/* ================= the brief: home or office, Vastu, who lives there, budget ================= */
const PROFILE_DEFAULT = () => ({ use: 'home', vastu: 'no', household: { adults: 2, kids: 0, elders: false, pets: false, wfh: 0 }, office: { team: 10, cabins: 1, meeting: true, reception: true }, budget: 'premium', done: false });
function profile() { if (!project.profile) project.profile = PROFILE_DEFAULT(); return project.profile; }
const BUDGETS = { essential: { name: 'Essential', line: 'Well made and simple. Fewer statement pieces.' }, premium: { name: 'Premium', line: 'Feature walls, layered light, a hero piece per room.' }, luxury: { name: 'Luxury', line: 'Stone, velvet, brass and custom joinery throughout.' } };

/* ---------- compass ---------- */
const DIRS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const DIRNAME = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west', C: 'centre' };
const ARROWS = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };
const hasNorth = () => Number.isFinite(layout?.settings?.north);
function compassVecs() { const n = (layout.settings.north || 0) * D2R; return { N: [Math.sin(n), -Math.cos(n)], E: [Math.cos(n), Math.sin(n)] }; }
function bearingOf(dx, dz) { const { N, E } = compassVecs(); return (Math.atan2(dx * E[0] + dz * E[1], dx * N[0] + dz * N[1]) / D2R + 360) % 360; }
const dirOf = b => DIRS8[Math.round((((b % 360) + 360) % 360) / 45) % 8];
function homeFrame() {
  const { N, E } = compassVecs(); let e0 = 1e9, e1 = -1e9, n0 = 1e9, n1 = -1e9;
  const pts = layout.walls.length ? layout.walls.flatMap(w => [w.a, w.b]) : layout.rooms.flatMap(r => r.polygon || []);
  for (const [x, z] of pts) { const e = x * E[0] + z * E[1], n = x * N[0] + z * N[1]; e0 = Math.min(e0, e); e1 = Math.max(e1, e); n0 = Math.min(n0, n); n1 = Math.max(n1, n); }
  return { N, E, e0, e1, n0, n1 };
}
// the Vastu grid: the home's footprint cut into thirds along north-south and east-west
function zoneAt(x, z, F = homeFrame()) {
  const e = x * F.E[0] + z * F.E[1], n = x * F.N[0] + z * F.N[1];
  const u = 2 * (e - F.e0) / Math.max(F.e1 - F.e0, 1) - 1, v = 2 * (n - F.n0) / Math.max(F.n1 - F.n0, 1) - 1;
  return ((v > 1 / 3 ? 'N' : v < -1 / 3 ? 'S' : '') + (u > 1 / 3 ? 'E' : u < -1 / 3 ? 'W' : '')) || 'C';
}
const roomZone = (r, F) => { const [x, z] = centroid(r.polygon); return zoneAt(x, z, F); };
const frontVec = it => { const t = (it.rot || 0) * D2R; return [Math.sin(t), Math.cos(t)]; };
const backDir = it => { const [fx, fz] = frontVec(it); return dirOf(bearingOf(-fx, -fz)); };   // the wall an item's back is on
function mainDoor() {
  for (const w of layout.walls) for (const o of w.openings || []) if (o.name === 'Main door') {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L, m = (o.start + o.end) / 2, cx = w.a[0] + ux * m, cz = w.a[1] + uz * m, off = w.thickness / 2 + 1.3;
    const p = roomAt(cx - uz * off, cz + ux * off), q = roomAt(cx + uz * off, cz - ux * off);
    let ox = -uz, oz = ux; if (p && !q) { ox = uz; oz = -ux; } else if (p && q) { const F = homeFrame(), [hx, hz] = [(F.e0 + F.e1) / 2, (F.n0 + F.n1) / 2]; const c = [hx * F.E[0] + hz * F.N[0], hx * F.E[1] + hz * F.N[1]]; if ((cx - c[0]) * ox + (cz - c[1]) * oz < 0) { ox = -ox; oz = -oz; } }
    return { x: cx, z: cz, faces: dirOf(bearingOf(ox, oz)) };
  }
  return null;
}
// rooms joined by a door (for "attached bath")
function doorLinks() {
  const out = [];
  for (const w of layout.walls) { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (L < .1) continue; const ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L;
    for (const o of w.openings || []) { if (o.type === 'window') continue; const m = (o.start + o.end) / 2, cx = w.a[0] + ux * m, cz = w.a[1] + uz * m, off = w.thickness / 2 + 1.3;
      const p = roomAt(cx - uz * off, cz + ux * off), q = roomAt(cx + uz * off, cz - ux * off); if (p && q && p !== q) out.push([p, q]); } }
  return out;
}
const attachedBath = r => doorLinks().some(([a, b]) => (a === r && b.type === 'bath') || (b === r && a.type === 'bath'));

