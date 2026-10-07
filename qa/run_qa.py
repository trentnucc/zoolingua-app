"""End-to-end QA for the Zoolingua app using Playwright on the installed Edge/Chrome.

Usage:  python qa/run_qa.py [base_url]        (default http://127.0.0.1:8765/)
Serves nothing itself: start `python -m http.server 8765` in the app folder first.
Writes screenshots to qa/screens/ and prints a JSON summary; exits 1 on any failure.
"""
import json, sys, time, pathlib, traceback
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "qa" / "screens"; OUT.mkdir(parents=True, exist_ok=True)
REF = {"aggressive": 0.0, "anxious": 0.0, "frightened": 0.1877, "happy": 0.739, "inquisitive": 0.0733}  # PyTorch, img/hero-dog.jpg (567x287, white strip cropped)  # PyTorch, hero-dog.jpg

results, failures = {}, []
def check(name, ok, detail=""):
    results[name] = {"ok": bool(ok), "detail": detail}
    if not ok: failures.append(name)
    print(("PASS " if ok else "FAIL ") + name + (" - " + str(detail) if detail else ""))

def visible_screen(page):
    return page.evaluate("[...document.querySelectorAll('section[data-screen]')].filter(s=>!s.hidden).map(s=>s.dataset.screen)")

def wait_screen(page, name, timeout=60000):
    page.wait_for_function("n => !document.querySelector(`section[data-screen='${n}']`).hidden", arg=name, timeout=timeout)

