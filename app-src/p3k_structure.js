/* ================= changing the building itself: walls, windows, doors, and corrections to the plan =================
   Mira and the change box may:
   - open up or remove LIGHT walls (thin interior partitions). Outside walls, thick walls, columns and beams are structure
     and stay: a removed partition leaves its beam at the ceiling unless the homeowner says there is none;
   - add, move, resize and remove windows and doors (windows and sliding doors may go in an outside wall);
   - correct a plan that was read wrong: move a wall, add a missing one, remove one that is not there, split or rename a room.
   Every refusal comes back as a short note the homeowner sees, so nothing fails silently. */
for (const t of ['led-strip', 'neon-sign', 'acoustic-panels', 'guitar-wall', 'projector-screen']) { WALLMOUNT.add(t); BACKED.add(t); }
for (const t of ['studio-desk', 'fireplace-linear', 'wine-wall', 'window-seat', 'gym-set']) BACKED.add(t);
const STRUCT_OPS = new Set(['wall_remove', 'wall_move', 'wall_add', 'wall_mark', 'opening_add', 'opening_set', 'opening_remove', 'room_set']);
const wallLen = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
const wallDir = w => { const L = wallLen(w) || 1; return [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L]; };
function ensureWallIds() {
  const used = new Set(); let n = 1;
  for (const w of layout.walls) { if (w.id && !used.has(w.id)) { used.add(w.id); continue; } w.id = null; }
  for (const w of layout.walls) { if (w.id) continue; while (used.has('w' + n)) n++; w.id = 'w' + n; used.add(w.id); }
}
// exterior | column | thick (both structural) | light (a partition that may be opened or removed)
function wallClass(w) {
  if (w.structural === true) return 'thick';
  if (w.structural === false) return 'light';
  if (w.kind === 'ext') return 'exterior';
  const t = +w.thickness || .5, L = wallLen(w), med = median(layout.walls.filter(x => x.kind !== 'ext' && wallLen(x) > 3).map(x => +x.thickness || .5)) || .5;
  if (L < Math.max(2.2, t * 2.6) && t >= Math.max(.7, med * 1.3)) return 'column';
  if (t >= Math.max(.8, med * 1.5)) return 'thick';
  return 'light';
}
const CLASS_WORDS = { exterior: 'an outside wall', column: 'a column', thick: 'a thick structural wall', light: 'a light partition' };
// the rooms on either side of a wall
function wallSides(w) {
  const L = wallLen(w), u = wallDir(w), n = [-u[1], u[0]], off = (+w.thickness || .5) / 2 + .9, A = new Map(), B = new Map();
  for (const q of [.2, .5, .8]) { const p = [w.a[0] + u[0] * L * q, w.a[1] + u[1] * L * q]; const a = roomAt(p[0] + n[0] * off, p[1] + n[1] * off), b = roomAt(p[0] - n[0] * off, p[1] - n[1] * off); if (a) A.set(a.name, a); if (b) B.set(b.name, b); }
  return { a: [...A.values()], b: [...B.values()], n };
}
function wallBetween(w) { const s = wallSides(w), nm = l => l.map(r => r.name).join(' / ') || 'outside'; return `${nm(s.a)} and ${nm(s.b)}`; }
function wallsText(rooms) {
  ensureWallIds(); const keep = rooms?.length ? new Set(rooms.map(r => r.name)) : null;
  return layout.walls.filter(w => wallLen(w) > .3).map(w => {
    const s = wallSides(w), names = [...s.a, ...s.b].map(r => r.name); if (keep && !names.some(n => keep.has(n))) return null;
    const cls = wallClass(w), ops = (w.openings || []).map((o, i) => `[${i}] ${o.type} ${f1(o.start)}–${f1(o.end)} ft${o.type === 'window' ? `, sill ${f1(o.sill || 0)} head ${f1(o.head ?? 7)}` : ''}${o.name ? ` "${o.name}"` : ''}`).join('; ');
    return `${w.id} | (${f1(w.a[0])},${f1(w.a[1])})→(${f1(w.b[0])},${f1(w.b[1])}) | ${f1(wallLen(w))} ft long, ${f1(+w.thickness || .5)} thick | ${cls === 'light' ? 'LIGHT partition (may be opened or removed)' : 'STRUCTURE: ' + CLASS_WORDS[cls]} | between ${wallBetween(w)}${ops ? ' | openings, measured in ft from the first point: ' + ops : ''}`;
  }).filter(Boolean).join('\n');
}
// what the visitor is facing: the first wall straight ahead, and the door or window there if any
function lookingAt() {
  ensureWallIds(); const d = [-Math.sin(player.yaw), -Math.cos(player.yaw)]; let best = null;
  for (const w of layout.walls) {
    const e = [w.b[0] - w.a[0], w.b[1] - w.a[1]], den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-6) continue;
    const t = ((w.a[0] - player.x) * e[1] - (w.a[1] - player.z) * e[0]) / den, u = ((w.a[0] - player.x) * d[1] - (w.a[1] - player.z) * d[0]) / den;
    if (t < .3 || u < 0 || u > 1 || (best && t >= best.t)) continue;
    const s = u * wallLen(w), op = (w.openings || []).findIndex(o => s >= o.start - .3 && s <= o.end + .3);
    best = { t, w, s, op };
  }
  if (!best) return '';
  const o = best.op >= 0 ? best.w.openings[best.op] : null, cls = wallClass(best.w);
  return `the visitor is facing wall ${best.w.id} (${CLASS_WORDS[cls]} between ${wallBetween(best.w)}), ${f1(best.t)} ft ahead${o ? `, at its ${o.type} [${best.op}]${o.name ? ' "' + o.name + '"' : ''}` : ''}.`;
}

