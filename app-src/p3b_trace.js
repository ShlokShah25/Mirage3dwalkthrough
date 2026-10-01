const PLAN_PROMPT = (W, Hh, brief) => `You are an architectural draftsperson converting a residential floor-plan image into vector data for a 3D model.
The image is ${W}×${Hh} pixels. Use pixel coordinates: origin at the top-left corner, x to the right, y downward. Measure against the drawn lines; aim for ±3 px.

Reply with only one JSON object of this shape:
{
 "units": "ft" or "m",
 "labels": [ {"room": "Master Bedroom", "dims": [13.08, 14.0], "bbox": [x0, y0, x1, y1]} ],
 "walls": [ {"a": [x, y], "b": [x, y], "t": thickness_px, "ext": true} ],
 "openings": [ {"type": "door", "a": [x, y], "b": [x, y]} ],
 "rooms": [ {"name": "Living / Dining", "type": "living", "poly": [[x, y], ...]} ],
 "entrance": [x, y],
 "north": 0,
 "notes": "one short sentence on anything uncertain"
}

Rules:
- labels: one entry for every room with a printed size. dims are the printed numbers as decimals in the order printed (13'1" becomes 13.08; metres stay metres). bbox is that room's clear interior rectangle in pixels, between the inner faces of its walls.
- walls: every wall as a straight centreline segment. t is the drawn thickness in pixels. ext=true for exterior walls. Keep a wall continuous through its doors and windows (openings are listed separately). Walls that meet must share exactly the same endpoint coordinates. Walls that look horizontal or vertical must be exactly horizontal or vertical. Curved walls become 2-4 straight segments.
- openings: a and b are the two jambs, on the wall centreline. type is "door" (hinged, usually with a swing arc), "slider" (full-height glazed sliding door, usually onto a balcony or terrace), "window" (glazing with a sill) or "opening" (a gap with no door).
- rooms: every enclosed space, including toilets, balconies, terraces and utility areas; skip ducts and shafts. poly follows the wall centrelines. type is one of living, dining, kitchen, bedroom, master, bath, foyer, passage, study, walkin, utility, staff, pooja, balcony, terrace, other. A combined space such as Living / Dining is one room.
- entrance: the main entrance door position, or null.
- north: if the drawing has a north arrow or compass, the direction it points as degrees clockwise from straight up on the image (0 = up, 90 = right, 180 = down, 270 = left); otherwise null.
- Ignore furniture drawings, hatching, text and dimension lines except to identify rooms.
${brief ? 'Homeowner notes (for context only): ' + brief.slice(0, 600) : ''}`;

const STYLE_PROMPT = (brief, room) => `You are an interior designer. The image shows design inspiration (a mood board or photos) for ${room ? `one room of a home: the ${room.name} (a ${room.type}). Focus on what applies to that room, and fill the floors entry for its type` : 'a home'}. Extract a material and colour palette that a 3D renderer can apply to every room.
Reply with only one JSON object:
{
 "summary": "one sentence describing the look",
 "keywords": ["4-7 short tags"],
 "walls": "#hex wall paint", "ceiling": "#hex ceiling paint",
 "tokens": {
   "wood-light": "#hex main timber (floors, joinery)",
   "wood-dark": "#hex darker timber accent",
   "stone": {"look": "travertine|marble|limestone|concrete|terrazzo", "color": "#hex"},
   "marble": {"look": "marble|terrazzo|concrete", "color": "#hex worktop / vanity stone"},
   "stone-dark": {"look": "marble|concrete", "color": "#hex dark statement stone"},
   "fabric-main": "#hex main upholstery", "fabric-second": "#hex secondary upholstery", "fabric-accent": "#hex accent textile",
   "metal": "brass|black|chrome"
 },
 "floors": {
   "living": {"finish": "stone-large|wood|tile-2ft|terrazzo", "color": "#hex"},
   "bedroom": {"finish": "wood|stone-large|tile-2ft", "color": "#hex"},
   "wet": {"finish": "stone-large|tile-1ft|tile-2ft|terrazzo", "color": "#hex"},
   "outdoor": {"finish": "stone|wood|tile-2ft", "color": "#hex"}
 },
 "cove": true,
 "time": "golden|day|night",
 "plants": "none|some|lush",
 "features": ["up to 5 signature elements, e.g. fluted wood wall panels, arched mirrors, stone feature walls"]
}
Colours must be the real observed colours (floors and fabrics are usually light and warm; pick exact hex values from the image). ${brief ? 'Homeowner notes for context: ' + brief.slice(0, 400) : ''}`;

