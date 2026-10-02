/* ================= plan accuracy: snap Claude's tracing to the drawn pixels, then to the printed sizes =================
   Claude reads the plan (what is a wall, a door, a room); the pixels say exactly where each one is;
   the printed room sizes say exactly how big each room is. All of this works in plan-image pixels,
   before traceToLayout turns the tracing into feet. */

async function planInk(src) {
  const im = await loadImg(src), W = im.naturalWidth, H = im.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(im, 0, 0);
  return inkFromRGBA(g.getImageData(0, 0, W, H).data, W, H);
}
// dark pixels = ink. The cut is Otsu's threshold on brightness, held in a sane range so grey hatching and pale text drop out.
function inkFromRGBA(d, W, H) {
  const n = W * H, lum = new Uint8Array(n), hist = new Float64Array(256);
  for (let i = 0, j = 0; i < n; i++, j += 4) { const v = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000 | 0; lum[i] = v; hist[v]++; }
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sB = 0, best = 0, T = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; T = t; } }
  T = clamp(T, 70, 165);
  const ink = new Uint8Array(n); for (let i = 0; i < n; i++) ink[i] = lum[i] < T ? 1 : 0;
  return { W, H, ink, T, lum };
}

const axisOf = w => { const dx = Math.abs(w.b[0] - w.a[0]), dy = Math.abs(w.b[1] - w.a[1]); return dy <= dx * .08 ? 'h' : dx <= dy * .08 ? 'v' : null; };
// u runs along the wall, v across it
function inkUV(P, ax, u, v) { const x = ax === 'h' ? u : v, y = ax === 'h' ? v : u; if (x < 0 || y < 0 || x >= P.W || y >= P.H) return 0; return P.ink[(y | 0) * P.W + (x | 0)]; }
const fillAt = (P, S, u) => { let k = 0; for (const v of S.rows) k += inkUV(P, S.ax, u, v); return k / S.rows.length; };
const median = a => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };

// Where is this wall really drawn? Look across a window around Claude's line for bands of ink that run its length.
function findWallBand(P, ax, u0, u1, c, t, skip, style) {
  const len = u1 - u0, m = Math.min(len * .2, t * 1.5 + 4), R = Math.round(clamp(Math.max(8, t * 2.2, (P.W + P.H) * .006), 8, 60));
  const us = []; for (let u = Math.round(u0 + m); u <= u1 - m; u++) if (!skip.some(([a, b]) => u >= a && u <= b)) us.push(u);
  if (us.length < 6) return null;
  const step = Math.max(1, Math.floor(us.length / 400)), cols = us.filter((_, i) => i % step === 0);
  const v0 = Math.round(c - R), cov = [];
  for (let v = v0; v <= c + R; v++) { let k = 0; for (const u of cols) k += inkUV(P, ax, u, v); cov.push(k / cols.length); }
  const mx = Math.max(...cov); if (mx < .3) return null;
  const th = Math.max(.45, mx * .6), bands = [];
  cov.forEach((x, i) => { if (x >= th) { const b = bands[bands.length - 1]; if (b && b.hi === v0 + i - 1) b.hi++; else bands.push({ lo: v0 + i, hi: v0 + i }); } });
  const cands = [];
  for (const b of bands) {
    const wdt = b.hi - b.lo + 1, rows = []; for (let v = b.lo; v <= b.hi; v++) rows.push(v);
    cands.push({ c: (b.lo + b.hi + 1) / 2, t: wdt >= 3 ? wdt : t, rows, kind: wdt >= 3 ? 'filled' : 'line' });
  }
  for (let i = 0; i < bands.length; i++) for (let j = i + 1; j < bands.length; j++) {
    const A = bands[i], B = bands[j], span = B.hi - A.lo + 1, wa = A.hi - A.lo + 1, wb = B.hi - B.lo + 1;
    if (span > Math.max(3 * t, t + 12) || span < 4 || wa > Math.max(3, span * .35) || wb > Math.max(3, span * .35) || B.lo - A.hi < 2) continue;
    const rows = []; for (let v = A.lo; v <= A.hi; v++) rows.push(v); for (let v = B.lo; v <= B.hi; v++) rows.push(v);
    cands.push({ c: (A.lo + B.hi + 1) / 2, t: span, rows, kind: 'double' });
  }
  let best = null, bs = 1e9;
  for (const k of cands) {
    const d = Math.abs(k.c - c); if (d > R) continue;
    const sc = d / R + .5 * Math.abs(Math.log(k.t / t)) + (k.kind === 'line' ? .6 : 0) + (style && k.kind !== style && k.kind !== 'line' ? .5 : 0);
    if (sc < bs) { bs = sc; best = k; }
  }
  return best;
}

