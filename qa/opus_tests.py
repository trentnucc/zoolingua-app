"""Adversarial end-to-end tests for Zoolingua (independent of qa/run_qa.py).

Usage:  python qa/opus_tests.py [base_url] [only=scenario1,scenario2]
        (default base http://127.0.0.1:8765/ - start `python -m http.server 8765` in the app folder first)
Test media is (re)built by qa/make_media.py into qa/media/.
Every scenario runs in a fresh browser context and fails on any console error or page error.
Writes qa/opus_last_run.json and screenshots to qa/screens/opus/; exits 1 on any failure.
"""
import json, sys, time, pathlib, traceback, subprocess
from playwright.sync_api import sync_playwright

ARGS = [a for a in sys.argv[1:] if not a.startswith("only=")]
ONLY = next((a[5:].split(",") for a in sys.argv[1:] if a.startswith("only=")), None)
BASE = ARGS[0] if ARGS else "http://127.0.0.1:8765/"
ROOT = pathlib.Path(__file__).resolve().parent.parent
MEDIA = ROOT / "qa" / "media"
SHOTS = ROOT / "qa" / "screens" / "opus"; SHOTS.mkdir(parents=True, exist_ok=True)
REF = {"aggressive": 0.0, "anxious": 0.0, "frightened": 0.1087, "happy": 0.8046, "inquisitive": 0.0866}  # PyTorch, img/hero-dog.jpg (567x287, white strip cropped)
if not (MEDIA / "long-75s.mp4").exists():
    subprocess.run([sys.executable, str(ROOT / "qa" / "make_media.py")], check=True)

results, failures = {}, []
def check(name, ok, detail=""):
    results[name] = {"ok": bool(ok), "detail": detail if isinstance(detail, (str, int, float, bool, list, dict, type(None))) else str(detail)}
    if not ok: failures.append(name)
    print(("PASS " if ok else "FAIL ") + name + (" - " + str(detail)[:300] if detail != "" else ""), flush=True)

# ---------------------------------------------------------------- helpers
def screen(page):
    v = page.evaluate("[...document.querySelectorAll('section[data-screen]')].filter(s=>!s.hidden).map(s=>s.dataset.screen)")
    return v[0] if len(v) == 1 else v

def wait_screen(page, name, timeout=60000):
    page.wait_for_function("n => !document.querySelector(`section[data-screen='${n}']`).hidden", arg=name, timeout=timeout)

def wait_model(page):
    page.wait_for_function("window.ZL && ['ready','error'].includes(ZL.state.model.status)", timeout=90000)
    return page.evaluate("ZL.state.model.status")

def sheet_open(page, sid):
    page.wait_for_function("id => document.getElementById(id).classList.contains('open')", arg=sid, timeout=5000)

def sheet_closed(page, sid):
    page.wait_for_function("id => !document.getElementById(id).classList.contains('open')", arg=sid, timeout=5000)

def toast_text(page):
    return page.evaluate("document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent : ''")

def go_understand(page):
    page.click('.tab[data-tab="home"]'); wait_screen(page, "home")
    page.click('[data-go="understand"]'); wait_screen(page, "understand")

def analyze(page, path=None, selector="#fileImage", sample=False, timeout=120000):
    """Load media into the capture screen, press Analyze, return ('result', result) or ('toast', text)."""
    go_understand(page)
    if sample:
        page.click("#sampleClipBtn")
    else:
        page.set_input_files(selector, str(path))
    page.wait_for_function("!!ZL.state.current", timeout=15000)
    page.click("#analyzeBtn")
    page.wait_for_function("""() => !document.querySelector("section[data-screen='result']").hidden ||
        (!document.querySelector("section[data-screen='understand']").hidden && document.getElementById('toast').classList.contains('show'))""", timeout=timeout)
    if screen(page) == "result":
        return "result", page.evaluate("({probs: ZL.state.result.probs, top: ZL.state.result.top, kind: ZL.state.result.kind, frames: ZL.state.result.frames && ZL.state.result.frames.map(f=>f.t), thumb: (ZL.state.result.thumb||'').slice(0,23)})")
    return "toast", toast_text(page)

class Ctx:
    """A fresh browser context + page that records every console error and page error."""
    def __init__(self, browser, name, width=390, height=844, scheme="light", init_script=None, ua=None, sw=True):
        opts = dict(viewport={"width": width, "height": height}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme=scheme)
        if ua: opts["user_agent"] = ua
        if not sw: opts["service_workers"] = "block"
        self.ctx = browser.new_context(**opts)
        if init_script: self.ctx.add_init_script(init_script)
        self.page = self.ctx.new_page(); self.name = name; self.errors = []; self.ignore = []
        self.page.on("console", lambda m: self.errors.append(f"console.{m.type}: {m.text} @ {m.location.get('url','')}") if m.type == "error" else None)
        self.page.on("pageerror", lambda e: self.errors.append("pageerror: " + str(e)))
    def open(self, path=""):
        self.page.goto(BASE + path); return wait_model(self.page)
    def close(self):
        errs = [e for e in self.errors if not any(i in e for i in self.ignore)]
        check(f"{self.name}: zero console/page errors", not errs, errs[:4])
        self.ctx.close()

