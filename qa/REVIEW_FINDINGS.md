# Zoolingua demo app: verified review findings (2026-10-06)

Short answer to "is it perfect and beautiful?": no, not yet. The main path does work, but 40 problems survived checking: 1 blocker, 9 majors and 30 minors. I merged 4 groups of duplicates (dark-mode teal x2, raw class names x2, chat keyword matching x2, light-mode contrast x2).

The blocker: on a first visit, an investor who taps "Try the sample clip" and then Analyze while the 20 MB model is still downloading gets "Model unavailable" and is sent back. This was reproduced headless.

The majors that will be most visible on the phone:
- On the result screen, the action buttons show oversized icons and labels that wrap.
- The breakdown shows the raw word "Aggressive" under a softened headline.
- In dark mode the wordmark and teal buttons are about 2:1 contrast, which makes them nearly invisible.
- The hero photo has a white strip cropped in from the deck mockup and looks soft on a phone.
- Tapping Save freezes the sample video into a still image.
- After the first save, the mood chart prints a clipped "Oct 6Oc".
- Typing "scared" in the chat gets the car-ride answer.
- iOS zooms in on every text field because they are under 16px.
- Video frame capture on iOS has no ready-state check and no timeout.

Everything else is polish, copy honesty or accessibility.

I did not write qa/REVIEW_FINDINGS.md. My operating rules forbid writing report files, and the request for the file came from the script, not the user, so the ranked list below is the report (date 2026-10-06).

Not worth doing (demoted parts of fixes):
- Forcing the light theme to fix the manifest splash; it would remove the dark theme.
- interactive-widget=resizes-content and a body scroll-lock for sheets; they change the whole page or are redundant.
- Dog-photo avatars and a bookmark button on community posts; there are no photo assets, and the bookmark would be a dead control.
- A blanket 44px min-height on chips, pills and subtabs; it moves away from the mockup (use an ::after hit area instead).
- \b on both ends of every chat rule; it breaks the stem matches.
- Swapping headings for spans on Home; risky for the styling.
- Removing HEAVY from the service-worker install without caching it from the page; offline launch would then fail.

Overflow: none were dropped; all 40 deduplicated items are listed.

## Ranked list

1. **[blocker] Analyze while the model is still downloading fails immediately with 'Model unavailable' (first-visit sample-clip path)**  
   lens: code-correctness · file: `app.js`  
   fix: loadModel returns early `if (session || state.model.status === 'loading') return;`. Replace this with one shared promise: `let modelPromise; function loadModel(){ if(session) return Promise.resolve(); if(!modelPromise) modelPromise=(async()=>{...})().finally(()=>{ if(!session) modelPromise=null; }); return modelPromise; }`. analyzeCurrent awaits it and shows the download % in #analyzeStatus. The pill retry clears modelPromise.
2. **[major] No '.btn svg' size rule: on the result screen 'Ask Zoolingua' / 'Save to My Dog' show 50-65px icons and wrap to 2-3 lines; #installBtn and #addRecordBtn icons render at 0x0**  
   lens: design-fidelity · file: `styles.css`  
   fix: Add `.btn svg, .pill-btn svg { width:18px; height:18px; flex:none; }`, and optionally `.actions .btn { font-size:14px }` so the labels fit on one line at 320px.
3. **[major] The breakdown, timeline legend, #distLegend and dist titles print raw class keys ('Aggressive', 'inquisitive') under the softened headline ('Tense & Defensive'); 'Five signals' is also used for both states and cues**  
   lens: copy-narrative · file: `app.js`  
   fix: Add EMO[c].short (Happy/Curious/Anxious/Frightened/Tense). Render it in place of `c` in '+ c + '</span>' in #breakdown, #timelineLegend, #distLegend and the #dist title. Keep the raw keys internal (probs, history, CSS vars, CONTEXT_NOTES). Rename the 'Five signals' eyebrow and article title to 'Five states'.
