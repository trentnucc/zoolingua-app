"""One-off patch for the v5 review fixes (index.html, manifest.json, sw.js). Safe to re-run: every replacement is asserted present or already applied."""
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent

def patch(name, reps):
    p = ROOT / name; s = p.read_text(encoding="utf-8"); n = 0
    for a, b in reps:
        if b in s and a not in s:
            continue  # already applied
        assert a in s, f"{name}: MISSING: {a[:90]}"
        s = s.replace(a, b); n += 1
    p.write_text(s, encoding="utf-8", newline="\n"); print(name, "patched", n)

patch("index.html", [
    ('<link rel="stylesheet" href="styles.css?v=4">', '<link rel="stylesheet" href="styles.css?v=5">'),
    ('<script src="app.js?v=4"></script>', '<script src="app.js?v=5"></script>'),
    ('    <section data-screen="home">\n', '    <section data-screen="home">\n      <h1 class="sr-only">Zoolingua home</h1>\n'),
    ('<h3>Ask Zoolingua</h3><p>Get expert-backed answers 24/7</p>', '<h3>Ask Zoolingua</h3><p>Answers 24/7, experts at launch</p>'),
    ('<span class="ico ico-orange tile-ico" style="width:42px;height:42px;border-radius:12px;display:grid;place-items:center" data-icon="bulb"></span>', '<span class="ico ico-orange" data-icon="bulb"></span>'),
    ('<label class="option" for="fileImage"><span class="ico" data-icon="photo"></span><span><h3>Upload Photo</h3><p>JPG, PNG</p></span></label>',
     '<button class="option" type="button" data-pick="fileImage"><span class="ico" data-icon="photo"></span><span><h3>Upload Photo</h3><p>JPG, PNG</p></span></button>'),
    ('<label class="option" for="fileVideo"><span class="ico" data-icon="video"></span><span><h3>Upload Video</h3><p>MP4, MOV · up to 60s</p></span></label>',
     '<button class="option" type="button" data-pick="fileVideo"><span class="ico" data-icon="video"></span><span><h3>Upload Video</h3><p>MP4, MOV · up to 60s</p></span></button>'),
    ('<label class="option" for="fileCamera"><span class="ico" data-icon="camera"></span><span><h3>Use Camera Now</h3><p>Capture a moment</p></span></label>',
     '<button class="option" type="button" data-pick="fileCamera"><span class="ico" data-icon="camera"></span><span><h3>Use Camera Now</h3><p>Capture a moment</p></span></button>'),
    ('<input type="file" id="fileImage" accept="image/*" hidden>', '<input type="file" id="fileImage" accept="image/*" hidden tabindex="-1" aria-hidden="true">'),
    ('<input type="file" id="fileVideo" accept="video/*" hidden>', '<input type="file" id="fileVideo" accept="video/*" hidden tabindex="-1" aria-hidden="true">'),
    ('<input type="file" id="fileCamera" accept="image/*" capture="environment" hidden>', '<input type="file" id="fileCamera" accept="image/*" capture="environment" hidden tabindex="-1" aria-hidden="true">'),
    ('<video id="hiddenVideo" muted playsinline preload="auto" hidden></video>', '<video id="hiddenVideo" muted playsinline preload="auto" aria-hidden="true" tabindex="-1" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"></video>'),
    ('<p class="lede" id="analyzeStatus">Preparing</p>', '<p class="lede" id="analyzeStatus" role="status" aria-live="polite">Preparing</p>'),
    ('<div class="progress" id="analyzeProgress"><span></span></div>', '<div class="progress" id="analyzeProgress" role="progressbar" aria-label="Reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>'),
    ('<p class="small">Runs on your device. Your photo never leaves your phone.</p>', '<p class="small">Runs on your device. Nothing you upload leaves it.</p>'),
    ('<div class="screen-head"><button class="icon-btn" data-back aria-label="Back"></button><h1>What your dog may be communicating.</h1>', '<div class="screen-head center"><button class="icon-btn" data-back aria-label="Back"></button><h1>What your dog may be communicating.</h1>'),
    ('<div class="result-hero" id="resultMedia"></div>\n      <div class="card">', '<div class="result-hero" id="resultMedia"></div>\n      <div class="card verdict-card">'),
    ('<div class="eyebrow">Five signals</div>', '<div class="eyebrow">Five states</div>'),
    ('<div class="strip" id="timelineStrip"></div>', '<div class="strip" id="timelineStrip" role="img" aria-label="Mood over the clip"></div>'),
    ('<button class="btn btn-primary btn-sm" id="newPostBtn">Start a Discussion</button>', '<button class="btn btn-secondary btn-sm" id="newPostBtn">Start a Discussion</button>'),
    ('        <span class="bubble" data-icon="comment"></span>\n      </div>\n      <div class="chips-scroll" id="filterChips"></div>',
     '        <span class="bubble" data-icon="comment"></span>\n      </div>\n      <p class="small" style="margin-top:-6px">Sample discussions · your own posts stay on this device.</p>\n      <div class="chips-scroll" id="filterChips"></div>'),
    ('      <div class="card row" style="gap:12px">\n        <span class="ico ico-teal" style="width:48px;height:48px;border-radius:50%;display:grid;place-items:center;flex:none" data-icon="chat"></span>\n        <div style="flex:1;min-width:0"><h3>Ask Zoolingua</h3><p class="small">24/7 guidance from our behavior experts.</p></div>',
     '      <div class="ask-card">\n        <span class="bubble" data-icon="chat"></span>\n        <div style="flex:1;min-width:0"><h3>Ask Zoolingua</h3><p class="small">24/7 guidance now · live behavior experts at launch.</p></div>'),
    ('<div class="dist" id="dist"></div>', '<div class="dist" id="dist" role="img" aria-label="Share of readings"></div>'),
    ('<div class="subtabs" id="subtabs"><button data-sub="moods">Moods</button><button data-sub="journal">Journal</button><button data-sub="health">Health</button></div>',
     '<div class="subtabs" id="subtabs"><button data-sub="moods" aria-pressed="true">Moods</button><button data-sub="journal" aria-pressed="false">Journal</button><button data-sub="health" aria-pressed="false">Health</button></div>'),
])
patch("manifest.json", [
    ('  "name": "Zoolingua",', '  "id": "./",\n  "name": "Zoolingua",'),
    ('"background_color": "#FBF7F4"', '"background_color": "#093E4E"'),
])
patch("sw.js", [
    ("const VERSION = 'zl-v4';", "const VERSION = 'zl-v5';"),
    ("'styles.css?v=4', 'app.js?v=4'", "'styles.css?v=5', 'app.js?v=5'"),
    ("""  // only page navigations fall back to the app shell; a missing image or script must fail as itself
  e.respondWith(fetch(req).then((res) => { keep(req, res); return res; }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));""",
     """  // Network first, but never wait on a captive portal: after 2.5s a cached copy wins (the network reply still refreshes the cache).
  // Only page navigations fall back to the app shell; a missing image or script must fail as itself.
  const fromNet = fetch(req).then((res) => { keep(req, res); return res; });
  const fromCache = () => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : null));
  e.respondWith(new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => { fromCache().then((hit) => { if (hit && !settled) { settled = true; resolve(hit); } }); }, 2500);
    fromNet.then((res) => { clearTimeout(timer); if (!settled) { settled = true; resolve(res); } })
      .catch(() => { clearTimeout(timer); if (settled) return; fromCache().then((hit) => { settled = true; resolve(hit || Response.error()); }); });
  }));"""),
])
print("done")