# ---------------------------------------------------------------- scenarios
def sc_photos(b):
    c = Ctx(b, "photos"); p = c.page
    check("photos: model ready", c.open() == "ready")
    cases = [("large-4000x3000.jpg", "result"), ("transparent.png", "result"), ("exif-orient6.jpg", "result"),
             ("tiny-50x50.jpg", "result"), ("not-an-image.jpg", "toast")]
    for fname, want in cases:
        t0 = time.time(); kind, r = analyze(p, MEDIA / fname); dt = time.time() - t0
        if want == "result":
            ok = kind == "result" and abs(sum(r["probs"].values()) - 1) < 1e-3 and r["thumb"].startswith("data:image/jpeg")
            check(f"photos: {fname}", ok, {"top": r.get("top") if isinstance(r, dict) else r, "secs": round(dt, 1), "probs": {k: round(v, 4) for k, v in r["probs"].items()} if isinstance(r, dict) else None})
            p.screenshot(path=str(SHOTS / f"photo-{fname}.png"))
        else:
            check(f"photos: {fname} fails gracefully", kind == "toast" and r and screen(p) == "understand", r)
            p.screenshot(path=str(SHOTS / f"photo-{fname}.png"))
            # the bad file is still loaded; user can clear it and continue
            p.click("#clearCapture"); check("photos: clear after failure", page_eval(p, "!ZL.state.current && document.getElementById('analyzeBtn').disabled"))
    # EXIF: the browser applies orientation, so the upright pixels should read like the upright hero image
    kind, r = analyze(p, MEDIA / "exif-orient6.jpg")
    diff = max(abs(r["probs"][k] - REF[k]) for k in REF)
    check("photos: EXIF orientation 6 honoured (reads like upright reference)", diff < 0.05, f"max diff vs upright reference {diff:.4f}")
    kind, r = analyze(p, ROOT / "img" / "hero-dog.jpg")
    diff = max(abs(r["probs"][k] - REF[k]) for k in REF)
    check("photos: hero matches PyTorch reference", diff < 0.02, f"max diff {diff:.4f}")
    # camera input behaves like upload
    kind, r = analyze(p, MEDIA / "tiny-50x50.jpg", selector="#fileCamera")
    check("photos: camera input path", kind == "result", kind)
    c.close()

def page_eval(p, js):
    return p.evaluate(js)

def sc_videos(b):
    c = Ctx(b, "videos"); p = c.page; c.open()
    kind, r = analyze(p, sample=True)
    check("videos: sample clip", kind == "result" and r["kind"] == "video" and len(r["frames"]) >= 4, r if kind != "result" else {"n": len(r["frames"]), "top": r["top"]})
    kind, r = analyze(p, ROOT / "img" / "sample-clip.mp4", selector="#fileVideo")
    check("videos: real mp4 upload", kind == "result" and r["kind"] == "video", {"n": len(r["frames"]) if kind == "result" else r})
    kind, r = analyze(p, MEDIA / "short-0.6s.mp4", selector="#fileVideo")
    check("videos: <1s clip", kind == "result" and len(r["frames"]) >= 4 and max(r["frames"]) <= 0.7, r if kind != "result" else r["frames"])
    t0 = time.time(); kind, r = analyze(p, MEDIA / "long-75s.mp4", selector="#fileVideo")
    check("videos: 75s clip capped at 60s", kind == "result" and max(r["frames"]) <= 60 and len(r["frames"]) == 12,
          {"frames": r["frames"] if kind == "result" else r, "secs": round(time.time() - t0, 1)})
    check("videos: timeline end label <= 60s", int(p.evaluate("parseInt(document.getElementById('timelineEnd').textContent)")) <= 60, p.evaluate("document.getElementById('timelineEnd').textContent"))
    kind, r = analyze(p, MEDIA / "not-a-video.mp4", selector="#fileVideo", timeout=30000)
    check("videos: corrupt video fails gracefully", kind == "toast" and screen(p) == "understand", r)
    p.click("#clearCapture")
    # a video picked through the video input whose MIME type the OS left blank must still be read as video
    go_understand(p)
    p.set_input_files("#fileVideo", files=[{"name": "clip.mov", "mimeType": "", "buffer": (ROOT / "img" / "sample-clip.mp4").read_bytes()}])
    p.wait_for_function("!!ZL.state.current")
    check("videos: blank MIME via video input treated as video", p.evaluate("ZL.state.current.kind") == "video", p.evaluate("ZL.state.current.kind"))
    p.click("#clearCapture")
    # save a video reading, then reopen it from the journal and from the home strip (and after reload)
    kind, r = analyze(p, sample=True)
    p.click("#saveBtn")
    p.click('.tab[data-tab="mydog"]'); wait_screen(p, "mydog"); p.click('#subtabs [data-sub="journal"]')
    p.click("#journal .entry");
    try:
        wait_screen(p, "result", timeout=5000); ok = p.evaluate("document.querySelectorAll('#timelineStrip span').length") >= 4
    except Exception as e:
        ok = False
    check("videos: saved video reading reopens from journal (timeline)", ok, screen(p))
    p.reload(); wait_model(p)
    p.click('.tab[data-tab="home"]'); p.click("#recent .mini")
    try:
        wait_screen(p, "result", timeout=5000); ok = True
    except Exception:
        ok = False
    check("videos: saved video reading reopens from home after reload", ok, screen(p))
    p.screenshot(path=str(SHOTS / "video-reopened.png"), full_page=True)
    c.close()