/* ---------- the operations ---------- */
let structSnap = null;   // the openings as the model saw them, so [index] keeps meaning what it meant through several operations
function structRef(w, i) { structSnap ||= new Map(layout.walls.map(x => [x, [...(x.openings || [])]])); const o = (structSnap.get(w) || w.openings || [])[+i]; return o && (w.openings || []).includes(o) ? o : null; }
const findWall = id => layout.walls.find(w => w.id === String(id)) || null;
const findRoomByName = n => layout.rooms.find(r => r.name.toLowerCase() === String(n || '').toLowerCase()) || null;
function fitOpening(w, start, end, self) {   // keep an opening inside its wall and clear of its neighbours
  const L = wallLen(w); let s = clamp(Math.min(+start, +end), .15, L - .15), e = clamp(Math.max(+start, +end), .15, L - .15);
  for (const o of w.openings || []) { if (o === self) continue; if (e <= o.start - .2 || s >= o.end + .2) continue; const mid = (s + e) / 2; if (mid < (o.start + o.end) / 2) e = Math.min(e, o.start - .25); else s = Math.max(s, o.end + .25); }
  return e - s >= 1.2 ? [r2(s), r2(e)] : null;
}
function applyStructOp(op) {
  ensureWallIds(); const Hc = +layout.settings.ceilingHeight || 10, no = note => ({ ok: false, note }), yes = note => ({ ok: true, note });
  const misread = op.misread === true;
  if (op.op === 'wall_mark') { const w = findWall(op.id); if (!w) return no(''); w.structural = !!op.structural; return yes(''); }
  if (op.op === 'wall_remove') {
    const w = findWall(op.id); if (!w) return no('');
    const cls = wallClass(w), L = wallLen(w);
    if (cls !== 'light' && !misread) return no(`The wall between ${wallBetween(w)} is ${CLASS_WORDS[cls]}, so it stays.`);
    const from = clamp(isFinite(+op.from) && op.from != null ? +op.from : 0, 0, L), to = clamp(isFinite(+op.to) && op.to != null ? +op.to : L, 0, L), s = Math.min(from, to), e = Math.max(from, to);
    if (e - s < 1) return no('');
    const whole = s <= .4 && e >= L - .4;
    if (whole && (misread || op.beam === false)) { layout.walls = layout.walls.filter(x => x !== w); return yes(''); }
    // the wall goes, its beam stays: a full-height opening up to the underside of the beam
    w.openings = (w.openings || []).filter(o => o.end <= s + .1 || o.start >= e - .1);
    w.openings.push({ type: 'opening', start: r2(whole ? 0 : s), end: r2(whole ? L : e), sill: 0, head: op.beam === false ? Hc : r2(Hc - 1), name: 'Opened wall' }); w.openings.sort((p, q) => p.start - q.start);
    return yes(op.beam === false ? '' : 'The beam above that wall is kept, since beams are structure.');
  }
  if (op.op === 'wall_move') {
    const w = findWall(op.id), by = clamp(Math.abs(+op.by || 0), 0, 8); if (!w || by < .05) return no('');
    const cls = wallClass(w); if (cls !== 'light' && !misread) return no(`The wall between ${wallBetween(w)} is ${CLASS_WORDS[cls]}; it can only be moved to correct the plan.`);
    // only a stretch moves: the wall is cut there first, and short returns join the moved stretch to what stays
    let w0 = w; const L0 = wallLen(w), hasF = op.from != null && isFinite(+op.from), hasT = op.to != null && isFinite(+op.to);
    if (hasF || hasT) { const s = clamp(Math.min(hasF ? +op.from : 0, hasT ? +op.to : L0), 0, L0), e = clamp(Math.max(hasF ? +op.from : 0, hasT ? +op.to : L0), 0, L0); if (e - s < 1.5) return no(''); if (e < L0 - .6) splitWallAt(w, e); if (s > .6) w0 = splitWallAt(w, s); }
    moveWall(w0, by, op); return yes('');
  }
  if (op.op === 'wall_add') {
    let a = numOk(op.a) ? op.a.map(Number) : null, b = numOk(op.b) ? op.b.map(Number) : null; if (!a || !b) return no('');
    if (Math.abs(a[0] - b[0]) < Math.abs(a[1] - b[1]) * .09) b[0] = a[0]; else if (Math.abs(a[1] - b[1]) < Math.abs(a[0] - b[0]) * .09) b[1] = a[1];
    // ends that stop just short of a wall are run into it
    for (const p of [a, b]) { let best = null; for (const x of layout.walls) { const dd = segDist(p[0], p[1], x.a, x.b); if (dd < .9 && (!best || dd < best.d)) best = { d: dd, x }; } if (best) { const x = best.x, xu = wallDir(x), s = clamp((p[0] - x.a[0]) * xu[0] + (p[1] - x.a[1]) * xu[1], 0, wallLen(x)); p[0] = r2(x.a[0] + xu[0] * s); p[1] = r2(x.a[1] + xu[1] * s); } }
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1.5) return no('');
    const light = median(layout.walls.filter(x => wallClass(x) === 'light').map(x => +x.thickness || .5)) || .5;
    const w = { a: a.map(r2), b: b.map(r2), thickness: r2(clamp(+op.thickness || light, .3, 1.2)), kind: 'int', openings: [], structural: false }; layout.walls.push(w); ensureWallIds();
    if (op.door && isFinite(+op.door.start) && isFinite(+op.door.end)) { const fit = fitOpening(w, op.door.start, op.door.end); if (fit) w.openings.push({ ...PRESET.door, start: fit[0], end: fit[1], name: 'Door', swing: { hinge: 'start', side: 1, open: 90 } }); }
    const sp = op.split; let note = '';
    if (sp?.room) { const r = findRoomByName(sp.room); if (r) { const done = splitRoom(r, w.a, w.b, sp.names, sp.types); if (!done) note = `${r.name} was not divided: the new wall does not cross it from side to side.`; } }
    return yes(note);
  }
  if (op.op === 'room_set') {
    const r = findRoomByName(op.room), set = op.set || {}; if (!r) return no('');
    if (set.name && String(set.name).trim() && !findRoomByName(set.name)) renameRoom(r, String(set.name).trim().slice(0, 40));
    if (set.type && TYPES.includes(set.type)) { r.type = set.type; r.kind = ['balcony', 'terrace'].includes(set.type) ? 'outdoor' : 'room'; }
    return yes('');
  }
  // doors, windows, sliding doors and open doorways
  const w = findWall(op.wall); if (!w) return no('');
  const cls = wallClass(w), okHere = type => cls === 'light' || misread || (cls === 'exterior' && ['window', 'slider'].includes(type)) || (cls === 'thick' && type === 'window');
  const why = type => `A ${type === 'opening' ? 'new opening' : type} cannot go in the wall between ${wallBetween(w)}: it is ${CLASS_WORDS[cls]}.`;
  if (op.op === 'opening_add') {
    const type = ['door', 'window', 'slider', 'opening'].includes(op.type) ? op.type : null; if (!type) return no('');
    if (!okHere(type)) return no(why(type));
    const fit = fitOpening(w, op.start, op.end); if (!fit) return no(`There is no room on that wall for the ${type}.`);
    const o = { ...PRESET[type], start: fit[0], end: fit[1] };
    if (isFinite(+op.sill) && op.sill != null) o.sill = clamp(+op.sill, 0, Hc - 1.5); if (isFinite(+op.head) && op.head != null) o.head = clamp(+op.head, o.sill + 1, Hc);
    if (type === 'door') { o.name = op.name || 'Door'; o.swing = doorSwing(w, o, op); }
    w.openings.push(o); w.openings.sort((p, q) => p.start - q.start); return yes('');
  }
  const o = structRef(w, op.index); if (!o) return no('');
  if (op.op === 'opening_remove') {
    if (o.name === 'Main door' && !misread) return no('The main door stays.');
    w.openings = w.openings.filter(x => x !== o); return yes('');
  }
  if (op.op === 'opening_set') {
    const set = op.set || {}, type = ['door', 'window', 'slider', 'opening'].includes(set.type) ? set.type : o.type;
    const grows = (isFinite(+set.start) && set.start != null && +set.start < o.start - .05) || (isFinite(+set.end) && set.end != null && +set.end > o.end + .05) || type !== o.type;
    if (grows && !okHere(type)) return no(why(type));
    const fit = fitOpening(w, set.start ?? o.start, set.end ?? o.end, o); if (!fit) return no('');
    o.start = fit[0]; o.end = fit[1];
    if (type !== o.type) { const keepName = o.name; Object.assign(o, PRESET[type]); delete o.swing; if (type === 'door') { o.name = keepName || 'Door'; o.swing = doorSwing(w, o, set); } }
    if (isFinite(+set.sill) && set.sill != null) o.sill = clamp(+set.sill, 0, Hc - 1.5); if (isFinite(+set.head) && set.head != null) o.head = clamp(+set.head, (o.sill || 0) + 1, Hc);
    if (o.type === 'door' && (set.hinge || set.into)) o.swing = doorSwing(w, o, set, o.swing);
    return yes('');
  }
  return no('');
}
// cut a wall in two at s ft from its first point; doors and windows go with the piece they are in. Returns the second piece.
function splitWallAt(w, s) {
  const u = wallDir(w), p = [r2(w.a[0] + u[0] * s), r2(w.a[1] + u[1] * s)], rest = { ...w, id: null, a: p.slice(), b: w.b.slice(), openings: [] }, keep = [];
  for (const o of w.openings || []) { if ((o.start + o.end) / 2 < s) keep.push({ ...o, end: Math.min(o.end, r2(s - .1)) }); else rest.openings.push({ ...o, start: r2(Math.max(.1, o.start - s)), end: r2(o.end - s) }); }
  w.b = p; w.openings = keep; layout.walls.splice(layout.walls.indexOf(w) + 1, 0, rest); ensureWallIds(); return rest;
}
function moveWall(w, by, op) {
    const sides = wallSides(w), into = findRoomByName(op.into), u = wallDir(w), L = wallLen(w); let n = sides.n;
    if (into) { const c = centroid(into.polygon), m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]; if ((c[0] - m[0]) * n[0] + (c[1] - m[1]) * n[1] < 0) n = [-n[0], -n[1]]; }
    else if (+op.by < 0) n = [-n[0], -n[1]];
    const d = [n[0] * by, n[1] * by], a0 = w.a.slice(), b0 = w.b.slice(), t = +w.thickness || .5;
    const onWall = (p, tol) => { const s = (p[0] - a0[0]) * u[0] + (p[1] - a0[1]) * u[1], off = Math.abs((p[0] - a0[0]) * -u[1] + (p[1] - a0[1]) * u[0]); return s >= -tol && s <= L + tol && off <= tol; };
    const extra = [];
    for (const x of layout.walls) {
      if (x === w) continue; const xu = wallDir(x), parallel = Math.abs(xu[0] * u[0] + xu[1] * u[1]) > .96, tol = Math.max(t, +x.thickness || .5) / 2 + .2;
      for (const key of ['a', 'b']) {
        const e = x[key]; if (!onWall(e, tol)) continue;
        if (parallel) { extra.push({ a: e.slice(), b: [r2(e[0] + d[0]), r2(e[1] + d[1])], thickness: x.thickness, kind: x.kind, openings: [] }); continue; }   // a wall carrying on in the same line stays; a short return joins the two
        const shift = d[0] * xu[0] + d[1] * xu[1]; e[0] = r2(e[0] + d[0]); e[1] = r2(e[1] + d[1]);
        if (key === 'a') for (const o of x.openings || []) { o.start = r2(o.start - shift); o.end = r2(o.end - shift); }
        const xl = wallLen(x); x.openings = (x.openings || []).filter(o => o.end > .3 && o.start < xl - .3).map(o => ({ ...o, start: r2(Math.max(.1, o.start)), end: r2(Math.min(xl - .1, o.end)) }));
      }
    }
    w.a = [r2(a0[0] + d[0]), r2(a0[1] + d[1])]; w.b = [r2(b0[0] + d[0]), r2(b0[1] + d[1])]; layout.walls.push(...extra.filter(x => wallLen(x) > .2));
    for (const r of layout.rooms) { let hit = false; for (const p of r.polygon || []) if (onWall(p, t / 2 + .45)) { p[0] = r2(p[0] + d[0]); p[1] = r2(p[1] + d[1]); hit = true; } if (hit) delete r.size; }
    // pieces standing against the wall go with it
    for (const it of layout.furniture) { const f = withDefaults(it), s = (it.x - a0[0]) * u[0] + (it.z - a0[1]) * u[1], off = Math.abs((it.x - a0[0]) * -u[1] + (it.z - a0[1]) * u[0]); if (s >= -.5 && s <= L + .5 && off <= t / 2 + Math.max(f.w, f.d) / 2 + .5 && (BACKED.has(it.type) || WALLMOUNT.has(it.type))) { it.x = r2(it.x + d[0]); it.z = r2(it.z + d[1]); } }
}
function doorSwing(w, o, set, cur) {
  const sw = { hinge: cur?.hinge || 'start', side: cur?.side || 1, open: cur?.open ?? 90 };
  if (['start', 'end'].includes(set.hinge)) sw.hinge = set.hinge;
  const into = findRoomByName(set.into);
  if (into) { const u = wallDir(w), n = [-u[1], u[0]], m = (o.start + o.end) / 2, p = [w.a[0] + u[0] * m, w.a[1] + u[1] * m], c = centroid(into.polygon); sw.side = (c[0] - p[0]) * n[0] + (c[1] - p[1]) * n[1] >= 0 ? 1 : -1; }
  return sw;
}
// a room cut in two by a wall from side to side: the first name goes to the left part (or the upper part for a level cut)
function splitRoom(r, a, b, names, types) {
  const d = [b[0] - a[0], b[1] - a[1]], side = p => (p[0] - a[0]) * d[1] - (p[1] - a[1]) * d[0];
  const clip = sg => { const out = [], P = r.polygon; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], sp = side(p) * sg, sq = side(q) * sg; if (sp >= 0) out.push([r2(p[0]), r2(p[1])]); if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) { const t = sp / (sp - sq); out.push([r2(p[0] + (q[0] - p[0]) * t), r2(p[1] + (q[1] - p[1]) * t)]); } } return out; };
  const A = clip(1), B = clip(-1); if (A.length < 3 || B.length < 3 || polyArea(A) < 9 || polyArea(B) < 9) return false;
  const level = Math.abs(d[0]) > Math.abs(d[1]), key = p => { const c = centroid(p); return level ? c[1] : c[0]; }, parts = [A, B].sort((p, q) => key(p) - key(q));
  const nm = (Array.isArray(names) ? names : []).map(s => String(s || '').trim().slice(0, 40)), ty = Array.isArray(types) ? types : [], old = r.name;
  const made = parts.map((poly, i) => { const o = { ...r, polygon: poly }; delete o.size; let name = nm[i] || (i ? old + ' 2' : old); while (layout.rooms.some(x => x !== r && x.name === name) || (i && name === (nm[0] || old))) name += ' 2'; o.name = name; if (TYPES.includes(ty[i])) o.type = ty[i]; return o; });
  layout.rooms.splice(layout.rooms.indexOf(r), 1, ...made);
  for (const k of ['roomStyles']) if (project[k]?.[old]) { for (const m of made) project[k][m.name] = structuredClone(project[k][old]); if (!made.some(m => m.name === old)) delete project[k][old]; }
  for (const it of layout.furniture) if (it.room === old) { const at = made.find(m => pip([it.x, it.z], m.polygon)); it.room = (at || made[0]).name; }
  return true;
}
// once the walls have changed: ids, the plan view, and every piece knows which room it is in
function afterStructChange() {
  structSnap = null; ensureWallIds();
  for (const w of layout.walls) { const L = wallLen(w); w.openings = (w.openings || []).filter(o => o.end - o.start > .5 && o.start < L).sort((p, q) => p.start - q.start); }
  for (const it of layout.furniture) { if (layout.rooms.some(r => r.name === it.room && pip([it.x, it.z], r.polygon))) continue; const r = roomAt(it.x, it.z); if (r) it.room = r.name; }
  project.tour = null;
}
const STRUCT_HELP = `{"op":"wall_remove","id":"<wall id>","from":ft,"to":ft} open up a LIGHT wall: the whole wall, or only the stretch from–to (ft from its first point). A wall often runs on past several rooms: open only the stretch that belongs to the rooms in question, and leave at least 0.5 ft of wall at each end of the stretch as a pier unless the whole wall goes. The beam above it is kept (it is structure) unless the homeowner says there is no beam: then add "beam":false. STRUCTURE walls are refused.
{"op":"wall_move","id":"<wall id>","by":ft,"into":"<room it moves into>","from":ft,"to":ft} slide a wall sideways; the room named in "into" gets smaller and the room on the other side larger. A wall that runs past several rooms is moved only along the stretch from–to (ft from its first point) that belongs to the room in question; the rest stays and short returns join them. Walls joined to it, room outlines and the pieces standing against it follow by themselves: do not update those pieces.
{"op":"wall_add","a":[x,z],"b":[x,z],"thickness":0.5,"door":{"start":ft,"end":ft},"split":{"room":"<room it divides>","names":["<left or upper part>","<right or lower part>"],"types":["<type>","<type>"]}} a new partition in whole-home coordinates; "door" and "split" are optional.
{"op":"opening_add","wall":"<wall id>","type":"window|slider|door|opening","start":ft,"end":ft,"sill":ft,"head":ft,"hinge":"start|end","into":"<room a door opens into>"} a new window, sliding door, door or open doorway. Windows and sliding doors may go in an outside wall; doors and doorways only in LIGHT walls.
{"op":"opening_set","wall":"<wall id>","index":n,"set":{"start":ft,"end":ft,"sill":ft,"head":ft,"type":"window|slider|door|opening","hinge":"start|end","into":"<room>"}} move, widen, narrow, raise or change an existing opening ([n] in the WALLS list); give only what changes.
{"op":"opening_remove","wall":"<wall id>","index":n} wall up a door or window.
{"op":"room_set","room":"<room>","set":{"name":"<new name>","type":"<type>"}} rename a room or correct what it is.
{"op":"wall_mark","id":"<wall id>","structural":true|false} when the homeowner tells you a wall is, or is not, structural.
When the homeowner says the PLAN WAS READ WRONG (a wall that is not there, a wall in the wrong place, a missing door, a room that is larger or smaller in reality), correct it with these operations and add "misread":true to each: a correction may touch any wall, because it changes the drawing, not the building.
After opening or removing a wall, deal with what stood against it in the same reply: move or remove those pieces, or follow with a refurnish of the rooms on both sides when the room's use changes.`;
