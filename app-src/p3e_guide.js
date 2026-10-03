/* ================= the guide: walks you through the home and makes changes as you talk ================= */
const GUIDE = { open: false, busy: false, speak: true, touring: false, paused: false, skip: false, hist: [], edits: [], flight: null, voice: null, rec: null, listening: false, stopTour: null };
const GUIDE_NAME = 'Mira';

/* ---------- camera: smooth moves and cinematic cuts ---------- */
const easeIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
// called from the render loop while walking; returns true when the guide is driving the camera
function guideStep(dt) {
  const pd = presentStep(dt), f = GUIDE.flight; if (!f) return pd;
  f.t = (performance.now() - f.start) / 1000; const k = Math.min(1, f.t / f.dur), e = easeIO(k);
  player.x = f.x0 + (f.x1 - f.x0) * e; player.z = f.z0 + (f.z1 - f.z0) * e;
  player.yaw = f.y0 + f.dy * e; player.pitch = f.p0 + (f.p1 - f.p0) * e;
  if (f.drift && k >= 1) { player.yaw += f.drift * dt; return true; }
  if (k >= 1 && !f.drift) { GUIDE.flight = null; f.done?.(); }
  return true;
}
function flyTo(x, z, yaw, pitch = .1, dur = 1.6, drift = 0) {
  GUIDE.flight?.done?.();   // a replaced flight still settles, so nothing awaiting it hangs
  return new Promise(res => { let fin = false; const done = () => { if (!fin) { fin = true; res(); } };
    GUIDE.flight = { t: 0, start: performance.now(), dur, x0: player.x, z0: player.z, x1: x, z1: z, y0: player.yaw, dy: angDiff(player.yaw, yaw), p0: player.pitch, p1: pitch, drift, done };
    setTimeout(() => { if (!drift && GUIDE.flight?.done === done) { player.x = x; player.z = z; player.yaw = yaw; player.pitch = pitch; GUIDE.flight = null; } done(); }, drift ? dur * 1000 : dur * 1000 + 1500); });
}
function gFade(to, ms = 320) { const el = $('guideFade'); el.style.transition = `opacity ${ms}ms ease`; el.style.opacity = to; return new Promise(r => setTimeout(r, ms)); }
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

/* ---------- where to stand in a room ---------- */
const FOCAL = ['tv-wall', 'media-wall', 'bed-luxe', 'bed', 'sectional', 'sofa-curved', 'sofa', 'island-waterfall', 'island', 'table-dining-long', 'pool-table', 'kitchen-luxe', 'closet-lit', 'vanity-luxe', 'vanity', 'pooja-unit', 'jhoola', 'outdoor-sofa', 'desk', 'kitchen-counter'];
function focalItem(r) {
  const items = layout.furniture.filter(it => it.room === r.name && CAT[it.type]);
  for (const t of FOCAL) { const it = items.find(i => i.type === t); if (it) return it; }
  return items.sort((a, b) => { const fa = withDefaults(a), fb = withDefaults(b); return fb.w * fb.d - fa.w * fa.d; })[0] || null;
}
function clearSpot(x, z, pad = .9) {
  return !layout.furniture.some(it => { const d = CAT[it.type]; if (!d || d.nc || WALLMOUNT.has(it.type)) return false; const f = withDefaults(it); if ((+f.y || 0) > 4) return false; return Math.hypot(it.x - x, it.z - z) < Math.max(f.w, f.d) / 2 + pad; });
}
function viewpoint(r, target) {
  const [cx, cz] = centroid(r.polygon), look = target ? [target.x, target.z] : [cx, cz];
  const fr = target ? (() => { const th = (target.rot || 0) * D2R; return [Math.sin(th), Math.cos(th)]; })() : null;
  const cands = [...insetPoly(r.polygon, 1.7).pts, ...insetPoly(r.polygon, 3.2).pts, [cx, cz]];
  let best = null;
  for (const [x, z] of cands) {
    if (!pip([x, z], r.polygon) || !clearSpot(x, z)) continue;
    const dx = x - look[0], dz = z - look[1], dist = Math.hypot(dx, dz); if (dist < 4) continue;
    let s = Math.min(dist, 22);
    if (fr) s += 6 * ((dx * fr[0] + dz * fr[1]) / dist);   // prefer standing in front of the focal piece
    if (!best || s > best.s) best = { x, z, s };
  }
  if (!best) best = { x: cx, z: cz };
  return { x: best.x, z: best.z, yaw: yawTo(best.x, best.z, look[0], look[1]), pitch: .12 };
}
async function goToRoom(r, { cut = true, item = null, drift = 0, hold = 0 } = {}) {
  if (mode !== 'walk') setMode('walk');
  if (activeView !== '3d') showView('3d');
  const vp = viewpoint(r, item || focalItem(r)), here = roomAt(player.x, player.z);
  if (cut && here !== r) { await gFade(1, 260); player.x = vp.x; player.z = vp.z; player.y = floorY(r); player.yaw = vp.yaw + .35; player.pitch = vp.pitch; await gFade(0, 360); await flyTo(vp.x, vp.z, vp.yaw, vp.pitch, 1.8); }
  else await flyTo(vp.x, vp.z, vp.yaw, vp.pitch, 1.8);
  if (drift) flyTo(vp.x, vp.z, vp.yaw, vp.pitch, 0.01, drift);
}
async function lookAtItem(it) {
  const r = layout.rooms.find(x => x.name === it.room) || roomAt(it.x, it.z);
  if (r && roomAt(player.x, player.z) !== r) return goToRoom(r, { item: it });
  const f = withDefaults(it); await flyTo(player.x, player.z, yawTo(player.x, player.z, it.x, it.z), Math.max(-.1, Math.min(.35, .12 + ((f.y || 0) > 5 ? -.25 : 0))), 1.2);
}

