// Scores a tracing (plan pixels) against a hand-verified answer key (a layout in feet: walls with openings, rooms).
//   node compare.mjs <trace.json> <key.json> [--json]
// The key is laid over the tracing with a best-fit affine map found from the rooms both name, then every key wall,
// opening and room is looked for in the tracing (recall) and every traced wall in the key (precision).
import fs from 'node:fs';
const J = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const nm = s => String(s || '').toLowerCase().replace(/master bedroom( *- *1)?$/, 'masterbedroom').replace(/[^a-z0-9]/g, '').replace(/^stafftoilet$/, 'toilet').replace(/^walkin.*/, 'walkin').replace(/^staffroom$/, 'staff');
const cen = p => { let a = 0, x = 0, y = 0; for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length], c = x0 * y1 - x1 * y0; a += c; x += (x0 + x1) * c; y += (y0 + y1) * c; } return a ? [x / (3 * a), y / (3 * a)] : p[0]; };
const pip = (q, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > q[1]) !== (p[j][1] > q[1]) && q[0] < (p[j][0] - p[i][0]) * (q[1] - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c; };
const dseg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const ang = (a, b) => { let d = Math.abs(Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])) % Math.PI; return Math.min(d, Math.PI - d); };
// least-squares affine px = A·ft + t from point pairs (normal equations, 3 unknowns per axis)
function affine(pairs) {
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  for (const [f, p] of pairs) { const v = [f[0], f[1], 1]; for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) S[i][j] += v[i] * v[j]; bx[i] += v[i] * p[0]; by[i] += v[i] * p[1]; } }
  const solve = b => { const M = S.map((r, i) => [...r, b[i]]); for (let i = 0; i < 3; i++) { let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; [M[i], M[p]] = [M[p], M[i]]; for (let k = 0; k < 3; k++) if (k !== i) { const f = M[k][i] / M[i][i]; for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j]; } } return M.map((r, i) => r[3] / r[i]); };
  const X = solve(bx), Y = solve(by); return f => [X[0] * f[0] + X[1] * f[1] + X[2], Y[0] * f[0] + Y[1] * f[1] + Y[2]];
}
export function compare(tr, key) {
  const kr = (key.rooms || []).filter(r => r.kind !== 'ledge'), trR = (tr.rooms || []).filter(r => Array.isArray(r.poly) && r.poly.length >= 3);
  let pairs = kr.map(k => { const t = trR.find(r => nm(r.name) === nm(k.name)); return t ? [cen(k.polygon), cen(t.poly), k.name] : null; }).filter(Boolean);
  if (pairs.length < 4) return { error: 'fewer than 4 rooms share a name with the key', matched: pairs.map(p => p[2]) };
  let map = affine(pairs);
  for (let it = 0; it < 3; it++) { const res = pairs.map(([f, p]) => Math.hypot(map(f)[0] - p[0], map(f)[1] - p[1])), med = res.slice().sort((a, b) => a - b)[res.length >> 1]; const keep = pairs.filter((_, i) => res[i] <= Math.max(6, med * 2.5)); if (keep.length < 4 || keep.length === pairs.length) break; pairs = keep; map = affine(keep); }
  // tighten the fit on the walls themselves: upright walls fix the x scale and shift, level walls the y (no shear, no rotation)
  const twA = (tr.walls || []).filter(w => w.a && w.b);
  for (let it = 0; it < 6; it++) {
    const f0 = Math.hypot(map([1, 0])[0] - map([0, 0])[0], map([1, 0])[1] - map([0, 0])[1]), fit1 = k => { const pts = [];
      for (const w of key.walls || []) { if (Math.abs(w.b[k] - w.a[k]) > Math.abs(w.b[1 - k] - w.a[1 - k]) * .08) continue; const A = map(w.a), B = map(w.b), c = (A[k] + B[k]) / 2, lo = Math.min(A[1 - k], B[1 - k]), hi = Math.max(A[1 - k], B[1 - k]); let best = null;
        for (const t of twA) { if (Math.abs(t.b[k] - t.a[k]) > Math.abs(t.b[1 - k] - t.a[1 - k]) * .08) continue; const tl = Math.min(t.a[1 - k], t.b[1 - k]), th = Math.max(t.a[1 - k], t.b[1 - k]); if (Math.min(hi, th) - Math.max(lo, tl) < (hi - lo) * .4) continue; const d = Math.abs((t.a[k] + t.b[k]) / 2 - c); if (d < f0 * (it < 2 ? 1.6 : 1) && (!best || d < best.d)) best = { d, v: (t.a[k] + t.b[k]) / 2 }; }
        if (best) pts.push([(w.a[k] + w.b[k]) / 2, best.v]); }
      if (pts.length < 4) return null; const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0), sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0), m = (n * sxy - sx * sy) / (n * sxx - sx * sx); return [m, (sy - m * sx) / n]; };
    const fx = fit1(0), fy = fit1(1); if (!fx || !fy) break; map = f => [fx[0] * f[0] + fx[1], fy[0] * f[1] + fy[1]];
  }
  const ft = Math.hypot(map([1, 0])[0] - map([0, 0])[0], map([1, 0])[1] - map([0, 0])[1]);   // px per foot
  const tw = (tr.walls || []).filter(w => w.a && w.b), kw = (key.walls || []).map(w => ({ ...w, A: map(w.a), B: map(w.b) }));
  const cover = (a, b, others, tol) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.round(L / (ft * .4))); let hit = 0; for (let k = 0; k < n; k++) { const q = (k + .5) / n, p = [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q]; if (others.some(o => dseg(p, o[0], o[1]) <= tol && ang([b[0] - a[0], b[1] - a[1]], [o[1][0] - o[0][0], o[1][1] - o[0][1]]) < .45)) hit++; } return hit / n; };
  const tol = ft * .75, tSeg = tw.map(w => [w.a, w.b]), kSeg = kw.map(w => [w.A, w.B]);
  const walls = kw.map(w => ({ id: w.id, cov: cover(w.A, w.B, tSeg, tol), len: Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) }));
  const extra = tw.map((w, i) => ({ i, cov: cover(w.a, w.b, kSeg, tol), len: Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) / ft })).filter(w => w.cov < .5 && w.len > 1.5);
  // wall position error: distance from key wall midpoints to the nearest parallel traced wall
  const offs = kw.map(w => { const m = [(w.A[0] + w.B[0]) / 2, (w.A[1] + w.B[1]) / 2]; let d = 1e9; for (const o of tSeg) if (ang([w.B[0] - w.A[0], w.B[1] - w.A[1]], [o[1][0] - o[0][0], o[1][1] - o[0][1]]) < .45) d = Math.min(d, dseg(m, o[0], o[1])); return d / ft; }).filter(d => d < 3);
  const cls = t => t === 'slider' ? 'slider' : t === 'window' ? 'window' : 'door';
  const to = (tr.openings || []).filter(o => o.a && o.b).map(o => ({ type: o.type, m: [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2], w: Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) / ft, used: false }));
  const opens = [];
  for (const w of key.walls || []) { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), d = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
    for (const o of w.openings || []) { const mid = (o.start + o.end) / 2, m = map([w.a[0] + d[0] * mid, w.a[1] + d[1] * mid]); let best = null;
      for (const t of to) { if (t.used) continue; const dist = Math.hypot(t.m[0] - m[0], t.m[1] - m[1]) / ft; if (dist <= Math.max(1.6, (o.end - o.start) * .5) && (!best || dist < best.dist)) best = { t, dist }; }
      if (best) best.t.used = true;
      opens.push({ wall: w.id, type: o.type, name: o.name, width: o.end - o.start, found: !!best, sameType: best ? (cls(best.t.type) === cls(o.type) || (o.type === 'door' && best.t.type === 'opening')) : false, off: best ? best.dist : null, widthErr: best ? best.t.w - (o.end - o.start) : null }); } }
  const extraOpen = to.filter(t => !t.used && t.type !== 'opening').length;
  // rooms: overlap of the two outlines on a ¼-ft grid
  const named = new Set(kr.map(k => nm(k.name)));
  const rooms = kr.map(k => { const P = k.polygon.map(map), t = trR.find(r => nm(r.name) === nm(k.name)); if (!t) return { name: k.name, found: false, iou: 0 };
    // a room the tracing splits in two (Foyer + Entrance Lobby) counts as one when the extra piece has no room of its own in the key
    const set = [t, ...trR.filter(r => r !== t && !named.has(nm(r.name)) && pip(cen(r.poly), P))], all = set.flatMap(r => r.poly), xs = [...P, ...all].map(p => p[0]), ys = [...P, ...all].map(p => p[1]), g = ft / 4; let i = 0, u = 0;
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += g) for (let x = Math.min(...xs); x <= Math.max(...xs); x += g) { const a = pip([x, y], P), b = set.some(r => pip([x, y], r.poly)); if (a || b) u++; if (a && b) i++; } return { name: k.name, found: true, iou: u ? i / u : 0 }; });
  const wLen = walls.reduce((s, w) => s + w.len, 0), pct = v => Math.round(v * 1000) / 10;
  const sum = {
    pxPerFt: Math.round(ft * 100) / 100, roomsUsedForFit: pairs.length,
    wallsFound: `${walls.filter(w => w.cov >= .7).length}/${walls.length}`, wallLengthCovered: pct(walls.reduce((s, w) => s + w.cov * w.len, 0) / wLen),
    wallOffsetMedianIn: Math.round(offs.slice().sort((a, b) => a - b)[offs.length >> 1] * 12 * 10) / 10, wallOffsetP90In: Math.round(offs.slice().sort((a, b) => a - b)[Math.floor(offs.length * .9)] * 12 * 10) / 10,
    extraWalls: extra.length,
    openingsFound: `${opens.filter(o => o.found).length}/${opens.length}`, openingsRightType: `${opens.filter(o => o.sameType).length}/${opens.length}`, extraOpenings: extraOpen,
    roomsFound: `${rooms.filter(r => r.found).length}/${rooms.length}`, roomOverlapMean: pct(rooms.reduce((s, r) => s + r.iou, 0) / rooms.length), roomsOver85: `${rooms.filter(r => r.iou >= .85).length}/${rooms.length}`,
  };
  // one number: walls, openings and rooms weigh the same
  sum.accuracy = Math.round((sum.wallLengthCovered * (1 - Math.min(.3, extra.length * .02)) + 100 * opens.filter(o => o.sameType).length / (opens.length + extraOpen * .5) + sum.roomOverlapMean) / 3 * 10) / 10;
  const keyPx = { walls: kw.map(w => ({ id: w.id, a: w.A, b: w.B, t: w.thickness * ft, ops: (w.openings || []).map(o => { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), d = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L]; return { type: o.type, a: map([w.a[0] + d[0] * o.start, w.a[1] + d[1] * o.start]), b: map([w.a[0] + d[0] * o.end, w.a[1] + d[1] * o.end]) }; }) })) };
  return { keyPx, sum, missedWalls: walls.filter(w => w.cov < .7).map(w => `${w.id} (${pct(w.cov)}%)`), extraWalls: extra.map(w => `walls[${w.i}] ${w.len.toFixed(1)} ft`), missedOpenings: opens.filter(o => !o.sameType).map(o => `${o.type} on ${o.wall}${o.name ? ' (' + o.name + ')' : ''}${o.found ? ' — found as another type' : ''}`), rooms: rooms.map(r => `${r.name} ${pct(r.iou)}%`) };
}
if (process.argv[1] && process.argv[1].endsWith('compare.mjs')) { const out = compare(J(process.argv[2]), J(process.argv[3])); if (process.argv.includes('--dump')) { console.log(JSON.stringify(out.keyPx)); process.exit(0); } delete out.keyPx; console.log(JSON.stringify(process.argv.includes('--brief') ? out.sum : out, null, 1)); }