function normalizeStyle(raw) {
  const r = raw || {}, t = r.tokens || {}, f = r.floors || {};
  const stone = (v, look, col) => ({ look: ['travertine', 'marble', 'limestone', 'concrete', 'terrazzo'].includes(v?.look) ? v.look : look, color: hexOk(v?.color ?? v, col) });
  const floor = (v, fin, col, allowed) => ({ finish: allowed.includes(v?.finish) ? v.finish : fin, color: hexOk(v?.color, col) });
  return {
    summary: String(r.summary || 'Warm, calm contemporary interiors with natural materials.').slice(0, 700),
    keywords: Array.isArray(r.keywords) ? r.keywords.slice(0, 8).map(String) : [],
    walls: hexOk(r.walls, '#e8dfd2'), ceiling: hexOk(r.ceiling, '#f5f0e8'),
    tokens: {
      'wood-light': hexOk(t['wood-light'], '#c49a6c'), 'wood-dark': hexOk(t['wood-dark'], '#6c4a33'),
      stone: stone(t.stone, 'travertine', '#d9c9b0'), marble: stone(t.marble, 'marble', '#ece6dc'), 'stone-dark': stone(t['stone-dark'], 'marble', '#2b2826'),
      'fabric-main': hexOk(t['fabric-main'], '#ece4d6'), 'fabric-second': hexOk(t['fabric-second'], '#a8937a'), 'fabric-accent': hexOk(t['fabric-accent'], '#6f7552'),
      metal: ['brass', 'black', 'chrome'].includes(t.metal) ? t.metal : 'brass',
    },
    floors: {
      living: floor(f.living, 'stone-large', '#e6d9c6', ['stone-large', 'wood', 'tile-2ft', 'terrazzo']), bedroom: floor(f.bedroom, 'wood', '#c9a47d', ['wood', 'stone-large', 'tile-2ft']),
      wet: floor(f.wet, 'stone-large', '#cdbfab', ['stone-large', 'tile-1ft', 'tile-2ft', 'terrazzo']), outdoor: floor(f.outdoor, 'stone', '#9d968c', ['stone', 'wood', 'tile-2ft']),
    },
    cove: r.cove !== false, time: ['golden', 'day', 'night', 'dusk'].includes(r.time) ? r.time : 'golden', view: ['sea', 'city', 'garden'].includes(r.view) ? r.view : undefined,
    plants: ['none', 'some', 'lush'].includes(r.plants) ? r.plants : 'some',
    features: Array.isArray(r.features) ? r.features.slice(0, 10).map(String) : [],
  };
}
const roomCat = t => ['bedroom', 'master', 'walkin', 'staff', 'study', 'cabin'].includes(t) ? 'bedroom' : ['bath', 'utility'].includes(t) ? 'wet' : isOutdoorType(t) ? 'outdoor' : 'living';
function applyStyleToRooms(L, st) {
  for (const r of L.rooms) {
    if (r.kind === 'ledge') continue;
    const fl = st.floors[roomCat(r.type)]; r.finish = fl.finish; r.floor = fl.color;
    r.cove = r.kind === 'room' && st.cove && !['staff', 'utility', 'passage', 'other'].includes(r.type);
  }
  L.settings.wallColor = st.walls; L.settings.ceilingColor = st.ceiling;
  for (const r of L.rooms) { const rs = project?.roomStyles?.[r.name]; if (rs?.floor && r.kind !== 'ledge') { r.finish = rs.floor.finish; r.floor = rs.floor.color; } }
}