/* ---------- describing the brief ---------- */
function profileLine(P = profile()) {
  if (!P.done) return 'Not set yet';
  const h = P.household, o = P.office, bits = [P.use === 'office' ? 'Office' : 'Home'];
  bits.push(P.vastu === 'yes' ? 'Vastu' : P.vastu === 'partly' ? 'Vastu where easy' : 'No Vastu');
  if (P.use === 'office') bits.push(`team of ${o.team}`, `${o.cabins} cabin${o.cabins === 1 ? '' : 's'}`); else { const w = [`${h.adults} adult${h.adults === 1 ? '' : 's'}`]; if (h.kids) w.push(`${h.kids} kid${h.kids > 1 ? 's' : ''}`); if (h.elders) w.push('elders'); if (h.pets) w.push('pets'); if (h.wfh) w.push(`${h.wfh} WFH`); bits.push(w.join(', ')); }
  bits.push(BUDGETS[P.budget]?.name || 'Premium'); return bits.join(' · ');
}
function spaceText(P = profile()) {
  if (P.use === 'office') { const o = P.office; return `An OFFICE for a team of ${o.team}, with ${o.cabins} private cabin${o.cabins === 1 ? '' : 's'}${o.meeting ? ', a meeting room' : ''}${o.reception ? ', a reception' : ''}.`; }
  const h = P.household, who = [`${h.adults} adult${h.adults === 1 ? '' : 's'}`]; if (h.kids) who.push(`${h.kids} child${h.kids > 1 ? 'ren' : ''}`); if (h.elders) who.push('elderly parents'); if (h.pets) who.push('pets');
  return `A HOME for ${who.join(', ')}${h.wfh ? `; ${h.wfh} ${h.wfh > 1 ? 'people work' : 'person works'} from home` : ''}.`;
}
function needsText(P = profile()) {
  if (P.use === 'office') return `OFFICE RULES (this is a workplace, not a home: no beds, wardrobes or nightstands anywhere):
- workspace: desks in rows or clusters with an office-chair each (about 5×2.5 ft per person, 3 ft aisles), bookshelf or tall-unit storage on the walls, pendant-linear or pendants over the desks, plants. Seat as many of the team as fit.
- cabin: a desk with an office-chair behind it facing the door, two armchairs as visitor chairs in front, a bookshelf behind, artwork, a plant; a small sofa if over 150 sq ft.
- meeting: table-dining-long as the conference table with office-chair all round, a tv on the end wall, pendant-linear above.
- reception: a console as the front desk with an office-chair behind, a sofa and armchairs for waiting, a feature wall with the brand moment (panel-slats or feature-stone), plants.
- pantry: kitchen-counter on a wall, bar-stool at a counter or a table-round with dining-chairs.
- Any room still typed as living, bedroom or master is used as workspace or a cabin.`;
  const h = P.household, n = [];
  if (h.kids) n.push("kids' rooms get a study desk with an office-chair, generous storage, playful colour in the accent and a rug-round");
  if (h.elders) n.push("the elders' bedroom keeps wide clear paths (3 ft), an armchair with arms, a lamp by the bed, low rugs only; no jhoola or low poufs in their path");
  if (h.pets) n.push('pets: durable fabrics (leather, fabric-second in darker tones), fewer floor vases and decor clusters at floor level');
  if (h.wfh) n.push(`work from home: ${h.wfh} proper desk${h.wfh > 1 ? 's' : ''} with an office-chair in the study or a quiet bedroom corner, facing a wall or window, with a lamp`);
  return n.length ? 'HOUSEHOLD NEEDS: ' + n.join('; ') + '.' : '';
}
function budgetText(P = profile()) {
  return { essential: 'BUDGET: ESSENTIAL. This overrides the PREMIUM rules below: keep rooms well made but simple. One light layer plus a lamp, ceiling-cove only in the living room, at most one feature wall in the home (living), plain bed with nightstands in secondary bedrooms, kitchen-counter rather than kitchen-luxe for short runs, no bar-unit, media-wall, feature-stone or chandelier. Fewer, better pieces.',
    premium: 'BUDGET: PREMIUM. Follow the PREMIUM rules below.',
    luxury: 'BUDGET: LUXURY. Go beyond the PREMIUM rules: rich materials in every room (marble, onyx, velvet, brass), feature-stone or wall-panel-wood on focal walls, chandeliers in living, dining and master, bed-luxe in every bedroom, closet-lit in walk-ins, kitchen-luxe with kitchen-tall-luxe and an island-waterfall where it fits.' }[P.budget] || '';
}
const VASTU_RULES = `VASTU (the client wants the home to follow Vastu Shastra). Compass directions are given for every room and wall. Follow these where the room allows, without blocking doors:
- Beds: headboard against the SOUTH or WEST wall (east is acceptable); never against the north wall.
- Desks and work tables: the person sits facing NORTH or EAST, so the desk's back goes on the north or east wall (or it floats with the chair on its south or west side).
- Cooking: the cook faces EAST, so the hob (kitchen-luxe) goes on the kitchen's east wall when there is one.
- Pooja: a pooja-unit in the NORTH-EAST of the home (or the north-east corner of the living room), against an east or west wall, never sharing a wall with a toilet.
- Heavy storage (wardrobe, tall-unit, bookshelf, closet-lit, kitchen-tall-luxe): on SOUTH or WEST walls.
- Mirrors: on NORTH or EAST walls, never facing the bed.
- Keep the centre of the home open and light; heavy pieces stay out of it.
- Living and seating: the main sofa's back on the south or west wall, so people face north or east.`;
const vastuOn = () => ['yes', 'partly'].includes(profile().vastu) && hasNorth();
function briefForFurnish() {
  const P = profile(); if (!P.done) return '';
  return [`SPACE: ${spaceText(P)}`, needsText(P), budgetText(P), vastuOn() ? VASTU_RULES + (P.vastu === 'partly' ? '\n(The client said "where it is easy": prefer Vastu, but never at the cost of a good layout.)' : '') : ''].filter(Boolean).join('\n');
}

