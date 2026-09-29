/* ================= the guide: walks you through the home and makes changes as you talk ================= */
const GUIDE = { open: false, busy: false, speak: true, touring: false, paused: false, skip: false, hist: [], flight: null, voice: null, rec: null, listening: false, stopTour: null };
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
const TOUR_ORDER = ['foyer', 'living', 'dining', 'kitchen', 'balcony', 'terrace', 'study', 'master', 'walkin', 'bath', 'bedroom', 'staff', 'passage', 'utility', 'other'];
function tourRooms() {
  const rs = layout.rooms.filter(r => r.polygon?.length > 2 && r.kind !== 'ledge' && !['passage', 'utility'].includes(r.type) && polyArea(r.polygon) > (r.type === 'bath' ? 64 : 30) && !/powder/i.test(r.name));
  return rs.sort((a, b) => TOUR_ORDER.indexOf(a.type) - TOUR_ORDER.indexOf(b.type) || polyArea(b.polygon) - polyArea(a.polygon));
}
function tourPrompt() {
  const F = homeFacts({ ids: true }), order = tourRooms().map(r => r.name);
  return `You are ${GUIDE_NAME}, the guide inside Mirage, a 3D walkthrough of a home that has not been built yet. Write the script for a guided tour you give in person: you walk the visitor from room to room, stop beside the standout piece and turn to talk to them. It is spoken aloud.
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
  const F = homeFacts({ ids: true }), here = roomAt(player.x, player.z);
  const hist = GUIDE.hist.slice(-8).map(m => `${m.who === 'you' ? 'VISITOR' : 'GUIDE'}: ${m.text}`).join('\n');
  return `You are ${GUIDE_NAME}, the guide inside Mirage, a live 3D walkthrough of a home that has not been built yet. You can move the visitor's camera and ask the design engine to change the home. Speak like a warm, sharp interior designer: short (one to three sentences, it is read aloud), specific, honest. Only state facts listed below; never invent views, sunlight, directions, prices or brands. If you don't know, say so.
HOME: ${project.name || 'the home'}, about ${F.area} sq ft. Style: ${project.style?.summary || ''} Time of day: ${layout.settings.timeOfDay}.
ROOMS (name — size — pieces with [ids]):
${F.text}
THE VISITOR IS IN: ${here ? here.name : 'the overview'}.${GUIDE.touring ? ' A guided tour is running.' : ''}
${hist ? 'CONVERSATION SO FAR:\n' + hist + '\n' : ''}VISITOR SAYS: "${text.slice(0, 600)}"
Reply with only JSON: {"say":"what you say","actions":[...]} using at most three actions:
{"do":"go","room":"<exact room name>"} take them to a room (use when they ask to see or go somewhere, or when showing helps your answer)
{"do":"look","item":"<id>"} turn to face a piece
{"do":"time","value":"dusk|golden|night|day"} change the light
{"do":"edit","request":"<a precise instruction for the design engine, naming the room and pieces>"} for ANY change to furniture, colours, materials, floors, walls or layout. It uses one of their changes; mention that you're making it.
{"do":"real"} when they want a real photo of the view
{"do":"tour"} start the full guided tour · {"do":"stop"} stop the tour
Questions (sizes, what is in a room, ideas) get an answer and usually a go or look.`;
}

/* ---------- talking to Claude ---------- */
async function guideAsk(prompt, kind) {
  if (SITE) SITE.ctx = { kind, homeId: project.id };
  const sample = await getSample(); if (!sample) throw Object.assign(new Error('The guide needs Claude, which is not available in this view.'), { code: 'no_claude' });
  return sample.json(prompt, { modelTier: 'default' });
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
  openGuide(true); GUIDE.touring = true; GUIDE.paused = false; setTourUI(true);
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
  gSay(text, 'you'); GUIDE.busy = true; const typing = gNote('…', 'guide typing');
  try {
    const j = await guideAsk(chatPrompt(text), 'guide');
    typing.remove();
    const line = String(j?.say || '').slice(0, 600) || 'Done.';
    gSay(line); gSpeak(line);
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
  else if (a.do === 'tour') { if (PRES.on) { PRES.paused = GUIDE.paused = false; $('presentPause').textContent = 'Pause'; } else startPresent(); }
  else if (a.do === 'stop') stopTour();
  else if (a.do === 'real') { if (SITE?.renderReal) SITE.renderReal(); else gNote('Photo-real renders are available on mirage.', 'sys'); }
  else if (a.do === 'edit' && a.request) await guideEdit(String(a.request).slice(0, 600));
}
function guideEdit(request) {
  return new Promise(res => {
    const before = project.edits?.length || 0; pinput.value = request; $('pform').requestSubmit();
    const t0 = Date.now(), iv = setInterval(() => { if ((!editing && Date.now() - t0 > 600) || Date.now() - t0 > 180000) { clearInterval(iv);
      const ok = (project.edits?.length || 0) > before, pw = SITE?.lastPaywall && SITE.lastPaywall.t >= t0 ? SITE.lastPaywall.reason : '';
      const why = pw === 'no_changes_left' ? 'You have used the changes on this home. I opened the options to add more.' : pw === 'pass_expired' ? 'This home is no longer editable on its pass. I opened the options.' : pw ? 'Changes by voice or text come with a Home Pass. I opened the options for you.' : ($('pstatus').textContent || 'Nothing was changed.');
      gNote(ok ? `✓ ${project.edits[0].summary || 'Changed.'}` : why, 'sys'); if (pw) gSpeak(why); if (ok) GUIDE.hist.push({ who: 'guide', text: `(changed: ${project.edits[0].summary})` }); res(ok); } }, 300);
  });
}

/* ---------- panel ---------- */
function gSay(text, who = 'guide') { GUIDE.hist.push({ who, text }); if (GUIDE.hist.length > 30) GUIDE.hist.shift(); return gNote(text, who); }
function gNote(text, cls = 'guide') {
  const el = document.createElement('div'); el.className = 'gmsg ' + cls; el.textContent = text; const log = $('guideLog'); log.appendChild(el); log.scrollTop = log.scrollHeight; return el;
}
function setTourUI(on) { $('guideTourBar').hidden = !on; $('guideTour').hidden = on; if (!on) $('guideStep').textContent = ''; $('guidePause').textContent = 'Pause'; }
function openGuide(v = !GUIDE.open) {
  GUIDE.open = v; $('guidePanel').hidden = !v; document.body.classList.toggle('guide-open', v); $('btnGuide').setAttribute('aria-pressed', v);
  if (v && !$('guideLog').children.length) gNote(`Hi, I'm ${GUIDE_NAME}. I can walk you through this home, answer questions, and change anything you ask for. Try “show me the kitchen” or “make the bedroom darker”.`);
  if (v) setTimeout(() => $('guideIn').focus(), 50); else hush();
}
$('btnGuide').onclick = () => openGuide();
$('guideClose').onclick = () => { stopTour(); openGuide(false); };