/* ================= plan trace → 3D layout ================= */
const TYPES = ['living', 'dining', 'kitchen', 'bedroom', 'master', 'bath', 'foyer', 'passage', 'study', 'walkin', 'utility', 'staff', 'balcony', 'terrace', 'pooja', 'workspace', 'cabin', 'meeting', 'reception', 'pantry', 'other'];
function normType(t, name) {
  const s = (String(t || '') + ' ' + String(name || '')).toLowerCase();
  if (TYPES.includes(String(t).toLowerCase())) return String(t).toLowerCase();
  const map = [[/pooja|puja|prayer|mandir/, 'pooja'], [/reception/, 'reception'], [/conference|meeting|board ?room/, 'meeting'], [/cabin/, 'cabin'], [/work ?station|open office|work ?area/, 'workspace'], [/master/, 'master'], [/toilet|bath|wc|powder|shower/, 'bath'], [/bed/, 'bedroom'], [/kitchen|pantry/, 'kitchen'], [/dining/, 'dining'], [/living|lounge|family|drawing/, 'living'], [/terrace/, 'terrace'], [/balcony|deck|sit.?out|veranda/, 'balcony'], [/foyer|entry|lobby/, 'foyer'], [/passage|corridor|hall/, 'passage'], [/study|office|library/, 'study'], [/walk|dress|wardrobe/, 'walkin'], [/utility|laundry|wash|store/, 'utility'], [/staff|servant|maid/, 'staff']];
  for (const [re, ty] of map) if (re.test(s)) return ty;
  return 'other';
}
const typeLabel = t => ({ living: 'Living', dining: 'Dining', kitchen: 'Kitchen', bedroom: 'Bedroom', master: 'Master Bedroom', bath: 'Bathroom', foyer: 'Foyer', passage: 'Passage', study: 'Study', walkin: 'Walk-in', utility: 'Utility', staff: 'Staff Room', balcony: 'Balcony', terrace: 'Terrace', pooja: 'Pooja Room', workspace: 'Workspace', cabin: 'Cabin', meeting: 'Meeting Room', reception: 'Reception', pantry: 'Pantry', other: 'Room' })[t] || 'Room';
function fmtFtIn(v) { const ft = Math.floor(v + 1e-6), inch = Math.round((v - ft) * 12); return inch === 12 ? `${ft + 1}'` : inch ? `${ft}'${inch}"` : `${ft}'`; }
const numOk = v => Array.isArray(v) && v.length >= 2 && isFinite(+v[0]) && isFinite(+v[1]);
function deriveScale(tr, W, Hh) {
  const unitK = tr.units === 'm' ? 3.28084 : 1, cands = [];
  for (const l of tr.labels || []) {
    const d = (l.dims || []).map(Number).filter(v => v > 0), b = l.bbox; if (d.length < 2 || !Array.isArray(b) || b.length < 4) continue;
    const wp = Math.abs(b[2] - b[0]), hp = Math.abs(b[3] - b[1]); if (wp < 8 || hp < 8) continue;
    const a1 = [d[0] / wp, d[1] / hp], a2 = [d[1] / wp, d[0] / hp], dev = a => Math.abs(Math.log(a[0] / a[1])), best = dev(a1) <= dev(a2) ? a1 : a2;
    if (dev(best) > .3) continue; cands.push((best[0] + best[1]) / 2 * unitK);
  }
  if (cands.length) {
    cands.sort((a, b) => a - b); const med = cands[cands.length >> 1], good = cands.filter(c => Math.abs(c / med - 1) < .18);
    return { s: good.reduce((a, b) => a + b, 0) / good.length, method: `Scale set from ${good.length} printed room size${good.length > 1 ? 's' : ''}.`, sure: good.length >= 2 };
  }
  const ws = (tr.openings || []).filter(o => o.type === 'door' && numOk(o.a) && numOk(o.b)).map(o => Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1])).filter(v => v > 4).sort((a, b) => a - b);
  if (ws.length) return { s: 3 / ws[ws.length >> 1], method: 'No printed sizes found, so the scale was estimated from door widths. Check it with Set scale.', sure: false };
  return { s: 60 / Math.max(W, Hh), method: 'Scale could not be read. It assumes the drawing is about 60 ft wide. Use Set scale in Plan check.', sure: false };
}
function cleanWalls(walls, tol = .8) {
  const orient = w => { const dx = Math.abs(w.b[0] - w.a[0]), dz = Math.abs(w.b[1] - w.a[1]); return dz <= dx * .08 ? 'h' : dx <= dz * .08 ? 'v' : 'd'; };
  const snap = w => { const o = orient(w); if (o === 'h') { const z = (w.a[1] + w.b[1]) / 2; w.a[1] = w.b[1] = z; } else if (o === 'v') { const x = (w.a[0] + w.b[0]) / 2; w.a[0] = w.b[0] = x; } };
  walls.forEach(snap);
  const pts = []; walls.forEach(w => { const o = orient(w); pts.push([w.a, o], [w.b, o]); });
  const used = new Array(pts.length).fill(false);
  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue; const cl = [i]; used[i] = true;
    for (let j = i + 1; j < pts.length; j++) if (!used[j] && Math.hypot(pts[i][0][0] - pts[j][0][0], pts[i][0][1] - pts[j][0][1]) < tol) { cl.push(j); used[j] = true; }
    if (cl.length < 2) continue;
    const vx = cl.filter(k => pts[k][1] === 'v').map(k => pts[k][0][0]), hz = cl.filter(k => pts[k][1] === 'h').map(k => pts[k][0][1]);
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    const X = vx.length ? mean(vx) : mean(cl.map(k => pts[k][0][0])), Z = hz.length ? mean(hz) : mean(cl.map(k => pts[k][0][1]));
    cl.forEach(k => { pts[k][0][0] = X; pts[k][0][1] = Z; });
  }
  for (const w of walls) for (const end of [w.a, w.b]) for (const o of walls) {
    if (o === w) continue; const d = segDist(end[0], end[1], o.a, o.b);
    if (d > 1e-3 && d < tol && Math.hypot(end[0] - o.a[0], end[1] - o.a[1]) > tol && Math.hypot(end[0] - o.b[0], end[1] - o.b[1]) > tol) {
      const dx = o.b[0] - o.a[0], dz = o.b[1] - o.a[1], L2 = dx * dx + dz * dz, t = ((end[0] - o.a[0]) * dx + (end[1] - o.a[1]) * dz) / L2; end[0] = o.a[0] + t * dx; end[1] = o.a[1] + t * dz; break;
    }
  }
  walls.forEach(snap);
  walls.forEach(w => { w.a = w.a.map(r2); w.b = w.b.map(r2); });
  return walls.filter(w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) > .4);
}
const PRESET = { door: { type: 'door', sill: 0, head: 7 }, slider: { type: 'slider', sill: 0, head: 8 }, window: { type: 'window', sill: 2.5, head: 7 }, opening: { type: 'opening', sill: 0, head: 7.5 } };
function roomAtIn(rooms, x, z) { let best = null; for (const r of rooms) if (pip([x, z], r.polygon)) { if (!best || polyArea(r.polygon) < polyArea(best.polygon)) best = r; } return best; }
function traceToLayout(tr, W, Hh, opt) {
  const warns = []; const sc = deriveScale(tr, W, Hh), s = sc.s;
  if (!sc.sure) warns.push(sc.method);
  const P = p => [r2(+p[0] * s), r2(+p[1] * s)];
  let walls = (tr.walls || []).filter(w => numOk(w?.a) && numOk(w?.b)).map(w => ({ a: P(w.a), b: P(w.b), thickness: r2(clamp((+w.t || 8) * s, .3, 2.2)), kind: w.ext ? 'ext' : 'int', openings: [] }));
  walls = cleanWalls(walls);
  const names = {};
  const rooms = (tr.rooms || []).filter(r => Array.isArray(r?.poly) && r.poly.length >= 3 && r.poly.every(numOk)).map(r => {
    const type = normType(r.type, r.name); let name = String(r.name || typeLabel(type)).slice(0, 40);
    names[name] = (names[name] || 0) + 1; if (names[name] > 1) name += ' ' + names[name];
    return { name, type, kind: isOutdoorType(type) ? 'outdoor' : 'room', polygon: r.poly.map(P) };
  }).filter(r => polyArea(r.polygon) > 6);
  const nm = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const l of tr.labels || []) {
    const r = rooms.find(r => nm(r.name) === nm(l.room)) || rooms.find(r => nm(r.name).includes(nm(l.room)) || nm(l.room).includes(nm(r.name)));
    const d = (l.dims || []).map(Number).filter(v => v > 0); if (r && d.length >= 2) r.size = tr.units === 'm' ? `${d[0]} × ${d[1]} m` : `${fmtFtIn(d[0])} x ${fmtFtIn(d[1])}`;
  }
  let dropped = 0;
  for (const o of tr.openings || []) {
    if (!numOk(o?.a) || !numOk(o?.b)) continue; const a = P(o.a), b = P(o.b), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ol = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let best = null, bd = 1e9;
    for (const w of walls) { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L; if (ol > .5 && Math.abs(ux * (b[0] - a[0]) / ol + uz * (b[1] - a[1]) / ol) < .8) continue; const d = segDist(m[0], m[1], w.a, w.b); if (d < bd) { bd = d; best = w; } }
    if (!best || bd > Math.max(1.6, best.thickness * 1.5)) { dropped++; continue; }
    const L = Math.hypot(best.b[0] - best.a[0], best.b[1] - best.a[1]), ux = (best.b[0] - best.a[0]) / L, uz = (best.b[1] - best.a[1]) / L;
    let st = Math.min((a[0] - best.a[0]) * ux + (a[1] - best.a[1]) * uz, (b[0] - best.a[0]) * ux + (b[1] - best.a[1]) * uz), en = Math.max((a[0] - best.a[0]) * ux + (a[1] - best.a[1]) * uz, (b[0] - best.a[0]) * ux + (b[1] - best.a[1]) * uz);
    const type = PRESET[o.type] ? o.type : 'door', min = { door: 2.4, slider: 3, window: 1.5, opening: 2.5 }[type];
    if (en - st < min) { const c = (st + en) / 2; st = c - min / 2; en = c + min / 2; }
    st = clamp(st, .1, L - .1); en = clamp(en, st + .5, L - .1); if (en - st < .8) { dropped++; continue; }
    best.openings.push({ ...PRESET[type], start: r2(st), end: r2(en) });
  }
  if (dropped) warns.push(`${dropped} door or window mark${dropped > 1 ? 's' : ''} could not be matched to a wall. Add them in Plan check if they matter.`);
  for (const w of walls) {
    w.openings.sort((p, q) => p.start - q.start); const keep = [];
    for (const o of w.openings) { const last = keep[keep.length - 1]; if (last && o.start < last.end - .2) { if (o.end - o.start > last.end - last.start) keep[keep.length - 1] = o; } else keep.push(o); }
    w.openings = keep;
  }
  // door names & swings, main door, small bathroom windows
  const entrance = numOk(tr.entrance) ? P(tr.entrance) : null; let main = null, mainD = 1e9;
  const prio = r => r ? ({ bath: 6, walkin: 5, staff: 4, utility: 4, bedroom: 3, master: 3, study: 3, kitchen: 2 }[r.type] || 1) : 0;
  for (const w of walls) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L, nx = -uz, nz = ux;
    for (const o of w.openings) {
      const sm = (o.start + o.end) / 2, cx = w.a[0] + ux * sm, cz = w.a[1] + uz * sm, off = w.thickness / 2 + 1.3;
      const rp = roomAtIn(rooms, cx + nx * off, cz + nz * off), rm = roomAtIn(rooms, cx - nx * off, cz - nz * off);
      if (o.type === 'window' && o.end - o.start < 3 && [rp, rm].some(r => r?.type === 'bath')) { o.sill = 5.5; o.head = 7; }
      if (o.type !== 'door') continue;
      const side = prio(rp) >= prio(rm) ? 1 : -1, tgt = side > 0 ? rp : rm;
      o.name = (tgt ? tgt.name + ' door' : 'Door'); o.swing = { hinge: 'start', side, open: 90 };
      const outside = !rp || !rm; const d = entrance ? Math.hypot(cx - entrance[0], cz - entrance[1]) : outside ? 0 : 1e8;
      if ((outside || entrance) && d < mainD) { mainD = d; main = { o, cx, cz, nx: rp ? nx : -nx, nz: rp ? nz : -nz }; }
    }
  }
  if (main) { main.o.name = 'Main door'; main.o.swing = { hinge: 'start', side: 1, open: 0 }; }
  // railings on open outdoor edges
  const railings = [];
  for (const r of rooms.filter(r => r.kind === 'outdoor')) {
    let run = null; const n = r.polygon.length;
    for (let i = 0; i < n; i++) {
      const a = r.polygon[i], b = r.polygon[(i + 1) % n], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const walled = walls.some(w => segDist(mx, mz, w.a, w.b) < .8);
      if (!walled) { if (run && run[run.length - 1] === a) run.push(b); else { run = [a, b]; railings.push({ name: r.name + ' railing', style: 'glass', height: 3.5, points: run }); } } else run = null;
    }
  }
  const st = opt.style, settings = baseSettings(opt.ceiling, opt.view, st);
  if (tr.north !== null && tr.north !== undefined && tr.north !== '' && isFinite(+tr.north)) settings.north = (Math.round(+tr.north / 45) * 45 % 360 + 360) % 360;
  const L = { name: opt.name, units: 'feet', settings, walls, rooms, railings, furniture: [] };
  applyStyleToRooms(L, st);
  const big = [...rooms].filter(r => r.kind === 'room').sort((a, b) => polyArea(b.polygon) - polyArea(a.polygon))[0];
  if (main) L.spawn = { position: [r2(main.cx + main.nx * 3), r2(main.cz + main.nz * 3)], lookAt: big ? centroid(big.polygon) : [main.cx + main.nx * 10, main.cz + main.nz * 10] };
  else if (big) { const c = centroid(big.polygon); L.spawn = { position: c, lookAt: [c[0], c[1] - 10] }; }
  if (!walls.length) warns.push('No walls were found in the plan. Try a cleaner, higher-contrast image.');
  if (!rooms.length) warns.push('No rooms were found. Draw them in Plan check with the Room tool.');
  if (tr.notes) warns.push('Claude noted: ' + String(tr.notes).slice(0, 200));
  return { layout: L, s, method: sc.method, warns };
}

