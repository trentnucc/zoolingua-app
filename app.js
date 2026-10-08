/* Zoolingua — app logic.
   One file: content (interpretations, articles, seeded community), storage, router, on-device model,
   capture/analyze flow, community, learn, my dog, chat guide, install prompt. No framework. */
(function () {
  'use strict';

  /* ===================== content ===================== */
  const CLASSES = ['aggressive', 'anxious', 'frightened', 'happy', 'inquisitive'];
  const EMO = {
    happy: {
      label: 'Happy & Relaxed', color: 'var(--e-happy)', face: 'smile',
      read: "Your dog's expression, ear set and overall posture are most consistent with a relaxed, contented state.",
      mean: "Your dog feels comfortable and engaged with what's happening. They're likely open to interaction, play and learning.",
      why: 'Soft eyes, a loose mouth and easy posture usually appear when a dog feels safe and expects good things.',
      steps: ['Reward the calm with attention or a short game', 'Good moment for training: relaxed dogs learn fastest', 'Note what was happening so you can recreate it'],
      help: 'No action needed. If this changes suddenly, check the environment first.'
    },
    inquisitive: {
      label: 'Curious & Interested', color: 'var(--e-inquisitive)', face: 'look',
      read: 'Forward ears, a focused gaze and an alert but loose body point to curiosity. Your dog is taking in something new.',
      mean: 'Your dog is paying close attention and deciding what to do next. Curiosity often sits one step before play or caution.',
      why: 'A new sound, smell or person. Dogs gather information before they commit to a reaction.',
      steps: ['Give them a moment to investigate at their own pace', 'Reward calm attention with a quiet word', 'If the focus turns stiff or fixed, create distance'],
      help: 'Curiosity that tips into fixation or stiffness deserves a closer look.'
    },
    anxious: {
      label: 'Anxious & Unsettled', color: 'var(--e-anxious)', face: 'worry',
      read: 'Ears pulled back, a tight mouth, lip licking or a lowered posture are consistent with unease.',
      mean: 'Something about the situation feels uncertain or too much. Your dog may be looking for reassurance or a way out.',
      why: 'Common triggers: new places, loud sounds, crowded spaces, being separated from you, car rides.',
      steps: ['Lower the intensity: more distance, less noise, slower pace', 'Offer a familiar item, a mat or your calm presence', 'Avoid forcing greetings or handling right now'],
      help: 'If anxiety shows up daily or stops your dog from eating, sleeping or settling, talk to a vet or a certified behaviorist.'
    },
    frightened: {
      label: 'Frightened & Wary', color: 'var(--e-frightened)', face: 'fear',
      read: 'A tucked tail, wide eyes with visible whites, flattened ears or a crouched body point to fear.',
      mean: 'Your dog feels unsafe and may try to escape, freeze or, if cornered, defend themselves.',
      why: 'Sudden movements, unfamiliar people or dogs, past experiences, fireworks or thunder.',
      steps: ['Give space and an exit. Never corner a frightened dog', 'Speak softly, move slowly, stay side-on', 'Move away from the trigger before it escalates'],
      help: 'Fear that is frequent, intense or growing calls for a vet visit to rule out pain, then a behavior plan.'
    },
    aggressive: {
      label: 'Tense & Defensive', color: 'var(--e-aggressive)', face: 'alert',
      read: 'A hard stare, stiff body, wrinkled muzzle or bared teeth are warning signals. Your dog is asking for distance.',
      mean: 'Your dog feels threatened and is communicating clearly. This is information, not misbehavior.',
      why: 'Guarding food, toys or a resting spot. Fear that has run out of options. Pain or illness.',
      steps: ['Stop and give distance now. Do not punish the warning', 'Remove other dogs, children or the contested item', 'Note the trigger for your vet or behaviorist'],
      help: 'Please involve a professional. Growling or snapping around people or dogs is urgent, and pain is a common hidden cause.'
    }
  };
  const SHORT = { happy: 'Happy', inquisitive: 'Curious', anxious: 'Anxious', frightened: 'Frightened', aggressive: 'Tense' }; // user-facing names; the raw class keys stay internal
  // Dr. Con's decision tree (sheet dated 2026-01-29): one path per state through tail, ears, mouth, brow, eyes, head.
  const CUE_KEYS = ['tail', 'ears', 'mouth', 'brow', 'eyes', 'head'];
  const CUES = {
    happy:       { tail: 'Up, wagging fast',              ears: 'Up and forward', mouth: 'Completely open',      brow: 'Up',      eyes: 'Open',          head: 'Up' },
    aggressive:  { tail: 'Up, wagging slowly',            ears: 'Up and forward', mouth: 'Forward, partly open', brow: 'Lowered', eyes: 'Partly closed', head: 'Up' },
    inquisitive: { tail: 'Horizontal, wagging slowly',    ears: 'Up and forward', mouth: 'Partly open',          brow: 'Neutral', eyes: 'Open',          head: 'Up' },
    anxious:     { tail: 'Part-way down',                 ears: 'To the side',    mouth: 'Open',                 brow: 'Neutral', eyes: 'Open',          head: 'Partly lowered' },
    frightened:  { tail: 'Down, pressed tight to the body', ears: 'Pressed back', mouth: 'Open',                 brow: 'Neutral', eyes: 'Open',          head: 'Down' }
  };
  const CONTEXTS = ['At home', 'With another dog', 'On a walk', 'Eating', 'In the car', 'With a child', 'Other'];
  const CONTEXT_PHRASE = { 'At home': 'at home', 'With another dog': 'with another dog', 'On a walk': 'on a walk', 'Eating': 'while eating', 'In the car': 'in the car', 'With a child': 'with a child', 'Other': '' };
  const CONTEXT_NOTES = {
    'In the car': { anxious: 'Car rides are one of the most common anxiety triggers: motion, confinement and anticipation stack up.', frightened: 'Many dogs link the car with vet visits or motion sickness. Short, happy trips rebuild the association.', happy: 'A relaxed dog in the car is a dog that has learned trips end somewhere good.' },
    'With another dog': { inquisitive: 'Dogs read each other in seconds. Curiosity here is the normal first step of a greeting.', aggressive: 'Stiffness around another dog is a request for space. Separate calmly before anyone commits.', frightened: 'A dog that is scared of other dogs needs distance first and introductions later, one calm dog at a time.', anxious: 'Loose leashes and curved approaches lower the pressure of a dog-to-dog meeting.' },
    'On a walk': { inquisitive: 'Walks are information gathering. Sniffing time is as valuable as distance.', anxious: 'Busy streets, bikes and strangers add up. A quieter route or time of day can change the whole walk.', aggressive: 'Leash tension often turns worry into reactivity. Distance and a loose leash help more than correction.' },
    'Eating': { aggressive: 'Guarding food is common and manageable. Give space while eating and trade up for higher-value treats later.', anxious: 'Dogs that eat nervously often prefer a quiet corner away from foot traffic.', happy: 'Food plus calm equals a happy dog. Keep mealtimes predictable.' },
    'With a child': { anxious: 'Children move fast and hug hard. Watch for lip licks and turning away: those are early requests for a break.', frightened: 'Give your dog an exit and teach the child to let the dog come to them.', aggressive: 'Separate right away and supervise every interaction. A warning is a gift; take it seriously.', happy: 'Relaxed with a child is wonderful. Keep supervising and teach gentle hands.' },
    'At home': { anxious: 'At home, anxiety often points to a specific trigger: a sound, a visitor pattern or being left alone.', frightened: 'Check for a new sound or object. Dogs can be startled by things we stop noticing.' }
  };
  const TIPS = [
    { t: 'A yawn outside of bedtime is often a stress signal. Watch for it before your dog reaches a new place.', img: 'img/hero-dog.jpg' },
    { t: 'Try a new game to spot signs of stress or fatigue. Watch for subtle body cues, not just one behavior.', img: 'img/hero-dog.jpg' },
    { t: 'Lip licking with no food around is one of the earliest signs your dog wants a break.', img: 'img/hero-dog.jpg' },
    { t: 'Sniffing is how dogs read the news. Five minutes of sniffing can tire a dog more than a jog.', img: 'img/hero-dog.jpg' },
    { t: 'A wagging tail is not always a happy tail. Height, speed and stiffness tell the real story.', img: 'img/hero-dog.jpg' }
  ];
  const ARTICLES = [
    { id: 'five', title: 'The five states Zoolingua reads', sub: 'Overview of the model', swatch: 'ico-teal', icon: 'book',
      body: ['Zoolingua reads a dog from a photo or short clip and sorts what it sees into five states: happy, curious, anxious, frightened and tense. You get a top reading plus all five percentages, because the mix matters as much as the headline.',
        'The percentages matter. A reading of 90% happy is a different animal from 45% happy with 40% anxious. The second one is a dog on the fence, and the fence is where most behavior problems begin.',
        'Every reading is grounded in Dr. Con Slobodchikoff\'s methodology for animal communication: look at the whole body, in context, and treat every signal as information about how the animal feels.',
        '<h3>What each state looks like</h3>Soft eyes, a loose mouth and an easy posture read as relaxed. Forward ears and a focused gaze read as curious. Pinned ears, lip licks and a lowered body read as anxious. Wide eyes, a tucked tail and a crouch read as frightened. A hard stare, a stiff body and bared teeth read as tense. A short clip adds how those change over a few seconds.',
        '<h3>What it does not do</h3>It does not diagnose. Pain, illness and medication all change behavior. If a reading surprises you, the first call is to your vet.'] },
    { id: 'tree', title: "Dr. Con's decision tree", sub: 'Tail, ears, mouth, brow, eyes, head', swatch: 'ico-teal', icon: 'flow',
      body: ['Dr. Con reads a dog in a fixed order: tail first, then ears, mouth, brow, eyes and head. Each state has one path through those six cues. Zoolingua\'s readings are checked against this tree, and every result shows the path for the state it found so you can compare it with the dog in front of you.',
        'TREE_TABLE',
        '<h3>How to use it</h3>Start at the tail. Up and wagging fast points toward happy; up and wagging slowly toward tense; horizontal toward curious; part-way down toward anxious; pressed tight to the body toward frightened. Then confirm with the ears, mouth, brow, eyes and head. When the cues disagree, trust the body over the face and give the dog space while you watch a little longer.'] },
    { id: 'happy', title: 'Happy & Relaxed', sub: 'What it looks like and what to do', swatch: 'ico-mint', icon: 'smile', emo: 'happy' },
    { id: 'inquisitive', title: 'Curious & Interested', sub: 'The moment before a decision', swatch: 'ico-teal', icon: 'look', emo: 'inquisitive' },
    { id: 'anxious', title: 'Anxious & Unsettled', sub: 'Early signs and quick relief', swatch: 'ico-orange', icon: 'worry', emo: 'anxious' },
    { id: 'frightened', title: 'Frightened & Wary', sub: 'Space, exits and patience', swatch: 'ico-purple', icon: 'fear', emo: 'frightened' },
    { id: 'aggressive', title: 'Tense & Defensive', sub: 'Warnings are information', swatch: 'ico-orange', icon: 'alert', emo: 'aggressive' },
    { id: 'video', title: 'Why a short video beats a photo', sub: 'Behavior lives in motion', swatch: 'ico-teal', icon: 'video',
      body: ['A photo freezes one instant. A dog can look worried mid-blink and relaxed a second later. A short clip gives Zoolingua several moments to read instead of one, so a single odd frame does not decide the result.',
        'When you record, hold the phone at your dog\'s eye level, keep the whole body in frame and do not call their name. You want the behavior as it is, not a reaction to you.',
        '<h3>What the timeline shows</h3>Zoolingua samples several moments across your clip and reads each one. The strip under the result shows how the mood moved. A clip that starts curious and ends anxious tells you something a single frame cannot.'] },
    { id: 'greeting', title: 'Meeting a new dog: the first thirty seconds', sub: 'Curved approaches and loose leashes', swatch: 'ico-purple', icon: 'paw',
      body: ['Dogs that meet head-on, on tight leashes, are being asked to do something rude by dog standards. Give them a curve: approach at an angle, keep the leash loose and let them sniff for three seconds before you move on.',
        'Watch both dogs, not just yours. Stiff tails held high, a hard stare or a frozen posture mean the greeting should end now, calmly, with distance.',
        'Short, successful meetings beat long ones. End on a good note and walk on together for a minute. Side by side is how dogs make friends.'] },
    { id: 'science', title: 'About the science', sub: 'Dr. Con Slobodchikoff and 40 years of research', swatch: 'ico-teal', icon: 'science',
      body: ['Zoolingua is built on the work of Dr. Con Slobodchikoff, Professor Emeritus of Biology at Northern Arizona University and author of around 100 scientific papers and popular articles on animal language, behavior and evolution.',
        'His research showed that prairie dog alarm calls carry semantic information: they encode the type of predator, and even its color and size. The same principle drives Zoolingua: animals send specific, decodable signals, and the job is to listen properly.',
        '<h3>Peer-reviewed research</h3><div class="pub"><b>1991</b><span>Animal Behaviour. Semantic information distinguishing individual predators in the alarm calls of Gunnison\'s prairie dogs.</span></div><div class="pub"><b>2009</b><span>Animal Cognition. Prairie dog alarm calls encode labels about predator colors.</span></div><div class="pub"><b>2018</b><span>Scientific Research Communication. Prairie Dog Chatter: The Science Behind a New Language.</span></div>',
        '<h3>Books</h3><div class="pub"><b>Book</b><span>Chasing Doctor Dolittle: Learning the Language of Animals.</span></div><div class="pub"><b>Book</b><span>Prairie Dogs: Communication and Community in an Animal Society (with Bianca S. Perla and Jennifer L. Verdolin).</span></div>',
        'Featured in People, The Guardian and YouTube/Animalogic. Full publication list at conslobodchikoff.com/publications.'] },
    { id: 'how', title: 'How Zoolingua works', sub: 'From upload to understanding', swatch: 'ico-orange', icon: 'flow',
      body: ['<img src="img/how-it-works.jpg" alt="How Zoolingua works: upload a photo or video, get behavior insights, access 24/7 behavioral telehealth, save, learn and connect" loading="lazy">',
        '<h3>1. Upload a photo or video</h3>JPG, PNG or a short clip. The model runs on your phone, so nothing waits on a server.',
        '<h3>2. Get behavior insights</h3>Five percentages, a plain-language interpretation and what it may mean in your context.',
        '<h3>3. Access 24/7 behavioral telehealth</h3>Today: the automated Zoolingua guide, with next steps based on your dog\'s reading. At launch: live behavior experts using Dr. Con\'s methodology.',
        '<h3>4. Save, learn and connect</h3>Track moods over time, keep health records in one place and compare notes with other dog parents.'] }
  ];
  const SEED_POSTS = [
    { id: 'p1', who: 'Sarah & Milo', color: '#E4705B', ago: 2 * 3600, title: 'Overexcited greetings, need advice', body: "Milo gets so excited when guests arrive. He jumps and mouths. What's worked for your dogs?", tags: ['Behavior Questions', 'Greetings'], likes: 24,
      replies: [{ who: 'Dana & Scout', text: 'Leash on before the door opens, and guests ignore him until all four paws are on the floor. Took us two weeks.' }, { who: 'Zoolingua Guide', expert: true, text: 'Jumping is usually excitement plus not knowing what else to do. Give Milo a job: a mat by the door and a treat scatter the moment guests come in. Reward the floor, not the greeting.' }, { who: 'Ravi & Pickles', text: 'Same dog, different name. The mat trick works for us too.' }] },
    { id: 'p2', who: 'James & Luna', color: '#3F7FB5', ago: 5 * 3600, title: 'Car ride anxiety', body: 'Luna pants and whines in the car. Looking for tips to help her relax.', tags: ['Training Tips', 'Car Anxiety'], likes: 15,
      replies: [{ who: 'Zoolingua Guide', expert: true, text: 'Start with the car parked: sit together, treats, then out. Then the engine on. Then around the block to a park. Each step ends somewhere good, so the car stops predicting the vet.' }, { who: 'Mia & Bear', text: 'A covered crate in the back seat changed everything for us. Less to look at, less to worry about.' }] },
    { id: 'p3', who: 'Priya & Biscuit', color: '#2E9E8F', ago: 9 * 3600, title: 'Barking at the window all afternoon', body: 'Biscuit stands on the sofa and barks at every person who walks past. The mail carrier gets a full concert.', tags: ['Behavior Questions'], likes: 9,
      replies: [{ who: 'Owen & Juniper', text: 'Frosted window film on the bottom half of the glass. Cheap and it worked the same day.' }] },
    { id: 'p4', who: 'Marcus & Duke', color: '#7C5CC4', ago: 26 * 3600, title: "First week with a rescue, he won't eat with us in the room", body: 'Duke came home Saturday. He eats only when we leave the kitchen. Normal for a rescue?', tags: ['Rescues', 'Behavior Questions'], likes: 31,
      replies: [{ who: 'Zoolingua Guide', expert: true, text: 'Very normal in the first weeks. Eating is a vulnerable moment. Leave the room, keep the routine identical every day, and let him choose to come closer. Most dogs shorten the gap on their own.' }, { who: 'Leah & Tofu', text: 'Our rescue took three weeks. Now she eats with her bowl touching my foot.' }] },
    { id: 'p5', who: 'Elena & Pepper', color: '#E0A33A', ago: 2 * 86400, title: "Does anyone else's puppy get the zoomies at 9pm sharp?", body: 'Every night, same time, Pepper turns into a race car. Is this a thing?', tags: ['Puppies'], likes: 58,
      replies: [{ who: 'Noah & Waffles', text: 'It is absolutely a thing. Ours is 8:45 and you could set a clock by it.' }, { who: 'Zoolingua Guide', expert: true, text: 'Evening zoomies are a release of leftover energy before sleep. A short sniff walk or a chew an hour earlier usually shortens the show.' }] },
    { id: 'p6', who: 'Tom & Olive', color: '#0E5C6E', ago: 3 * 86400, title: "Reading my dog's play bow vs about to bolt", body: 'Olive drops her front end a lot. Sometimes it is play, sometimes she is about to run. How do you tell?', tags: ['Training Tips', 'Body Language'], likes: 12,
      replies: [{ who: 'Zoolingua Guide', expert: true, text: 'Look at the mouth and the tail. A play bow comes with a loose, open mouth and a wagging tail at mid height. A bolt comes with a closed mouth, ears back and weight shifted to the rear.' }] }
  ];
  const TAG_FILTERS = ['All', 'Behavior Questions', 'Training Tips', 'Puppies', 'Rescues', 'Body Language'];
  const SAMPLE_DOG = { name: 'Milo', breed: 'Golden Retriever', age: '3 yrs', photo: 'img/hero-dog.jpg', sample: true };
  const SAMPLE_RECORDS = [
    { id: 'r1', kind: 'vaccine', title: 'Rabies vaccine', note: 'Booster given. Next due March 2029.', date: '2026-03-12', sample: true },
    { id: 'r2', kind: 'med', title: 'Heartworm prevention', note: 'Monthly chew, first of each month.', date: '2026-10-01', sample: true },
    { id: 'r3', kind: 'vet', title: 'Annual exam', note: 'Healthy weight, teeth cleaned. Vet noted mild anxiety on the table.', date: '2026-03-12', sample: true }
  ];
  // Keyword rules: specific triggers first, generic last; anchored at the start of a word so "scared" is not "car" and "treat" is not "eat".
  const CHAT_RULES = [
    { k: /\bgrowl|\bsnap(s|ped|ping)?\b|\bbit(e|es|ing|ten)\b|\bteeth\b|\blung(e|es|ed|ing)\b|\baggress/i, r: 'A growl is a warning and a gift: your dog is telling you before acting. Do not punish it, or you lose the warning. Right now, give distance and remove the trigger (other dog, child, food, toy). Then please book a vet visit to rule out pain, and a certified behaviorist for a plan. This is one to take seriously and early.' },
    { k: /\bthunder|\bfirework|\bnoise|\bloud\b|\bstorm/i, r: 'Noise fear is common and worth treating early, because it tends to grow. Tonight: a den (covered crate or closet), white noise or a fan, and stay calm yourself. Long term: play recorded sounds at a whisper during meals and raise the volume over weeks. Ask your vet about options if the fear is intense.' },
    { k: /\balone\b|\bseparation|\bleav(e|es|ing)\b|\bhowl|\bcries\b|\bcry(ing)?\b/i, r: 'Separation distress means your dog does not yet believe you come back. Start with absences of seconds, not hours. Pick up keys, step out, step back in. Stretch the time slowly and always come back before the worry starts. A camera helps you see where the limit is.' },
    { k: /\bcars?\b|\bdriv(e|es|ing)\b|\brid(e|es|ing)\b|\btravel/i, r: 'Car rides stack three stressors: motion, confinement and anticipation. Break them apart. Day one, sit in the parked car with treats and get out. Day two, engine on. Day three, around the block to a park. Each trip ends somewhere good, so the car stops predicting the vet.\n\nIf panting or drooling starts within minutes, ask your vet about motion sickness. It looks like anxiety and is often the cause.' },
    { k: /\bguests?\b|\bvisitors?\b|\bjump|\bgreet|\bdoors?\b|\bdoorbell/i, r: 'Jumping at the door is excitement with nowhere to go. Give your dog a job: a mat a few feet from the door, and a scatter of treats on it the moment guests step in. Guests ignore the dog until four paws are on the floor. Reward the floor, never the greeting. Two weeks of consistency usually does it.' },
    { k: /\bbark/i, r: 'Barking is communication, so the first question is what your dog is saying. Window barking is usually alert barking: block the view (frosted film works) and reward quiet. Demand barking: wait it out and reward silence. Fear barking: distance first, then slow exposure. Tell me when it happens and I can narrow it down.' },
    { k: /\beat(s|ing|en)?\b|\bfood\b|\bappetite|\bhungry\b|\bmeals?\b/i, r: 'Appetite changes are one of the first signs of stress or illness. If your dog skipped more than two meals, or there is vomiting, lethargy or diarrhea, call your vet today. If it is a new home or a new routine, keep mealtimes identical every day and give privacy while eating. Most rescues settle within a few weeks.' },
    { k: /\bwalk|\bleash|\bpull(s|ed|ing)?\b|\blead\b/i, r: 'Pulling is usually excitement plus a tight leash that teaches tension. Try this: the moment the leash goes tight, stop. The moment it goes loose, walk. Reward beside your knee. Add sniffing breaks: five minutes of sniffing calms a dog more than another mile.' },
    { k: /\bpupp/i, r: 'Puppies run on a simple formula: sleep, food, play, potty, repeat. Most "problems" are a tired puppy. Aim for 18 hours of sleep a day, short training bursts of two minutes, and socialization that means calm exposure, not forced greetings.' },
    { k: /\banxious|\banxiety|\bstress|\bnervous|\bscared|\bfear|\bfright|\bworr(y|ied)|\bpanic|\bshak(e|es|ing)\b|\bpant(s|ing)?\b/i, r: 'Anxiety has early signs: lip licks, yawning, looking away, a lowered body. Catch those and you can act before the panting and pacing. Lower the intensity of whatever is happening (more distance, less noise, slower pace), offer a familiar item and your calm presence, and avoid forcing handling or greetings. If it shows up daily, a vet and a behaviorist should be your next two calls.' },
    { k: /\bhappy\b|\brelax|\bcalm\b|\bcontent\b/i, r: 'Good news reads matter too. A relaxed dog is the best moment for training, because learning happens fastest when the body is loose. Note what was happening so you can recreate it.' }
  ];

  /* ===================== utilities ===================== */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('zl.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('zl.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable: keep in memory only */ } },
    del(k) { try { localStorage.removeItem('zl.' + k); } catch (e) {} }
  };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const fmtAgo = (sec) => sec < 3600 ? Math.max(1, Math.round(sec / 60)) + 'm' : sec < 86400 ? Math.round(sec / 3600) + 'h' : Math.round(sec / 86400) + 'd';
  const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); };
  const fmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }
  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    community: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M14.5 18.5c.4-2.2 1.6-3.5 3.3-3.5 1.4 0 2.4.8 2.9 2.3"/></svg>',
    learn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5c-1.6-1.4-3.8-2-7-2v13c3.2 0 5.4.6 7 2 1.6-1.4 3.8-2 7-2v-13c-3.2 0-5.4.6-7 2z"/><path d="M12 6.5v13"/></svg>',
    mydog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.5 5 5.5l4 1.5"/><path d="m17 9.5 2-4-4 1.5"/><path d="M7 9.5c0-2 2.2-3 5-3s5 1 5 3c0 1.5 1.5 3 1.5 5.5 0 3.3-2.9 5.5-6.5 5.5S5.5 18.3 5.5 15C5.5 12.5 7 11 7 9.5z"/><circle cx="10" cy="12.5" r=".8" fill="currentColor"/><circle cx="14" cy="12.5" r=".8" fill="currentColor"/><path d="M11 16h2l-1 1.2z" fill="currentColor"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="m5 18 5-5 3 3 2.5-2.5L20 18"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="6" width="12" height="12" rx="2.5"/><path d="m15.5 10 5-2.5v9l-5-2.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="m8 8 4-4 4 4"/><path d="M5 12v8h14v-8"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z"/><circle cx="9" cy="10" r=".9" fill="currentColor"/><circle cx="12" cy="10" r=".9" fill="currentColor"/><circle cx="15" cy="10" r=".9" fill="currentColor"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5.5c0 4.5 3 7.9 7 9.5 4-1.6 7-5 7-9.5V6z"/><path d="m9.5 12 1.8 1.8L15 10"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.3 2.3L15.5 10"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".9" fill="currentColor"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V15h.5A2.5 2.5 0 0 1 5 12.5z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/></svg>',
    paw: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="7.5" cy="9" r="2"/><circle cx="11" cy="5.5" r="2"/><circle cx="15.5" cy="6.5" r="2"/><circle cx="18.5" cy="10.5" r="1.8"/><path d="M12.5 10c-3 0-6 3.2-6 5.8 0 1.8 1.3 2.7 2.8 2.7 1.1 0 1.9-.6 3.2-.6s2.1.6 3.2.6c1.5 0 2.8-.9 2.8-2.7 0-2.6-3-5.8-6-5.8z"/></svg>',
    science: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6L5 18.5A2 2 0 0 0 6.8 21h10.4a2 2 0 0 0 1.8-2.5L14 9V3"/><path d="M7.5 15h9"/></svg>',
    flow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 11 15.6 7"/><path d="m8.3 13 7.3 4"/></svg>',
    pro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5.5c0 4.5 3 7.9 7 9.5 4-1.6 7-5 7-9.5V6z"/><path d="m12 8 1.2 2.5 2.8.4-2 2 .5 2.8L12 14.4l-2.5 1.3.5-2.8-2-2 2.8-.4z"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M8.5 14.5A5.5 5.5 0 1 1 15.5 14.5c-.8.7-1.5 1.6-1.5 2.5h-4c0-.9-.7-1.8-1.5-2.5z"/></svg>',
    vaccine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m14 4 6 6"/><path d="m17 7-9.5 9.5a2 2 0 0 1-2.8 0l-.2-.2a2 2 0 0 1 0-2.8L14 4"/><path d="m4 20 3-3"/><path d="m11 9 2 2"/><path d="m9 11 2 2"/></svg>',
    med: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-40 12 12)"/><path d="m9 8.5 6 7"/></svg>',
    vet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M12 10v6"/><path d="M9 13h6"/><path d="M9 3v3"/><path d="M15 3v3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 6 12 12"/><path d="m18 6-12 12"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z"/><path d="m13 7 4 4"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12v17l-6-4-6 4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/></svg>',
    smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8"/><circle cx="9" cy="10" r=".9" fill="currentColor"/><circle cx="15" cy="10" r=".9" fill="currentColor"/></svg>',
    look: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10.5" r="1.6"/><circle cx="15" cy="10.5" r="1.6"/><circle cx="9.6" cy="10.5" r=".6" fill="currentColor"/><circle cx="15.6" cy="10.5" r=".6" fill="currentColor"/><path d="M10 16h4"/></svg>',
    worry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 16.5c.8-1 1.8-1.5 3-1.5s2.2.5 3 1.5"/><path d="m8 9 2.2 1"/><path d="m16 9-2.2 1"/><circle cx="9.5" cy="11.5" r=".8" fill="currentColor"/><circle cx="14.5" cy="11.5" r=".8" fill="currentColor"/></svg>',
    fear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10.5" r="1.8"/><circle cx="15" cy="10.5" r="1.8"/><ellipse cx="12" cy="16" rx="1.6" ry="1.9"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 16h6"/><path d="m8 9 3 1.2"/><path d="m16 9-3 1.2"/><circle cx="9.3" cy="11.8" r=".8" fill="currentColor"/><circle cx="14.7" cy="11.8" r=".8" fill="currentColor"/></svg>'
  };

  /* ===================== state ===================== */
  const state = {
    dog: store.get('dog', SAMPLE_DOG),
    readings: store.get('readings', null),
    posts: store.get('posts', null),
    likes: store.get('likes', {}),
    records: store.get('records', null),
    chat: store.get('chat', []),
    filter: 'All',
    mydogTab: 'moods',
    current: null,     // current capture {kind:'image'|'video', url, file}
    result: null,      // last analysis
    stack: [],         // navigation stack of {screen, params}
    model: { status: 'idle', progress: 0, error: null },
    installEvent: null
  };
  if (!state.readings) state.readings = state.dog.sample ? sampleReadings() : [];
  if (!state.posts) state.posts = SEED_POSTS.map((p) => ({ ...p, created: Date.now() - p.ago * 1000, replies: p.replies.map((r) => ({ ...r })) }));
  if (!state.records) state.records = state.dog.sample ? SAMPLE_RECORDS.slice() : [];
  function sampleReadings() {
    const now = Date.now();
    return [
      { id: 's1', when: new Date(now - 6 * 86400000).toISOString(), top: 'happy', probs: { happy: 0.78, inquisitive: 0.14, anxious: 0.05, frightened: 0.02, aggressive: 0.01 }, ctx: 'On a walk', note: 'Park, off leash with Luna.', thumb: 'img/hero-dog.jpg', sample: true },
      { id: 's2', when: new Date(now - 3 * 86400000).toISOString(), top: 'anxious', probs: { anxious: 0.61, frightened: 0.18, inquisitive: 0.12, happy: 0.07, aggressive: 0.02 }, ctx: 'In the car', note: 'Ride to the groomer.', thumb: 'img/hero-dog.jpg', sample: true },
      { id: 's3', when: new Date(now - 1 * 86400000).toISOString(), top: 'inquisitive', probs: { inquisitive: 0.55, happy: 0.33, anxious: 0.08, frightened: 0.03, aggressive: 0.01 }, ctx: 'At home', note: 'New vacuum.', thumb: 'img/hero-dog.jpg', sample: true }
    ];
  }
  function persist() { store.set('dog', state.dog); store.set('readings', state.readings); store.set('posts', state.posts); store.set('likes', state.likes); store.set('records', state.records); store.set('chat', state.chat); }

  /* ===================== router ===================== */
  const TABS = ['home', 'community', 'learn', 'mydog'];
  const screens = {};
  // Browser history mirrors the in-app stack: every screen pushed on top of a tab gets a history entry, so the
  // browser / Android back button walks the app instead of leaving it. hist = entries we pushed above the tab root.
  let hist = 0, pendingPops = 0;
  function show(screen, params, push) {
    const replace = push === 'replace';
    if (replace) state.stack.pop();
    if (push !== false) state.stack.push({ screen, params });
    $$('section[data-screen]').forEach((s) => { s.hidden = s.dataset.screen !== screen; });
    const tab = TABS.includes(screen) ? screen : (state.stack.slice().reverse().find((e) => TABS.includes(e.screen)) || {}).screen || 'home';
    $$('.tab').forEach((b) => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (screens[screen]) screens[screen](params || {});
    window.scrollTo({ top: 0 });
    if (booted) { const h = $('section[data-screen="' + screen + '"] h1'); if (h) { h.tabIndex = -1; try { h.focus({ preventScroll: true }); } catch (e) {} } } // move focus to the new screen's heading
    try {
      if (push === false) return;
      if (!replace && state.stack.length > 1) { hist++; history.pushState({ zl: hist }, '', '#' + screen); }
      else history.replaceState({ zl: hist }, '', '#' + screen);
    } catch (e) {}
  }
  function goTab(tab) { state.stack = []; hist = 0; pendingPops = 0; show(tab, {}, true); }
  function back() { state.stack.pop(); const prev = state.stack[state.stack.length - 1]; if (prev) show(prev.screen, prev.params, false); else goTab('home'); }
  // in-app back: go through history when we pushed an entry, so the browser stack stays in step
  function navBack() { if (hist > 0) { hist--; pendingPops++; history.back(); } else back(); }
  window.addEventListener('popstate', () => {
    closeSheets();
    if (pendingPops > 0) { pendingPops--; back(); return; }
    if (state.stack.length > 1) { hist = Math.max(0, hist - 1); back(); return; }
    // at a tab root: other tabs fall back to Home; Home skips stale entries and lets the browser leave the app
    if ((state.stack[0] || {}).screen !== 'home') goTab('home'); else history.back();
  });

  /* ===================== model ===================== */
  let session = null, modelPromise = null;
  // One shared promise: a tap on Analyze while the first download is still running waits for it instead of failing.
  function loadModel() {
    if (session) return Promise.resolve();
    if (modelPromise) return modelPromise;
    modelPromise = (async () => {
      state.model.status = 'loading'; state.model.progress = 0; state.model.error = null; renderModelPill();
      try {
        if (!window.ort) throw new Error('Runtime script did not load');
        ort.env.wasm.wasmPaths = new URL('ort/', location.href).href; // absolute: the runtime import()s its .mjs loader from here
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        const modelUrl = document.documentElement.dataset.model || 'model/zoolingua-sd10.onnx'; // a host may serve the same bytes under another name
        const buf = await fetchProgress(modelUrl, (p) => { state.model.progress = p; renderModelPill(); });
        session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
        state.model.status = 'ready'; renderModelPill();
      } catch (e) {
        console.warn('model load failed', e);
        state.model.status = 'error'; state.model.error = e && e.message ? e.message : String(e); renderModelPill();
      } finally { modelPromise = null; }
    })();
    return modelPromise;
  }
  async function fetchProgress(url, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Model download failed (' + res.status + ')');
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !total) { const b = await res.arrayBuffer(); onProgress(1); return new Uint8Array(b); }
    const reader = res.body.getReader(); const chunks = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress(got / total); }
    const out = new Uint8Array(got); let off = 0; for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }
  function renderModelPill() {
    const el = $('#modelPill'); if (!el) return;
    const m = state.model; el.className = 'model-pill ' + (m.status === 'ready' ? 'ready' : m.status === 'error' ? 'error' : '');
    el.innerHTML = '<span class="dot"></span>' + (m.status === 'ready' ? 'On-device model ready' : m.status === 'loading' ? 'Loading model ' + Math.round(m.progress * 100) + '%' : m.status === 'error' ? 'Model unavailable. Tap to retry' : 'On-device model');
    const st = $('#analyzeStatus'); const an = $('section[data-screen="analyzing"]');
    if (st && an && !an.hidden && m.status === 'loading') st.textContent = 'Loading the on-device model ' + Math.round(m.progress * 100) + '%';
  }
  // Preprocessing mirrors the training pipeline: PIL Resize((224,224)) (bilinear with antialiasing,
  // stretched to the square), then ImageNet normalisation. Reimplemented so phone and server agree.
  function pilWeights(inSize, outSize) {
    const scale = inSize / outSize, fscale = Math.max(1, scale), support = fscale, ss = 1 / fscale, rows = [];
    for (let xx = 0; xx < outSize; xx++) {
      const center = (xx + 0.5) * scale;
      const xmin = Math.max(0, Math.floor(center - support + 0.5)), xmax = Math.min(inSize, Math.floor(center + support + 0.5));
      const w = []; let sum = 0;
      for (let x = xmin; x < xmax; x++) { const t = Math.abs((x - center + 0.5) * ss); const v = t < 1 ? 1 - t : 0; w.push(v); sum += v; }
      rows.push({ xmin, w: w.map((v) => v / sum) });
    }
    return rows;
  }
  function pilResize(data, sw, sh, dw, dh) {
    const wx = pilWeights(sw, dw), wy = pilWeights(sh, dh);
    const tmp = new Uint8ClampedArray(dw * sh * 3);
    for (let y = 0; y < sh; y++) {
      const row = y * sw * 4;
      for (let x = 0; x < dw; x++) {
        const { xmin, w } = wx[x]; let r = 0, g = 0, b = 0;
        for (let k = 0; k < w.length; k++) { const p = row + (xmin + k) * 4; r += data[p] * w[k]; g += data[p + 1] * w[k]; b += data[p + 2] * w[k]; }
        const o = (y * dw + x) * 3; tmp[o] = Math.round(r); tmp[o + 1] = Math.round(g); tmp[o + 2] = Math.round(b);
      }
    }
    const out = new Uint8ClampedArray(dw * dh * 3);
    for (let y = 0; y < dh; y++) {
      const { xmin, w } = wy[y];
      for (let x = 0; x < dw; x++) {
        let r = 0, g = 0, b = 0;
        for (let k = 0; k < w.length; k++) { const p = ((xmin + k) * dw + x) * 3; r += tmp[p] * w[k]; g += tmp[p + 1] * w[k]; b += tmp[p + 2] * w[k]; }
        const o = (y * dw + x) * 3; out[o] = Math.round(r); out[o + 1] = Math.round(g); out[o + 2] = Math.round(b);
      }
    }
    return out;
  }
  function toInputTensor(src, sw, sh) {
    // Very large photos are first brought down to ~1280px with the canvas (area-quality), which keeps memory
    // sane; the final step to 224 is the exact PIL filter.
    const MAX = 1280; let w = sw, h = sh;
    if (Math.max(w, h) > MAX) { const s = MAX / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, w, h);
    const rgb = pilResize(g.getImageData(0, 0, w, h).data, w, h, 224, 224);
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    const out = new Float32Array(3 * 224 * 224);
    for (let i = 0, p = 0; i < 224 * 224; i++, p += 3) {
      out[i] = (rgb[p] / 255 - mean[0]) / std[0];
      out[224 * 224 + i] = (rgb[p + 1] / 255 - mean[1]) / std[1];
      out[2 * 224 * 224 + i] = (rgb[p + 2] / 255 - mean[2]) / std[2];
    }
    return out;
  }
  async function classify(src, sw, sh) {
    const data = toInputTensor(src, sw, sh);
    const out = await session.run({ input: new ort.Tensor('float32', data, [1, 3, 224, 224]) });
    const logits = Array.from(out.logits.data);
    const mx = Math.max(...logits); const ex = logits.map((v) => Math.exp(v - mx)); const sum = ex.reduce((a, b) => a + b, 0);
    const probs = {}; CLASSES.forEach((c, i) => { probs[c] = ex[i] / sum; });
    return probs;
  }
  function loadImage(url) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Could not read that image')); im.src = url; }); }
  function thumbFrom(src, sw, sh, size) {
    const s = size || 320; const scale = Math.min(1, s / Math.max(sw, sh));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * scale)); c.height = Math.max(1, Math.round(sh * scale));
    const g = c.getContext('2d'); g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  }

  /* ===================== analysis flow ===================== */
  let runId = 0;
  async function analyzeCurrent() {
    const cur = state.current; if (!cur) return;
    if ((state.stack[state.stack.length - 1] || {}).screen === 'analyzing') return; // double tap: one run only
    const my = ++runId;
    // the run is abandoned as soon as the user leaves the analyzing screen (Back, a tab) or starts another run
    const alive = () => my === runId && (state.stack[state.stack.length - 1] || {}).screen === 'analyzing';
    const ctx = $$('#ctxChips .chip').find((c) => c.getAttribute('aria-pressed') === 'true');
    const note = $('#noteInput').value.trim().slice(0, 200);
    show('analyzing', {});
    $('#scanImg').src = cur.kind === 'image' ? cur.url : (cur.poster || 'img/logo.png'); // a video URL in an <img> renders as a broken image
    const prog = $('#analyzeProgress span'); const stat = $('#analyzeStatus'); const bar = $('#analyzeProgress');
    const setP = (p, t) => { prog.style.width = Math.round(p * 100) + '%'; bar.setAttribute('aria-valuenow', Math.round(p * 100)); if (t) stat.textContent = t; };
    setP(0, 'Preparing');
    try {
      if (!session) { setP(0.05, 'Loading the on-device model'); await loadModel(); if (!session) throw new Error(state.model.error || 'Model unavailable'); }
      if (!alive()) return;
      let probs, frames = null, thumb;
      if (cur.kind === 'image') {
        setP(0.4, 'Reading body language');
        const im = await loadImage(cur.url);
        if (!alive()) return;
        probs = await classify(im, im.naturalWidth, im.naturalHeight);
        thumb = thumbFrom(im, im.naturalWidth, im.naturalHeight);
        setP(1, 'Done');
      } else {
        const v = $('#hiddenVideo'); v.src = cur.url; v.muted = true; v.playsInline = true; v.load();
        await new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error('That video is taking too long to open')), 10000);
          v.onloadedmetadata = () => { clearTimeout(t); res(); }; v.onerror = () => { clearTimeout(t); rej(new Error('Could not read that video')); };
        });
        if (!isFinite(v.duration)) { // recorded WebMs report Infinity until the end is probed
          await new Promise((res) => { const t = setTimeout(res, 4000); v.ondurationchange = () => { if (isFinite(v.duration)) { clearTimeout(t); res(); } }; v.currentTime = 1e6; });
          v.currentTime = 0;
        }
        try { await v.play(); v.pause(); } catch (e) { /* autoplay refused: seeking still works */ } // iOS decodes frames only after a play
        if (!alive()) return;
        const dur = Math.min(isFinite(v.duration) ? v.duration : 0, 60); if (!dur) throw new Error('That clip has no readable length');
        if (!v.videoWidth || !v.videoHeight) throw new Error('That file has no video picture to read');
        const n = Math.max(4, Math.min(12, Math.round(dur * 1.2)));
        frames = []; const sums = {}; CLASSES.forEach((c) => { sums[c] = 0; });
        for (let i = 0; i < n; i++) {
          const t = (dur * (i + 0.5)) / n;
          const ok = await seekTo(v, t);
          if (!alive()) return;
          if (!ok || v.readyState < 2) { setP(0.1 + 0.85 * ((i + 1) / n), 'Skipping a moment that would not load'); continue; }
          const p = await classify(v, v.videoWidth, v.videoHeight);
          frames.push({ t, probs: p }); CLASSES.forEach((c) => { sums[c] += p[c]; });
          if (frames.length === 1) $('#scanImg').src = thumbFrom(v, v.videoWidth, v.videoHeight);
          if (i === Math.floor(n / 2)) thumb = thumbFrom(v, v.videoWidth, v.videoHeight);
          setP(0.1 + 0.85 * ((i + 1) / n), 'Reading moment ' + (i + 1) + ' of ' + n);
        }
        if (!frames.length) throw new Error('Could not read any frames from that clip');
        probs = {}; CLASSES.forEach((c) => { probs[c] = sums[c] / frames.length; });
        if (!thumb) thumb = thumbFrom(v, v.videoWidth, v.videoHeight);
        setP(1, 'Done');
      }
      if (!alive()) return;
      state.result = { id: uid(), when: new Date().toISOString(), kind: cur.kind, url: cur.url, thumb, probs, top: topOf(probs), ctx: ctx ? ctx.textContent.trim() : '', note, frames, saved: false };
      state.current = null; // the next visit to Understand starts clean; the result keeps its own media URL
      $('#fileImage').value = ''; $('#fileVideo').value = ''; $('#fileCamera').value = '';
      // the result replaces the analyzing screen in the stack, so Back from the result returns to Understand
      setTimeout(() => { if (alive()) show('result', { fromAnalysis: true }, 'replace'); }, 250);
    } catch (e) {
      console.warn(e); // expected for unreadable files; the user gets the toast
      if (!alive()) return;
      toast(e.message || 'Something went wrong reading that');
      navBack();
    }
  }
  function seekTo(v, t) {
    return new Promise((res) => {
      let timer;
      const done = (ok) => { clearTimeout(timer); v.removeEventListener('seeked', onSeek); setTimeout(() => res(ok), 30); };
      const onSeek = () => done(true);
      timer = setTimeout(() => done(false), 4000); // never hang the run on a seek that does not report back
      v.addEventListener('seeked', onSeek); v.currentTime = t;
    });
  }
  function topOf(probs) { return CLASSES.slice().sort((a, b) => probs[b] - probs[a])[0]; }
  function ranked(probs) { return CLASSES.slice().sort((a, b) => probs[b] - probs[a]); }

  /* ===================== screens ===================== */
  function dogPlaceholder(name) {
    const letter = (name || '?').trim().charAt(0).toUpperCase();
    return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#0E5C6E"/><circle cx="100" cy="100" r="62" fill="#093E4E"/><text x="100" y="124" text-anchor="middle" font-family="DM Sans, Inter, sans-serif" font-size="72" font-weight="700" fill="#FFFFFF">' + letter.replace(/[<>&"]/g, '') + '</text></svg>');
  }
  screens.home = function () {
    const dog = state.dog;
    $('#heroImg').src = dog.photo || (dog.sample ? 'img/hero-dog.jpg' : dogPlaceholder(dog.name));
    $('#heroCap').textContent = dog.sample ? 'Meet Milo, our sample dog' : (dog.photo ? dog.name : dog.name + ' · add a photo in My Dog');
    const tip = TIPS[new Date().getDate() % TIPS.length];
    $('#tipText').textContent = tip.t;
    renderModelPill();
    const mine = state.readings.filter((r) => !r.sample).slice(-8).reverse();
    const wrap = $('#recentWrap');
    if (!mine.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    $('#recent').innerHTML = mine.map((r) => '<button class="mini" data-id="' + r.id + '"><img src="' + r.thumb + '" alt=""><div class="cap"><b>' + esc(EMO[r.top].label.split(' &')[0]) + '</b><span class="small">' + esc(fmtDate(r.when)) + '</span></div></button>').join('');
    $$('#recent .mini').forEach((b) => b.addEventListener('click', () => { const r = state.readings.find((x) => x.id === b.dataset.id); if (r) { state.result = { ...r, saved: true }; show('result', {}); } }));
  };

  screens.understand = function () {
    renderPreview();
    $('#ctxChips').innerHTML = CONTEXTS.map((c) => '<button class="chip" aria-pressed="false">' + esc(c) + '</button>').join('');
    $$('#ctxChips .chip').forEach((b) => b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') === 'true'; $$('#ctxChips .chip').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', on ? 'false' : 'true'); }));
    $('#noteInput').value = ''; $('#noteCount').textContent = '0/200';
  };
  function renderPreview() {
    const cur = state.current; const pv = $('#preview'); const opts = $('#captureOptions');
    if (!cur) { pv.hidden = true; opts.hidden = false; $('#analyzeBtn').disabled = true; return; }
    pv.hidden = false; opts.hidden = true; $('#analyzeBtn').disabled = false;
    $('#previewMedia').innerHTML = cur.kind === 'image' ? '<img src="' + cur.url + '" alt="Your dog">' : '<video src="' + cur.url + '" muted playsinline autoplay loop></video>';
  }
  function setCapture(file, hint) {
    if (!file) return;
    if (state.current && state.current.url) { try { URL.revokeObjectURL(state.current.url); } catch (e) {} }
    const kind = file.type ? (file.type.startsWith('video/') ? 'video' : 'image') : (hint || (/\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name) ? 'video' : 'image'));
    if (kind === 'video' && file.size > 200 * 1024 * 1024) { toast('That video is too large. Keep clips under 60 seconds.'); return; }
    state.current = { kind, url: URL.createObjectURL(file), file };
    renderPreview();
    if (!session) loadModel();
  }

  screens.result = function (params) {
    const r = state.result; if (!r) { goTab('home'); return; }
    const top = EMO[r.top]; const order = ranked(r.probs); const p1 = r.probs[order[0]], p2 = r.probs[order[1]];
    $('#resultMedia').innerHTML = r.kind === 'video' && r.url && params.fromAnalysis ? '<video src="' + r.url + '" poster="' + (r.thumb || '') + '" muted playsinline autoplay loop></video>' : '<img src="' + (r.thumb || r.url) + '" alt="Your dog">';
    $('#verdictFace').style.background = top.color; $('#verdictFace').innerHTML = ICONS[top.face];
    $('#verdictLabel').textContent = top.label;
    $('#verdictConf').innerHTML = '<b class="num">' + Math.round(p1 * 100) + '%</b> confidence';
    const bar = $('#confBar span'); bar.style.background = top.color; bar.style.width = '0'; requestAnimationFrame(() => { bar.style.width = Math.round(p1 * 100) + '%'; });
    const mixed = p1 < 0.5 || p1 - p2 < 0.12;
    $('#mixedNote').hidden = !mixed;
    if (mixed) $('#mixedText').textContent = 'Mixed signals: ' + top.label.split(' &')[0].toLowerCase() + ' with some ' + EMO[order[1]].label.split(' &')[0].toLowerCase() + '. ' + (r.kind === 'video' ? 'The mood moved during the clip; see the timeline below.' : 'A photo captures one instant. A short video reads body language in motion and usually gives a clearer answer.');
    $('#breakdown').innerHTML = order.map((c, i) => '<div class="brow' + (i === 0 ? ' top' : '') + '"><span class="name"><i class="sw" style="background:' + EMO[c].color + '"></i>' + SHORT[c] + '</span><span class="bar"><span data-w="' + Math.round(r.probs[c] * 100) + '" style="background:' + EMO[c].color + '"></span></span><span class="pct num">' + Math.round(r.probs[c] * 100) + '%</span></div>').join('');
    requestAnimationFrame(() => $$('#breakdown .bar > span').forEach((s) => { s.style.width = s.dataset.w + '%'; }));
    const tl = $('#timelineWrap');
    if (r.frames && r.frames.length) {
      tl.hidden = false;
      const frameTop = (f) => f.top || topOf(f.probs); // saved readings keep only each frame's top class
      $('#timelineStrip').innerHTML = r.frames.map((f) => { const t = frameTop(f); return '<span style="background:' + EMO[t].color + '" title="' + Math.round(f.t) + 's: ' + EMO[t].label + '"></span>'; }).join('');
      $('#timelineStrip').setAttribute('aria-label', 'Mood over the clip: ' + runs(r.frames.map((f) => SHORT[frameTop(f)]), r.frames.map((f) => Math.round(f.t))));
      const used = Array.from(new Set(r.frames.map(frameTop)));
      $('#timelineLegend').innerHTML = used.map((c) => '<span><i style="background:' + EMO[c].color + '"></i>' + SHORT[c] + '</span>').join('');
      $('#timelineEnd').textContent = Math.round(r.frames[r.frames.length - 1].t + (r.frames[1] ? (r.frames[1].t - r.frames[0].t) / 2 : 0)) + 's';
    } else tl.hidden = true;
    $('#readText').textContent = top.read;
    $('#meanText').textContent = top.mean;
    const ctxNote = r.ctx && CONTEXT_NOTES[r.ctx] && CONTEXT_NOTES[r.ctx][r.top];
    $('#whyText').textContent = top.why + (ctxNote ? ' ' + ctxNote : '');
    const ctxShown = r.ctx && r.ctx !== 'Other' ? r.ctx : '';
    $('#ctxLine').textContent = [ctxShown ? 'Context: ' + ctxShown : '', r.note ? '"' + r.note + '"' : ''].filter(Boolean).join(' · ');
    $('#ctxLine').hidden = !ctxShown && !r.note;
    $('#stepsList').innerHTML = top.steps.map((s) => '<div class="step">' + ICONS.check + '<span>' + esc(s) + '</span></div>').join('');
    $('#helpText').textContent = top.help;
    $('#cueList').innerHTML = CUE_KEYS.map((k) => '<b>' + k.charAt(0).toUpperCase() + k.slice(1) + '</b><span>' + esc(CUES[r.top][k]) + '</span>').join('');
    const saveBtn = $('#saveBtn'); saveBtn.innerHTML = ICONS.bookmark + (r.saved ? ' Saved to My Dog' : ' Save to My Dog'); saveBtn.disabled = !!r.saved;
    $('#resultWhen').textContent = fmtTime(r.when) + (r.kind === 'video' ? ' · video' : ' · photo');
  };
  function saveResult() {
    const r = state.result; if (!r || r.saved) return;
    if (state.dog.sample) { state.readings = state.readings.filter((x) => !x.sample); }
    state.readings.push({ id: r.id, when: r.when, top: r.top, probs: r.probs, ctx: r.ctx, note: r.note, thumb: r.thumb, kind: r.kind, frames: r.frames ? r.frames.map((f) => ({ t: f.t, top: f.top || topOf(f.probs) })) : null });
    r.saved = true; persist();
    const saveBtn = $('#saveBtn'); saveBtn.innerHTML = ICONS.bookmark + ' Saved to My Dog'; saveBtn.disabled = true; // button only: keep the video playing and the bars still
    toast('Saved to ' + (state.dog.sample ? 'My Dog' : state.dog.name));
  }
  // "Curious 0-2s, Anxious 3-4s": group consecutive frames with the same reading for screen readers
  function runs(labels, times) {
    const out = []; let i = 0;
    while (i < labels.length) { let j = i; while (j + 1 < labels.length && labels[j + 1] === labels[i]) j++; out.push(labels[i] + ' ' + times[i] + (j > i ? '-' + times[j] : '') + 's'); i = j + 1; }
    return out.join(', ');
  }
  async function shareResult() {
    const r = state.result; if (!r) return;
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
    g.fillStyle = '#FBF7F4'; g.fillRect(0, 0, 1080, 1350);
    try { const im = await loadImage(r.thumb || r.url); const s = Math.max(1080 / im.width, 1000 / im.height); const w = im.width * s, h = im.height * s; g.drawImage(im, (1080 - w) / 2, (1000 - h) / 2, w, h); } catch (e) {}
    g.fillStyle = '#093E4E'; g.fillRect(0, 1000, 1080, 350);
    g.fillStyle = '#fff'; g.font = '700 64px "DM Sans", Inter, sans-serif'; g.fillText(EMO[r.top].label, 60, 1095);
    g.font = '400 40px Inter, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(Math.round(r.probs[r.top] * 100) + '% confidence · read by Zoolingua', 60, 1160);
    g.font = '700 34px "DM Sans", Inter, sans-serif'; g.fillStyle = '#6CC0AE'; g.fillText('Z O O L I N G U A', 60, 1260);
    g.font = '400 30px Inter, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText('Understand what your dog is telling you.', 60, 1305);
    const url = c.toDataURL('image/jpeg', 0.9);
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], 'zoolingua-reading.jpg', { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Zoolingua reading', text: EMO[r.top].label + ' · read by Zoolingua' }); return; } catch (e) { if (e && e.name === 'AbortError') return; /* other failures fall through to the preview */ } }
    $('#shareImg').src = url; $('#shareDl').href = url; openSheet('shareSheet');
  }

  screens.community = function () {
    $('#filterChips').innerHTML = TAG_FILTERS.map((t) => '<button class="chip" aria-pressed="' + (state.filter === t) + '">' + esc(t) + '</button>').join('');
    $$('#filterChips .chip').forEach((b) => b.addEventListener('click', () => { state.filter = b.textContent.trim(); screens.community(); }));
    const posts = state.posts.slice().sort((a, b) => b.created - a.created).filter((p) => state.filter === 'All' || p.tags.includes(state.filter));
    $('#feed').innerHTML = posts.length ? posts.map(postCard).join('') : '<div class="empty">' + ICONS.community + '<span>No discussions with that tag yet. Start one.</span></div>';
    bindPosts('#feed');
  };
  function postCard(p) {
    const liked = !!state.likes[p.id]; const likes = p.likes + (liked ? 1 : 0);
    return '<article class="post" data-id="' + p.id + '"><div class="who"><span class="avatar" style="background:' + p.color + '">' + esc(initials(p.who)) + '</span><b>' + esc(p.who) + '</b><span class="time">' + fmtAgo((Date.now() - p.created) / 1000) + '</span></div><h3>' + esc(p.title) + '</h3><p class="body">' + esc(p.body) + '</p><div class="chips">' + p.tags.map((t) => '<span class="tag">' + esc(t) + '</span>').join('') + '</div><div class="meta"><span>' + ICONS.comment + ' <span class="num">' + p.replies.length + '</span></span><button class="like' + (liked ? ' liked' : '') + '" aria-pressed="' + liked + '" aria-label="' + (liked ? 'Unlike' : 'Like') + ', ' + likes + ' likes">' + ICONS.heart + ' <span class="num">' + likes + '</span></button></div></article>';
  }
  function initials(who) { return who.split(/\s*&\s*|\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase(); }
  function bindPosts(sel) { $$(sel + ' .post').forEach(bindPost); }
  function bindPost(el) {
    el.addEventListener('click', (ev) => { if (ev.target.closest('.like')) return; show('post', { id: el.dataset.id }); });
    const like = $('.like', el); if (like) like.addEventListener('click', (ev) => {
      ev.stopPropagation(); const id = el.dataset.id; state.likes[id] = !state.likes[id]; persist();
      const p = state.posts.find((x) => x.id === id); const tpl = document.createElement('template'); tpl.innerHTML = postCard(p);
      const fresh = tpl.content.firstElementChild; el.replaceWith(fresh); bindPost(fresh); // rebind only the replaced card
    });
  }
  screens.post = function (params) {
    const p = state.posts.find((x) => x.id === params.id); if (!p) { back(); return; }
    $('#postView').innerHTML = postCard(p).replace('class="post"', 'class="post" style="cursor:default"');
    const like = $('#postView .like'); like.addEventListener('click', () => { state.likes[p.id] = !state.likes[p.id]; persist(); screens.post(params); });
    $('#replies').innerHTML = p.replies.map((r) => '<div class="reply"><span class="avatar" style="background:' + (r.expert ? 'var(--teal)' : '#9AA7AA') + '">' + esc(initials(r.who)) + '</span><div class="bubble-text' + (r.expert ? ' expert' : '') + '"><b>' + esc(r.who) + '</b>' + esc(r.text) + '</div></div>').join('') || '<p class="small">No replies yet. Be the first.</p>';
    $('#replyInput').value = '';
  };
  function sendReply() {
    const cur = state.stack[state.stack.length - 1]; const p = state.posts.find((x) => x.id === (cur.params || {}).id); const text = $('#replyInput').value.trim();
    if (!p) return;
    if (!text) { $('#replyInput').focus(); return; }
    p.replies.push({ who: youName(), text }); persist(); screens.post(cur.params); toast('Reply posted');
  }
  function youName() { return state.dog.sample ? 'You' : 'You & ' + state.dog.name; }
  function createPost() {
    const title = $('#postTitle').value.trim(), body = $('#postBody').value.trim();
    const tags = $$('#postTags .chip').filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.textContent.trim());
    if (!title) { toast('Give your discussion a title'); return; }
    state.posts.push({ id: uid(), who: youName(), color: '#EE8A3C', created: Date.now(), title, body, tags: tags.length ? tags : ['Behavior Questions'], likes: 0, replies: [] });
    persist(); closeSheets(); state.filter = 'All'; screens.community(); toast('Discussion posted');
    $('#postTitle').value = ''; $('#postBody').value = '';
  }

  screens.learn = function () {
    $('#articles').innerHTML = ARTICLES.map((a) => '<button class="article-card" data-id="' + a.id + '"><span class="swatch ' + a.swatch + '">' + ICONS[a.icon] + '</span><span><h3>' + esc(a.title) + '</h3><p>' + esc(a.sub) + '</p></span></button>').join('');
    $$('#articles .article-card').forEach((b) => b.addEventListener('click', () => show('article', { id: b.dataset.id })));
  };
  screens.article = function (params) {
    const a = ARTICLES.find((x) => x.id === params.id); if (!a) { back(); return; }
    let body;
    const cueTable = () => '<div class="table-wrap"><table><thead><tr><th>Cue</th>' + CLASSES.map((c) => '<th>' + SHORT[c] + '</th>').join('') + '</tr></thead><tbody>' + CUE_KEYS.map((k) => '<tr><th>' + k.charAt(0).toUpperCase() + k.slice(1) + '</th>' + CLASSES.map((c) => '<td>' + esc(CUES[c][k]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    if (a.emo) {
      const e = EMO[a.emo];
      body = ['<p>' + esc(e.read) + '</p>', "<h3>Dr. Con's cues for this state</h3><div class=\"cues\">" + CUE_KEYS.map((k) => '<b>' + k.charAt(0).toUpperCase() + k.slice(1) + '</b><span>' + esc(CUES[a.emo][k]) + '</span>').join('') + '</div>', '<h3>What it may mean</h3><p>' + esc(e.mean) + '</p>', '<h3>Why it may be happening</h3><p>' + esc(e.why) + '</p>', '<h3>What to try</h3><ul>' + e.steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul>', '<h3>When to seek more help</h3><p>' + esc(e.help) + '</p>'].join('');
    } else body = a.body.map((p) => (p === 'TREE_TABLE' ? cueTable() : p.startsWith('<') ? p : '<p>' + p + '</p>')).join('');
    $('#articleBody').innerHTML = '<h1>' + esc(a.title) + '</h1><p class="small">' + esc(a.sub) + '</p>' + body + '<div class="badge">' + ICONS.shield + " Grounded in Dr. Con's Animal Behavior Methodology</div>";
  };

  screens.mydog = function () {
    const d = state.dog;
    $('#dogPhoto').src = d.photo || (d.sample ? 'img/hero-dog.jpg' : dogPlaceholder(d.name));
    $('#dogName').textContent = d.name; $('#dogMeta').textContent = [d.breed, d.age].filter(Boolean).join(' · ');
    $('#sampleFlag').hidden = !d.sample;
    const mine = state.readings;
    $('#statReadings').textContent = mine.length;
    const top = mine.length ? mostCommon(mine.map((r) => r.top)) : null;
    $('#statMood').textContent = top ? EMO[top].label.split(' &')[0] : '—';
    $('#statRecords').textContent = state.records.length;
    $$('#subtabs button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.sub === state.mydogTab));
    $('#moodsPane').hidden = state.mydogTab !== 'moods'; $('#journalPane').hidden = state.mydogTab !== 'journal'; $('#healthPane').hidden = state.mydogTab !== 'health';
    renderMoods(); renderJournal(); renderHealth();
  };
  function mostCommon(arr) { const m = {}; arr.forEach((a) => { m[a] = (m[a] || 0) + 1; }); return Object.keys(m).sort((a, b) => m[b] - m[a])[0]; }
  function renderMoods() {
    const rs = state.readings.slice().sort((a, b) => new Date(a.when) - new Date(b.when));
    const wrap = $('#moodChart');
    if (!rs.length) { wrap.innerHTML = '<div class="empty">' + ICONS.paw + '<span>Your first reading will appear here. Save a result and the mood timeline starts.</span></div>'; $('#dist').innerHTML = ''; $('#distLegend').innerHTML = ''; return; }
    // timeline: x = time, y = confidence of the top emotion, colour = emotion. One scale, labels from real values.
    const W = 440, H = 170, L = 36, R = 12, T = 16, B = 34;
    const t0 = new Date(rs[0].when).getTime(), t1 = new Date(rs[rs.length - 1].when).getTime();
    const single = t1 - t0 < 3600000; // one reading (or several within an hour): centre it on a one-day axis
    const span = single ? 86400000 : t1 - t0; const left = single ? t1 - span / 2 : t0;
    const x = (t) => L + ((new Date(t).getTime() - left) / span) * (W - L - R);
    const y = (v) => T + (1 - v) * (H - T - B);
    const grid = [0.25, 0.5, 0.75, 1].map((v) => '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="var(--line)" stroke-dasharray="2 4"/><text x="' + (L - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + Math.round(v * 100) + '%</text>').join('');
    const path = rs.map((r, i) => (i ? 'L' : 'M') + x(r.when).toFixed(1) + ' ' + y(r.probs[r.top]).toFixed(1)).join(' ');
    const dots = rs.map((r) => '<circle cx="' + x(r.when).toFixed(1) + '" cy="' + y(r.probs[r.top]).toFixed(1) + '" r="6" fill="' + EMO[r.top].color + '" stroke="var(--surface)" stroke-width="2"><title>' + esc(fmtDate(r.when) + ': ' + EMO[r.top].label + ' ' + Math.round(r.probs[r.top] * 100) + '%') + '</title></circle>').join('');
    const ticks = single
      ? '<text x="' + x(rs[rs.length - 1].when).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(fmtDate(rs[rs.length - 1].when)) + '</text>'
      : [rs[0], rs[rs.length - 1]].map((r, i) => '<text x="' + x(r.when).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="' + (i ? 'end' : 'start') + '">' + esc(fmtDate(r.when)) + '</text>').join('');
    const chartLabel = 'Mood timeline: ' + rs.map((r) => fmtDate(r.when) + ' ' + SHORT[r.top] + ' ' + Math.round(r.probs[r.top] * 100) + '%').join(', ');
    wrap.innerHTML = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(chartLabel) + '">' + grid + '<path d="' + path + '" fill="none" stroke="var(--line)" stroke-width="2"/>' + dots + ticks + '</svg>';
    const counts = {}; rs.forEach((r) => { counts[r.top] = (counts[r.top] || 0) + 1; });
    const order = CLASSES.filter((c) => counts[c]);
    $('#dist').innerHTML = order.map((c) => '<span style="flex:' + counts[c] + ';background:' + EMO[c].color + '" title="' + SHORT[c] + '"></span>').join('');
    $('#dist').setAttribute('aria-label', 'Share of readings: ' + order.map((c) => SHORT[c] + ' ' + Math.round((counts[c] / rs.length) * 100) + '%').join(', '));
    $('#distLegend').innerHTML = order.map((c) => '<span><i style="background:' + EMO[c].color + '"></i>' + SHORT[c] + ' <span class="num">' + Math.round((counts[c] / rs.length) * 100) + '%</span></span>').join('');
  }
  function renderJournal() {
    const rs = state.readings.slice().sort((a, b) => new Date(b.when) - new Date(a.when));
    $('#journal').innerHTML = rs.length ? rs.map((r) => '<div class="entry" data-id="' + r.id + '" role="button" tabindex="0"><img src="' + r.thumb + '" alt=""><div style="flex:1;min-width:0"><div class="row"><h3>' + esc(EMO[r.top].label) + ' <span class="small num">' + Math.round(r.probs[r.top] * 100) + '%</span></h3><span class="when">' + esc(fmtDate(r.when)) + '</span></div><p>' + esc([r.ctx, r.note].filter(Boolean).join(' · ') || 'No notes') + '</p>' + (r.sample ? '<span class="sample-flag">Example</span>' : '') + '</div></div>').join('') : '<div class="empty">' + ICONS.bookmark + '<span>Saved readings and your notes live here.</span></div>';
    $$('#journal .entry').forEach((el) => {
      el.addEventListener('click', () => { const r = state.readings.find((x) => x.id === el.dataset.id); if (r) { state.result = { ...r, saved: true }; show('result', {}); } });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
    });
  }
  function renderHealth() {
    const kinds = { vaccine: ['Vaccine', 'ico-mint', 'vaccine'], med: ['Medication', 'ico-orange', 'med'], vet: ['Vet visit', 'ico-teal', 'vet'], note: ['Note', 'ico-purple', 'edit'] };
    const rs = state.records.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    $('#records').innerHTML = rs.length ? rs.map((r) => { const k = kinds[r.kind] || kinds.note; return '<div class="entry"><span class="ico ' + k[1] + '">' + ICONS[k[2]] + '</span><div style="flex:1;min-width:0"><div class="row"><h3>' + esc(r.title) + '</h3><span class="when">' + esc(fmtDate(r.date)) + '</span></div><p>' + esc(r.note || k[0]) + '</p>' + (r.sample ? '<span class="sample-flag">Example</span>' : '') + '</div><button class="icon-btn del" data-id="' + r.id + '" aria-label="Delete record">' + ICONS.trash + '</button></div>'; }).join('') : '<div class="empty">' + ICONS.vet + '<span>Vaccinations, medications and vet visits, all in one place.</span></div>';
    $$('#records .del').forEach((b) => b.addEventListener('click', () => { state.records = state.records.filter((r) => r.id !== b.dataset.id); persist(); renderHealth(); $('#statRecords').textContent = state.records.length; toast('Record removed'); }));
  }
  function saveRecord() {
    const title = $('#recTitle').value.trim(); if (!title) { toast('Add a title'); return; }
    if (state.dog.sample) state.records = state.records.filter((r) => !r.sample);
    state.records.push({ id: uid(), kind: $('#recKind').value, title, note: $('#recNote').value.trim(), date: $('#recDate').value || new Date().toISOString().slice(0, 10) });
    persist(); closeSheets(); screens.mydog(); toast('Record added'); $('#recTitle').value = ''; $('#recNote').value = '';
  }
  function saveDog() {
    const name = $('#dogNameInput').value.trim(); if (!name) { toast("What's your dog's name?"); return; }
    const wasSample = state.dog.sample;
    state.dog = { name, breed: $('#dogBreedInput').value.trim(), age: $('#dogAgeInput').value.trim(), photo: state.pendingPhoto || (wasSample ? '' : state.dog.photo) || '', sample: false };
    if (wasSample) { state.readings = state.readings.filter((r) => !r.sample); state.records = state.records.filter((r) => !r.sample); }
    state.pendingPhoto = null; persist(); closeSheets(); screens.mydog(); toast('Welcome, ' + name);
  }

  /* ===================== chat (Ask Zoolingua) ===================== */
  function openChat(prefill) {
    openSheet('chatSheet');
    if (!state.chat.length) state.chat.push({ me: false, text: "Hi, I'm the Zoolingua guide. Tell me what's going on with your dog and I'll walk you through what it may mean and what to try next. For anything urgent about health, call your vet first." });
    renderChat();
    if (prefill) { $('#chatInput').value = prefill; sendChat(); }
    else setTimeout(() => $('#chatInput').focus(), 300);
  }
  function renderChat() {
    const log = $('#chatLog');
    log.innerHTML = state.chat.map((m) => '<div class="msg ' + (m.me ? 'me' : 'bot') + '">' + esc(m.text) + '</div>').join('');
    log.scrollTop = log.scrollHeight;
  }
  let chatGen = 0;
  function sendChat() {
    const inp = $('#chatInput'); const text = inp.value.trim(); if (!text) return;
    inp.value = ''; state.chat.push({ me: true, text }); renderChat();
    const log = $('#chatLog'); const typing = document.createElement('div'); typing.className = 'msg bot typing'; typing.textContent = 'Zoolingua guide is typing'; log.appendChild(typing); log.scrollTop = log.scrollHeight;
    const gen = chatGen;
    setTimeout(() => {
      typing.remove();
      if (gen !== chatGen) return; // chat was cleared while the guide was typing
      let reply = null;
      const r = state.result && /reading|read as|result/i.test(text) ? state.result : null;
      if (r) { const e = EMO[r.top]; const where = CONTEXT_PHRASE[r.ctx] || ''; reply = 'Your reading came back ' + e.label + ' at ' + Math.round(r.probs[r.top] * 100) + '%' + (where ? ' ' + where : '') + '.\n\n' + e.mean + '\n\nWhat to try:\n' + e.steps.map((s) => '• ' + s).join('\n') + '\n\n' + e.help; }
      if (!reply) { const rule = CHAT_RULES.find((x) => x.k.test(text)); reply = rule ? rule.r : "Tell me a bit more: where does it happen, and what happens right before? Those two details usually point to the cause. If you have a reading from Understand My Dog, ask me about it and I'll build on it."; }
      state.chat.push({ me: false, text: reply }); store.set('chat', state.chat); renderChat();
    }, 700 + Math.min(1400, text.length * 15));
  }

  /* ===================== sheets ===================== */
  let lastFocus = null;
  function openSheet(id) {
    const b = $('#backdrop'), s = $('#' + id);
    if (!$('.sheet.open')) lastFocus = document.activeElement;
    b.hidden = false; void b.offsetHeight; // flush layout so the slide-up transition runs, without waiting on a frame
    b.classList.add('open'); s.classList.add('open'); s.setAttribute('aria-hidden', 'false'); s.inert = false;
    try { $('.app').inert = true; } catch (e) {} // keep focus and screen readers inside the sheet
    const closeBtn = $('[data-close]', s); if (closeBtn) closeBtn.focus({ preventScroll: true });
  }
  function closeSheets() {
    $$('.sheet').forEach((s) => { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); s.inert = true; }); // inert at once, before the slide-down ends
    const b = $('#backdrop'); b.classList.remove('open'); setTimeout(() => { b.hidden = true; }, 220);
    try { $('.app').inert = false; } catch (e) {}
    if (lastFocus && lastFocus.isConnected && typeof lastFocus.focus === 'function') { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    lastFocus = null;
  }

  /* ===================== install ===================== */
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function setupInstall() {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installEvent = e; $('#installBtn').hidden = false; });
    $('#installBtn').addEventListener('click', async () => {
      if (state.installEvent) { state.installEvent.prompt(); try { await state.installEvent.userChoice; } catch (e) {} state.installEvent = null; $('#installBtn').hidden = true; }
      else openSheet('installSheet');
    });
    window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('Zoolingua is on your home screen'); });
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    if (!isStandalone() && (ios || !('onbeforeinstallprompt' in window))) $('#installBtn').hidden = false;
    if (!isStandalone() && ios && !store.get('tipShown', false)) { $('#installTip').hidden = false; }
  }

  /* ===================== boot ===================== */
  function boot() {
    $$('.tab').forEach((b) => { b.innerHTML = ICONS[b.dataset.tab] + '<span>' + b.textContent + '</span>'; b.addEventListener('click', () => goTab(b.dataset.tab)); });
    $$('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go, {})));
    $$('[data-back]').forEach((b) => { b.innerHTML = ICONS.back; b.addEventListener('click', navBack); });
    $$('[data-chat]').forEach((b) => b.addEventListener('click', () => openChat(b.dataset.chat === 'result' && state.result ? 'What does my reading mean?' : '')));
    $$('[data-close]').forEach((b) => b.addEventListener('click', closeSheets));
    $$('.sheet').forEach((s) => { s.inert = true; }); // closed sheets start out unfocusable
    $('#backdrop').addEventListener('click', closeSheets);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('.sheet.open')) closeSheets(); });
    // fill icons (decorative: every icon-only control carries its own aria-label)
    $$('[data-icon]').forEach((el) => { el.innerHTML = ICONS[el.dataset.icon].replace('<svg ', '<svg aria-hidden="true" ') + el.innerHTML; });
    // capture options are real buttons that open the matching file input (keyboard reachable, announced as buttons)
    $$('[data-pick]').forEach((b) => b.addEventListener('click', () => { const i = $('#' + b.dataset.pick); if (i) { i.value = ''; i.click(); } }));
    // capture inputs
    $('#fileImage').addEventListener('change', (e) => setCapture(e.target.files[0]));
    $('#fileVideo').addEventListener('change', (e) => setCapture(e.target.files[0], 'video'));
    $('#fileCamera').addEventListener('change', (e) => setCapture(e.target.files[0]));
    $('#sampleClipBtn').addEventListener('click', async () => { try { const b = await (await fetch('img/sample-clip.mp4')).blob(); setCapture(new File([b], 'sample-clip.mp4', { type: 'video/mp4' })); } catch (e) { toast('Could not load the sample clip'); } });
    $('#clearCapture').addEventListener('click', () => { if (state.current) { try { URL.revokeObjectURL(state.current.url); } catch (e) {} } state.current = null; $('#fileImage').value = ''; $('#fileVideo').value = ''; $('#fileCamera').value = ''; renderPreview(); });
    $('#analyzeBtn').addEventListener('click', analyzeCurrent);
    $('#noteInput').addEventListener('input', (e) => { if (e.target.value.length > 200) e.target.value = e.target.value.slice(0, 200); $('#noteCount').textContent = e.target.value.length + '/200'; });
    $('#modelPill').addEventListener('click', () => { if (state.model.status === 'error') { state.model.status = 'idle'; loadModel(); } });
    // result actions
    $('#saveBtn').addEventListener('click', saveResult);
    $('#shareBtn').addEventListener('click', shareResult);
    $('#learnMoreBtn').addEventListener('click', () => { if (state.result) show('article', { id: state.result.top }); });
    $('#anotherBtn').addEventListener('click', () => { state.current = null; goTab('home'); show('understand', {}); });
    // community
    $('#newPostBtn').addEventListener('click', () => { $('#postTags').innerHTML = TAG_FILTERS.slice(1).map((t) => '<button class="chip" aria-pressed="false">' + esc(t) + '</button>').join(''); $$('#postTags .chip').forEach((c) => c.addEventListener('click', () => c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true'))); openSheet('postSheet'); });
    $('#createPostBtn').addEventListener('click', createPost);
    $('#replyBtn').addEventListener('click', sendReply);
    $('#replyInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } });
    // chat
    $('#chatSend').addEventListener('click', sendChat);
    $('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
    $('#chatClear').addEventListener('click', () => { chatGen++; state.chat = []; store.set('chat', []); openChat(''); });
    // my dog
    $$('#subtabs button').forEach((b) => b.addEventListener('click', () => { state.mydogTab = b.dataset.sub; screens.mydog(); }));
    $('#addRecordBtn').addEventListener('click', () => { $('#recDate').value = new Date().toISOString().slice(0, 10); openSheet('recordSheet'); });
    $('#saveRecordBtn').addEventListener('click', saveRecord);
    $('#editDogBtn').addEventListener('click', () => { const d = state.dog; $('#dogNameInput').value = d.sample ? '' : d.name; $('#dogBreedInput').value = d.sample ? '' : d.breed || ''; $('#dogAgeInput').value = d.sample ? '' : d.age || ''; $('#dogPhotoPreview').src = d.sample ? '' : d.photo || ''; $('#dogPhotoPreview').hidden = d.sample || !d.photo; $('#dogPhotoInput').value = ''; state.pendingPhoto = null; openSheet('dogSheet'); });
    $('#dogPhotoInput').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; const url = URL.createObjectURL(f); try { const im = await loadImage(url); state.pendingPhoto = thumbFrom(im, im.naturalWidth, im.naturalHeight, 400); $('#dogPhotoPreview').src = state.pendingPhoto; $('#dogPhotoPreview').hidden = false; } catch (err) { toast('Could not read that photo'); } URL.revokeObjectURL(url); });
    $('#saveDogBtn').addEventListener('click', saveDog);
    $('#resetBtn').addEventListener('click', () => { ['dog', 'readings', 'posts', 'likes', 'records', 'chat', 'tipShown'].forEach(store.del); location.reload(); });
    // pro
    $('#proRequestBtn').addEventListener('click', () => { const n = $('#proName').value.trim(), o = $('#proOrg').value.trim(); if (!n || !o) { toast('Add your name and organization'); return; } const em = $('#proEmail').value.trim(); if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { toast('Check your email address'); return; } store.set('proRequest', { n, o, role: $('#proRole').value, email: $('#proEmail').value.trim(), when: new Date().toISOString() }); closeSheets(); toast('Saved on this device. Early access opens at launch.'); });
    $('#installTipClose').addEventListener('click', () => { $('#installTip').hidden = true; store.set('tipShown', true); });
    $('#proTile').addEventListener('click', () => openSheet('proSheet'));
    setupInstall();
    // service worker (offline shell + cached model); skipped where unsupported or sandboxed
    try { if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {}
    const h = (location.hash || '').replace('#', '');
    goTab(TABS.includes(h) ? h : 'home');
    booted = true;
    // warm the model in the background after first paint
    setTimeout(loadModel, 600);
  }
  let booted = false;
  document.addEventListener('DOMContentLoaded', boot);
  window.ZL = { state, EMO, CLASSES, loadModel, classify: (img) => classify(img, img.naturalWidth || img.width, img.naturalHeight || img.height) };
})();