function refineTrace(tr, P) {
  const stats = { walls: 0, snapped: 0, openings: 0, openSnapped: 0, rooms: 0, style: null, tMed: 0 };
  const walls = (tr.walls || []).filter(w => numOk(w?.a) && numOk(w?.b));
  const ops = (tr.openings || []).filter(o => numOk(o?.a) && numOk(o?.b));
  // the frame each axis-aligned wall lives in
  const S = walls.map(w => {
    const ax = axisOf(w); if (!ax) return null;
    const i = ax === 'h' ? 0 : 1, j = 1 - i, u0 = Math.min(w.a[i], w.b[i]), u1 = Math.max(w.a[i], w.b[i]);
    return { w, ax, u0, u1, c: (w.a[j] + w.b[j]) / 2, c0: (w.a[j] + w.b[j]) / 2, t: clamp(+w.t || 8, 2, 80), ops: [] };
  });
  // openings belong to the nearest parallel wall
  const proj = (s, p) => s.ax === 'h' ? [p[0], p[1]] : [p[1], p[0]];
  const opWall = o => { const dx = Math.abs(o.b[0] - o.a[0]), dy = Math.abs(o.b[1] - o.a[1]), oax = dy <= dx ? 'h' : 'v'; let best = null, bd = 1e9; const m = [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2];
    for (const s of S) { if (!s || s.ax !== oax) continue; const [u, v] = proj(s, m), du = u < s.u0 ? s.u0 - u : u > s.u1 ? u - s.u1 : 0, d = Math.hypot(du, v - s.c); if (d < bd) { bd = d; best = s; } }
    return best && bd < Math.max(best.t * 2, 14) ? best : null; };
  for (const o of ops) { const s = opWall(o); if (!s) continue; const ua = proj(s, o.a)[0], ub = proj(s, o.b)[0]; s.ops.push({ o, s0: Math.min(ua, ub), s1: Math.max(ua, ub) }); }
  // pass 1 finds the drawing style (solid fill, two thin lines, or single lines), pass 2 snaps with it
  let style = null;
  for (let pass = 0; pass < 2; pass++) {
    const tally = { filled: 0, double: 0, line: 0 };
    for (const s of S) {
      if (!s) continue; const b = findWallBand(P, s.ax, s.u0, s.u1, s.c0, s.t, s.ops.map(q => [q.s0 - 2, q.s1 + 2]), style === 'line' ? null : style);
      s.band = b; if (b) tally[b.kind] += s.u1 - s.u0;
    }
    style = tally.line > (tally.filled + tally.double) * 1.5 ? 'line' : tally.filled >= tally.double ? 'filled' : 'double';
  }
  stats.style = style;
  const tMed = median(S.filter(s => s?.band && s.band.kind !== 'line').map(s => s.band.t)) || median(S.filter(Boolean).map(s => s.t)) || 8; stats.tMed = tMed;
  // Is a wall drawn here at all? Compare the strip under the wall with the floor beside it: a drawn wall, however thin or
  // grey (brochure partitions are often a single grey line), is darker than the floor next to it; open floor is not.
  // Only walls lying on plain open floor are removed, and only stretches of plain floor are opened up.
  // a missed doorway is about as wide as the doors the tracing did find
  const doorW = median(S.filter(Boolean).flatMap(s => s.ops.filter(q => q.o.type === 'door').map(q => q.s1 - q.s0)));
  const minGap = doorW ? Math.max(10, doorW * .6) : Math.max(tMed * 2.5, 12);
  const contrastAt = (s, u, c, t) => {
    const lum = (u2, v) => { const x = Math.round(s.ax === 'h' ? u2 : v), y = Math.round(s.ax === 'h' ? v : u2); return x < 0 || y < 0 || x >= P.W || y >= P.H ? 255 : P.lum[y * P.W + x]; };
    const h = Math.max(1.5, t / 2), k = Math.max(3, Math.round(t)); let band = 0, nb = 0, sa = 0, sb = 0;
    for (let v = Math.round(c - h); v <= Math.round(c + h); v++) { band += lum(u, v); nb++; }
    for (let i = 0; i < k; i++) { sa += lum(u, c - h - 2 - i); sb += lum(u, c + h + 2 + i); }
    return Math.max(sa, sb) / k - band / nb;
  };
  const dropped = [], added = [];
  for (let i = 0; i < S.length; i++) {
    const s = S[i]; if (!s) continue; stats.walls++;
    const b = s.band;
    if (b && (b.kind !== 'line' || Math.abs(b.c - s.c0) <= Math.max(3, s.t))) { s.c = b.c; s.t = b.kind === 'line' ? Math.min(s.t, tMed) : b.t; s.rows = b.rows; stats.snapped++; }
    else { s.rows = []; for (let v = Math.round(s.c - s.t / 2); v <= s.c + s.t / 2; v++) s.rows.push(v); }
    const lo = Math.round(s.u0), hi = Math.round(s.u1), prof = [];
    for (let u = lo; u <= hi; u++) prof.push(contrastAt(s, u, s.c, s.t));
    const inOp = u => s.ops.some(q => u >= q.s0 - 2 && u <= q.s1 + 2), solidU = prof.filter((_, k) => !inOp(lo + k));
    const drawn = solidU.length ? solidU.filter(v => v >= 12).length / solidU.length : 1;
    s.drawn = drawn;
    if (drawn < .15 && !s.w.ext && hi - lo >= minGap) { dropped.push(s); S[i] = null; continue; }
    if (drawn < .4) continue;
    // stretches of plain floor across a drawn wall: a doorway the tracing missed (or a wall end that overshoots)
    let st = null; const runs = [];
    prof.forEach((v, k) => { const e = v < 8; if (e && st === null) st = k; if ((!e || k === prof.length - 1) && st !== null) { runs.push([lo + st, lo + (e ? k + 1 : k)]); st = null; } });
    for (const [a, b2] of runs) {
      if (b2 - a < minGap) continue;
      const known = s.ops.some(q => Math.min(b2, q.s1) - Math.max(a, q.s0) > (b2 - a) * .4);
      if (known) continue;
      if (a <= s.u0 + tMed) { s.u0 = b2; continue; }
      if (b2 >= s.u1 - tMed) { s.u1 = a; continue; }
      const at = u => s.ax === 'h' ? [u, s.c] : [s.c, u], o = { type: s.w.ext ? 'window' : 'opening', a: at(a), b: at(b2), auto: true };
      added.push(o); s.ops.push({ o, s0: a, s1: b2 });
    }
  }
  stats.dropped = dropped.length; stats.added = added.length;
  const live = S.filter(Boolean);
  // ends: meet the centreline of the wall they run into
  for (const s of live) for (const end of ['u0', 'u1']) {
    const ue = s[end], tol = 6; let best = null, bd = 1e9;
    for (const o of live) {
      if (o === s || o.ax === s.ax) continue;
      const d = Math.abs(ue - o.c); if (d > o.t / 2 + s.t + tol) continue;
      if (s.c < o.u0 - s.t - tol || s.c > o.u1 + s.t + tol) continue;
      if (d < bd) { bd = d; best = o; }
    }
    if (best) s[end] = best.c;
  }
  for (const s of live) { if (s.u1 - s.u0 < 1) s.u1 = s.u0 + 1; }
  for (const s of live) {
    const { w } = s; w.t = r1(s.t);
    if (s.ax === 'h') { w.a = [s.u0, s.c]; w.b = [s.u1, s.c]; } else { w.a = [s.c, s.u0]; w.b = [s.c, s.u1]; }
  }
  // openings that sat on a dropped wall go with it
  const lostOps = new Set(dropped.flatMap(s => s.ops.map(q => q.o)));
  // openings: jambs go to the edges of the gap in the drawn wall
  for (const s of live) for (const q of s.ops) {
    stats.openings++;
    const wdt = q.s1 - q.s0, pad = Math.max(wdt * .6, 10), lo = Math.round(q.s0 - pad), hi = Math.round(q.s1 + pad), runs = [];
    let st = null; for (let u = lo; u <= hi + 1; u++) { const gap = u <= hi && fillAt(P, s, u) < .55; if (gap && st === null) st = u; if (!gap && st !== null) { runs.push([st, u]); st = null; } }
    let best = null, bo = 0; for (const [a, b] of runs) { const ov = Math.min(b, q.s1) - Math.max(a, q.s0); if (ov > bo) { bo = ov; best = [a, b]; } }
    let s0 = q.s0, s1 = q.s1;
    if (best && bo >= wdt * .3 && best[1] - best[0] >= wdt * .5 && best[1] - best[0] <= Math.max(wdt * 2, wdt + 20)) { s0 = best[0]; s1 = best[1]; stats.openSnapped++; }
    s0 = clamp(s0, s.u0, s.u1); s1 = clamp(s1, s.u0, s.u1); if (s1 - s0 < 2) continue;
    // keep a and b in Claude's order, so "hinge": "a" or "b" still names the right jamb
    const at = u => s.ax === 'h' ? [u, s.c] : [s.c, u], aWasLow = proj(s, q.o.a)[0] <= proj(s, q.o.b)[0];
    q.o.a = at(aWasLow ? s0 : s1); q.o.b = at(aWasLow ? s1 : s0);
  }
  // room outlines and drawn furniture follow the walls they sat on
  const vs = live.filter(s => s.ax === 'v'), hs = live.filter(s => s.ax === 'h');
  const snapPt = p => {
    let x = p[0], y = p[1], bx = 1e9, by = 1e9;
    for (const s of vs) { const d = Math.abs(p[0] - s.c0), tol = s.t + 8; if (d < tol && d < bx && p[1] >= s.u0 - tol && p[1] <= s.u1 + tol) { bx = d; x = s.c; } }
    for (const s of hs) { const d = Math.abs(p[1] - s.c0), tol = s.t + 8; if (d < tol && d < by && p[0] >= s.u0 - tol && p[0] <= s.u1 + tol) { by = d; y = s.c; } }
    return [x, y];
  };
  for (const r of tr.rooms || []) if (Array.isArray(r?.poly) && r.poly.every(numOk)) { r.poly = r.poly.map(snapPt); stats.rooms++; }
  const deadWalls = new Set(dropped.map(s => s.w));
  tr.walls = walls.filter(w => !deadWalls.has(w)); tr.openings = [...ops.filter(o => !lostOps.has(o)), ...added]; tr._px = { style, tMed };
  const R = p => p.map(Math.round);
  const hints = dropped.map(s => `the traced wall from (${R(s.w.a)}) to (${R(s.w.b)}) has no wall drawn under it on the plan, so it was removed`)
    .concat(added.map(o => `nothing is drawn across the wall from (${R(o.a)}) to (${R(o.b)}); it is now an ${o.type} (no door or window was traced there)`));
  return { tr, stats, hints: hints.slice(0, 30) };
}