/* ---------- voice ---------- */
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const vs = speechSynthesis.getVoices(); if (!vs.length) return null;
  const pref = [/en-IN/i, /en-GB/i, /en-US/i];
  for (const re of pref) { const v = vs.find(v => re.test(v.lang) && /female|samantha|serena|veena|google uk english female|aria|jenny|natural/i.test(v.name)) || vs.find(v => re.test(v.lang)); if (v) return v; }
  return vs[0];
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { GUIDE.voice = pickVoice(); };
function gSpeak(text) {
  gCaption(text);
  const words = text.split(/\s+/).length, est = 900 + words * 360;
  const say = PRES.say = { text, t0: performance.now() + 150, ci: 0, cps: text.length / Math.max(1, (est - 900) / 1000) };   // her lips follow the words
  const clear = () => { if (PRES.say === say) PRES.say = null; };
  if (GUIDE.speak && SITE?.token && !GUIDE.voiceOff) {   // Mira's own voice (premium), falling back to the device voice
    return premiumSpeak(text, say).then(ok => { if (ok) { clear(); return; } return deviceSpeak(text, say, est, clear); });
  }
  return deviceSpeak(text, say, est, clear);
}
const VOICE_CACHE = new Map();
async function premiumSpeak(text, say) {
  try {
    let url = VOICE_CACHE.get(text);
    if (!url) { url = (await SITE.api('/api/voice', { text })).url; VOICE_CACHE.set(text, url); if (VOICE_CACHE.size > 80) VOICE_CACHE.delete(VOICE_CACHE.keys().next().value); }
    hush(); PRES.say = say; const a = new Audio(url); GUIDE.audio = a; a.preload = "auto";
    await new Promise((res, rej) => { a.oncanplay = res; a.onerror = rej; setTimeout(rej, 8000); });
    await a.play();
    return await new Promise(res => {
      const tick = () => { if (GUIDE.audio !== a) return res(true); if (a.duration) { say.ci = Math.floor(a.currentTime / a.duration * text.length); say.t0 = performance.now(); } if (!a.ended && !a.paused) requestAnimationFrame(tick); };
      a.onended = () => res(true); a.onpause = () => res(true); tick();
    });
  } catch (e) { if (e?.status === 429) GUIDE.voiceOff = true; return false; }
}
function deviceSpeak(text, say, est, clear) {
  if (!GUIDE.speak || !('speechSynthesis' in window)) return new Promise(r => setTimeout(() => { clear(); r(); }, est));
  return new Promise(res => {
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); GUIDE.voice ||= pickVoice(); if (GUIDE.voice) u.voice = GUIDE.voice;
    u.rate = 1.02; u.pitch = 1; let done = false; const fin = () => { if (!done) { done = true; clear(); res(); } };
    u.onstart = () => { say.t0 = performance.now(); };
    u.onboundary = e => { if (e.charIndex != null) { say.ci = e.charIndex; say.t0 = performance.now(); } };
    u.onend = fin; u.onerror = fin; setTimeout(fin, est + 4000); speechSynthesis.speak(u);
  });
}
function hush() { try { window.speechSynthesis?.cancel(); } catch { } try { GUIDE.audio?.pause(); } catch { } GUIDE.audio = null; if (typeof PRES !== 'undefined') PRES.say = null; }
let capT = null;
function gCaption(text) { const el = $('guideCap'); el.textContent = text; el.hidden = !text; clearTimeout(capT); if (text) capT = setTimeout(() => { el.hidden = true; }, 1500 + text.split(/\s+/).length * 420); }

// microphone: browser speech recognition where available (Chrome, Edge, Safari 14.5+)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function gListen() {
  if (!SR) return;
  if (GUIDE.listening) { GUIDE.rec?.stop(); return; }
  hush(); const rec = new SR(); GUIDE.rec = rec; rec.lang = navigator.language?.startsWith('en-') ? navigator.language : 'en-IN'; rec.interimResults = true; rec.maxAlternatives = 1;
  let final = '';
  rec.onresult = e => { let s = ''; for (const r of e.results) s += r[0].transcript; $('guideIn').value = s; if (e.results[e.results.length - 1].isFinal) final = s; };
  rec.onend = () => { GUIDE.listening = false; $('guideMic').classList.remove('on'); if (final.trim()) guideSend(final.trim()); };
  rec.onerror = e => { GUIDE.listening = false; $('guideMic').classList.remove('on'); if (e.error === 'not-allowed') gNote('Microphone access was blocked. You can type instead.'); };
  GUIDE.listening = true; $('guideMic').classList.add('on'); rec.start();
}