def sc_navigation(b):
    c = Ctx(b, "navigation"); p = c.page; c.open()
    # rapid double click on Analyze
    go_understand(p); p.set_input_files("#fileImage", str(ROOT / "img" / "hero-dog.jpg")); p.wait_for_function("!!ZL.state.current")
    p.evaluate("() => { const b=document.getElementById('analyzeBtn'); b.click(); b.click(); b.click(); }")
    wait_screen(p, "result")
    p.wait_for_timeout(800)
    stack = p.evaluate("ZL.state.stack.map(e=>e.screen)")
    check("nav: triple-click Analyze runs once (stack sane)", stack.count("result") == 1 and stack.count("analyzing") == 0, stack)
    # in-app back from result goes to understand, then home
    p.click("section[data-screen='result'] [data-back]"); p.wait_for_timeout(400)
    s1 = screen(p)
    p.click("section[data-screen='understand'] [data-back]"); p.wait_for_timeout(400)
    s2 = screen(p)
    check("nav: result -> back -> understand -> back -> home", (s1, s2) == ("understand", "home"), [s1, s2])
    check("nav: still on the app after in-app backs", p.url.startswith(BASE), p.url)
    # browser back button
    go_understand(p)
    p.go_back(); p.wait_for_timeout(500)
    check("nav: browser back from understand returns home inside the app", p.url.startswith(BASE) and screen(p) == "home", [p.url, screen(p)])
    if not p.url.startswith(BASE):
        p.goto(BASE); wait_model(p)
    kind, r = analyze(p, ROOT / "img" / "hero-dog.jpg")
    p.go_back(); p.wait_for_timeout(500)
    check("nav: browser back from result -> understand", p.url.startswith(BASE) and screen(p) == "understand", [p.url, screen(p)])
    if not p.url.startswith(BASE):
        p.goto(BASE); wait_model(p)
    p.click('.tab[data-tab="learn"]'); p.click('#articles .article-card[data-id="video"]'); wait_screen(p, "article")
    p.go_back(); p.wait_for_timeout(400)
    check("nav: browser back from article -> learn", p.url.startswith(BASE) and screen(p) == "learn", [p.url, screen(p)])
    if not p.url.startswith(BASE):
        p.goto(BASE); wait_model(p)
    # back while a sheet is open closes it
    p.click('.tab[data-tab="community"]'); p.click("#feed .post"); wait_screen(p, "post")
    p.click('[data-chat="community"]') if p.is_visible('[data-chat="community"]') else None
    # double-tap the in-app back button must not leave the app
    p.click('.tab[data-tab="home"]'); p.click('[data-go="learn"]'); wait_screen(p, "learn")
    p.click('#articles .article-card[data-id="five"]'); wait_screen(p, "article")
    p.evaluate("() => { const b=document.querySelector(\"section[data-screen='article'] [data-back]\"); b.click(); b.click(); }")
    p.wait_for_timeout(600)
    check("nav: double-tap in-app back stays in app", p.url.startswith(BASE) and screen(p) in ("learn", "home"), [p.url, screen(p)])
    if not p.url.startswith(BASE):
        p.goto(BASE); wait_model(p)

    # Back during analysis (browser back) must cancel: no surprise jump to result later
    go_understand(p); p.set_input_files("#fileVideo", str(MEDIA / "long-75s.mp4")); p.wait_for_function("!!ZL.state.current")
    p.click("#analyzeBtn"); wait_screen(p, "analyzing")
    p.wait_for_function("document.getElementById('analyzeStatus').textContent.includes('moment')", timeout=30000)
    p.go_back(); p.wait_for_timeout(300)
    s_after = screen(p) if p.url.startswith(BASE) else "LEFT APP"
    if p.url.startswith(BASE):
        p.wait_for_timeout(12000)
    s_later = screen(p) if p.url.startswith(BASE) else "LEFT APP"
    check("nav: browser back during analysis cancels it", s_after == "understand" and s_later == "understand", [s_after, s_later])
    if not p.url.startswith(BASE):
        p.goto(BASE); wait_model(p)
    # Tab switch during analysis must not be hijacked by the finished result
    go_understand(p); p.set_input_files("#fileVideo", str(MEDIA / "long-75s.mp4")); p.wait_for_function("!!ZL.state.current")
    p.click("#analyzeBtn"); wait_screen(p, "analyzing")
    p.click('.tab[data-tab="community"]'); p.wait_for_timeout(12000)
    check("nav: tab switch during analysis is not hijacked", screen(p) == "community", screen(p))
    p.screenshot(path=str(SHOTS / "nav-after-cancel.png"))
    # analyzing screen with a video shows an image, not a broken icon
    go_understand(p)
    check("nav: media from an abandoned run is still loaded", p.is_visible("#preview")); p.click("#clearCapture")
    p.click("#sampleClipBtn"); p.wait_for_function("ZL.state.current && ZL.state.current.kind==='video'")
    p.click("#analyzeBtn"); wait_screen(p, "analyzing")
    p.wait_for_timeout(1200)
    broken = p.evaluate("(()=>{const i=document.getElementById('scanImg'); return !!i.getAttribute('src') && i.complete && i.naturalWidth===0})()")
    p.screenshot(path=str(SHOTS / "nav-analyzing-video.png"))
    check("nav: analyzing screen has no broken image for video", not broken)
    wait_screen(p, "result", timeout=120000)
    c.close()