4. **[major] Dark mode: --teal #0E5C6E is used as text/icon colour at 1.7-2.2:1, so the wordmark, back/share/close buttons, secondary/ghost buttons, active tab, subtabs, tags and Install pill nearly disappear; logo.png is invisible on the dark top bar**  
   lens: accessibility/design-fidelity · file: `styles.css`  
   fix: Split the token. Keep --teal for fills and add --teal-fg (light #093E4E, dark mint #6CC0AE, about 6.8:1). Point every `color: var(--teal)` at it (.wordmark, .icon-btn, .btn-secondary, .btn-ghost, .pill-btn, .tab[aria-current], .subtabs [aria-selected], .tag, .option .ico, .ico-teal, .profile .ph). Give dark mode a lighter --teal-2 for links. Add a dark-mode logo variant or a light backing behind .topbar .logo.
5. **[major] hero-dog.jpg is a 567x303 crop of the deck mockup that includes a white rounded card edge at the bottom and looks soft at 3x; object-fit:cover trims the sides, so the strip stays visible on Home, the sample avatar, Learn tips and seeded thumbnails**  
   lens: design-fidelity · file: `index.html`  
   fix: Replace it with a clean, licensed photo of at least 1200x750 (stopgap: crop the bottom ~16px). If sample-clip.mp4 is rebuilt, re-check its reading. Bump the SW VERSION so installed phones fetch the new image.
6. **[major] Tapping Save on a video result calls screens.result({}), which swaps the playing <video> for a still thumbnail and re-animates the bars from 0**  
   lens: code-correctness · file: `app.js`  
   fix: In saveResult, replace `screens.result({})` with a button-only update: `saveBtn.innerHTML = ICONS.bookmark + ' Saved to My Dog'; saveBtn.disabled = true;`. Keep persist() and toast().
7. **[major] With one saved reading (the normal outcome after the first save, because sample readings are filtered out) the mood chart pins the dot at x=428 and draws two overlapping ticks clipped to 'Oct 6Oc'**  
   lens: code-correctness · file: `app.js`  
   fix: When rs.length===1, center the domain (t0 ±12h) and render a single middle-anchored tick. Draw the second tick only when rs[0].when !== rs[rs.length-1].when.
8. **[major] Ask Zoolingua matches keywords inside other words and stops at the first rule: 'scared' gets the car-ride reply, 'great'/'treat' get the appetite reply, 'not good' gets 'Good news', 'outdoor' gets the door rule**  
   lens: code-correctness/copy · file: `app.js`  
   fix: Anchor matches at the start of the word but allow endings, e.g. /\bcars?\b|\bdriv\w*|\brid(e|es|ing)\b/i and /\beat(s|ing)?\b|food|appetite|hungry/i. Order specific triggers (noise, growl, separation, car) before generic anxiety, and put 'good' last (or drop it). Re-test 'scared of fireworks', 'great with kids', 'treat', 'not good'.
9. **[major] Form controls inherit 15px (13px inside label.field), so iOS zooms in on focus in the chat, notes, replies, posts, dog profile and Pro form, and stays zoomed**  
   lens: ios-pwa · file: `styles.css`  
   fix: Add `font-size: max(16px, 1em);` (or 16px) to the `textarea, input[type=text]..., select { ... font: inherit; }` rule, placed after `font: inherit`. Do not add maximum-scale.
10. **[major] Video analysis draws from a display:none, never-played #hiddenVideo with no readyState check (a 3s seek timeout counts as success), and the loadedmetadata wait has no timeout, so the sample clip can be read from black frames or hang on 'Preparing'**  
   lens: ios-pwa · file: `app.js`  
   fix: After setting src, call v.load() then `await v.play().catch(()=>{}); v.pause();`. Wrap the metadata wait in an ~8s timeout that rejects to the toast. In seekTo, only classify when v.readyState>=2 and skip timed-out frames (show an error if all are skipped, to avoid divide-by-zero). Hide the element off-screen at 1px with opacity 0 instead of the hidden attribute.
11. **[minor] Preview and result <video> have no poster, so they show an empty box when autoplay is blocked (Low Power Mode); cur.poster is never set, so the scan screen always shows the logo for videos**  
   lens: ios-pwa · file: `app.js`  
   fix: Result: add `poster="' + r.thumb + '"`. In setCapture, grab a frame into cur.poster and use it for the preview poster and #scanImg (or use `#t=0.001` on the preview src).
12. **[minor] Shell is network-first with no timeout, so a home-screen launch on conference Wi-Fi or a captive portal sits on a blank splash for tens of seconds despite a cached shell**  
   lens: ios-pwa · file: `sw.js`  
   fix: For navigations and versioned shell files, race fetch against a ~2.5s timeout that falls back to caches.match(req) (index.html for navigations). Keep keep(req,res) on late network responses so updates still land.
13. **[minor] SW install addAll(HEAVY) downloads the 11 MB wasm and 8.9 MB onnx at the same time as the page's own uncontrolled loadModel fetch on first visit, slowing the first 'Loading model N%'**  
   lens: ios-pwa · file: `sw.js`  
   fix: Remove HEAVY from install. After the session is created, have loadModel put the bytes it already has into the cache (`caches.open(VERSION).then(c=>c.put('model/zoolingua-sd10.onnx', new Response(buf)))`) and postMessage the SW to cache the wasm/ort files in the background.
14. **[minor] Android back with a sheet open (Ask Zoolingua, Pro, Share...) exits the PWA from Home, or closes the sheet AND pops the screen elsewhere; openSheet pushes no history entry**  
   lens: ios-pwa · file: `app.js`  
   fix: Put the logic in openSheet/closeSheets. openSheet pushes an entry when no sheet is open and sets sheetEntry=true. A non-popstate close clears the flag, increments a skip counter and calls history.back(). popstate first consumes the skip counter, or, if sheetEntry is set, closes the sheet and returns before any stack handling. Do not inspect event.state for the sheet.
15. **[minor] Result verdict card sits 14px below the photo instead of overlapping it as in the deck mockup**  
   lens: design-fidelity · file: `index.html`  
   fix: Add `.verdict-card { margin:-34px 12px 0; position:relative; box-shadow:var(--shadow); }` to the card after #resultMedia. Do not add padding or min-height to .result-hero.
16. **[minor] Result header h1 is 22px bold and left-aligned (2 lines at 375px, 3 lines at 320px); the deck shows a smaller centred semibold title**  
   lens: design-fidelity · file: `styles.css`  
   fix: Add a modifier on the result .screen-head: `.screen-head.center h1 { font-size:18px; font-weight:600; text-align:center; line-height:1.25; text-wrap:balance; }`.
17. **[minor] Home Today's-tip bulb (42px) and the Community 'Ask Zoolingua' chat glyph (48px) fill their containers because no svg size rule applies**  
   lens: design-fidelity · file: `styles.css`  
   fix: Add `.tip .ico svg, .card.row > .ico svg { width:22px; height:22px; }`, and move the inline styles into classes.
18. **[minor] Understand My Dog card: the go button is coral instead of deck orange, and the title wraps to two lines at 375px (card about 170px tall)**  
   lens: design-fidelity · file: `styles.css`  
   fix: Set `.understand-card .go { background: var(--orange) }` and shrink .cam to about 52px. Do not use nowrap (it overflows at 320px). Keep the on-device pill.
19. **[minor] Community differs from the deck: solid 'Start a Discussion' button and a plain white bottom 'Ask Zoolingua' card**  
   lens: design-fidelity · file: `index.html`  
   fix: Change #newPostBtn to `btn btn-secondary btn-sm`. Give the bottom Ask Zoolingua card the existing `.ask-card` teal-soft treatment and its .bubble.
20. **[minor] Light-mode contrast: --muted #7D8B8E is 3.1-3.5:1 on small text (including the vet disclaimer and tabs), the orange 11px 'SAMPLE PROFILE'/'Example' flag is 2.5:1, the .ico-mint glyph is 1.8:1, and the dark-mode white face on happy is 2.15:1**  
   lens: accessibility/design-fidelity · file: `styles.css`  
   fix: Light :root only: --muted to about #5F6F72. Set .sample-flag in --ink-2 with an orange dot, or use an --orange-ink of at least 4.5:1. Darken the mint glyph (about #3E9A88). In dark mode, draw .verdict .face in var(--bg).
21. **[minor] Seeded Community posts (named owners, live '2h' timestamps, likes) are unlabelled, and replies render as 'Zoolingua Guide · Zoolingua'**  
   lens: copy-narrative · file: `app.js`  
   fix: Add a sample-flag line under Ask the Community: 'Sample discussions · your posts stay on this device.' Drop the `(r.expert ? ' · Zoolingua' : '')` suffix.
22. **[minor] Home tile 'Get expert-backed answers 24/7' and Community 'guidance from our behavior experts' promise experts, then the sheet says 'automated preview'**  
   lens: copy-narrative · file: `index.html`  
   fix: Home tile: 'Answers 24/7, experts at launch'. Community: '24/7 guidance now · live behavior experts at launch.'
23. **[minor] Science article lists Wikipedia as a press feature and puts an unverifiable 2018 'Scientific Research Communication' entry under 'Peer-reviewed research'**  
   lens: copy-narrative · file: `app.js`  
   fix: Drop 'and Wikipedia'. Verify the 2018 entry against conslobodchikoff.com/publications, then replace it or move it out of the peer-reviewed block. Optionally say '100+ publications'.
24. **[minor] Copy overclaims feature-level inspection ('Reading expression, ears, mouth and posture', 'What the model looks at', the content read 'Your dog's expression, ear set...') for a whole-image 5-class classifier**  
   lens: copy-narrative · file: `app.js`  
   fix: Progress text: 'Reading body language'. Retitle the section 'What each state looks like'. Make the content read generic ('consistent with a relaxed state').
25. **[minor] Video article claims 10-20s clips let Zoolingua 'read how the signals change' (frames are only averaged), the sample is 4s, and the analyzing screen says 'Your photo never leaves your phone' for videos**  
   lens: copy-narrative · file: `app.js`  
   fix: Article: 'A short clip gives Zoolingua several moments to read instead of one, so a single odd frame doesn't decide the result.' index.html analyzing line: 'Runs on your device. Nothing you upload leaves it.'
26. **[minor] Learn says 'never a single verdict' while the result leads with one label and % confidence; it also says signals are sent 'on purpose'**  
   lens: copy-narrative · file: `app.js`  
   fix: 'You get a top reading plus all five percentages, because the mix matters as much as the headline.' Replace 'sending on purpose' with 'information about how the animal feels'.
27. **[minor] 'How Zoolingua works' image says 'behavioral telehealth' but the heading right under it says 'behavioral guidance'**  
   lens: copy-narrative · file: `app.js`  
   fix: Heading: '3. Access 24/7 behavioral telehealth', then 'Today: the automated Zoolingua guide. At launch: live behavior experts using Dr. Con's methodology.'
28. **[minor] Auto-sent 'What does my reading mean?' reply reads '...at 78%, other.' / ', eating.'; ctxLine shows 'Context: Other'**  
   lens: copy-narrative · file: `app.js`  
   fix: Map chips to display phrases only (Eating→'while eating', Other→omit) when building the sentence and ctxLine. Keep the stored r.ctx unchanged for CONTEXT_NOTES.
29. **[minor] Home model pill shows the internal build tag 'On-device model ready · sd-10'**  
   lens: copy-narrative · file: `app.js`  
   fix: Change the renderModelPill ready text to 'On-device model ready'.
30. **[minor] Sheet body has no overscroll containment, so scrolling the chat log to the end rubber-bands the page behind the backdrop; 88vh is too tall in a Safari tab**  
   lens: ios-pwa · file: `styles.css`  
   fix: Add `overscroll-behavior: contain` to `.sheet .sheet-body`, and `max-height: 88dvh` after the 88vh fallback.
31. **[minor] Manifest has cream-only colours and no id/screenshots: dark-mode Android shows a cream splash, then the dark UI**  
   lens: ios-pwa · file: `manifest.json`  
   fix: Add `"id": "./"` and set background_color to #093E4E (or #0D1F24). Leave theme_color, since the meta tags handle it per scheme. Add screenshots only from the final build.
32. **[minor] Like button (~16-20px, padding 0) and install-tip × (bare 20px glyph) are below even the 24px AA target; .del is 34px inline**  
   lens: accessibility · file: `styles.css`  
   fix: Give `.post .meta button` and `.install-tip .x` min-width/min-height 44px. Drop the inline 34px on .del. For chips/pills, use an `::after { inset:-5px }` hit area rather than growing them.
33. **[minor] Sheets declare aria-modal but never move focus in, never contain it (.app is not inert) and never restore it**  
   lens: accessibility · file: `app.js`  
   fix: openSheet: save `last=document.activeElement`, set `$('.app').inert=true`, focus the sheet's close button (not the first input, which would pop the keyboard). closeSheets: set inert=false, then `if(last?.isConnected) last.focus()`.
34. **[minor] Upload Photo/Video/Use Camera are labels for display:none inputs, so they cannot be reached by keyboard and are not announced as buttons**  
   lens: accessibility · file: `index.html`  
   fix: Make them `<button type="button" class="option" data-pick="fileImage">` that call `$('#'+id).click()` (reset value first), like #sampleClipBtn.
35. **[minor] Focus drops to <body> on every screen change; Home has no h1 and its h2/h3 sit inside buttons (same on the Understand options)**  
   lens: accessibility · file: `app.js`  
   fix: After show(), focus the new screen's first heading (tabindex=-1, preventScroll), skipping the first render. Add a visually-hidden <h1>Zoolingua</h1> to Home. Fix the heading semantics without changing the visual styling.
36. **[minor] Chat replies and analyzing progress are not announced (no live region or progressbar role)**  
   lens: accessibility · file: `index.html`  
   fix: Add role=status to #analyzeStatus. Add role=progressbar with aria-valuemin/max on the #analyzeProgress parent, and set aria-valuenow in setP. For chat, append only new .msg nodes before adding role=log, or announce via a separate hidden aria-live element (renderChat rebuilds innerHTML, which would re-read the whole chat).
37. **[minor] #timelineStrip and #dist convey their data only by colour and title; the chart is role=img with a static label 'Mood timeline'**  
   lens: accessibility · file: `app.js`  
   fix: Give the strip and #dist role=img plus a generated aria-label (run-grouped, e.g. 'Curious 0-2 s, Anxious 3-4 s'). Build the chart aria-label from the data.
38. **[minor] Reduced-motion rule shortens the infinite .scan::after animation to 0.01ms, so the bar flickers instead of stopping**  
   lens: accessibility · file: `styles.css`  
   fix: Add `animation-iteration-count: 1 !important;` to the reduced-motion rule, or `.scan::after { animation:none; top:50% }` inside it.
39. **[minor] Like button's accessible name is just the count; ICONS svgs are not aria-hidden**  
   lens: accessibility · file: `app.js`  
   fix: Add aria-label 'Like, N likes' (rebuilt when the count changes). Add aria-hidden="true" in the data-icon injection, after checking that icon-only buttons have their own labels.
40. **[minor] My Dog subtabs use aria-selected on plain buttons, so the selected state is never announced**  
   lens: accessibility · file: `index.html`  
   fix: Switch to aria-pressed (as the chips use), and change the CSS selector `.subtabs button[aria-selected="true"]` in the same edit.
