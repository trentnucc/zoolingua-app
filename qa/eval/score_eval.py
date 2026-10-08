"""Score the sd-10 model against the double-labelled evaluation set.

Input:  qa/eval/rows.json  (written from the collection workflow: id, file, collector label, verifier label, confidences)
Output: qa/eval/EVAL_RESULTS.md and qa/eval/predictions.json
Metrics on three subsets: ALL (collector label), AGREED (collector == verifier), CONFIDENT (agreed and both >= 0.8).
Uses the exact training preprocessing: PIL Resize((224,224)) bilinear + ImageNet normalisation, PyTorch MobileNetV2 + sd-10 weights.
"""
import json, os, sys, pathlib
import torch, torchvision
from torch import nn
from PIL import Image
import torchvision.transforms as T

HERE = pathlib.Path(__file__).resolve().parent
CKPT = pathlib.Path(r"C:\Users\trent\AppData\Local\Temp\claude\C--Users-trent\52f4a4f5-657f-489d-b725-b243eea2397f\scratchpad\zl\hf\doge_224_sd-10.bin")
CLASSES = ['aggressive', 'anxious', 'frightened', 'happy', 'inquisitive']

def load_model():
    m = torchvision.models.mobilenet_v2(weights=None)
    m.features[0][0] = nn.Conv2d(3, 32, 3, 2, 1, bias=False)
    m.classifier[1] = nn.Linear(1280, 5)
    m.load_state_dict(torch.load(CKPT, map_location="cpu")); m.eval()
    return m

def main():
    rows = json.load(open(HERE / "rows.json", encoding="utf-8"))
    m = load_model()
    tf = T.Compose([T.Resize((224, 224)), T.ToTensor(), T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    preds = []
    for r in rows:
        f = r["file"]
        if not os.path.exists(f):
            continue
        im = Image.open(f).convert("RGB")
        with torch.no_grad():
            p = torch.softmax(m(tf(im).unsqueeze(0)), 1)[0].tolist()
        order = sorted(range(5), key=lambda k: -p[k])
        preds.append({**r, "probs": {c: round(v, 4) for c, v in zip(CLASSES, p)}, "pred": CLASSES[order[0]], "pred2": CLASSES[order[1]], "top_p": round(p[order[0]], 4)})
    json.dump(preds, open(HERE / "predictions.json", "w", encoding="utf-8"), indent=1)

    def metrics(subset, name):
        n = len(subset)
        if not n:
            return f"\n## {name}\n\nno images\n"
        acc = sum(1 for r in subset if r["pred"] == r["truth"]) / n
        top2 = sum(1 for r in subset if r["truth"] in (r["pred"], r["pred2"])) / n
        # 3-way grouping: positive (happy, inquisitive) / worried (anxious, frightened) / aggressive
        grp = lambda c: 'positive' if c in ('happy', 'inquisitive') else ('worried' if c in ('anxious', 'frightened') else 'aggressive')
        acc3 = sum(1 for r in subset if grp(r["pred"]) == grp(r["truth"])) / n
        out = [f"\n## {name} (n={n})\n", f"- Top-1 accuracy: **{acc*100:.1f}%** (chance = 20%)", f"- Top-2 accuracy: {top2*100:.1f}%", f"- 3-group accuracy (positive / worried / aggressive): {acc3*100:.1f}%", "", "Per class:", "", "| class | n | recall | precision | most common confusion |", "|---|---|---|---|---|"]
        for c in CLASSES:
            tr = [r for r in subset if r["truth"] == c]; pr = [r for r in subset if r["pred"] == c]
            rec = (sum(1 for r in tr if r["pred"] == c) / len(tr)) if tr else float('nan')
            prec = (sum(1 for r in pr if r["truth"] == c) / len(pr)) if pr else float('nan')
            conf = {}
            for r in tr:
                if r["pred"] != c: conf[r["pred"]] = conf.get(r["pred"], 0) + 1
            top_conf = max(conf.items(), key=lambda kv: kv[1])[0] + f" ({max(conf.values())})" if conf else "none"
            out.append(f"| {c} | {len(tr)} | {rec*100:.0f}% | {prec*100:.0f}% | {top_conf} |")
        out += ["", "Confusion matrix (rows = truth, columns = predicted):", "", "| truth \\ pred | " + " | ".join(CLASSES) + " |", "|---|" + "---|" * 5]
        for c in CLASSES:
            out.append(f"| {c} | " + " | ".join(str(sum(1 for r in subset if r['truth'] == c and r['pred'] == d)) for d in CLASSES) + " |")
        return "\n".join(out) + "\n"

    all_rows = [{**r, "truth": r["collector"]} for r in preds]
    agreed = [{**r, "truth": r["collector"]} for r in preds if r.get("verifier") == r["collector"]]
    confident = [r for r in agreed if (r.get("collectorConf") or 0) >= 0.8 and (r.get("verifierConf") or 0) >= 0.8]
    report = ["# sd-10 model: independent evaluation", "", f"Images: {len(preds)} licensed photos from Wikimedia Commons, gathered per class by one labeller and re-labelled blind by a second (mixed batches). Neither labeller saw the model's output.", f"Labeller agreement: {len(agreed)}/{len(preds)} ({len(agreed)/max(1,len(preds))*100:.0f}%).", ""]
    report.append(metrics(all_rows, "ALL images (label = collector's)"))
    report.append(metrics(agreed, "AGREED images (both labellers)"))
    report.append(metrics(confident, "CONFIDENT images (agreed, both >= 0.8)"))
    report.append("\nCaveats: small set; labels are human judgement from a single photo (no behaviourist review); classes are not equally represented; some Commons photos could overlap the model's training data.\n")
    (HERE / "EVAL_RESULTS.md").write_text("\n".join(report), encoding="utf-8")
    print("\n".join(report))

if __name__ == "__main__":
    main()