def sc_buttons(b):
    """Walk every visible button on every screen; each must do something observable and nothing may throw."""
    c = Ctx(b, "buttons"); p = c.page; c.open()
    kind, r = analyze(p, ROOT / "img" / "hero-dog.jpg"); p.click("#saveBtn")
    # headless Edge exposes navigator.share but never resolves it (no share UI); use the in-app fallback here
    p.add_init_script("navigator.share = undefined; navigator.canShare = undefined;"); p.evaluate("() => { navigator.share = undefined; navigator.canShare = undefined; }")
    def reset_to(name):
        p.evaluate("() => { document.querySelectorAll('.sheet.open').forEach(s=>s.classList.remove('open')); const b=document.getElementById('backdrop'); b.classList.remove('open'); b.hidden=true; document.querySelector('.app').inert=false; }")
        if not p.url.startswith(BASE): p.goto(BASE); wait_model(p)
        nav = {"home": ['.tab[data-tab="home"]'], "understand": ['.tab[data-tab="home"]', '[data-go="understand"]'],
               "community": ['.tab[data-tab="community"]'], "post": ['.tab[data-tab="community"]', '#feed .post'],
               "learn": ['.tab[data-tab="learn"]'], "article": ['.tab[data-tab="learn"]', '#articles .article-card'],
               "mydog": ['.tab[data-tab="mydog"]'], "result": ['.tab[data-tab="mydog"]', '#subtabs [data-sub="journal"]', '#journal .entry'],
               "preview": ['.tab[data-tab="home"]', '[data-go="understand"]']}[name]
        for sel in nav: p.click(sel)
        if name == "preview":
            p.set_input_files("#fileImage", str(ROOT / "img" / "hero-dog.jpg")); p.wait_for_function("!!ZL.state.current")
        p.wait_for_timeout(150)
    dead = []; total = 0
    SKIP = {"resetBtn"}  # covered separately (reloads)
    PICKERS = {"Upload Photo", "Upload Video", "Use Camera Now"}  # open the native file picker: no DOM change is the correct outcome
    for name in ["home", "understand", "preview", "community", "post", "learn", "article", "mydog", "result"]:
        reset_to(name)
        n = p.evaluate("[...document.querySelectorAll('button')].filter(b=>b.offsetParent && !b.closest('.sheet')).length")
        for i in range(n):
            reset_to(name)
            info = p.evaluate("""i => { const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent && !b.closest('.sheet'));
                const b=bs[i]; if(!b) return null; return {id:b.id, txt:(b.getAttribute('aria-label')||b.textContent).trim().slice(0,30), disabled:b.disabled}; }""", i)
            if not info or info["id"] in SKIP or info["disabled"]: continue
            total += 1
            changed = p.evaluate("""i => new Promise(res => { const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent && !b.closest('.sheet'));
                const before = [...document.querySelectorAll('section[data-screen]')].filter(s=>!s.hidden).map(s=>s.dataset.screen).join();
                let muts = 0; const mo = new MutationObserver(m => { muts += m.length; }); mo.observe(document.body, {subtree:true, childList:true, attributes:true, characterData:true});
                const y = scrollY; const fa = document.activeElement; bs[i].click();
                setTimeout(() => { mo.disconnect(); const after=[...document.querySelectorAll('section[data-screen]')].filter(s=>!s.hidden).map(s=>s.dataset.screen).join();
                  res({muts: muts + (document.activeElement!==fa && document.activeElement!==bs[i] ? 1 : 0), nav: before!==after, sheet: !!document.querySelector('.sheet.open'), toast: document.getElementById('toast').classList.contains('show')}); }, 900); })""", i)
            if not (changed["muts"] or changed["nav"] or changed["sheet"] or changed["toast"]):
                if not any(info['txt'].startswith(x) for x in PICKERS): dead.append(f"{name}:{info['txt']}")
    check("buttons: every visible button does something", not dead, {"clicked": total, "dead": dead})
    # sheet buttons
    reset_to("home")
    for opener, sid in [("#proTile", "proSheet"), ('[data-chat="home"]', "chatSheet")]:
        p.click(opener); sheet_open(p, sid); p.click(f"#{sid} [data-close]"); sheet_closed(p, sid)
    p.click('.tab[data-tab="home"]'); p.click("#proTile"); sheet_open(p, "proSheet")
    p.click("#backdrop", position={"x": 20, "y": 20}); sheet_closed(p, "proSheet")
    check("buttons: sheets close via X and backdrop", True)
    p.keyboard.press("Escape")
    # keyboard: closed sheets must not be reachable with Tab
    reset_to("home")
    focusable_in_closed = p.evaluate("""(()=>{ const out=[]; document.querySelectorAll('.sheet:not(.open)').forEach(s=>{ s.querySelectorAll('button,input,textarea,select,a[href]').forEach(el=>{ el.focus(); if(document.activeElement===el) out.push(s.id+' '+(el.id||el.tagName)); }); }); return out; })()""")
    check("a11y: controls inside closed sheets are not focusable", not focusable_in_closed, focusable_in_closed[:6])
    p.click("#proTile"); sheet_open(p, "proSheet"); p.keyboard.press("Escape"); p.wait_for_timeout(400)
    check("a11y: Escape closes an open sheet", not p.evaluate("!!document.querySelector('.sheet.open')"))
    c.close()

XSS = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>"\'&'
def sc_community(b):
    c = Ctx(b, "community"); p = c.page; c.open()
    p.click('.tab[data-tab="community"]'); wait_screen(p, "community")
    p.click("#newPostBtn"); sheet_open(p, "postSheet")
    p.click("#createPostBtn"); check("community: empty title rejected", "title" in toast_text(p).lower(), toast_text(p))
    p.fill("#postTitle", XSS); p.fill("#postBody", XSS + " body"); p.click("#postTags .chip:nth-child(4)")
    p.click("#createPostBtn"); sheet_closed(p, "postSheet")
    p.wait_for_timeout(300)
    h3 = p.evaluate("document.querySelector('#feed .post h3').textContent")
    check("community: HTML in title rendered as text", h3 == XSS and p.evaluate("window.__xss") is None and p.evaluate("document.querySelectorAll('#feed img[src=x]').length") == 0, h3)
    p.click("#feed .post"); wait_screen(p, "post")
    p.fill("#replyInput", XSS); p.click("#replyBtn")
    check("community: HTML in reply rendered as text", p.evaluate("window.__xss") is None and XSS in p.evaluate("[...document.querySelectorAll('#replies .bubble-text')].pop().textContent"))
    p.fill("#replyInput", "   "); n = p.evaluate("document.querySelectorAll('#replies .reply').length"); p.click("#replyBtn")
    check("community: blank reply ignored", p.evaluate("document.querySelectorAll('#replies .reply').length") == n)
    p.fill("#replyInput", "Enter key reply"); p.press("#replyInput", "Enter")
    check("community: Enter sends reply", p.evaluate("document.querySelectorAll('#replies .reply').length") == n + 1)
    # like in post view
    p.click("#postView .like"); check("community: like in post view", p.evaluate("document.querySelector('#postView .like').classList.contains('liked')"))
    p.click("section[data-screen='post'] [data-back]"); wait_screen(p, "community")
    # like several posts in a row in the feed (rebinding bug check), then unlike one
    ids = p.evaluate("[...document.querySelectorAll('#feed .post')].map(e=>e.dataset.id)")
    for pid in ids[1:4]:
        p.click(f'#feed .post[data-id="{pid}"] .like')
    liked = p.evaluate("[...document.querySelectorAll('#feed .post .like.liked')].map(b=>b.closest('.post').dataset.id)")
    check("community: liking 3 posts in a row likes all 3", set(ids[1:4]).issubset(set(liked)), liked)
    p.click(f'#feed .post[data-id="{ids[2]}"] .like')
    # opening a post after several likes must push exactly one screen
    p.click(f'#feed .post[data-id="{ids[3]}"] h3'); wait_screen(p, "post")
    st = p.evaluate("ZL.state.stack.map(e=>e.screen)")
    check("community: one tap opens post once", st.count("post") == 1, st)
    p.click("section[data-screen='post'] [data-back]"); wait_screen(p, "community")
    want = {ids[0]: True, ids[1]: True, ids[2]: False, ids[3]: True}
    p.reload(); wait_model(p); p.click('.tab[data-tab="community"]'); wait_screen(p, "community")
    got = p.evaluate("ids => Object.fromEntries(ids.map(id => [id, document.querySelector(`#feed .post[data-id='${id}'] .like`).classList.contains('liked')]))", list(want))
    check("community: likes/unlikes persist across reload", got == want, got)
    check("community: XSS post persists escaped", p.evaluate("document.querySelector('#feed .post h3').textContent") == XSS and p.evaluate("window.__xss") is None)
    # filters
    bad = []
    for tag in p.evaluate("[...document.querySelectorAll('#filterChips .chip')].map(c=>c.textContent)"):
        p.click(f'#filterChips .chip:text-is("{tag}")')
        pressed = p.evaluate("[...document.querySelectorAll('#filterChips .chip')].filter(c=>c.getAttribute('aria-pressed')==='true').map(c=>c.textContent)")
        tags = p.evaluate("[...document.querySelectorAll('#feed .post')].map(e=>[...e.querySelectorAll('.tag')].map(t=>t.textContent))")
        if pressed != [tag] or (tag != "All" and any(tag not in t for t in tags)): bad.append(tag)
    check("community: every filter shows only matching posts", not bad, bad)
    p.screenshot(path=str(SHOTS / "community-xss.png"), full_page=True)
    c.close()