$('guideStop').onclick = () => stopTour();
$('guidePause').onclick = () => { GUIDE.paused = !GUIDE.paused; $('guidePause').textContent = GUIDE.paused ? 'Resume' : 'Pause'; if (GUIDE.paused) window.speechSynthesis?.pause(); else window.speechSynthesis?.resume(); };
$('guideVoice').onclick = () => { GUIDE.speak = !GUIDE.speak; $('guideVoice').setAttribute('aria-pressed', GUIDE.speak); $('guideVoice').title = GUIDE.speak ? 'Voice on' : 'Voice off'; if (!GUIDE.speak) hush(); };
$('guideMic').hidden = !SR; $('guideMic').onclick = gListen;
$('guideForm').addEventListener('submit', e => { e.preventDefault(); guideSend($('guideIn').value.trim()); });
$('guideIn').addEventListener('keydown', e => e.stopPropagation());
$('guideChips').querySelectorAll('button').forEach(b => b.onclick = () => b.dataset.act === 'tour' ? startPresent() : b.dataset.act === 'fly' ? startTour() : guideSend(b.textContent));
// the guide stops driving the moment you take the controls
['keydown', 'pointerdown'].forEach(ev => $('stage').addEventListener(ev, () => { if (GUIDE.flight && !GUIDE.touring) GUIDE.flight = null; }));
addEventListener('keydown', e => { if (GUIDE.touring && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown'].includes(e.code)) stopTour(); });
window.__guide = { GUIDE, goToRoom, startTour, stopTour, viewpoint, guideStep };