/* ---------- printed sizes: one scale for the drawing, then walls nudged so every room measures what it says ---------- */
function fitToDims(tr) {
  const unitK = tr.units === 'm' ? 3.28084 : 1, walls = (tr.walls || []).filter(w => numOk(w?.a) && numOk(w?.b));
  const lines = { v: [], h: [] };
  for (const w of walls) { const ax = axisOf(w); if (!ax) continue; const i = ax === 'h' ? 0 : 1, j = 1 - i; lines[ax === 'h' ? 'h' : 'v'].push({ pos: w.a[j], lo: Math.min(w.a[i], w.b[i]), hi: Math.max(w.a[i], w.b[i]), t: +w.t || 8 }); }
  const clusters = ax => { const L = [...lines[ax]].sort((a, b) => a.pos - b.pos), out = []; for (const l of L) { const c = out[out.length - 1]; if (c && l.pos - c.pos < 2) { c.ls.push(l); c.pos = c.ls.reduce((s, q) => s + q.pos, 0) / c.ls.length; } else out.push({ pos: l.pos, ls: [l] }); } return out; };
  const C = { v: clusters('v'), h: clusters('h') };
  // the wall line bounding a room edge, and its thickness where it meets the room
  const edgeLine = (ax, pos, lo, hi) => { let best = -1, bd = 1e9; C[ax].forEach((c, k) => { const d = Math.abs(c.pos - pos); if (d > 3 || d >= bd) return; const ov = c.ls.reduce((s, l) => s + Math.max(0, Math.min(hi, l.hi) - Math.max(lo, l.lo)), 0); if (ov < (hi - lo) * .3) return; bd = d; best = k; });
    if (best < 0) return null; const c = C[ax][best], l = c.ls.reduce((a, q) => (Math.min(hi, q.hi) - Math.max(lo, q.lo)) > (Math.min(hi, a.hi) - Math.max(lo, a.lo)) ? q : a); return { k: best, t: l.t }; };
  const nm = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
  const rooms = (tr.rooms || []).filter(r => Array.isArray(r?.poly) && r.poly.length >= 3 && r.poly.every(numOk));
  const cons = { v: [], h: [] }, roomFit = [];
  for (const l of tr.labels || []) {
    const d = (l.dims || []).map(Number).filter(v => v > 0).map(v => v * unitK); if (d.length < 2) continue;
    const r = rooms.find(r => nm(r.name) === nm(l.room)) || rooms.find(r => nm(r.name).includes(nm(l.room)) || nm(l.room).includes(nm(r.name))); if (!r) continue;
    const rect = r.poly.every((p, i) => { const q = r.poly[(i + 1) % r.poly.length]; return Math.abs(p[0] - q[0]) < 2 || Math.abs(p[1] - q[1]) < 2; });
    if (!rect) continue;
    const xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    // L-shaped rooms: the printed size is usually the big rectangle, which the bbox only matches if the room is near-rectangular
    if (polyArea(r.poly) < (x1 - x0) * (y1 - y0) * .85) continue;
    const L = edgeLine('v', x0, y0, y1), R = edgeLine('v', x1, y0, y1), T = edgeLine('h', y0, x0, x1), B = edgeLine('h', y1, x0, x1);
    const wp = x1 - x0, hp = y1 - y0, flip = Math.abs(Math.log((d[0] / wp) / (d[1] / hp))) > Math.abs(Math.log((d[1] / wp) / (d[0] / hp)));
    const [dw, dh] = flip ? [d[1], d[0]] : [d[0], d[1]];
    if (L && R) cons.v.push({ a: L.k, b: R.k, t: (L.t + R.t) / 2, D: dw, room: r.name });
    if (T && B) cons.h.push({ a: T.k, b: B.k, t: (T.t + B.t) / 2, D: dh, room: r.name });
    roomFit.push({ room: r.name, L, R, T, B, dw, dh, printed: l.dims });
  }
  const all = [...cons.v.map(c => ({ ...c, ax: 'v' })), ...cons.h.map(c => ({ ...c, ax: 'h' }))];
  const spanPx = (c, conv) => C[c.ax][c.b].pos - C[c.ax][c.a].pos - (conv === 'interior' ? c.t : 0);
  let pick = null;
  for (const conv of ['interior', 'centre']) {
    const ss = all.map(c => c.D / spanPx(c, conv)).filter(v => v > 0 && isFinite(v)); if (ss.length < 2) continue;
    const m = median(ss), mad = median(ss.map(v => Math.abs(v / m - 1)));
    if (!pick || mad < pick.mad) pick = { conv, s: m, mad };
  }
  if (!pick) return null;
  const { conv } = pick;
  // drop room sizes that disagree with the rest (a mislabelled room or a misread number)
  const good = all.filter(c => Math.abs(c.D / spanPx(c, conv) / pick.s - 1) < .12);
  if (good.length < 2) return null;
  const s = good.reduce((a, c) => a + c.D / spanPx(c, conv), 0) / good.length;
  // least squares per axis: printed sizes are firm, the drawing's positions are soft
  const solve = ax => {
    const n = C[ax].length; if (!n) return [];
    const A = Array.from({ length: n }, () => new Float64Array(n)), b = new Float64Array(n), wA = 1, wD = 400;
    C[ax].forEach((c, k) => { A[k][k] += wA; b[k] += wA * s * c.pos; });
    for (const c of good.filter(c => c.ax === ax)) {
      const off = conv === 'interior' ? c.t * s : 0, tgt = c.D + off;   // X_b - X_a = tgt
      A[c.a][c.a] += wD; A[c.b][c.b] += wD; A[c.a][c.b] -= wD; A[c.b][c.a] -= wD; b[c.b] += wD * tgt; b[c.a] -= wD * tgt;
    }
    for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; if (!f) continue; for (let k = i; k < n; k++) A[r][k] -= f * A[i][k]; b[r] -= f * b[i]; } }
    const X = new Array(n); for (let i = n - 1; i >= 0; i--) { let v = b[i]; for (let k = i + 1; k < n; k++) v -= A[i][k] * X[k]; X[i] = v / A[i][i]; }
    return X;
  };
  const X = { v: solve('v'), h: solve('h') };
  const mono = ax => X[ax].every((v, i) => !i || v > X[ax][i - 1]);
  const warp = ax => {
    const P0 = C[ax].map(c => c.pos), P1 = X[ax].map(v => v / s);
    if (!P0.length || !mono(ax) || P1.some(v => !isFinite(v))) return p => p;
    return p => { if (p <= P0[0]) return p + P1[0] - P0[0]; const n = P0.length; if (p >= P0[n - 1]) return p + P1[n - 1] - P0[n - 1];
      let i = 1; while (P0[i] < p) i++; const f = (p - P0[i - 1]) / (P0[i] - P0[i - 1] || 1); return P1[i - 1] + f * (P1[i] - P1[i - 1]); };
  };
  const wx = warp('v'), wy = warp('h');
  const report = roomFit.map(f => {
    const meas = (ax, a, b) => a && b ? (X[ax][b.k] - X[ax][a.k]) - (conv === 'interior' ? (a.t + b.t) / 2 * s : 0) : null;
    return { room: f.room, printed: [f.dw, f.dh], before: [f.L && f.R ? (C.v[f.R.k].pos - C.v[f.L.k].pos - (conv === 'interior' ? (f.L.t + f.R.t) / 2 : 0)) * s : null, f.T && f.B ? (C.h[f.B.k].pos - C.h[f.T.k].pos - (conv === 'interior' ? (f.T.t + f.B.t) / 2 : 0)) * s : null], after: [meas('v', f.L, f.R), meas('h', f.T, f.B)] };
  });
  return { s, conv, used: good.length, total: all.length, wx, wy, report };
}
// move every point of the tracing through the size fit
function warpTrace(tr, wx, wy) {
  const W = p => numOk(p) ? [wx(+p[0]), wy(+p[1])] : p;
  for (const w of tr.walls || []) { w.a = W(w.a); w.b = W(w.b); }
  for (const o of tr.openings || []) { o.a = W(o.a); o.b = W(o.b); if (numOk(o.into)) o.into = W(o.into); }
  for (const r of tr.rooms || []) if (Array.isArray(r.poly)) r.poly = r.poly.map(W);
  for (const f of tr.fixtures || []) if (Array.isArray(f.bbox) && f.bbox.length >= 4) { const a = W([f.bbox[0], f.bbox[1]]), b = W([f.bbox[2], f.bbox[3]]); f.bbox = [a[0], a[1], b[0], b[1]]; }
  if (numOk(tr.entrance)) tr.entrance = W(tr.entrance);
  return tr;
}