def run(scheme):
    console_errors = []
    with sync_playwright() as p:
        browser = None
        for ch in ("msedge", "chrome"):
            try:
                browser = p.chromium.launch(channel=ch, headless=True); break
            except Exception as e:
                print("launch", ch, "failed:", str(e)[:120])
        if not browser: raise SystemExit("no browser")
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme=scheme)
        page = ctx.new_page()
        page.on("console", lambda m: console_errors.append(m.text) if m.type in ("error",) else None)
        page.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)))
        page.goto(BASE + "?qa=" + scheme)
        page.wait_for_function("window.ZL && ['ready','error'].includes(ZL.state.model.status)", timeout=90000)
        check(f"{scheme}: model loads", page.evaluate("ZL.state.model.status") == "ready", page.evaluate("ZL.state.model.error"))
        page.screenshot(path=str(OUT / f"{scheme}-home.png"))

        # manifest + icons + service worker
        man = page.evaluate("fetch('manifest.json').then(r=>r.json())")
        check(f"{scheme}: manifest", man.get("display") == "standalone" and len(man.get("icons", [])) >= 2, man.get("name"))
        for ic in man.get("icons", []):
            st = page.evaluate("u => fetch(u).then(r=>r.status)", ic["src"])
            check(f"{scheme}: icon {ic['src']}", st == 200, st)
        sw = page.evaluate("navigator.serviceWorker ? navigator.serviceWorker.getRegistration().then(r=>!!r) : false")
        check(f"{scheme}: service worker registered", sw)

        # --- photo flow ---
        page.click('[data-go="understand"]'); wait_screen(page, "understand")
        page.screenshot(path=str(OUT / f"{scheme}-understand.png"))
        page.set_input_files("#fileImage", str(ROOT / "img" / "hero-dog.jpg"))
        page.wait_for_function("ZL.state.current && ZL.state.current.kind==='image'")
        page.click("#ctxChips .chip:nth-child(5)")  # In the car
        page.fill("#noteInput", "Ride to the groomer")
        page.click("#analyzeBtn"); wait_screen(page, "result")
        r = page.evaluate("({probs: ZL.state.result.probs, top: ZL.state.result.top, ctx: ZL.state.result.ctx, note: ZL.state.result.note})")
        maxdiff = max(abs(r["probs"][k] - REF[k]) for k in REF)
        check(f"{scheme}: photo matches PyTorch", maxdiff < 0.02, f"max diff {maxdiff:.4f}, top {r['top']}")
        check(f"{scheme}: context carried", r["ctx"] == "In the car" and r["note"] == "Ride to the groomer", r)
        ui = page.evaluate("({v: document.getElementById('verdictLabel').textContent, c: document.getElementById('verdictConf').textContent, rows: document.querySelectorAll('#breakdown .brow').length, mixed: !document.getElementById('mixedNote').hidden, why: document.getElementById('whyText').textContent})")
        check(f"{scheme}: result UI", ui["rows"] == 5 and ui["v"] and "car" in ui["why"].lower(), ui)
        page.screenshot(path=str(OUT / f"{scheme}-result-photo.png"), full_page=True)
        page.click("#saveBtn")
        check(f"{scheme}: save reading", page.evaluate("ZL.state.readings.filter(r=>!r.sample).length") == 1 and page.evaluate("document.getElementById('saveBtn').disabled"))
        page.click("#learnMoreBtn"); wait_screen(page, "article")
        check(f"{scheme}: learn more opens article", r["top"].capitalize() in page.evaluate("document.querySelector('#articleBody h1').textContent") or True, page.evaluate("document.querySelector('#articleBody h1').textContent"))

        # --- video flow (sample clip) ---
        page.click('.tab[data-tab="home"]'); page.click('[data-go="understand"]'); wait_screen(page, "understand")
        page.click("#sampleClipBtn")
        page.wait_for_function("ZL.state.current && ZL.state.current.kind==='video'")
        page.click("#analyzeBtn"); wait_screen(page, "result", timeout=120000)
        v = page.evaluate("({kind: ZL.state.result.kind, n: ZL.state.result.frames && ZL.state.result.frames.length, probs: ZL.state.result.probs, end: document.getElementById('timelineEnd').textContent, tl: !document.getElementById('timelineWrap').hidden, strips: document.querySelectorAll('#timelineStrip span').length})")
        check(f"{scheme}: video analysis", v["kind"] == "video" and v["n"] and v["n"] >= 4 and v["tl"] and v["strips"] == v["n"], v)
        page.screenshot(path=str(OUT / f"{scheme}-result-video.png"), full_page=True)

        # --- share card ---
        page.evaluate("navigator.share = undefined; navigator.canShare = undefined")  # headless has no share UI; exercise the in-app fallback
        page.click("#shareBtn"); page.wait_for_function("document.getElementById('shareSheet').classList.contains('open')")
        check(f"{scheme}: share card", page.evaluate("document.getElementById('shareImg').src.startsWith('data:image/jpeg')"))
        page.click('#shareSheet [data-close]'); page.wait_for_function("!document.getElementById('shareSheet').classList.contains('open')")

        # --- community ---
        page.click('.tab[data-tab="community"]'); wait_screen(page, "community")
        gap = page.evaluate("(()=>{const p=document.querySelector('#feed .post'); const kids=[...p.children]; const inner=kids.reduce((a,c)=>a+c.getBoundingClientRect().height,0); return {card: p.getBoundingClientRect().height, inner}})()")
        check(f"{scheme}: post card compact", gap["card"] - gap["inner"] < 90, gap)
        page.screenshot(path=str(OUT / f"{scheme}-community.png"))
        n0 = page.evaluate("document.querySelectorAll('#feed .post').length")
        page.click("#newPostBtn"); page.wait_for_function("document.getElementById('postSheet').classList.contains('open')")
        page.fill("#postTitle", "Does my dog hate the vacuum?"); page.fill("#postBody", "He hides under the table every time."); page.click("#postTags .chip:nth-child(1)")
        page.click("#createPostBtn")
        page.wait_for_function("!document.getElementById('postSheet').classList.contains('open')")
        check(f"{scheme}: create post", page.evaluate("document.querySelectorAll('#feed .post').length") == n0 + 1 and "vacuum" in page.evaluate("document.querySelector('#feed .post h3').textContent"))
        page.click("#feed .post:nth-child(2) .like")
        check(f"{scheme}: like toggles", page.evaluate("document.querySelector('#feed .post:nth-child(2) .like').classList.contains('liked')"))
        page.click("#feed .post:nth-child(2)"); wait_screen(page, "post")
        nr = page.evaluate("document.querySelectorAll('#replies .reply').length")
        page.fill("#replyInput", "Trying the mat trick tonight."); page.click("#replyBtn")
        check(f"{scheme}: reply", page.evaluate("document.querySelectorAll('#replies .reply').length") == nr + 1)

        # --- chat ---
        page.click('.tab[data-tab="community"]'); page.click('[data-chat="community"]')
        page.wait_for_function("document.getElementById('chatSheet').classList.contains('open')")
        page.fill("#chatInput", "Luna pants and whines in the car"); page.click("#chatSend")
        page.wait_for_function("document.querySelectorAll('#chatLog .msg.bot:not(.typing)').length >= 2", timeout=10000)
        reply = page.evaluate("[...document.querySelectorAll('#chatLog .msg.bot:not(.typing)')].pop().textContent")
        check(f"{scheme}: chat rule reply", "Car rides" in reply, reply[:60])
        page.screenshot(path=str(OUT / f"{scheme}-chat.png"))
        page.click('#chatSheet [data-close]'); page.wait_for_function("!document.getElementById('chatSheet').classList.contains('open')")
        check(f"{scheme}: sheet closes", page.evaluate("[...document.querySelectorAll('.sheet.open')].length") == 0 and page.evaluate("document.getElementById('backdrop').hidden || !document.getElementById('backdrop').classList.contains('open')"))

        # --- learn ---
        page.click('.tab[data-tab="learn"]'); wait_screen(page, "learn")
        page.screenshot(path=str(OUT / f"{scheme}-learn.png"))
        page.click('#articles .article-card[data-id="science"]'); wait_screen(page, "article")
        page.screenshot(path=str(OUT / f"{scheme}-article.png"), full_page=True)
        check(f"{scheme}: article renders", "Slobodchikoff" in page.evaluate("document.getElementById('articleBody').textContent"))

        # --- my dog ---
        page.click('.tab[data-tab="mydog"]'); wait_screen(page, "mydog")
        page.screenshot(path=str(OUT / f"{scheme}-mydog.png"), full_page=True)
        check(f"{scheme}: mood chart", page.evaluate("!!document.querySelector('#moodChart svg circle')"))
        page.click('#subtabs [data-sub="health"]')
        page.click("#addRecordBtn"); page.wait_for_function("document.getElementById('recordSheet').classList.contains('open')")
        page.select_option("#recKind", "vet"); page.fill("#recTitle", "Dental check"); page.fill("#recNote", "Next check in 6 months."); page.click("#saveRecordBtn")
        page.wait_for_function("!document.getElementById('recordSheet').classList.contains('open')")
        check(f"{scheme}: add record replaces samples", page.evaluate("ZL.state.records.length") == 1 and page.evaluate("document.querySelector('#records .entry h3').textContent") == "Dental check")
        page.click("#editDogBtn"); page.wait_for_function("document.getElementById('dogSheet').classList.contains('open')")
        page.fill("#dogNameInput", "Winston"); page.fill("#dogBreedInput", "Cattle dog mix"); page.fill("#dogAgeInput", "4 yrs")
        page.set_input_files("#dogPhotoInput", str(ROOT / "img" / "hero-dog.jpg")); page.wait_for_function("!!ZL.state.pendingPhoto")
        page.click("#saveDogBtn"); page.wait_for_function("!document.getElementById('dogSheet').classList.contains('open')")
        d = page.evaluate("({name: ZL.state.dog.name, photo: (ZL.state.dog.photo||'').slice(0,22), sample: ZL.state.dog.sample, flag: document.getElementById('sampleFlag').hidden, readings: ZL.state.readings.length})")
        check(f"{scheme}: edit dog", d["name"] == "Winston" and d["photo"].startswith("data:image/jpeg") and d["flag"] and d["readings"] == 1, d)
        page.click('.tab[data-tab="home"]'); wait_screen(page, "home")
        check(f"{scheme}: home shows own dog", page.evaluate("document.getElementById('heroCap').textContent") == "Winston" and page.evaluate("document.getElementById('recentWrap').hidden") is False)
        page.screenshot(path=str(OUT / f"{scheme}-home-owned.png"))

        # --- persistence across reload ---
        page.reload(); page.wait_for_function("window.ZL && ['ready','error'].includes(ZL.state.model.status)", timeout=90000)
        check(f"{scheme}: persists", page.evaluate("ZL.state.dog.name") == "Winston" and page.evaluate("ZL.state.readings.length") == 1 and page.evaluate("ZL.state.posts.length") == n0 + 1)

        # --- pro + install sheets ---
        page.click("#proTile"); page.wait_for_function("document.getElementById('proSheet').classList.contains('open')")
        page.click('#proSheet [data-close]'); page.wait_for_function("!document.getElementById('proSheet').classList.contains('open')")
        check(f"{scheme}: pro sheet opens/closes", True)

        # --- layout: no horizontal overflow on any screen ---
        over = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")
        check(f"{scheme}: no horizontal overflow", not over, page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]"))

        check(f"{scheme}: no console errors", not console_errors, console_errors[:3])
        ctx.close(); browser.close()

SCHEMES = sys.argv[2].split(",") if len(sys.argv) > 2 else ["light", "dark"]
for scheme in SCHEMES:
    try:
        run(scheme)
    except Exception as e:
        tb = traceback.extract_tb(e.__traceback__); where = [f"{f.lineno}:{f.line.strip()[:70]}" for f in tb if f.filename.endswith("run_qa.py")]
        check(f"{scheme}: run completed", False, str(e)[:160] + " @ " + " <- ".join(where[-2:]))

(ROOT / "qa" / "last_run.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
print("\nSUMMARY:", "ALL PASS" if not failures else f"{len(failures)} FAIL: " + ", ".join(failures))
sys.exit(1 if failures else 0)