def sc_mydog(b):
    c = Ctx(b, "mydog"); p = c.page; c.open()
    p.click('.tab[data-tab="mydog"]'); wait_screen(p, "mydog")
    check("mydog: sample Milo shown", p.evaluate("document.getElementById('dogName').textContent") == "Milo" and p.evaluate("ZL.state.readings.length") == 3)
    p.click('#subtabs [data-sub="journal"]')
    p.click("#journal .entry"); wait_screen(p, "result")
    check("mydog: sample journal entry opens result", p.evaluate("document.getElementById('verdictLabel').textContent") != "")
    p.click("section[data-screen='result'] [data-back]"); wait_screen(p, "mydog")
    check("mydog: back from journal result returns to My Dog", screen(p) == "mydog")
    # keyboard activation of a journal entry (role=button)
    p.click('#subtabs [data-sub="journal"]'); p.focus("#journal .entry"); p.keyboard.press("Enter"); p.wait_for_timeout(300)
    check("a11y: journal entry opens with Enter key", screen(p) == "result", screen(p))
    p.click('.tab[data-tab="mydog"]')
    # edit dog with XSS name + photo
    p.click("#editDogBtn"); sheet_open(p, "dogSheet")
    p.click("#saveDogBtn"); check("mydog: empty name rejected", "name" in toast_text(p).lower(), toast_text(p))
    p.fill("#dogNameInput", "<b>Rex</b>"); p.fill("#dogBreedInput", "Mutt"); p.fill("#dogAgeInput", "2")
    p.set_input_files("#dogPhotoInput", str(MEDIA / "exif-orient6.jpg")); p.wait_for_function("!!ZL.state.pendingPhoto")
    p.click("#saveDogBtn"); sheet_closed(p, "dogSheet")
    check("mydog: dog saved, samples cleared", p.evaluate("ZL.state.dog.name") == "<b>Rex</b>" and p.evaluate("document.getElementById('dogName').textContent") == "<b>Rex</b>" and p.evaluate("ZL.state.readings.length") == 0 and p.evaluate("ZL.state.records.length") == 0)
    # bad photo file must not crash
    p.click("#editDogBtn"); sheet_open(p, "dogSheet")
    p.set_input_files("#dogPhotoInput", str(MEDIA / "not-an-image.jpg")); p.wait_for_timeout(800)
    check("mydog: bad dog photo -> toast", "photo" in toast_text(p).lower(), toast_text(p))
    # re-picking the same file after reopening the sheet still updates the preview
    p.click("#dogSheet [data-close]"); sheet_closed(p, "dogSheet")
    p.click("#editDogBtn"); sheet_open(p, "dogSheet")
    check("mydog: photo input cleared on reopen", p.evaluate("document.getElementById('dogPhotoInput').value") == "", p.evaluate("document.getElementById('dogPhotoInput').value"))
    p.fill("#dogNameInput", "Rex"); p.click("#saveDogBtn"); sheet_closed(p, "dogSheet")
    check("mydog: photo kept on rename", p.evaluate("(ZL.state.dog.photo||'').startsWith('data:image/jpeg')"))
    # records: add two, delete one
    p.click('#subtabs [data-sub="health"]')
    for title in ["Rabies", "<i>Heartworm</i>"]:
        p.click("#addRecordBtn"); sheet_open(p, "recordSheet")
        p.fill("#recTitle", title); p.fill("#recNote", "note for " + title); p.click("#saveRecordBtn"); sheet_closed(p, "recordSheet")
    p.click("#addRecordBtn"); sheet_open(p, "recordSheet"); p.fill("#recTitle", ""); p.click("#saveRecordBtn")
    check("mydog: record without title rejected", "title" in toast_text(p).lower()); p.click("#recordSheet [data-close]"); sheet_closed(p, "recordSheet")
    titles = p.evaluate("[...document.querySelectorAll('#records .entry h3')].map(h=>h.textContent)")
    check("mydog: two records added (escaped)", sorted(titles) == sorted(["Rabies", "<i>Heartworm</i>"]) and p.evaluate("document.getElementById('statRecords').textContent") == "2", titles)
    p.click("#records .del"); p.wait_for_timeout(200)
    check("mydog: delete record", p.evaluate("ZL.state.records.length") == 1 and p.evaluate("document.getElementById('statRecords').textContent") == "1")
    # readings -> journal -> chart
    kind, r = analyze(p, ROOT / "img" / "hero-dog.jpg"); p.click("#saveBtn")
    kind, r = analyze(p, MEDIA / "transparent.png"); p.click("#saveBtn")
    p.click('.tab[data-tab="mydog"]'); wait_screen(p, "mydog"); p.click('#subtabs [data-sub="moods"]')
    check("mydog: chart has 2 points", p.evaluate("document.querySelectorAll('#moodChart circle').length") == 2)
    p.click('#subtabs [data-sub="journal"]'); p.click("#journal .entry"); wait_screen(p, "result")
    check("mydog: own journal entry opens result", p.evaluate("document.getElementById('saveBtn').disabled"))
    p.screenshot(path=str(SHOTS / "mydog-result-from-journal.png"))
    p.click('.tab[data-tab="mydog"]'); p.screenshot(path=str(SHOTS / "mydog-own.png"), full_page=True)
    # reset demo data
    p.click("#resetBtn"); p.wait_for_load_state(); wait_model(p)
    p.click('.tab[data-tab="mydog"]')
    check("mydog: reset restores Milo", p.evaluate("ZL.state.dog.name") == "Milo" and p.evaluate("ZL.state.readings.length") == 3 and p.evaluate("ZL.state.records.length") == 3)
    c.close()

