"""Build artifact.html: the same app as index.html, but as a body fragment for the Artifact
publisher (which wraps it in its own doctype/head/body) and with the service worker left out."""
import re, pathlib
root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")
head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
keep = []
for line in head.splitlines():
    s = line.strip()
    if not s or s.startswith('<meta charset') or 'name="viewport"' in s:
        continue
    keep.append(s)
# the artifact host serves no .onnx, so the preview fetches the same bytes published under a .wasm name
out = "\n".join(keep) + "\n<script>document.documentElement.dataset.model = 'model/zoolingua-sd10.wasm'; document.documentElement.dataset.theme = 'light';</script>\n" + body
(root / "artifact.html").write_text(out, encoding="utf-8")
print("artifact.html", len(out), "bytes")