/* ---------- the questionnaire ---------- */
function askProfile() {
  return new Promise(resolve => {
    const P = structuredClone(profile()); P.household ||= PROFILE_DEFAULT().household; P.office ||= PROFILE_DEFAULT().office;
    let step = 0, settled = false; const north0 = layout.settings.north;
    let north = Number.isFinite(north0) ? north0 : null;
    const m = modal(`<div id="qz"></div>`, { wide: true });
    const end = ok => { if (settled) return; settled = true; mo.disconnect(); if (ok) { P.done = true; project.profile = P; layout.settings.north = north; renderProfileSum(); saveSoon(); } resolve(ok); };
    const mo = new MutationObserver(() => { if (!m.el.isConnected) end(false); }); mo.observe($('modalRoot'), { childList: true });
    const card = (grp, val, title, line, on) => `<button type="button" class="qcard" data-g="${grp}" data-v="${val}" aria-pressed="${on}"><b>${title}</b><span>${line}</span></button>`;
    const stepper = (k, label, v, min, max) => `<div class="qstep"><span>${label}</span><div><button type="button" data-k="${k}" data-d="-1" aria-label="Fewer">−</button><output>${v}</output><button type="button" data-k="${k}" data-d="1" aria-label="More">+</button></div></div>`;
    const toggle = (k, label, v) => `<div class="qstep"><span>${label}</span><div><button type="button" class="qtog" data-t="${k}" aria-pressed="${!!v}">${v ? 'Yes' : 'No'}</button></div></div>`;
    const pages = [
      () => `<div class="eyebrow">Before we design · 1 of 4</div><h2>What is this space?</h2><p class="lead">It changes how every room gets planned.</p>
        <div class="qgrid two">${card('use', 'home', 'A home', 'Bedrooms, living, kitchen, family life', P.use === 'home')}${card('use', 'office', 'An office', 'Workstations, cabins, meeting room, reception', P.use === 'office')}</div>`,
      () => `<div class="eyebrow">Before we design · 2 of 4</div><h2>Should it follow Vastu?</h2><p class="lead">Mirage plans rooms, beds, desks, the stove and the pooja by direction. You can ask Mira to check or fix it any time.</p>
        <div class="qgrid three">${card('vastu', 'yes', 'Yes', 'Follow Vastu throughout', P.vastu === 'yes')}${card('vastu', 'partly', 'Where it\'s easy', 'Prefer it, never at the cost of a good layout', P.vastu === 'partly')}${card('vastu', 'no', 'No', 'Design freely', P.vastu === 'no')}</div>
        <div class="qnorth"${P.vastu === 'no' ? ' hidden' : ''}><div class="eyebrow" style="margin:16px 0 8px">Which way is north on your plan?${Number.isFinite(north0) ? ' <span style="color:var(--gold)">Read from the plan\'s north arrow</span>' : ''}</div>
        <div class="qcompass">${DIRS8.map((d, i) => `<button type="button" data-n="${i * 45}" aria-pressed="${north === i * 45}" title="North is ${['up', 'up and right', 'right', 'down and right', 'down', 'down and left', 'left', 'up and left'][i]} on the plan">${ARROWS[d]}</button>`).join('')}${project.plan?.image ? `<img src="${project.plan.image}" alt="Your floor plan">` : ''}</div>
        <p class="note" style="margin-top:8px">Point the arrow where north is on the plan image as you uploaded it.</p></div>`,
      () => P.use === 'office' ? `<div class="eyebrow">Before we design · 3 of 4</div><h2>Who works here?</h2><p class="lead">Rooms get assigned to fit the team.</p>
        <div class="qlist">${stepper('office.team', 'People on the team', P.office.team, 1, 200)}${stepper('office.cabins', 'Private cabins', P.office.cabins, 0, 12)}${toggle('office.meeting', 'A meeting room', P.office.meeting)}${toggle('office.reception', 'A reception', P.office.reception)}</div>`
        : `<div class="eyebrow">Before we design · 3 of 4</div><h2>Who will live here?</h2><p class="lead">Kids get study corners, elders get clear paths, work-from-home gets a real desk.</p>
        <div class="qlist">${stepper('household.adults', 'Adults', P.household.adults, 1, 12)}${stepper('household.kids', 'Children', P.household.kids, 0, 8)}${toggle('household.elders', 'Elderly parents', P.household.elders)}${toggle('household.pets', 'Pets', P.household.pets)}${stepper('household.wfh', 'People working from home', P.household.wfh, 0, 8)}</div>`,
      () => `<div class="eyebrow">Before we design · 4 of 4</div><h2>What's the budget level?</h2><p class="lead">It sets the materials and how many statement pieces each room gets.</p>
        <div class="qgrid three">${Object.entries(BUDGETS).map(([k, b]) => card('budget', k, b.name, b.line, P.budget === k)).join('')}</div>`,
    ];
    const lims = { 'office.team': [1, 200], 'office.cabins': [0, 12], 'household.adults': [1, 12], 'household.kids': [0, 8], 'household.wfh': [0, 8] };
    const draw = () => {
      const root = m.el.querySelector('#qz');
      root.innerHTML = pages[step]() + `<div class="qdots">${pages.map((_, i) => `<i${i === step ? ' class="on"' : ''}></i>`).join('')}</div>
        <div class="mact">${step ? '<button type="button" id="qBack">Back</button>' : '<button type="button" data-close>Cancel</button>'}<button type="button" class="primary" id="qNext">${step === pages.length - 1 ? 'Continue' : 'Next'}</button></div>`;
      root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => m.close());
      root.querySelectorAll('.qcard').forEach(b => b.onclick = () => { P[b.dataset.g] = b.dataset.v; draw(); });
      root.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { north = +b.dataset.n; draw(); });
      root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const [g, k] = b.dataset.k.split('.'), [lo, hi] = lims[b.dataset.k]; P[g][k] = clamp((+P[g][k] || 0) + +b.dataset.d, lo, hi); draw(); });
      root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const [g, k] = b.dataset.t.split('.'); P[g][k] = !P[g][k]; draw(); });
      const back = root.querySelector('#qBack'); if (back) back.onclick = () => { step--; draw(); };
      root.querySelector('#qNext').onclick = () => {
        if (step === 1 && P.vastu !== 'no' && north === null) { flash('Pick which way north points on your plan, or choose No for Vastu.', true); return; }
        if (step < pages.length - 1) { step++; draw(); } else { end(true); m.close(); }
      };
      setTimeout(() => root.querySelector('#qNext')?.focus(), 20);
    };
    draw();
  });
}
function renderProfileSum() {
  const el = $('profileSum'); if (!el || !project) return;
  const P = profile();
  el.innerHTML = `<span>${esc(profileLine(P))}</span><button type="button" class="ghost" id="btnProfile">${P.done ? 'Change' : 'Answer'}</button>`;
  $('btnProfile').onclick = () => askProfile();
}