/* ---------- the overlay Claude checks its own tracing against ---------- */
async function traceOverlay(src, tr) {
  const im = await loadImg(src), W = im.naturalWidth, H = im.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = .4; g.drawImage(im, 0, 0); g.globalAlpha = 1;
  const k = Math.max(1, (W + H) / 1800);
  g.lineCap = 'butt';
  for (const r of tr.rooms || []) if (Array.isArray(r.poly) && r.poly.every(numOk)) {
    g.beginPath(); r.poly.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
    g.fillStyle = 'rgba(150,60,220,.08)'; g.fill(); g.setLineDash([6 * k, 4 * k]); g.strokeStyle = 'rgba(150,60,220,.9)'; g.lineWidth = 1.5 * k; g.stroke(); g.setLineDash([]);
  }
  for (const w of tr.walls || []) if (numOk(w.a) && numOk(w.b)) { g.strokeStyle = w.ext ? 'rgba(220,20,20,.75)' : 'rgba(255,110,0,.75)'; g.lineWidth = Math.max(2, +w.t || 6); g.beginPath(); g.moveTo(w.a[0], w.a[1]); g.lineTo(w.b[0], w.b[1]); g.stroke(); }
  const col = { door: '#00a651', slider: '#00b5d8', window: '#1e4dff', opening: '#ff00b4' };
  for (const o of tr.openings || []) if (numOk(o.a) && numOk(o.b)) { g.strokeStyle = col[o.type] || '#00a651'; g.lineWidth = Math.max(4, 6 * k); g.beginPath(); g.moveTo(o.a[0], o.a[1]); g.lineTo(o.b[0], o.b[1]); g.stroke(); }
  g.font = `bold ${Math.round(12 * k)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const r of tr.rooms || []) if (Array.isArray(r.poly) && r.poly.every(numOk)) { const [x, y] = centroid(r.poly); const t = `${r.name} [${r.type}]`; g.fillStyle = 'rgba(255,255,255,.85)'; const tw = g.measureText(t).width; g.fillRect(x - tw / 2 - 3, y + 14 * k, tw + 6, 16 * k); g.fillStyle = '#7a1fd0'; g.fillText(t, x, y + 22 * k); }
  return c.toDataURL('image/jpeg', .9);
}

const PLAN_CHECK_PROMPT = (W, Hh, tr, hints) => `You are checking a tracing of a residential floor plan before it becomes a 3D model. Accuracy matters more than speed.
Image 1 is the floor plan (${W}×${Hh} pixels). Image 2 is the same plan, faded, with the current tracing drawn over it in the same pixel coordinates:
- red lines = exterior walls, orange = interior walls (line width = traced thickness)
- green = doors, cyan = sliding doors, blue = windows, magenta = openings with no door
- dashed purple outlines = rooms, labelled "name [type]"

The current tracing (pixel coordinates, origin top-left, y down):
${JSON.stringify(compactTrace(tr))}
${hints.length ? '\nThe pixel analysis of the drawing already corrected these (the drawing is the authority: do not put a removed wall back unless you can clearly see a wall drawn there; for each new opening decide whether it is a door, a window, a sliding door or an open doorway and give it that type):\n- ' + hints.join('\n- ') + '\n' : ''}
Go over the plan methodically, room by room and wall by wall, and compare it with the overlay. Never add a wall where the plan shows no drawn wall: furniture, kitchen counters, wardrobes, railings, steps, floor patterns, text boxes and dimension lines are not walls, and an open-plan boundary between two rooms (for example living to dining or kitchen) with no wall drawn stays open. Every room must have its door or opening; a doorway drawn as a gap in a wall must never be closed. Look for: walls that are missing, extra, too long or short, or in the wrong place; doors, windows and openings that are missing, misplaced, the wrong width or the wrong type; rooms that are missing, merged, mis-shaped, misnamed or of the wrong type; printed room sizes that were misread (re-read every number); door swings (hinge jamb and the room the leaf opens into); and furniture or fixtures drawn on the plan that are missing.

Reply with only the complete corrected tracing as one JSON object in exactly the same shape as above (every key, every item, including the ones that were already right). Keep correct coordinates unchanged. Add "changes": a short list of what you fixed.`;
const compactTrace = tr => {
  const R = p => numOk(p) ? [Math.round(+p[0]), Math.round(+p[1])] : p;
  return { units: tr.units, labels: tr.labels, dimLines: tr.dimLines, walls: (tr.walls || []).map(w => ({ a: R(w.a), b: R(w.b), t: w.t, ext: !!w.ext })), openings: (tr.openings || []).map(o => ({ type: o.type, a: R(o.a), b: R(o.b), ...(o.hinge ? { hinge: o.hinge } : {}), ...(numOk(o.into) ? { into: R(o.into) } : {}) })),
    rooms: (tr.rooms || []).map(r => ({ name: r.name, type: r.type, poly: (r.poly || []).map(R) })), fixtures: tr.fixtures || [], entrance: tr.entrance ?? null, north: tr.north ?? null };
};