def sc_chat(b):
    c = Ctx(b, "chat"); p = c.page; c.open()
    p.click('[data-chat="home"]'); sheet_open(p, "chatSheet")
    msgs = [("My dog barks at the window", "Barking"), ("He growls at the mailman", "growl"), ("qwerty zxcv", "Tell me a bit more"), (XSS, None)]
    for text, expect in msgs:
        n = p.evaluate("document.querySelectorAll('#chatLog .msg.bot:not(.typing)').length")
        p.fill("#chatInput", text); p.press("#chatInput", "Enter")
        p.wait_for_function("n => document.querySelectorAll('#chatLog .msg.bot:not(.typing)').length > n", arg=n, timeout=10000)
        last = p.evaluate("[...document.querySelectorAll('#chatLog .msg.bot:not(.typing)')].pop().textContent")
        if expect: check(f"chat: reply to '{text[:20]}'", expect.lower() in last.lower(), last[:60])
    check("chat: user HTML escaped", p.evaluate("window.__xss") is None and XSS in p.evaluate("[...document.querySelectorAll('#chatLog .msg.me')].pop().textContent"))
    p.fill("#chatInput", "   "); p.click("#chatSend")
    check("chat: blank message ignored", p.evaluate("document.querySelectorAll('#chatLog .msg.me').length") == 4)
    p.screenshot(path=str(SHOTS / "chat.png"))
    p.click("#chatClear"); p.wait_for_timeout(200)
    check("chat: clear leaves only the greeting", p.evaluate("document.querySelectorAll('#chatLog .msg').length") == 1)
    # clear while the guide is typing: the late reply must not resurrect into the cleared chat
    p.fill("#chatInput", "car rides"); p.click("#chatSend"); p.click("#chatClear"); p.wait_for_timeout(2500)
    check("chat: clear during typing stays clear", p.evaluate("document.querySelectorAll('#chatLog .msg').length") == 1, p.evaluate("document.querySelectorAll('#chatLog .msg').length"))
    p.click("#chatSheet [data-close]"); sheet_closed(p, "chatSheet")
    # ask about a reading from the result screen
    analyze(p, ROOT / "img" / "hero-dog.jpg")
    p.click('section[data-screen="result"] [data-chat="result"]'); sheet_open(p, "chatSheet")
    p.wait_for_function("[...document.querySelectorAll('#chatLog .msg.bot:not(.typing)')].pop().textContent.includes('Your reading came back')", timeout=10000)
    check("chat: result-aware reply", True)
    p.reload(); wait_model(p); p.click('[data-chat="home"]'); sheet_open(p, "chatSheet")
    check("chat: history persists across reload", p.evaluate("document.querySelectorAll('#chatLog .msg').length") >= 3)
    c.close()

def sc_sheets(b):
    c = Ctx(b, "sheets"); p = c.page; c.open()
    analyze(p, ROOT / "img" / "hero-dog.jpg")
    # Web Share available: should call navigator.share with an image file
    p.evaluate("""() => { window.__shared=null; navigator.canShare = (d)=> !!(d && d.files); navigator.share = (d)=>{ window.__shared={n:d.files.length, type:d.files[0].type, size:d.files[0].size, title:d.title}; return Promise.resolve(); }; }""")
    p.click("#shareBtn"); p.wait_for_function("!!window.__shared", timeout=10000)
    s = p.evaluate("window.__shared")
    check("share: navigator.share gets a JPEG file", s["n"] == 1 and s["type"] == "image/jpeg" and s["size"] > 10000 and not p.evaluate("!!document.querySelector('.sheet.open')"), s)
    # user cancels the native share: no fallback sheet should pop up
    p.evaluate("() => { navigator.share = () => Promise.reject(new DOMException('cancel','AbortError')); }")
    p.click("#shareBtn"); p.wait_for_timeout(1500)
    check("share: cancelling native share does not open fallback", not p.evaluate("!!document.querySelector('.sheet.open')"))
    # share fails for another reason -> fallback preview
    p.evaluate("() => { navigator.share = () => Promise.reject(new DOMException('nope','NotAllowedError')); }")
    p.click("#shareBtn"); sheet_open(p, "shareSheet")
    check("share: failure falls back to preview", p.evaluate("document.getElementById('shareImg').src.startsWith('data:image/jpeg')"))
    p.click("#shareSheet [data-close]"); sheet_closed(p, "shareSheet")
    p.evaluate("navigator.share = undefined; navigator.canShare = undefined")
    p.click("#shareBtn"); sheet_open(p, "shareSheet")
    href = p.evaluate("document.getElementById('shareDl').getAttribute('href')")
    check("share: no Web Share -> preview with download link", href.startswith("data:image/jpeg"))
    p.screenshot(path=str(SHOTS / "share-sheet.png"))
    p.click("#shareSheet [data-close]"); sheet_closed(p, "shareSheet")
    # Pro sheet validation
    p.click('.tab[data-tab="home"]'); p.click("#proTile"); sheet_open(p, "proSheet")
    p.click("#proRequestBtn"); check("pro: empty form rejected", "name" in toast_text(p).lower() and p.evaluate("ZL.state && document.getElementById('proSheet').classList.contains('open')"))
    p.fill("#proName", "Dr. Vet"); p.fill("#proOrg", "Clinic"); p.fill("#proEmail", "not-an-email"); p.click("#proRequestBtn")
    check("pro: invalid email rejected", p.evaluate("document.getElementById('proSheet').classList.contains('open')") and "email" in toast_text(p).lower(), toast_text(p))
    p.fill("#proEmail", "vet@clinic.com"); p.select_option("#proRole", "Trainer"); p.click("#proRequestBtn"); sheet_closed(p, "proSheet")
    saved = p.evaluate("JSON.parse(localStorage.getItem('zl.proRequest'))")
    check("pro: valid request saved", saved and saved["email"] == "vet@clinic.com" and saved["role"] == "Trainer", saved)
    p.screenshot(path=str(SHOTS / "pro-after.png"))
    # Install button & sheet (Edge exposes beforeinstallprompt so the button stays hidden until the event fires)
    p.evaluate("document.getElementById('installBtn').hidden = false"); p.click("#installBtn"); sheet_open(p, "installSheet")
    check("install: sheet opens without a prompt event", True)
    p.click("#installSheet [data-close]"); sheet_closed(p, "installSheet")
    # simulated beforeinstallprompt
    p.evaluate("""(()=>{ const e = new Event('beforeinstallprompt'); e.prompt = ()=>{ window.__prompted = true; }; e.userChoice = Promise.resolve({outcome:'accepted'}); window.dispatchEvent(e); })()""")
    check("install: beforeinstallprompt shows Install button", p.evaluate("!document.getElementById('installBtn').hidden"))
    p.click("#installBtn"); p.wait_for_timeout(300)
    check("install: Install button calls prompt()", p.evaluate("window.__prompted === true") and p.evaluate("document.getElementById('installBtn').hidden"))
    c.close()
    # iOS user agent: install tip shows once and can be dismissed
    ios = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
    c = Ctx(b, "sheets-ios", ua=ios); p = c.page; c.open()
    check("install(iOS): tip + button visible", p.evaluate("!document.getElementById('installTip').hidden && !document.getElementById('installBtn').hidden"))
    p.screenshot(path=str(SHOTS / "ios-install-tip.png"))
    p.click("#installTipClose"); p.reload(); wait_model(p)
    check("install(iOS): tip stays dismissed", p.evaluate("document.getElementById('installTip').hidden"))
    p.click("#installBtn"); sheet_open(p, "installSheet"); p.screenshot(path=str(SHOTS / "ios-install-sheet.png"))
    c.close()