/* ================= furnishing ================= */
const BACKED = new Set(['bed', 'sofa', 'wardrobe', 'console', 'desk', 'vanity', 'kitchen-counter', 'tall-unit', 'bookshelf', 'wc', 'panel-slats', 'panel-stone', 'panel-upholstered', 'tv', 'artwork', 'mirror', 'curtain', 'tv-wall', 'bed-luxe', 'sideboard-fluted', 'arch-niche', 'bar-unit', 'pooja-unit', 'sconce', 'wall-molding', 'kitchen-luxe', 'vanity-luxe', 'wall-panel-wood', 'feature-stone', 'kitchen-tall-luxe', 'shower-luxe', 'closet-lit', 'media-wall']);
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
function roomFaces(r) {
  const out = [], n = r.polygon.length;
  for (let i = 0; i < n; i++) {
    const a = r.polygon[i], b = r.polygon[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], el = Math.hypot(ex, ez); if (el < .5) continue;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    for (const w of layout.walls) {
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L;
      if (Math.abs(ux * ex / el + uz * ez / el) < .95 || segDist(mx, mz, w.a, w.b) > .8) continue;
      let s0 = (a[0] - w.a[0]) * ux + (a[1] - w.a[1]) * uz, s1 = (b[0] - w.a[0]) * ux + (b[1] - w.a[1]) * uz; if (s0 > s1) [s0, s1] = [s1, s0];
      s0 = Math.max(s0, 0); s1 = Math.min(s1, L); if (s1 - s0 < .5) continue;
      let nx = -uz, nz = ux; const t2 = w.thickness / 2; if (!pip([w.a[0] + ux * (s0 + s1) / 2 + nx * (t2 + .3), w.a[1] + uz * (s0 + s1) / 2 + nz * (t2 + .3)], r.polygon)) { nx = -nx; nz = -nz; }
      const P = s => [w.a[0] + ux * s + nx * t2, w.a[1] + uz * s + nz * t2];
      const ops = (w.openings || []).filter(o => o.end > s0 && o.start < s1).map(o => { const p = P(Math.max(o.start, s0)), q = P(Math.min(o.end, s1)); return `${o.type}${o.type === 'window' ? ' (sill ' + o.sill + ')' : ''} from (${f1(p[0])},${f1(p[1])}) to (${f1(q[0])},${f1(q[1])})`; });
      const p = P(s0), q = P(s1);
      out.push(`  - ${hasNorth() ? `the room's ${DIRNAME[dirOf(bearingOf(-nx, -nz))]} wall: ` : ''}wall face (${f1(p[0])},${f1(p[1])}) to (${f1(q[0])},${f1(q[1])}), facing into the room along (${f1(nx)},${f1(nz)})${ops.length ? '; openings: ' + ops.join('; ') : ''}`);
    }
  }
  return [...new Set(out)];
}
function furnishPrompt(rooms, extra = '') {
  const st = project.style, cat = Object.entries(CAT).map(([k, d]) => `${k}: ${d.d.w}×${d.d.d}×${d.d.h}${d.d.y ? ' y' + d.d.y : ''} — ${NOTES[k] || d.label}`).join('\n');
  const others = layout.rooms.filter(r => r.kind !== 'ledge').map(r => `${r.name} (${r.type})`).join(', '), FR = hasNorth() ? homeFrame() : null, BRIEF = briefForFurnish();
  const blocks = rooms.map(r => { const xs = r.polygon.map(p => p[0]), zs = r.polygon.map(p => p[1]); return `ROOM "${r.name}" — type ${r.type}${r.size ? ', printed size ' + r.size : ''}, ${hasNorth() ? 'in the ' + DIRNAME[roomZone(r, FR)] + ' of the home, ' : ''}${r.kind === 'outdoor' ? 'outdoor, ' : ''}area ${Math.round(polyArea(r.polygon))} sq ft${project.roomStyles?.[r.name] ? `
  ROOM STYLE (from inspiration for this room; it overrides the home style here): ${project.roomStyles[r.name].summary} Signature: ${(project.roomStyles[r.name].features || []).join(', ') || 'none'}.` : ''}
  floor polygon: ${r.polygon.map(p => `(${f1(p[0])},${f1(p[1])})`).join(' ')}
  bounds: x ${f1(Math.min(...xs))}–${f1(Math.max(...xs))}, z ${f1(Math.min(...zs))}–${f1(Math.max(...zs))}
${roomFaces(r).join('\n') || '  (no wall faces found; keep items inside the polygon)'}`; }).join('\n\n');
  return `You are a senior interior designer at a luxury studio, designing a home that should look like it belongs in Architectural Digest, not a furniture catalogue. You place real pieces into a 3D model of the home. Units are feet. Plan coordinates: x increases to the right, z increases downward on the plan.

STYLE: ${st.summary} Signature elements: ${(st.features || []).join(', ') || 'none given'}. Plants: ${st.plants}.
FINISH TOKENS (use these so the style stays consistent): wood-light, wood-dark, stone, marble, stone-dark, fabric-main, fabric-second, fabric-accent, metal. Also allowed: linen, linen-white, white-ceramic, black-metal, brass, felt, terracotta, concrete, plaster, teak, glass, glass-bronze, onyx, marble-green, marble-rosso, travertine-dark, velvet-emerald, velvet-rust, velvet-navy, velvet-blush, velvet-mustard, velvet-ink, or a "#rrggbb" hex (rugs and fabrics). Use one or two rich contrast materials per room (a velvet, a dark or veined stone, brass) against the calm base tokens.
HOMEOWNER'S NOTES: ${(project.brief || 'none').slice(0, 1200)}${extra ? '\nREQUEST FOR THESE ROOMS (takes priority over the notes): ' + String(extra).slice(0, 600) : ''}
CEILING HEIGHT: ${layout.settings.ceilingHeight} ft. The whole home has: ${others}.${BRIEF ? '\n' + BRIEF : ''}${FR ? '\nCOMPASS: ' + compassVecsText() : ''}

ORIENTATION: rot is in degrees. An item's FRONT faces +z at rot 0, +x at rot 90, -z at rot 180, -x at rot -90. Its back is opposite its front. x,z is the item's centre. w is its width across the front, d its depth front-to-back, h its height, y its lift off the floor.
Items listed as going against a wall (beds, sofas along walls, wardrobes, consoles, desks, vanities, counters, tall units, bookshelves, wc, TVs, mirrors, artwork, wall panels, curtains) must have their back touching the wall face: centre = point on the face + (d/2) along the face's inward direction, and rot chosen so the front faces into the room.

CATALOG (type: default w×d×h — notes):
${cat}

${blocks}

EVENING LUXE vocabulary (use generously in premium styles): wall-panel-wood (walnut with LED reveals) on the focal wall of bedrooms, dining and passages; feature-stone; media-wall; sectional + coffee-nest + lounge-leather; table-dining-long + dining-chair-luxe + pendant-linear or pendant-globes; bed-luxe with panel:"walnut"; plant-tree (big leafy trees) by the glass.

DESIGN FIRST: before placing anything, decide for each room (silently) a one-line concept, its FOCAL WALL (the wall you face on entering, or the wall behind the bed/sofa), its hero piece, and its material story. Rooms must not repeat each other: vary the feature treatment, the rug, the accent colour and the lighting piece from room to room.

RULES:
- PREMIUM, NOT BASIC. Every living, dining and bedroom gets: (1) a feature wall treatment on its focal wall (tv-wall, panel-stone, panel-slats, panel-upholstered, wall-molding, or arch-niche, or bed-luxe whose headboard wall is the feature); (2) a ceiling-cove false ceiling; (3) at least three layers of light: a statement piece (chandelier, pendant-drum or pendants), a floor or table lamp, and sconces or LED; (4) one hero piece (sculptural coffee-plinth, lounge-chair, accent-barrel pair, bar-unit, jhoola, sideboard-fluted); (5) styling: decor-set clusters on consoles and sideboards, a floor-vase or large plant in a corner, artwork.
- Prefer the premium types over their plain versions: bed-luxe over bed in master and guest bedrooms (no nightstands with it), tv-wall in the living room instead of a bare tv, coffee-plinth over a plain coffee table, sideboard-fluted over a plain console in dining.
- If the style is Indian or the notes mention it, add Indian touches that feel luxe: a pooja-unit in a quiet corner of living/dining/foyer, brass accents, a jhoola on the balcony or living corner, jaali or wall-molding details.
- Balconies: an outdoor lounge moment (lounge-chair or jhoola, planters, a floor-vase, a small table).
- Furnish every room above fully for its type and the style: key furniture, rugs (layered, generous: the front legs of the seating sit on the rug), plants, art on walls, sheer curtains beside windows and sliders.
- Every item stays fully inside its own room's polygon, clear of walls and of other items (rugs may sit under furniture; lamps and vases on tables use y).
- Leave a 3 ft clear zone in front of every door and slider, and a 2.5 ft path from each door to the main areas. Do not block windows with tall items.
- Bathrooms: vanity-luxe (brings its own lit mirror and stone wall), shower-luxe in a corner (or shower-glass across the shower zone), wc against a wall, a panel-stone or feature-stone on the remaining wall, a plant-pot; tub-freestanding only in a large master bath.
- Kitchens: kitchen-luxe on the main wall (sink and hobAt offsets), kitchen-tall-luxe on a second wall when there is room, plain kitchen-counter for short runs, and an island-waterfall with bar stools and a pendant-linear above only if the kitchen or kitchen+foyer is at least 11 ft deep.
- Walk-in closets and dressing rooms: closet-lit on every solid wall, a closet-island in the middle if 3 ft clear all round, a pouf-round, a pendant-globes or chandelier.
- Lounges and dens: a media-wall, a sectional facing it, coffee-nest, lounge-leather, a plant-tree.
- Pooja rooms: a pooja-unit centred on the east or west wall, a rug, sconces either side, a floor-vase; nothing else.
- Honour the architect brief wherever it applies to these rooms.
Reply with only JSON: {"items":[{"room":"<room name>","type":"<catalog type>","name":"<short label>","x":0,"z":0,"rot":0,"w":0,"d":0,"h":0,"y":0,"finish":"<token>","accent":"<token>"}]} — include any extra fields a type's note mentions.`;
}
function itemOBB(it) { const f = withDefaults(it), th = (it.rot || 0) * D2R; return { cx: it.x, cz: it.z, hx: f.w / 2, hz: f.d / 2, c: Math.cos(th), s: -Math.sin(th) }; }
function sat(A, B) {
  const pr = (R, ax, az) => R.hx * Math.abs(R.c * ax + R.s * az) + R.hz * Math.abs(-R.s * ax + R.c * az);
  let best = null;
  for (const [ax, az] of [[A.c, A.s], [-A.s, A.c], [B.c, B.s], [-B.s, B.c]]) {
    const d = (B.cx - A.cx) * ax + (B.cz - A.cz) * az, ov = pr(A, ax, az) + pr(B, ax, az) - Math.abs(d);
    if (ov <= 0) return null; if (!best || ov < best.ov) best = { ov, ax, az, sg: Math.sign(d) || 1 };
  }
  return best;
}
function snapBack(it) {
  const f = withDefaults(it), th = (it.rot || 0) * D2R, bx_ = -Math.sin(th), bz = -Math.cos(th); let tmin = null;
  for (const w of layout.walls) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L, nx = -uz, nz = ux;
    for (const sd of [-1, 1]) {
      const px = w.a[0] + nx * sd * w.thickness / 2, pz = w.a[1] + nz * sd * w.thickness / 2, den = bx_ * uz - bz * ux; if (Math.abs(den) < .2) continue;
      const t = ((px - it.x) * uz - (pz - it.z) * ux) / den, sAlong = ((it.x + bx_ * t) - w.a[0]) * ux + ((it.z + bz * t) - w.a[1]) * uz;
      if (sAlong < -.3 || sAlong > L + .3 || t < -.4 || t > f.d / 2 + 1.6) continue;
      if (tmin === null || t < tmin) tmin = t;
    }
  }
  if (tmin !== null) { const k = tmin - f.d / 2 - .01; it.x = r2(it.x + bx_ * k); it.z = r2(it.z + bz * k); }
}
// a keep-clear box through every door and passage opening, 2.2 ft deep on both sides
function doorZones() {
  const z = [];
  for (const w of layout.walls) { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (L < .1) continue; const ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L;
    for (const o of w.openings || []) { if (o.type === 'window' || (o.sill || 0) > .5) continue; const m = (o.start + o.end) / 2;
      z.push({ cx: w.a[0] + ux * m, cz: w.a[1] + uz * m, hx: (o.end - o.start) / 2 + .1, hz: 2.2, c: ux, s: uz }); } }
  return z;
}
// long pieces (wardrobes, consoles, vanities) give up the end that runs into the doorway
function trimToClear(it, dz) {
  const f = withDefaults(it); if (f.w < 3) return false;
  const th = (it.rot || 0) * D2R, ax = Math.cos(th), az = -Math.sin(th), sd = Math.sign((dz.cx - it.x) * ax + (dz.cz - it.z) * az) || 1, save = [it.x, it.z, it.w];
  let w = f.w;
  while (sat(itemOBB(it), dz) && w - .25 >= 2) { w -= .25; it.w = r2(w); it.x = r2(it.x - sd * ax * .125); it.z = r2(it.z - sd * az * .125); }
  if (sat(itemOBB(it), dz)) { [it.x, it.z, it.w] = save; if (save[2] == null) delete it.w; return false; }
  return true;
}
function doorFix(it, dz) {
  const m = sat(itemOBB(it), dz); if (!m) return false;
  const home = roomAt(it.x, it.z), f = withDefaults(it);
  if (BACKED.has(it.type) && trimToClear(it, dz)) return true;
  const cands = [[it.x - m.ax * m.sg * (m.ov + .05), it.z - m.az * m.sg * (m.ov + .05)]];
  const nrm = (it.x - dz.cx) * -dz.s + (it.z - dz.cz) * dz.c, tan = (it.x - dz.cx) * dz.c + (it.z - dz.cz) * dz.s, need = dz.hz + Math.max(f.w, f.d) / 2 + .05;
  cands.push([dz.cx + dz.c * tan - dz.s * Math.sign(nrm || 1) * need, dz.cz + dz.s * tan + dz.c * Math.sign(nrm || 1) * need]);
  for (const [nx, nz] of cands) if (roomAt(nx, nz) === home) { it.x = r2(nx); it.z = r2(nz); return true; }
  return trimToClear(it, dz);
}
// clear doorways in an existing layout (used when a saved home is opened)
function clearDoorways(items) {
  const doors = doorZones(); let moved = 0;
  const solid = it => { const d = CAT[it.type]; return d && !d.nc && !WALLMOUNT.has(it.type) && !['rug', 'loft-platform', 'stair-curved'].includes(it.type) && (+withDefaults(it).y || 0) < 2; };
  for (let pass = 0; pass < 2; pass++) for (const it of items) { if (!solid(it)) continue; for (const dz of doors) if (doorFix(it, dz)) moved++; }
  return moved;
}
function settleItems(raw, rooms) {
  const out = [], names = new Set(rooms.map(r => r.name));
  for (const r of raw || []) {
    if (!r || !CAT[r.type]) continue;
    const def = CAT[r.type], it = { id: newId(), type: r.type, name: String(r.name || def.label).slice(0, 40), room: names.has(r.room) ? r.room : null };
    for (const [k, v] of Object.entries(r)) if (!(k in it) && k !== 'id') it[k] = v;
    for (const k of ['x', 'z', 'rot', 'w', 'd', 'h', 'y']) { if (k in it) { const v = +it[k]; if (!isFinite(v) || (['w', 'd', 'h'].includes(k) && v <= 0)) delete it[k]; else it[k] = v; } }
    if (!isFinite(it.x) || !isFinite(it.z)) continue;
    const rm = roomAt(it.x, it.z); if (!rm) continue; it.room ||= rm.name;
    if (BACKED.has(it.type)) snapBack(it);
    out.push(it);
  }
  const solid = it => { const d = CAT[it.type]; return !d.nc && !WALLMOUNT.has(it.type) && !['rug', 'loft-platform', 'stair-curved'].includes(it.type) && (+withDefaults(it).y || 0) < 2; };
  const wallBoxes = wallCols.filter(c => c.wall && c.y0 < 1).map(c => ({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, c: c.c, s: c.s }));
  const doors = doorZones();
  for (let pass = 0; pass < 3; pass++) {
    // nothing may stand in a doorway: slide it out of the swing/clearance zone
    for (const it of out) { if (!solid(it)) continue; for (const dz of doors) doorFix(it, dz); }
    for (const it of out) { if (!solid(it)) continue; for (const wb of wallBoxes) { const A = itemOBB(it), m = sat(A, wb); if (m && m.ov < 2.5) { it.x = r2(it.x - m.ax * m.sg * (m.ov + .02)); it.z = r2(it.z - m.az * m.sg * (m.ov + .02)); } } }
    const pool = out.filter(solid).concat(layout.furniture.filter(x => solid(x) && names.has(x.room)));
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      const A = pool[i], B = pool[j], m = sat(itemOBB(A), itemOBB(B)); if (!m || m.ov > 3) continue;
      const fa = withDefaults(A), fb = withDefaults(B), moveA = out.includes(A) && (fa.w * fa.d <= fb.w * fb.d || !out.includes(B)), mv = moveA ? A : B, sg = moveA ? -1 : 1;
      if (!out.includes(mv)) continue; mv.x = r2(mv.x + sg * m.ax * m.sg * (m.ov + .02)); mv.z = r2(mv.z + sg * m.az * m.sg * (m.ov + .02));
    }
  }
  return out.filter(it => roomAt(it.x, it.z));
}