/* ---------- what the guide knows ---------- */
function roomDims(r) { const xs = r.polygon.map(p => p[0]), zs = r.polygon.map(p => p[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)]; }
const gFtin = v => { const f = Math.floor(v), i = Math.round((v - f) * 12); return i === 12 ? `${f + 1}'` : `${f}'${i ? i + '"' : ''}`; };
function gRoomSize(r) { if (r.size) return r.size; const [w, d] = roomDims(r); return `${gFtin(w)} × ${gFtin(d)}`; }
function homeFacts({ ids = false } = {}) {
  const rooms = layout.rooms.filter(r => r.kind !== 'ledge' && r.polygon?.length > 2);
  const area = rooms.filter(r => r.kind === 'room').reduce((a, r) => a + polyArea(r.polygon), 0);
  const lines = rooms.map(r => {
    const items = layout.furniture.filter(it => it.room === r.name && CAT[it.type] && !['curtain', 'ceiling-cove', 'rug', 'sconce', 'decor-set'].includes(it.type));
    const names = items.slice(0, 14).map(it => ids ? `${it.name || CAT[it.type].label} [${it.id}]` : (it.name || CAT[it.type].label));
    return `${r.name} (${r.type}${r.kind === 'outdoor' ? ', outdoor' : ''}) — ${gRoomSize(r)}, about ${Math.round(polyArea(r.polygon))} sq ft. Pieces: ${names.join('; ') || 'empty'}`;
  });
  return { area: Math.round(area), rooms, text: lines.join('\n') };
}
const TOUR_ORDER = ['foyer', 'reception', 'living', 'workspace', 'dining', 'kitchen', 'pantry', 'pooja', 'balcony', 'terrace', 'meeting', 'cabin', 'study', 'master', 'walkin', 'bath', 'bedroom', 'staff', 'passage', 'utility', 'other'];
function tourRooms() {
  const rs = layout.rooms.filter(r => r.polygon?.length > 2 && r.kind !== 'ledge' && !['passage', 'utility'].includes(r.type) && polyArea(r.polygon) > (r.type === 'bath' ? 64 : 30) && !/powder/i.test(r.name));
  return rs.sort((a, b) => TOUR_ORDER.indexOf(a.type) - TOUR_ORDER.indexOf(b.type) || polyArea(b.polygon) - polyArea(a.polygon));
}
function tourPrompt() {
  const F = homeFacts({ ids: true }), order = tourRooms().map(r => r.name);
  return `You are ${GUIDE_NAME}, the guide inside Mirage, a 3D walkthrough of a home that has not been built yet. Write the script for a guided tour you narrate: you take the visitor from room to room, pause on the standout piece and point it out. You are a voice only (no body), speaking over a moving camera.
HOME: ${project.name || 'the home'}, about ${F.area} sq ft. Style: ${project.style?.summary || ''} Time of day in the model: ${layout.settings.timeOfDay}.
ROOMS (name — size — pieces with [ids]):
${F.text}
TOUR ORDER: ${order.join(' → ')}
Write like a warm, confident interior designer showing a client their home: specific, sensory, never salesy. Each stop is one or two sentences, at most 40 words: name the room, mention its size naturally, point out the standout pieces and materials from the list, and one line about how it will feel to live in. Only use facts listed here; do not invent views, directions, sunlight, prices or brands.
Reply with only JSON: {"intro":"one sentence welcome","stops":[{"room":"<exact room name>","say":"...","look":"<id of the piece to face, or empty>"}],"outro":"one sentence close that invites them to ask for any change"}`;
}
function localTour() {
  const stops = tourRooms().map(r => { const it = focalItem(r); const pieces = layout.furniture.filter(i => i.room === r.name && CAT[i.type] && !['curtain', 'ceiling-cove', 'rug', 'sconce'].includes(i.type)).slice(0, 3).map(i => (i.name || CAT[i.type].label).toLowerCase());
    return { room: r.name, say: `This is the ${r.name.toLowerCase()}, ${gRoomSize(r).replace(' × ', ' by ')}.${pieces.length ? ' Notice the ' + pieces.join(', ').replace(/, ([^,]*)$/, ' and $1') + '.' : ''}`, look: it?.id || '' }; });
  return { intro: `Welcome home. I'm ${GUIDE_NAME}, and I'll walk you through it.`, stops, outro: 'That is the whole home. Ask me to change anything you like.' };
}
function chatPrompt(text) {
  const F = homeFacts({ ids: true }), here = roomAt(player.x, player.z), P = profile();
  const hist = GUIDE.hist.slice(-10).map(m => `${m.who === 'you' ? 'VISITOR' : 'MIRA'}: ${String(m.text).slice(0, 900)}`).join('\n');
  const doing = GUIDE.edits.map(e => `"${e.request.slice(0, 280)}" (${e.state === 'working' ? 'being made now' : 'next in line'})`).join('; ');
  const ahead = lookingAt(), walls = here ? wallsText([here]) : '';
  return `You are ${GUIDE_NAME}, the designer and guide inside Mirage, a live 3D walkthrough of a home that has not been built yet. You have the eye of a principal at a top interior studio, and you can act: you move the visitor's camera, and you have the design engine change anything, from furniture, materials and lighting to light walls, windows and doors. Your words are read aloud: one to three short sentences, warm, specific and sure of yourself. Only state facts listed below; never invent views, sunlight, prices or brands.

HOW YOU WORK
- Act on what they say. When the visitor tells you what they want, make it happen in this same reply with an "edit" action. Never answer a clear request with a question, and never describe a change without the action that makes it.
- "Yes", "go for it", "do it", "that one", "the second one" after you offered ideas means: make the idea they picked (the first if they did not pick), using its full request text.
- If that change is already listed under CHANGES IN PROGRESS, do not start it again: tell them it is under way. A different change can be asked for straight away; it follows the first.
- "This", "here", "that wall", "this window" mean the room they are in and what they are facing.
- If something cannot be done, say why in a few words and offer the nearest thing that can.

HOME: ${project.name || 'the home'}, about ${F.area} sq ft. Style: ${project.style?.summary || ''} Time of day: ${layout.settings.timeOfDay}.
ROOMS (name — size — pieces with [ids]):
${F.text}
${P.done ? 'THE CLIENT: ' + spaceText() + ' Budget: ' + (BUDGETS[P.budget]?.name || '') + '. Vastu: ' + P.vastu + '.\n' : ''}${compassFacts()}
THE VISITOR IS IN: ${here ? here.name : 'the overview'}.${ahead ? ' Straight ahead, ' + ahead : ''}${GUIDE.touring ? ' A guided tour is running.' : ''}
${walls ? `WALLS OF THIS ROOM (id | from→to | size | LIGHT or STRUCTURE | rooms on each side | openings):\n${walls}\n` : ''}${doing ? 'CHANGES IN PROGRESS: ' + doing + '\n' : ''}${hist ? 'CONVERSATION SO FAR:\n' + hist + '\n' : ''}VISITOR SAYS: "${text.slice(0, 700)}"

Reply with only JSON: {"say":"what you say","actions":[...],"options":[...]} with at most three actions:
{"do":"go","room":"<exact room name>"} take them to a room (when they ask to see it, or when showing helps your answer)
{"do":"look","item":"<id>"} turn to face a piece
{"do":"time","value":"dusk|golden|night|day"} change the light
{"do":"edit","request":"<a complete brief for the design engine: the room by name, the pieces, finishes and colours, the lighting, what to remove, any wall or window change by wall id>"} for ANY change. It uses one of their changes.
{"do":"real"} when they want a real photo of the view
{"do":"tour"} start the full guided tour · {"do":"stop"} stop the tour
{"do":"vastu"} show the Vastu report card (when they ask whether the home is Vastu compliant, about directions, or Vastu in general). Summarise the score and the main points in "say".
{"do":"vastu_fix"} rearrange the home to follow Vastu without moving walls. It uses one change.
{"do":"design_rooms"} start designing the home room by room with them (when they ask to design it themselves, room by room, or to go through the rooms one at a time).

WALLS, WINDOWS AND DOORS: you may open up or remove LIGHT partition walls, and add, widen, move or remove windows and doors. STRUCTURE (outside walls, thick walls, columns) and beams stay where they are: when a light wall is opened its beam is kept. If they ask for a structural wall to go, say it is structure and offer what can be done (open a light wall, a wider window or sliding door). The first time you change a wall in a conversation, add that their engineer should confirm it before anything is broken on site. Name a wall by its id when it is in the list above, otherwise by the two rooms it stands between. One exception to acting at once: if opening a wall would expose a bathroom or take the privacy from a bedroom, say what it would mean and offer a better move (a glazed partition, a wider door, a dressing area) as options instead of doing it.
PLAN CORRECTIONS: if they say the plan was read wrong (a wall that is not there, a room that is really bigger, a missing or misplaced door or window), that is a correction, not a renovation, and it may touch any wall. Start the request with "Plan correction:" and say exactly what is wrong and what is right.

IDEAS: when they ask for ideas, options, what could be different, or for something more premium, do not edit yet. Go to that room and offer three or four concepts as "options":[{"label":"...","why":"...","request":"..."}]. Think like a designer pitching to a client with taste, not like a furniture catalogue. Each concept is a complete point of view:
- a signature move: a statement piece, a feature wall, a ceiling or lighting scheme, or an architectural change (opening a light wall, a full-height window, a window seat, a partition that makes a dressing room or a study);
- a palette and two or three real materials (stone, timber, metal, fabric), named;
- layered light: cove or wall wash, an accent, and a pendant, sconce or lamp.
Make the concepts different from each other and from what is there now, with at least one bold one, and pitch them at the client's budget. "label" is an evocative name of at most five words. "why" is one line, at most 16 words, on how it will feel to live in. "request" is the full brief, 60 to 120 words. Keep "say" to one sentence that introduces them.
PIECES THE ENGINE CAN BUILD (any finish or colour): ${Object.values(CAT).map(c => c.label.toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(', ')}.
Questions (sizes, what is in a room) get an answer and usually a go or look.`;
}