def sc_offline(b):
    c = Ctx(b, "offline"); p = c.page; c.open()
    p.evaluate("navigator.serviceWorker.ready")
    p.reload(); wait_model(p)
    ctl = p.evaluate("!!navigator.serviceWorker.controller")
    check("offline: page controlled by service worker", ctl)
    p.wait_for_function("""async () => { const c = await caches.open((await caches.keys())[0]); const k = (await c.keys()).map(r=>r.url);
        return ['zoolingua-sd10.onnx','ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.mjs','ort.min.js','sample-clip.mp4','app.js'].every(n => k.some(u=>u.includes(n))); }""", timeout=60000)
    c.ctx.set_offline(True)
    c.ignore = ["fonts.googleapis.com", "fonts.gstatic.com", "ERR_INTERNET_DISCONNECTED"]
    p.reload(); st = wait_model(p)
    check("offline: shell reloads and model is ready", st == "ready", p.evaluate("ZL.state.model.error"))
    kind, r = analyze(p, ROOT / "img" / "hero-dog.jpg")
    diff = max(abs(r["probs"][k] - REF[k]) for k in REF) if kind == "result" else 9
    check("offline: photo analysis works", kind == "result" and diff < 0.02, f"{kind} diff {diff}")
    kind, r = analyze(p, sample=True)
    check("offline: sample clip works", kind == "result" and r["kind"] == "video", kind)
    p.click('.tab[data-tab="learn"]'); p.click('#articles .article-card[data-id="how"]'); wait_screen(p, "article")
    p.wait_for_timeout(500)
    check("offline: article image from cache", p.evaluate("(()=>{const i=document.querySelector('#articleBody img'); return i && i.complete && i.naturalWidth>0})()"))
    p.screenshot(path=str(SHOTS / "offline-article.png"))
    # an uncached same-origin asset must fail cleanly, not be answered with index.html
    ct = p.evaluate("fetch('img/does-not-exist.png').then(r=>r.status+' '+(r.headers.get('content-type')||'')).catch(e=>'network error')")
    check("offline: missing asset is not answered with index.html", "text/html" not in ct, ct)
    c.ignore.append("img/does-not-exist.png")  # the deliberate failed fetch above
    c.ctx.set_offline(False)
    c.close()

BLOCK_LS = """Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });"""
def sc_nostorage(b):
    c = Ctx(b, "nostorage", init_script=BLOCK_LS); p = c.page
    check("nostorage: boots + model ready", c.open() == "ready")
    kind, r = analyze(p, ROOT / "img" / "hero-dog.jpg"); p.click("#saveBtn")
    check("nostorage: analyze + save work in session", kind == "result" and p.evaluate("ZL.state.readings.filter(r=>!r.sample).length") == 1)
    p.click('.tab[data-tab="community"]'); p.click("#newPostBtn"); sheet_open(p, "postSheet"); p.fill("#postTitle", "no storage post"); p.click("#createPostBtn"); sheet_closed(p, "postSheet")
    p.click("#feed .post .like")
    check("nostorage: post + like work", "no storage" in p.evaluate("document.querySelector('#feed .post h3').textContent"))
    p.click('.tab[data-tab="mydog"]'); p.click("#editDogBtn"); sheet_open(p, "dogSheet"); p.fill("#dogNameInput", "Ghost"); p.click("#saveDogBtn"); sheet_closed(p, "dogSheet")
    p.click('[data-chat]') if False else None
    p.click('.tab[data-tab="home"]'); p.click('[data-chat="home"]'); sheet_open(p, "chatSheet"); p.fill("#chatInput", "hi"); p.click("#chatSend"); p.wait_for_timeout(1200)
    p.click("#chatSheet [data-close]"); sheet_closed(p, "chatSheet")
    p.click('.tab[data-tab="mydog"]'); p.click("#resetBtn"); p.wait_for_load_state(); wait_model(p)
    check("nostorage: reset reloads cleanly", p.evaluate("ZL.state.dog.name") == "Milo")
    c.close()