/* ---------- room program: what each room is used for ---------- */
const FIXED_TYPES = new Set(['bath', 'balcony', 'terrace', 'passage', 'foyer', 'utility']);
function programPrompt() {
  const P = profile(), F = hasNorth() ? homeFrame() : null, md = hasNorth() ? mainDoor() : null;
  const rooms = layout.rooms.filter(r => r.kind !== 'ledge' && r.polygon?.length > 2).map(r => `${r.name} | ${r.type} | ${Math.round(polyArea(r.polygon))} sq ft${F ? ' | ' + DIRNAME[roomZone(r, F)] + ' of the home' : ''}${['master', 'bedroom', 'study', 'staff'].includes(r.type) && attachedBath(r) ? ' | has an attached bath' : ''}`).join('\n');
  const types = P.use === 'office' ? 'workspace, cabin, meeting, reception, pantry, study, bath, utility, foyer, passage, balcony, terrace, other' : 'living, dining, kitchen, master, bedroom, study, pooja, walkin, bath, foyer, passage, utility, staff, balcony, terrace, other';
  return `You are an architect deciding how a ${P.use} will use its rooms. The walls are fixed: you only decide what each room is used for and what it is called.
CLIENT: ${spaceText(P)} Budget: ${BUDGETS[P.budget]?.name || 'Premium'}.
${P.use === 'office' ? `Plan the office: ${P.office.cabins} cabin(s) (the largest, quietest one is the owner's cabin, called "Director's Cabin"), ${P.office.meeting ? 'a meeting room, ' : ''}${P.office.reception ? 'a reception by the entrance, ' : ''}a pantry in the old kitchen, and everything else as open workspace with room for ${P.office.team} people. Bathrooms stay bathrooms.` : `Plan the home: one master bedroom (normally the largest bedroom with an attached bath), ${P.household.kids ? `${P.household.kids > 1 ? 'kids\' bedrooms' : 'a kid\'s bedroom'} named for them, ` : ''}${P.household.elders ? 'a parents\' bedroom that is close to the living area and a common bath, ' : ''}${P.household.wfh ? 'a study or home office if a small room is spare (otherwise a work corner is added to a bedroom later), ' : ''}guest bedroom for any spare bedroom. Kitchens, living and dining stay as they are unless a room is clearly mislabelled.`}
${vastuOn() ? `VASTU: the client wants Vastu. Prefer: master bedroom (or the owner's cabin) in the south-west; kids' or guest bedrooms in the west or north-west; a study in the north, east or west; ${P.use === 'office' ? 'reception in the north or east, meeting room in the north-west, pantry in the south-east or north-west' : 'a small spare room in the north-east may become a pooja room'}. Main entrance faces ${md ? DIRNAME[md.faces] : 'unknown'}.` : ''}
ROOMS (current name | type | area${F ? ' | position' : ''} | notes):
${rooms}
Rules: bath, balcony, terrace, passage, foyer and utility rooms keep their type (you may rename them, e.g. "Kids' Bath"). Names are short (under 28 characters) and unique. Every room appears once.
Reply with only JSON: {"rooms":[{"room":"<current name>","name":"<new name>","type":"<one of: ${types}>","why":"<under 12 words>"}]}`;
}
function renameRoom(r, to) {
  const from = r.name; if (from === to) return;
  for (const k of ['roomInspo', 'roomStyles']) if (project[k]?.[from]) { project[k][to] = project[k][from]; delete project[k][from]; }
  for (const it of layout.furniture) if (it.room === from) it.room = to;
  for (const w of layout.walls) for (const o of w.openings || []) if (o.name === from + ' door') o.name = to + ' door';
  r.name = to;
}
function applyProgram(res) {
  const P = profile(), list = Array.isArray(res?.rooms) ? res.rooms : [], ok = new Set(TYPES), changes = [];
  const plan = [];
  for (const e of list) {
    const r = layout.rooms.find(x => x.name === e?.room); if (!r || plan.some(p => p.r === r)) continue;
    let type = String(e.type || r.type).toLowerCase(); if (!ok.has(type) || FIXED_TYPES.has(r.type) || r.kind === 'outdoor') type = r.type;
    if (P.use === 'home' && ['workspace', 'cabin', 'meeting', 'reception'].includes(type)) type = r.type;
    if (P.use === 'office' && ['master', 'bedroom', 'living', 'dining', 'staff', 'walkin'].includes(type)) type = 'workspace';
    let name = String(e.name || r.name).replace(/[\n\r"]/g, '').trim().slice(0, 30) || r.name;
    if (type === r.type && FIXED_TYPES.has(type) && !['other', type].includes(normType('', name))) name = r.name;   // a bath must not be named like a bedroom
    plan.push({ r, name, type, orig: { name: r.name, type: r.type }, why: String(e.why || '').slice(0, 90) });
  }
  // two-phase rename so swaps between names never collide
  plan.forEach((p, i) => renameRoom(p.r, `\u0000tmp${i}`));
  const taken = new Set(layout.rooms.filter(r => !plan.some(p => p.r === r)).map(r => r.name));
  for (const p of plan) {
    let nm = p.name, k = 2; while (taken.has(nm)) nm = `${p.name} ${k++}`; taken.add(nm);
    renameRoom(p.r, nm); p.r.type = p.type;
    if (p.orig.type !== p.type || p.orig.name !== nm) changes.push(`${p.orig.name} → ${nm}${p.why ? ' (' + p.why + ')' : ''}`);
  }
  return changes;
}
async function planRooms(sample, signal) {
  const P = profile(); if (!P.done) return null;
  const h = P.household, worth = P.use === 'office' || vastuOn() || h.kids || h.elders || h.wfh; if (!worth) return null;
  const res = await sample.json(programPrompt(), { modelTier: 'default', signal });
  return applyProgram(res);
}

/* ================= Vastu: check and fix ================= */
const HEAVY = new Set(['wardrobe', 'tall-unit', 'bookshelf', 'closet-lit', 'kitchen-tall-luxe']);
function vGrade(zone, good, bad) { return good.includes(zone) ? 'ok' : bad.includes(zone) ? 'fail' : 'warn'; }
function vastuAudit() {
  if (!hasNorth() || !layout.rooms.length) return null;
  const F = homeFrame(), office = profile().use === 'office', items = [];
  const R = layout.rooms.filter(r => r.kind !== 'ledge' && r.polygon?.length > 2), z = r => roomZone(r, F);
  const add = (key, w, label, status, detail, fix) => items.push({ key, w, label, status, detail, fix });
  const md = mainDoor();
  if (md) add('entrance', 3, 'Main entrance', vGrade(md.faces, ['N', 'NE', 'E', 'NW'], ['SW']), `Faces ${DIRNAME[md.faces]}. ${vGrade(md.faces, ['N', 'NE', 'E', 'NW'], ['SW']) === 'ok' ? 'An auspicious direction.' : 'North, north-east or east is preferred.'}`, { kind: 'remedy', text: 'The entrance is part of the building. Traditional remedies: a brass or copper threshold strip, a well-lit nameplate, and a clean, uncluttered approach.' });
  const kit = R.filter(r => ['kitchen', 'pantry'].includes(r.type));
  for (const r of kit) { const s = vGrade(z(r), ['SE', 'NW'], ['NE', 'C']); add('kitchen:' + r.name, 3, r.name, s, `In the ${DIRNAME[z(r)]}. ${s === 'ok' ? 'South-east (fire) is ideal, north-west is fine.' : 'South-east is ideal; a kitchen can\'t move without plumbing work.'}`, { kind: 'remedy', text: 'Cook facing east, keep the hob away from the sink, and use warm colours (terracotta, yellow) in this kitchen.' }); }
  const bed = office ? R.filter(r => r.type === 'cabin') : R.filter(r => r.type === 'master');
  const owner = office ? (bed.find(r => /director|owner|ceo|md|principal|founder|partner/i.test(r.name)) || [...bed].sort((a, b) => polyArea(b.polygon) - polyArea(a.polygon))[0]) : bed[0];
  if (owner) { const s = vGrade(z(owner), ['SW', 'S', 'W'], ['NE', 'SE']), swap = s !== 'ok' && swapCandidate(owner, F);
    add('owner', 3, owner.name, s, `In the ${DIRNAME[z(owner)]}. ${office ? "The owner's cabin" : 'The master bedroom'} belongs in the south-west.${swap ? ` ${swap.name} is in the ${DIRNAME[z(swap)]}, so the two can swap.` : ''}`, swap ? { kind: 'swap', a: owner.name, b: swap.name } : { kind: 'remedy', text: 'No other room of the same kind sits in the south-west. Earthy tones and heavier furniture on the south and west walls help.' }); }
  for (const r of R.filter(r => ['bedroom'].includes(r.type))) add('bed:' + r.name, 1, r.name, vGrade(z(r), ['W', 'NW', 'S', 'SW', 'N', 'E'], []), `In the ${DIRNAME[z(r)]}.${vGrade(z(r), ['W', 'NW', 'S', 'SW', 'N', 'E'], []) === 'ok' ? '' : ' West or north-west suits children and guests better.'}`);
  for (const r of R.filter(r => r.type === 'bath')) { const s = vGrade(z(r), ['NW', 'W', 'S', 'SE', 'E', 'N'], ['NE', 'C']); add('bath:' + r.name, 1.5, r.name, s, `In the ${DIRNAME[z(r)]}.${s === 'ok' ? '' : ' North-east and the centre are kept free of toilets.'}`, s === 'ok' ? null : { kind: 'remedy', text: 'Keep the door shut, use light colours, and a sea-salt bowl is the traditional remedy.' }); }
  for (const r of R.filter(r => r.type === 'living')) add('living:' + r.name, 1, r.name, vGrade(z(r), ['N', 'NE', 'E', 'NW', 'C', 'W'], []), `In the ${DIRNAME[z(r)]}.`);
  for (const r of R.filter(r => r.type === 'study')) add('study:' + r.name, 1, r.name, vGrade(z(r), ['N', 'E', 'NE', 'W'], []), `In the ${DIRNAME[z(r)]}.`);
  if (office) {
    for (const r of R.filter(r => r.type === 'reception')) add('rec:' + r.name, 1, r.name, vGrade(z(r), ['N', 'NE', 'E', 'NW'], ['SW']), `In the ${DIRNAME[z(r)]}.`);
    for (const r of R.filter(r => r.type === 'meeting')) add('meet:' + r.name, 1, r.name, vGrade(z(r), ['NW', 'W', 'N'], ['SW']), `In the ${DIRNAME[z(r)]}. North-west keeps meetings moving.`);
  }
  // centre of the home stays open
  const mid = R.filter(r => ['bath', 'kitchen'].includes(r.type) && z(r) === 'C');
  const midHeavy = layout.furniture.filter(it => HEAVY.has(it.type) && zoneAt(it.x, it.z, F) === 'C');
  add('centre', 2, 'Centre of the home', mid.length ? 'fail' : midHeavy.length ? 'warn' : 'ok', mid.length ? `${mid.map(r => r.name).join(', ')} sit${mid.length > 1 ? '' : 's'} at the centre, which should stay open.` : midHeavy.length ? `Heavy storage stands in the centre: ${midHeavy.slice(0, 3).map(i => i.name || i.type).join(', ')}.` : 'Open and light.', midHeavy.length && !mid.length ? { kind: 'orient', rooms: [...new Set(midHeavy.map(i => i.room))], text: 'move the heavy storage out of the centre of the home, onto a south or west wall of its room' } : mid.length ? { kind: 'remedy', text: 'This needs the walls to move. Keep that room light and clutter-free.' } : null);
  // pieces
  const piece = (types, key, w, label, good, bad, rule, why, how = d => `on the ${DIRNAME[d]} wall`) => {
    const its = layout.furniture.filter(it => types.includes(it.type)); if (!its.length) return;
    const bad_ = its.filter(it => vGrade(rule(it), good, bad) !== 'ok'), worst = bad_.some(it => vGrade(rule(it), good, bad) === 'fail') ? 'fail' : bad_.length ? 'warn' : 'ok';
    add(key, w, label, worst, bad_.length ? `${bad_.length} of ${its.length}: ${bad_.slice(0, 3).map(it => `${it.name || CAT[it.type]?.label} in ${it.room}, ${how(rule(it))}`).join('; ')}. ${why}` : `All ${its.length} placed well.`, bad_.length ? { kind: 'orient', rooms: [...new Set(bad_.map(i => i.room))], ids: bad_.map(i => i.id), text: why } : null);
  };
  if (!office) piece(['bed', 'bed-luxe'], 'beds', 2, 'Beds', ['S', 'W', 'SW', 'E', 'SE'], ['N'], backDir, 'Headboards go on the south or west wall, never the north.', d => `headboard on the ${DIRNAME[d]} wall`);
  piece(['desk'], 'desks', office ? 2 : 1, 'Desks', ['N', 'E', 'NE'], [], backDir, 'Whoever sits there should face north or east.', d => `facing ${DIRNAME[d]}`);
  piece(['kitchen-luxe'], 'hob', 1.5, 'Cooking', ['E', 'NE', 'SE'], ['S', 'SW'], backDir, 'The cook should face east.', d => `the cook faces ${DIRNAME[d]}`);
  piece(['mirror'], 'mirrors', .5, 'Mirrors', ['N', 'E', 'NE'], ['S', 'SW'], backDir, 'Mirrors go on north or east walls.');
  piece([...HEAVY], 'storage', 1, 'Heavy storage', ['S', 'W', 'SW', 'NW', 'SE'], ['NE'], backDir, 'Wardrobes and tall storage go on south or west walls.');
  if (!office) {
    const pu = layout.furniture.filter(it => it.type === 'pooja-unit'), pr = R.filter(r => r.type === 'pooja');
    if (pu.length || pr.length) { const zz = pu.length ? zoneAt(pu[0].x, pu[0].z, F) : z(pr[0]); add('pooja', 1.5, 'Pooja', vGrade(zz, ['NE', 'E', 'N'], ['S', 'SW', 'SE']), `In the ${DIRNAME[zz]}. North-east is ideal.`, vGrade(zz, ['NE', 'E', 'N'], ['S', 'SW', 'SE']) === 'ok' ? null : { kind: 'add', text: 'move the pooja-unit to the north-east of the home, against an east or west wall' }); }
    else if (profile().vastu !== 'no') add('pooja', 1, 'Pooja', 'warn', 'There is no prayer space yet. The north-east is the place for it.', { kind: 'add', text: 'add a pooja-unit in the north-east of the home (the north-east corner of the living room, or a north-east room), against an east or west wall, with a sconce' });
  }
  const val = { ok: 1, warn: .5, fail: 0 }, W = items.reduce((a, i) => a + i.w, 0);
  const score = W ? Math.round(100 * items.reduce((a, i) => a + i.w * val[i.status], 0) / W) : 100;
  return { score, items, fixable: items.filter(i => i.status !== 'ok' && i.fix && i.fix.kind !== 'remedy'), remedies: items.filter(i => i.status !== 'ok' && i.fix?.kind === 'remedy') };
}
function swapCandidate(r, F) {
  const like = profile().use === 'office' ? ['cabin', 'workspace'] : ['bedroom'], a = polyArea(r.polygon);
  const c = layout.rooms.filter(x => x !== r && like.includes(x.type) && ['SW', 'S', 'W'].includes(roomZone(x, F)) && polyArea(x.polygon) > a * .6);
  return c.sort((p, q) => (roomZone(q, F) === 'SW') - (roomZone(p, F) === 'SW') || polyArea(q.polygon) - polyArea(p.polygon))[0] || null;
}
function vastuFixRequest(A) {
  const lines = []; let n = 1;
  for (const it of A.fixable) {
    const f = it.fix;
    if (f.kind === 'swap') { const a = layout.rooms.find(r => r.name === f.a); lines.push(`${n++}. Swap what "${f.a}" and "${f.b}" are used for with {"op":"swap","a":"${f.a}","b":"${f.b}"}, then refurnish both for their new use (use the names after the swap: "${f.a}" becomes the room that was "${f.b}"). ${a?.type === 'master' || a?.type === 'cabin' ? 'In the new ' + f.a + ', put the bed or desk by the Vastu rules.' : ''}`); }
    else if (f.kind === 'orient') lines.push(`${n++}. ${it.label}${f.rooms?.length ? ' in ' + f.rooms.join(', ') : ''}${f.ids?.length ? ' (ids ' + f.ids.slice(0, 12).join(', ') + ')' : ''}: ${f.text} Move or rotate those pieces to a better wall of the same room if one is free; otherwise leave them.`);
    else if (f.kind === 'add') lines.push(`${n++}. ${f.text}.`);
  }
  return `Vastu fix. The walls, doors and windows stay exactly where they are. Make these changes: ${lines.join(' ')}`;
}
let vastuFixing = false;
async function vastuFix() {
  if (vastuFixing) return; if (!layout.walls.length) return gNote('Open a designed home first.', 'sys');
  if (!hasNorth()) { const ok = await askNorthInChat(); if (!ok) return; }
  const A = vastuAudit(); if (!A) return;
  if (!A.fixable.length) { const t = A.remedies.length ? `Your home scores ${A.score} out of 100. What's left needs walls to move, so I can't change it by rearranging. ${A.remedies[0].fix.text}` : `Your home already scores ${A.score} out of 100 for Vastu. Nothing to change.`; gSay(t); gSpeak(t); return; }
  if (profile().vastu === 'no') { profile().vastu = 'yes'; renderProfileSum(); saveSoon(); }
  vastuFixing = true;
  try {
    const say = `I'll make it Vastu compliant without moving any walls: ${A.fixable.length} change${A.fixable.length > 1 ? 's' : ''}. This uses one change.`; gSay(say); gSpeak(say);
    const ok = await guideEdit(vastuFixRequest(A));
    if (ok) { const B = vastuAudit(); const t = `Done. Your Vastu score went from ${A.score} to ${B?.score ?? A.score}.${B?.remedies?.length ? ` ${B.remedies.length} item${B.remedies.length > 1 ? 's' : ''} need${B.remedies.length > 1 ? '' : 's'} walls to move, so I've listed remedies.` : ''}`; gSay(t); gSpeak(t); if (B) vastuCard(B, true); }
  } finally { vastuFixing = false; }
}
function vastuSpoken(A) {
  const bad = A.items.filter(i => i.status === 'fail'), warn = A.items.filter(i => i.status === 'warn');
  const lead = A.score >= 85 ? 'This home follows Vastu well' : A.score >= 65 ? 'This home mostly follows Vastu' : 'This home needs work to follow Vastu';
  const top = [...bad, ...warn].slice(0, 2).map(i => `${i.label.toLowerCase()}: ${i.detail.split('.')[0].toLowerCase()}`).join('; ');
  return `${lead}: ${A.score} out of 100.${top ? ' The main points are ' + top + '.' : ''}${A.fixable.length ? ` I can fix ${A.fixable.length} of them by rearranging, without moving walls.` : ''}`;
}
function vastuCard(A, quiet) {
  const order = { fail: 0, warn: 1, ok: 2 }, its = [...A.items].sort((a, b) => order[a.status] - order[b.status]);
  const ic = { ok: '✓', warn: '!', fail: '✕' };
  const el = document.createElement('div'); el.className = 'gmsg card';
  el.innerHTML = `<div class="vhead"><div class="vring" style="--p:${A.score}"><b>${A.score}</b></div><div><b>Vastu check</b><small>${A.items.filter(i => i.status === 'ok').length} of ${A.items.length} in place · north is ${['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'][Math.round(layout.settings.north / 45) % 8]} on the plan</small></div></div>
    <ul class="vlist">${its.slice(0, 9).map(i => `<li class="${i.status}"><i>${ic[i.status]}</i><span><b>${esc(i.label)}</b> ${esc(i.detail)}${i.status !== 'ok' && i.fix?.kind === 'remedy' ? `<em>${esc(i.fix.text)}</em>` : ''}</span></li>`).join('')}${its.length > 9 ? `<li class="more">+${its.length - 9} more in place</li>` : ''}</ul>
    <div class="vact">${A.fixable.length ? `<button type="button" class="primary" data-v="fix">Make it Vastu compliant</button>` : ''}<button type="button" data-v="north">North is wrong?</button></div>`;
  el.querySelector('[data-v="fix"]')?.addEventListener('click', () => { gSay('Make it Vastu compliant', 'you'); vastuFix(); });
  el.querySelector('[data-v="north"]').onclick = () => askNorthInChat(true).then(ok => ok && showVastu());
  const log = $('guideLog'); log.appendChild(el); log.scrollTop = log.scrollHeight;
  return el;
}
async function showVastu(say) {
  if (!layout.walls.length) return gNote('Open a designed home first.', 'sys');
  if (!hasNorth()) { const ok = await askNorthInChat(); if (!ok) return; }
  const A = vastuAudit(); if (!A) return;
  vastuCard(A); if (!say) { const t = vastuSpoken(A); GUIDE.hist.push({ who: 'guide', text: t }); gSpeak(t); }
}
function askNorthInChat(force) {
  return new Promise(res => {
    if (hasNorth() && !force) return res(true);
    gSay('Which way is north on your floor plan? Tap the arrow that points north on the plan as you uploaded it.');
    const el = document.createElement('div'); el.className = 'gmsg card';
    el.innerHTML = `<div class="qcompass small">${DIRS8.map((d, i) => `<button type="button" data-n="${i * 45}" aria-pressed="${layout.settings.north === i * 45}">${ARROWS[d]}</button>`).join('')}${project.plan?.image ? `<img src="${project.plan.image}" alt="">` : ''}</div>`;
    el.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { layout.settings.north = +b.dataset.n; saveSoon(); el.querySelectorAll('[data-n]').forEach(x => x.disabled = true); b.setAttribute('aria-pressed', 'true'); gNote(`North set: ${['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'][+b.dataset.n / 45]} on the plan.`, 'sys'); res(true); });
    const log = $('guideLog'); log.appendChild(el); log.scrollTop = log.scrollHeight;
  });
}
// Mira's tappable ideas
function gOptions(opts) {
  const list = (Array.isArray(opts) ? opts : []).filter(o => o?.label && o?.request).slice(0, 4); if (!list.length) return;
  const el = document.createElement('div'); el.className = 'gopts';
  el.innerHTML = list.map((o, i) => `<button type="button" data-i="${i}"><b>${esc(String(o.label).slice(0, 60))}</b>${o.why ? `<span>${esc(String(o.why).slice(0, 140))}</span>` : ''}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => { const o = list[+b.dataset.i]; el.querySelectorAll('button').forEach(x => x.disabled = true); b.classList.add('chosen'); gSay(o.label, 'you'); GUIDE.hist.push({ who: 'guide', text: `(they chose "${o.label}"; the change is being made)` }); guideEdit(o.request); });
  // she remembers what she offered, so "go for it" or "the second one" means something
  GUIDE.hist.push({ who: 'guide', text: '(ideas offered: ' + list.map((o, i) => `${i + 1}. ${o.label} — ${String(o.request).slice(0, 700)}`).join(' | ') + ')' });
  const log = $('guideLog'); log.appendChild(el); log.scrollTop = log.scrollHeight;
}
function compassFacts() {
  if (!hasNorth()) return 'COMPASS: north is not set for this plan (if they ask about Vastu, use the vastu action and it will ask them).';
  const F = homeFrame(), md = mainDoor(), A = vastuAudit();
  return `COMPASS: ${layout.rooms.filter(r => r.kind !== 'ledge' && r.polygon?.length > 2).map(r => `${r.name} is in the ${DIRNAME[roomZone(r, F)]}`).join('; ')}.${md ? ' The main entrance faces ' + DIRNAME[md.faces] + '.' : ''}${A ? `\nVASTU CHECK: score ${A.score}/100. ${A.items.filter(i => i.status !== 'ok').map(i => `${i.label}: ${i.detail}`).join(' | ') || 'Everything in place.'}` : ''}`;
}
function compassVecsText() { const { N, E } = compassVecs(); return `north points along (x,z) = (${f1(N[0])},${f1(N[1])}) on the plan and east along (${f1(E[0])},${f1(E[1])}).`; }