/* ---------- talking to Claude ---------- */
// quick questions and navigation go to the fast model; anything creative or that leads to a change goes to the stronger one
const QUICK = /^\s*(show|take|go|walk|where|which room|how (big|large|many)|what('s| is) (in|the size)|make it (night|day|dusk|golden)|(start|stop|end|pause) (the )?tour|hi|hello|hey|thanks|thank you)\b/i;
async function guideAsk(prompt, kind) {
  const sample = await getSample(); if (!sample) throw Object.assign(new Error('The guide needs Claude, which is not available in this view.'), { code: 'no_claude' });
  return sample.json(prompt, { modelTier: 'default', ctx: SITE ? { kind, homeId: project.id } : undefined });
}

/* ---------- the tour ---------- */
async function tourScript() {
  let script = project.tour && project.tour.sig === tourSig() ? project.tour : null;
  if (!script) {
    gNote('Preparing your tour…', 'sys'); gCaption('One moment, preparing your tour…');
    try { const j = await guideAsk(tourPrompt(), 'guide'); if (Array.isArray(j?.stops) && j.stops.length) script = { ...j, sig: tourSig() }; }
    catch (e) { if (e?.status === 402 || e?.code === 'rate_limited') gNote(e.message, 'sys'); }
    script ||= { ...localTour(), sig: tourSig() }; project.tour = script; saveSoon();
  }
  return script;
}
async function startTour() {
  if (GUIDE.touring) return; if (!layout.walls.length) return gNote('Open a designed home first.');
  openGuide(false); GUIDE.touring = true; GUIDE.paused = false; setTourUI(true);   // the tour is watched, not read: the conversation folds away and her words show as captions
  const script = await tourScript();
  const stop = () => GUIDE.touring = false; GUIDE.stopTour = stop;
  try {
    if (script.intro) { gSay(script.intro); await gSpeak(script.intro); }
    for (const s of script.stops) {
      if (!GUIDE.touring) break;
      const r = layout.rooms.find(x => x.name === s.room); if (!r) continue;
      const it = s.look && layout.furniture.find(x => x.id === s.look);
      $('guideStep').textContent = r.name;
      await goToRoom(r, { item: it || null });
      if (!GUIDE.touring) break;
      flyTo(player.x, player.z, player.yaw, player.pitch, .01, .045);   // slow pan while talking
      gSay(s.say); await gSpeak(s.say);
      while (GUIDE.paused && GUIDE.touring) await new Promise(r => setTimeout(r, 250));
      GUIDE.flight = null; await new Promise(r => setTimeout(r, 350));
    }
    if (GUIDE.touring && script.outro) { gSay(script.outro); await gSpeak(script.outro); }
  } finally { GUIDE.touring = false; GUIDE.flight = null; setTourUI(false); }
}
const tourSig = () => layout.rooms.length + ':' + layout.furniture.length + ':' + (project.edits?.[0]?.t || 0);
function stopTour() { if (PRES.on) return endPresent(); GUIDE.touring = false; GUIDE.paused = false; hush(); GUIDE.flight = null; setTourUI(false); }

/* ---------- chat ---------- */
async function guideSend(text) {
  if (!text) return; if (GUIDE.busy) { GUIDE.queued = text; $('guideIn').value = ''; gNote('Got it, one moment…', 'sys'); return; } $('guideIn').value = '';
  if (PRES.on) { PRES.paused = GUIDE.paused = true; $('presentPause').textContent = 'Resume'; } else if (GUIDE.touring) stopTour();
  if (!GUIDE.open) openGuide(true);
  if (DES.on && DES.waiting && !/\?\s*$/.test(text) && !QUICK.test(text)) { const r = DES.waiting; gSay(text, 'you'); designThisRoom(r, `Design ${r.name}: ${text}`); return; }   // in designer mode, what they type is the brief for the room in front of them
  gSay(text, 'you'); GUIDE.busy = true; const typing = gNote('…', 'guide typing');
  try {
    const j = await guideAsk(chatPrompt(text), QUICK.test(text) && text.length < 60 ? 'guide' : 'guide_pro');
    typing.remove();
    const line = String(j?.say || '').slice(0, 600) || 'Done.';
    gSay(line); gSpeak(line);
    if (Array.isArray(j?.options) && j.options.length) gOptions(j.options);
    for (const a of (Array.isArray(j?.actions) ? j.actions : []).slice(0, 3)) await runAction(a);
  } catch (e) { typing.remove(); gNote(e?.message || 'Something went wrong. Try again.', 'sys'); }
  finally { GUIDE.busy = false; if (GUIDE.queued) { const q = GUIDE.queued; GUIDE.queued = null; guideSend(q); } }
}
async function runAction(a) {
  if (!a || typeof a !== 'object') return;
  const findRoom = n => layout.rooms.find(r => r.name.toLowerCase() === String(n || '').toLowerCase()) || layout.rooms.find(r => r.name.toLowerCase().includes(String(n || '').toLowerCase()));
  if (a.do === 'go') { const r = findRoom(a.room); if (r) { if (PRES.on || PRES.fig?.visible) { const was = PRES.on; PRES.on = true; await presentGo(r); PRES.on = was; } else await goToRoom(r); } }
  else if (a.do === 'look') { const it = layout.furniture.find(x => x.id === a.item); if (it) await lookAtItem(it); }
  else if (a.do === 'time' && TIMES[a.value]) { layout.settings.timeOfDay = a.value; applyTime(); saveSoon(); }
  else if (a.do === 'tour') { if (!GUIDE.touring) startTour(); }
  else if (a.do === 'stop') stopTour();
  else if (a.do === 'real') { if (SITE?.renderReal) SITE.renderReal(); else gNote('Photo-real renders are available on mirage.', 'sys'); }
  else if (a.do === 'edit' && a.request) guideEdit(a.request);   // not awaited: she can keep talking while the change is made
  else if (a.do === 'design_rooms') startDesigner();
  else if (a.do === 'vastu') await showVastu(true);
  else if (a.do === 'vastu_fix') await vastuFix();
}
// A change asked for through Mira. It joins the queue (one change at a time), shows its progress in the chat with a
// Stop button, and resolves true if the home changed. Asking for the same change twice returns the one already running.
function guideEdit(request) {
  request = String(request || '').trim().slice(0, 2400); if (!request) return Promise.resolve(false);
  const same = GUIDE.edits.find(e => e.request === request); if (same) return same.job;
  const ac = new AbortController(), t0 = Date.now(), ent = { request, state: editing || GUIDE.edits.length ? 'queued' : 'working' };
  const note = gNote('', 'sys work'), label = document.createElement('span'), stop = document.createElement('button'); stop.type = 'button'; stop.textContent = 'Stop'; stop.onclick = () => ac.abort(); note.append(label, stop);
  const paint = () => { ent.state = editNow === request ? 'working' : 'queued'; const s = Math.round((Date.now() - t0) / 1000); label.textContent = ent.state === 'queued' ? `Next in line… ${s}s` : running ? `Furnishing the room… ${s}s` : `Making the change… ${s}s`; };
  paint(); const iv = setInterval(paint, 500);
  ent.job = requestEdit(request, { signal: ac.signal }).then(r => {
    clearInterval(iv); GUIDE.edits = GUIDE.edits.filter(e => e !== ent); note.remove();
    const pw = r.paywall, why = pw === 'no_changes_left' ? 'You have used the changes on this home. I opened the options to add more.' : pw === 'pass_expired' ? 'This home is no longer editable on its pass. I opened the options.' : pw === 'credits' ? 'There are not enough credits for a change.' : pw && pw !== 'blocked' ? 'Changes by voice or text come with a Home Pass. I opened the options for you.' : '';
    if (r.ok) { document.querySelectorAll('#guideLog .gundo').forEach(b => b.remove()); const n = gNote(`✓ ${r.summary || 'Changed.'} `, 'sys'), u = document.createElement('button'); u.type = 'button'; u.className = 'gundo'; u.textContent = 'Undo'; u.onclick = () => { undoEdit(); u.remove(); gNote('Undone.', 'sys'); }; n.append(u); GUIDE.hist.push({ who: 'guide', text: `(changed: ${r.summary})` }); }
    else if (why) { gNote(why, 'sys'); gSpeak(why); }
    else if (r.cancelled) gNote('Stopped. Nothing was changed.', 'sys');
    else { const t = r.summary || r.reason || 'Nothing was changed.'; gSay(t); gSpeak(t); }
    return !!r.ok;
  });
  GUIDE.edits.push(ent); return ent.job;
}

/* ---------- interior designer mode: the bare shell, designed room by room with Mira ---------- */
const DES = { on: false, rooms: [], i: 0, waiting: null, genId: null, pre: new Map() };
const roomBare = r => !layout.furniture.some(it => it.room === r.name && CAT[it.type]);
function designerPrompt(r) {
  const P = profile(), done = layout.rooms.filter(x => x !== r && !roomBare(x) && x.kind !== 'ledge').map(x => `${x.name}: ${layout.furniture.filter(it => it.room === x.name && CAT[it.type]).slice(0, 5).map(it => (it.name || CAT[it.type].label).toLowerCase()).join(', ')}`).join('\n');
  return `You are ${GUIDE_NAME}, the designer and guide inside Mirage. You are designing a client's new home with them, one room at a time, in a live 3D model. The room in front of you is empty. Offer four complete, different concepts for it; the client picks one or describes their own, and the furnishing engine builds it.
HOME: ${project.name || 'the home'}. Chosen style: ${project.style?.summary || ''}
${P.done ? 'THE CLIENT: ' + spaceText() + ' Budget: ' + (BUDGETS[P.budget]?.name || '') + '.' : ''}${project.brief ? '\nTHEIR NOTES: ' + String(project.brief).slice(0, 500) : ''}
${describeRoom(roomFrame(r), false)}
${done ? 'ROOMS ALREADY DESIGNED (keep the home feeling like one home):\n' + done + '\n' : ''}
Think like a principal at a top studio pitching to a client with taste, not like a furniture catalogue. Each concept is a point of view:
- what the room is for and how it is laid out: which wall the main piece goes on, what faces the window or the door, where people walk;
- a signature move: a statement piece, a feature wall, a ceiling or lighting scheme;
- a palette and two or three real materials, named;
- layered light: cove or wall wash, an accent, and a pendant, sconce or lamp.
The first concept follows the home's chosen style closely. The others may differ in mood but must sit well with the rooms already designed. One should be bold. For a kitchen or bathroom, keep the room what it is and vary the layout, materials and light. Pitch at the client's budget.
PIECES THE ENGINE CAN BUILD (any finish or colour): ${Object.values(CAT).map(c => c.label.toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(', ')}.
Reply with only JSON: {"say":"one warm sentence, read aloud, that names the best thing about this room and invites them to pick","options":[{"label":"an evocative name, at most five words","why":"one line, at most 16 words, on how it will feel","request":"the full brief for the furnishing engine, 60 to 120 words: the layout by wall, the key pieces with finishes and colours, the lighting, the signature piece"}]}`;
}
function setDesignUI() {
  const r = DES.rooms[DES.i]; $('designBar').hidden = !DES.on; $('guidePanel').classList.toggle('designing', DES.on);
  if (DES.on) $('designStep').textContent = r ? `${r.name} · ${DES.i + 1} of ${DES.rooms.length}` : 'finishing';
  if (!DES.on) guideActions([]);
}
// the next steps, as buttons in the dock itself: they stay in reach when the conversation is folded away to show the room
function guideActions(list) {
  const el = $('guideActs'); el.innerHTML = ''; el.hidden = !list.length;
  list.forEach((o, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = o.label; if (!i) b.className = 'primary'; b.onclick = () => { guideActions([]); gSay(o.label, 'you'); o.go(); }; el.append(b); });
}
function designConcepts(r) { if (!DES.pre.has(r.name)) DES.pre.set(r.name, guideAsk(designerPrompt(r), 'guide_pro').catch(() => null)); return DES.pre.get(r.name); }
async function startDesigner() {
  if (DES.on) return; if (!layout.walls.length) return gNote('Add your floor plan first, then we can design it together.');
  if (running) return gNote('A design is still being made. We can go room by room as soon as it finishes.');
  const rooms = tourRooms().filter(roomBare);
  openGuide(true);
  if (!rooms.length) { const t = 'Every room is already designed. Walk into any room and ask me for ideas, and I will redo it with you.'; gSay(t); gSpeak(t); return; }
  if (!profile().done && !(await askProfile())) return;
  if (SITE) { if (!(await SITE.canDesign?.(project))) return; try { DES.genId = await SITE.startGen(project); } catch (e) { gNote(errText(e), 'sys'); SITE.onError?.(e); return; } }
  if (!layout.furniture.length) {   // the shell takes on the chosen style before the first room
    const preset = presetById(project.presetId) || PRESETS[0]; if (!project.customStyle) project.style = normalizeStyle(structuredClone(preset.style));
    layout.settings.timeOfDay = project.style.time; applyStyleToRooms(layout, project.style); for (const k in MC) delete MC[k]; buildAll(); renderStyle();
  }
  if (GUIDE.touring) stopTour();
  DES.on = true; DES.rooms = rooms; DES.i = 0; DES.pre = new Map();
  const hi = `Let us design your home together, ${rooms.length} room${rooms.length > 1 ? 's' : ''}, one at a time. For each room I will show you a few directions: pick one, or tell me what you want.`; gSay(hi); gSpeak(hi);
  designRoom();
}
async function designRoom() {
  const r = DES.rooms[DES.i]; setDesignUI(); if (!DES.on) return; if (!r) return finishDesigner(false);
  DES.waiting = null; guideActions([]); const typing = gNote('…', 'guide typing');
  const [j] = await Promise.all([designConcepts(r), goToRoom(r)]); typing.remove();
  if (!DES.on || DES.rooms[DES.i] !== r) return;
  const nxt = DES.rooms[DES.i + 1]; if (nxt) designConcepts(nxt);     // the next room's ideas are ready by the time this one is built
  const opts = (Array.isArray(j?.options) ? j.options : []).filter(o => o?.label && o?.request).slice(0, 4);
  const line = String(j?.say || '').slice(0, 400) || `This is the ${r.name.toLowerCase()}, ${gRoomSize(r).replace(' × ', ' by ')}. Tell me how you want it to feel.`;
  gSay(line); gSpeak(line); DES.waiting = r;
  if (opts.length) designOptions(opts.map(o => ({ label: o.label, why: o.why, go: () => designThisRoom(r, `Design ${r.name}: ${o.request}`, o.label) })));
  else gNote('Describe the room you want in the box below, and I will build it.', 'sys');
}
// a row of choices in the conversation; each runs its own action once
function designOptions(list) {
  const el = document.createElement('div'); el.className = 'gopts';
  el.innerHTML = list.map((o, i) => `<button type="button" data-i="${i}"><b>${esc(String(o.label).slice(0, 60))}</b>${o.why ? `<span>${esc(String(o.why).slice(0, 140))}</span>` : ''}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => { const o = list[+b.dataset.i]; el.querySelectorAll('button').forEach(x => x.disabled = true); b.classList.add('chosen'); gSay(o.label, 'you'); o.go(); });
  if (!GUIDE.open) openGuide(true); const log = $('guideLog'); log.appendChild(el); log.scrollTop = log.scrollHeight;
}
async function designThisRoom(r, brief) {
  if (running) return gNote('One moment, the last room is still being built.', 'sys');
  DES.waiting = null; guideActions([]); const note = gNote(`Building ${r.name}…`, 'sys work'); let placed = 0;
  openGuide(false);   // step back and let them watch the room come together; progress shows at the top
  running = true; ctl = new AbortController(); stepUI([{ id: 'refurn', label: 'Designing ' + r.name, state: 'active' }]);
  try {
    if (SITE) SITE.ctx = DES.genId ? { kind: 'design', genId: DES.genId } : { kind: 'refurnish', homeId: project.id };
    removeItemsWhere(it => it.room === r.name); select(null);
    placed = (await furnishRooms([r], ctl.signal, 'refurn', brief)).placed;
  } catch (e) { if (e?.code !== 'cancelled') gNote(errText(e), 'sys'); }
  finally { running = false; note.remove(); saveSoon(); }
  if (placed > 0) { project.status = 'generated'; project.generatedAt ||= Date.now(); project.tour = null; setTimeout(captureCover, 600); await goToRoom(r, { cut: false }); }
  if (!DES.on) return;
  const nxt = DES.rooms[DES.i + 1], t = placed > 0 ? `${r.name} is done. Look around: if something is not right, tell me and I will change it.` : `I could not build ${r.name} that way. Try another direction, or skip it for now.`;
  gSay(t); gSpeak(t); DES.waiting = placed > 0 ? null : r;
  if (placed > 0) openGuide(false);   // fold the conversation away so the room they just designed is what they see
  guideActions([
    ...(placed > 0 ? [{ label: nxt ? `Next room: ${nxt.name}` : 'Finish the home', go: () => { DES.i++; designRoom(); } }] : []),
    { label: placed > 0 ? 'Try another look for this room' : 'Show me the directions again', go: () => { DES.pre.delete(r.name); designRoom(); } },
    ...(placed > 0 ? [] : [{ label: 'Skip this room', go: () => { DES.i++; designRoom(); } }]),
  ]);
}
// the rooms nobody needs to choose for (passages, utility, small baths), or everything that is left when they say "finish it for me"
async function finishDesigner(all) {
  const left = layout.rooms.filter(r => r.kind !== 'ledge' && r.type !== 'other' && r.polygon?.length > 2 && roomBare(r) && (all || !DES.rooms.includes(r)));
  DES.waiting = null; DES.i = DES.rooms.length; setDesignUI();
  if (left.length && !running) {
    const t = all ? 'I will finish the rest of the home in the same spirit.' : 'I will finish the passages and small rooms to match.'; gSay(t); gSpeak(t);
    running = true; ctl = new AbortController(); stepUI([{ id: 'refurn', label: all ? 'Designing the rest of the home' : 'Finishing passages and small rooms', state: 'active' }]);
    try { if (SITE) SITE.ctx = DES.genId ? { kind: 'design', genId: DES.genId } : { kind: 'refurnish', homeId: project.id }; const { placed } = await furnishRooms(left, ctl.signal, 'refurn', ''); if (placed) project.status = 'generated'; }
    catch (e) { if (e?.code !== 'cancelled') gNote(errText(e), 'sys'); }
    finally { running = false; saveSoon(); }
  }
  endDesigner(layout.furniture.length ? 'That is your home, designed by you. Walk through it, ask me for a tour, or tell me anything you want changed.' : '');
}
function endDesigner(say) {
  const was = DES.on; DES.on = false; DES.waiting = null; setDesignUI();
  if (SITE && DES.genId) { SITE.finishGen?.(DES.genId); DES.genId = null; }
  if (was) { renderGenState(); renderPresets?.(); saveSoon(); setTimeout(captureCover, 800); if (say) { gSay(say); gSpeak(say); } }
}
$('designSkip').onclick = () => { if (running || !DES.on) return; gNote(`Skipped ${DES.rooms[DES.i]?.name || 'this room'}.`, 'sys'); DES.i++; designRoom(); };
$('designAuto').onclick = () => { if (!running && DES.on) finishDesigner(true); };
$('designExit').onclick = () => { if (running) ctl?.abort(); endDesigner('We can pick this up again whenever you like: tap Design room by room.'); };

/* ---------- panel ---------- */
function gSay(text, who = 'guide') { GUIDE.hist.push({ who, text }); if (GUIDE.hist.length > 30) GUIDE.hist.shift(); return gNote(text, who); }
function gNote(text, cls = 'guide') {
  const el = document.createElement('div'); el.className = 'gmsg ' + cls; el.textContent = text; const log = $('guideLog'); log.appendChild(el); log.scrollTop = log.scrollHeight;
  if (text && !/typing|work/.test(cls)) { const last = $('guideLast'); last.textContent = (cls === 'you' ? 'You: ' : cls === 'guide' ? GUIDE_NAME + ': ' : '') + text; last.hidden = false; }   // the last line stays readable when the conversation is folded away
  return el;
}
function setTourUI(on) { $('guideTourBar').hidden = !on; $('guideTour').hidden = on; if (!on) $('guideStep').textContent = ''; $('guidePause').textContent = 'Pause'; }
function openGuide(v = !GUIDE.open) {
  // the dock (chips and the box to type in) is always there; "open" unfolds the conversation above it
  GUIDE.open = v; $('guidePanel').classList.toggle('open', v); document.body.classList.toggle('guide-open', v); $('btnGuide').setAttribute('aria-pressed', v);
  if (v && !$('guideLog').children.length) gNote(`Hi, I'm ${GUIDE_NAME}. I can walk you through this home, give you ideas, and change anything: furniture, colours, lighting, even a light wall or a window. If the plan was read wrong, tell me and I'll correct it.`);
  if (v) { const log = $('guideLog'); log.scrollTop = log.scrollHeight; }
}
$('guideLast').onclick = () => openGuide(true);
$('btnGuide').onclick = () => openGuide();
$('guideClose').onclick = () => openGuide(false);

$('guideStop').onclick = () => stopTour();
$('guidePause').onclick = () => { GUIDE.paused = !GUIDE.paused; $('guidePause').textContent = GUIDE.paused ? 'Resume' : 'Pause'; if (GUIDE.paused) window.speechSynthesis?.pause(); else window.speechSynthesis?.resume(); };
$('guideVoice').onclick = () => { GUIDE.speak = !GUIDE.speak; $('guideVoice').setAttribute('aria-pressed', GUIDE.speak); $('guideVoice').title = GUIDE.speak ? 'Voice on' : 'Voice off'; if (!GUIDE.speak) hush(); };
$('guideMic').hidden = !SR; $('guideMic').onclick = gListen;
$('guideForm').addEventListener('submit', e => { e.preventDefault(); guideSend($('guideIn').value.trim()); });
$('guideIn').addEventListener('keydown', e => e.stopPropagation());
$('guideChips').querySelectorAll('button').forEach(b => b.onclick = () => b.dataset.act === 'tour' || b.dataset.act === 'fly' ? startTour()
  : b.dataset.act === 'vastu' ? (gSay(b.textContent, 'you'), showVastu())
  : b.dataset.act === 'fix' ? (() => { const i = $('guideIn'); i.value = 'The plan was read wrong: '; i.focus(); i.setSelectionRange(i.value.length, i.value.length); gNote('Tell me what is different in the real plan: a wall that is not there, a room that is bigger, a missing door or window. I will correct the drawing.', 'guide'); })()
  : b.dataset.act === 'design' ? startDesigner()
  : b.dataset.act === 'ideas' ? guideSend(`Give me your best ideas for ${roomAt(player.x, player.z)?.name || 'this room'}.`)
  : guideSend(b.textContent));
// the guide stops driving the moment you take the controls
['keydown', 'pointerdown'].forEach(ev => $('stage').addEventListener(ev, () => { if (GUIDE.flight && !GUIDE.touring) GUIDE.flight = null; }));
addEventListener('keydown', e => { if (GUIDE.touring && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown'].includes(e.code)) stopTour(); });
window.__guide = { GUIDE, goToRoom, startTour, stopTour, viewpoint, guideStep };