SCREENS_JS = "[...document.querySelectorAll('section[data-screen]')].filter(s=>!s.hidden).map(s=>s.dataset.screen)[0]"
def overflow(p):
    return p.evaluate("""(()=>{ const de=document.documentElement; const W=de.clientWidth; const bad=[];
      document.querySelectorAll('body *').forEach(el=>{ if(!el.offsetParent && getComputedStyle(el).position!=='fixed') return; if(el.closest('.chips-scroll,.recent,.sheet:not(.open)')) return;
        const r=el.getBoundingClientRect(); if(r.width && (r.right>W+1 || r.left< -1)) bad.push((el.id||el.className||el.tagName).toString().slice(0,30)+' '+Math.round(r.left)+'..'+Math.round(r.right)); });
      return {sw: de.scrollWidth, cw: W, bad: bad.slice(0,5)}; })()""")

def sc_layout(b):
    for scheme in ["light", "dark"]:
        for w in [320, 390, 430]:
            c = Ctx(b, f"layout-{scheme}-{w}", width=w, height=760 if w == 320 else 860, scheme=scheme); p = c.page; c.open()
            analyze(p, ROOT / "img" / "hero-dog.jpg"); p.click("#saveBtn")
            probs = []
            def snap(tag):
                o = overflow(p)
                if o["sw"] > o["cw"] or o["bad"]: probs.append({tag: o})
                p.screenshot(path=str(SHOTS / f"{scheme}-{w}-{tag}.png"), full_page=(tag in ("result", "mydog", "article-science")))
            snap("result")
            for tab in ["home", "community", "learn", "mydog"]:
                p.click(f'.tab[data-tab="{tab}"]'); wait_screen(p, tab); p.wait_for_timeout(250); snap(tab)
            p.click('.tab[data-tab="home"]'); p.click('[data-go="understand"]'); wait_screen(p, "understand"); snap("understand")
            p.set_input_files("#fileImage", str(MEDIA / "large-4000x3000.jpg")); p.wait_for_function("!!ZL.state.current"); p.wait_for_timeout(300); snap("understand-preview")
            p.click("#clearCapture")
            p.click('.tab[data-tab="community"]'); p.click("#feed .post"); wait_screen(p, "post"); snap("post")
            for aid in ["science", "how", "anxious"]:
                p.click('.tab[data-tab="learn"]'); p.click(f'#articles .article-card[data-id="{aid}"]'); wait_screen(p, "article"); p.wait_for_timeout(200); snap("article-" + aid)
            p.click('.tab[data-tab="mydog"]')
            for sub in ["journal", "health"]:
                p.click(f'#subtabs [data-sub="{sub}"]'); snap("mydog-" + sub)
            for opener, sid, tab in [('[data-chat="home"]', "chatSheet", "home"), ("#proTile", "proSheet", "home"), ("#newPostBtn", "postSheet", "community"), ("#addRecordBtn", "recordSheet", "mydog"), ("#editDogBtn", "dogSheet", "mydog")]:
                p.click(f'.tab[data-tab="{tab}"]')
                if sid == "recordSheet": p.click('#subtabs [data-sub="health"]')
                p.click(opener); sheet_open(p, sid); p.wait_for_timeout(350)
                fits = p.evaluate("id => { const r=document.getElementById(id).getBoundingClientRect(); return r.top >= 0 && r.right <= document.documentElement.clientWidth + 1; }", sid)
                if not fits: probs.append({sid: "sheet does not fit viewport"})
                snap("sheet-" + sid)
                p.click(f"#{sid} [data-close]"); sheet_closed(p, sid)
            # analyzing screen
            go_understand(p); p.set_input_files("#fileVideo", str(MEDIA / "long-75s.mp4")); p.wait_for_function("!!ZL.state.current")
            p.click("#analyzeBtn"); wait_screen(p, "analyzing"); p.wait_for_timeout(1500); snap("analyzing")
            wait_screen(p, "result", timeout=120000)
            check(f"layout-{scheme}-{w}: no horizontal overflow on any screen/sheet", not probs, probs[:3])
            c.close()

def sc_a11y(b):
    c = Ctx(b, "a11y"); p = c.page; c.open()
    analyze(p, ROOT / "img" / "hero-dog.jpg")
    issues = p.evaluate("""(()=>{ const out=[];
      document.querySelectorAll('button, a[href]').forEach(b=>{ const name=(b.getAttribute('aria-label')||b.textContent||'').trim(); if(!name) out.push('unnamed '+b.tagName+'#'+b.id+'.'+b.className); });
      document.querySelectorAll('input:not([type=hidden]):not([hidden]), textarea, select').forEach(i=>{ if(!i.closest('label') && !i.getAttribute('aria-label') && !(i.id && document.querySelector('label[for='+i.id+']'))) out.push('unlabelled '+i.id); });
      document.querySelectorAll('img').forEach(i=>{ if(!i.hasAttribute('alt')) out.push('img without alt '+i.id); });
      return out; })()""")
    check("a11y: every control named / labelled, every img has alt", not issues, issues[:8])
    check("a11y: html lang set", p.evaluate("document.documentElement.lang") == "en")
    c.close()

SCENARIOS = {"photos": sc_photos, "videos": sc_videos, "navigation": sc_navigation, "buttons": sc_buttons, "community": sc_community,
             "mydog": sc_mydog, "chat": sc_chat, "sheets": sc_sheets, "offline": sc_offline, "nostorage": sc_nostorage, "a11y": sc_a11y, "layout": sc_layout}

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    for name, fn in SCENARIOS.items():
        if ONLY and name not in ONLY: continue
        print(f"\n=== {name} ===", flush=True)
        try:
            fn(browser)
        except Exception as e:
            tb = traceback.extract_tb(e.__traceback__); where = [f"{f.lineno}:{(f.line or '').strip()[:80]}" for f in tb if f.filename.endswith("opus_tests.py")]
            check(f"{name}: scenario completed", False, str(e).splitlines()[0][:200] + " @ " + " <- ".join(where[-2:]))
    browser.close()

(ROOT / "qa" / "opus_last_run.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
print(f"\nSUMMARY: {len(results) - len(failures)}/{len(results)} pass" + ("" if not failures else "\nFAILED: " + "; ".join(failures)))
sys.exit(1 if failures else 0)
