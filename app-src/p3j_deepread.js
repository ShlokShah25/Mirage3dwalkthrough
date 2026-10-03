/* ================= the deep read: measure the drawing, check the tracing, fix it, repeat until the checks pass =================
   The quick read gives Claude two looks at a plan. This gives it a working session, the way a person traces a plan carefully:
   - the code measures every long straight line of ink in the drawing (exact pixel positions);
   - after every change the tracing is examined: do rooms measure what the plan prints, is every wall-like line accounted for,
     is every room enclosed and reachable, is all the floor covered, does every label sit in its room;
   - Claude is shown each problem close up, with rulers and the measured lines, and answers with edits;
   - the best-scoring tracing is kept, and anything still unsettled becomes a yes/no question for the person. */

/* ---------- measuring: every long straight run of ink (level, upright, leaning and sloped) ---------- */
function inkSegments(P) {
  const { W, H, lum } = P, N = W * H, Lmin = Math.max(18, Math.round(Math.max(W, H) * .028)), B = Math.max(26, Math.round(Math.max(W, H) * .034));
  // Brochures draw walls dark and fill decks, tiles and shadows in mid grey. A second, darker cut separates the two,
  // so a wall beside a grey fill is still measured as a wall. Lines found in the dark cut win; the ordinary cut adds the rest.
  const hist = new Float64Array(256); let nInk = 0, sum = 0; for (let i = 0; i < N; i++) if (P.ink[i]) { hist[lum[i]]++; nInk++; sum += lum[i]; }
  let wB = 0, sB = 0, bestV = 0, T2 = 0; for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = nInk - wB; if (!wF) break; sB += t * hist[t]; const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2; if (v > bestV) { bestV = v; T2 = t + 1; } }
  const masks = [P.ink]; if (T2 > 30 && T2 < (P.T || 140) - 18) { const dark = new Uint8Array(N); let nd = 0; for (let i = 0; i < N; i++) if (lum[i] < T2) { dark[i] = 1; nd++; } if (nd > nInk * .12) masks.unshift(dark); }
  const out = [];
  for (let mi = 0; mi < masks.length; mi++) {
    const { ink, hr, vr } = solidRemoved(masks[mi], W, H, B); if (mi === masks.length - 1) P.fill = ink;
    const segs = bandSegments(ink, lum, W, H, Lmin); segs.push(...slopedSegments(P, ink, hr, vr, segs, Lmin));
    for (const sg of segs) { const d = segDir(sg); let dup = false;
      for (const o of out) { if (!parallel(segDir(o), d)) continue; let k = 0; for (let q = 0; q < 7; q++) { const p = segPt(sg, (q + .5) / 7), od = segDir(o), rx = p[0] - o.a[0], ry = p[1] - o.a[1], u = rx * od[0] + ry * od[1], v = Math.abs(rx * od[1] - ry * od[0]); if (u >= -4 && u <= o.len + 4 && v <= o.t / 2 + Math.max(4, sg.t / 2)) k++; } if (k >= 5) { dup = true; break; } }
      if (!dup) out.push(sg); }
  }
  out.sort((a, b) => b.len * Math.sqrt(b.t) - a.len * Math.sqrt(a.t));
  const kept = out.slice(0, 900), n = { h: 0, v: 0, s: 0 }; for (const s of kept) s.id = s.ax.toUpperCase() + (++n[s.ax]);
  // hatching and filled areas (terrace decking, tiles, rugs) are full of long runs of ink: a wall has clear floor on at least one side
  for (const s of kept) { const d = segDir(s), nrm = [-d[1], d[0]], dens = sg => { let k = 0, n2 = 0; for (let q = 0; q < 14; q++) { const p = segPt(s, (q + .5) / 14); for (let o = 3; o <= 11; o += 2) { const x = Math.round(p[0] + nrm[0] * sg * (s.t / 2 + o)), y = Math.round(p[1] + nrm[1] * sg * (s.t / 2 + o)); if (x < 0 || y < 0 || x >= W || y >= H) continue; n2++; k += P.ink[y * W + x]; } } return n2 ? k / n2 : 0; }; s.hatch = dens(1) > .3 && dens(-1) > .3; }
  return kept;
}
// filled areas (decking, tiles, rugs, solid blocks) are not lines: drop ink that is wide in every direction.
// Where two thick walls cross the ink is long both ways but short on the diagonals, so crossings are kept.
function solidRemoved(mask, W, H, B) {
  const N = W * H, hr = new Uint16Array(N), vr = new Uint16Array(N), d1 = new Uint16Array(N), d2 = new Uint16Array(N);
  for (let y = 0; y < H; y++) { let st = -1; for (let x = 0; x <= W; x++) { const on = x < W && mask[y * W + x]; if (on && st < 0) st = x; if (!on && st >= 0) { const n = Math.min(65535, x - st); for (let k = st; k < x; k++) hr[y * W + k] = n; st = -1; } } }
  for (let x = 0; x < W; x++) { let st = -1; for (let y = 0; y <= H; y++) { const on = y < H && mask[y * W + x]; if (on && st < 0) st = y; if (!on && st >= 0) { const n = Math.min(65535, y - st); for (let k = st; k < y; k++) vr[k * W + x] = n; st = -1; } } }
  const diag = (dst, dx) => { for (let s0 = -H; s0 < W + H; s0++) { let x = dx > 0 ? s0 : s0, y = 0; if (dx > 0) { if (x < 0) { y = -x; x = 0; } } else { if (x >= W) { y = x - W + 1; x = W - 1; } } let run = [];
      for (; x >= 0 && x < W && y < H; x += dx, y++) { const i = y * W + x; if (mask[i]) run.push(i); else if (run.length) { for (const j of run) dst[j] = Math.min(65535, run.length); run = []; } } for (const j of run) dst[j] = Math.min(65535, run.length); } };
  diag(d1, 1); diag(d2, -1);
  const ink = new Uint8Array(mask), Bd = Math.round(B * .75);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (hr[i] >= B && vr[i] >= B && d1[i] >= Bd && d2[i] >= Bd) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) ink[Y * W + X] = 0; } }
  return { ink, hr, vr };
}
function bandSegments(ink, lum, W, H, Lmin) {
  const out = [];
  for (const ax of ['h', 'v']) {
    const U = ax === 'h' ? W : H, V = ax === 'h' ? H : W, at = (u, v) => ax === 'h' ? v * W + u : u * W + v;
    // mark pixels that sit in a run of at least Lmin along the axis (gaps of up to 2 px are bridged)
    const m = new Uint8Array(W * H);
    for (let v = 0; v < V; v++) {
      let st = -1, gap = 0;
      for (let u = 0; u <= U; u++) {
        const on = u < U && ink[at(u, v)];
        if (on) { if (st < 0) st = u; gap = 0; }
        else if (st >= 0 && (++gap > 2 || u === U)) { const en = u - gap; if (en - st + 1 >= Lmin) for (let k = st; k <= en; k++) m[at(k, v)] = 1; st = -1; gap = 0; }
      }
    }
    // join neighbouring rows into bands
    const seen = new Uint8Array(W * H), stack = [];
    for (let v0 = 0; v0 < V; v0++) for (let u0 = 0; u0 < U; u0++) {
      const i0 = at(u0, v0); if (!m[i0] || seen[i0]) continue;
      let ua = u0, ub = u0; const px = []; stack.push(u0, v0); seen[i0] = 1;
      while (stack.length) {
        const v = stack.pop(), u = stack.pop(); px.push(u, v); if (u < ua) ua = u; if (u > ub) ub = u;
        for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1], [3, 0], [-3, 0]]) { const u2 = u + du, v2 = v + dv; if (u2 < 0 || v2 < 0 || u2 >= U || v2 >= V) continue; const j = at(u2, v2); if (m[j] && !seen[j]) { seen[j] = 1; stack.push(u2, v2); } }
      }
      // thickness along the band; where it changes a lot (a thin partition running into a thick wall) the band is cut
      const n = ub - ua + 1, lo = new Int32Array(n).fill(1e9), hi = new Int32Array(n).fill(-1), cnt = new Int32Array(n), dk = new Float64Array(n);
      for (let k = 0; k < px.length; k += 2) { const j = px[k] - ua, v = px[k + 1]; if (v < lo[j]) lo[j] = v; if (v > hi[j]) hi[j] = v; cnt[j]++; dk[j] += lum[at(px[k], v)]; }
      const cls = j => cnt[j] ? Math.round(Math.log2(cnt[j]) * 1.6) : -9, runs = [];
      for (let j = 0; j < n; j++) { const c = cls(j), r = runs[runs.length - 1]; if (r && r.c === c) r.b = j; else runs.push({ a: j, b: j, c }); }
      for (let k = 0; k < runs.length; k++) if (runs[k].b - runs[k].a + 1 < 8 && runs.length > 1) { if (runs[k - 1]) runs[k - 1].b = runs[k].b; else runs[k + 1].a = runs[k].a; runs.splice(k--, 1); }
      for (let k = 1; k < runs.length; k++) { const A = runs[k - 1], Bn = runs[k], ta = median(Array.from(cnt.subarray(A.a, A.b + 1))), tb = median(Array.from(cnt.subarray(Bn.a, Bn.b + 1))); if (Math.max(ta, tb) < Math.min(ta, tb) * 2.3 + 3) { A.b = Bn.b; runs.splice(k--, 1); } }
      for (const r of runs) {
        const len = r.b - r.a + 1; if (len < Lmin * .55) continue;
        let pix = 0, dark = 0; const ts = [], us = [];
        for (let j = r.a; j <= r.b; j++) { if (!cnt[j]) continue; pix += cnt[j]; dark += dk[j]; ts.push((lo[j] + hi[j] + 1) / 2); us.push(ua + j + .5); }
        const t = Math.max(1, Math.round(pix / len));
        if (len < t * 2.2) continue;                                       // a block, not a line
        // does the band lean? fit its centre along its length (photographed plans and angled walls)
        const mu = us.reduce((a, v) => a + v, 0) / us.length, mt = ts.reduce((a, v) => a + v, 0) / ts.length; let sxx = 0, sxy = 0; for (let q = 0; q < us.length; q++) { sxx += (us[q] - mu) ** 2; sxy += (us[q] - mu) * (ts[q] - mt); }
        const k = sxx ? sxy / sxx : 0; let rss = 0; for (let q = 0; q < us.length; q++) rss += (ts[q] - mt - k * (us[q] - mu)) ** 2;
        const u0 = ua + r.a, u1 = ua + r.b + 1, lean = Math.abs(k) >= .035 && Math.abs(k) * len >= 3 && Math.sqrt(rss / us.length) < 1.6, c = Math.round(median(ts) * 2) / 2;
        const c0 = lean ? mt + k * (u0 - mu) : c, c1 = lean ? mt + k * (u1 - mu) : c, tt = lean ? Math.max(1, Math.round(t / Math.sqrt(1 + k * k))) : t;
        out.push({ ax: lean ? 's' : ax, a: ax === 'h' ? [u0, c0] : [c0, u0], b: ax === 'h' ? [u1, c1] : [c1, u1], t: tt, len, lum: dark / pix });
      }
    }
  }
  return out;
}
// walls drawn at an angle: a Hough search over the thick ink the level and upright lines did not use
function slopedSegments(P, ink, hr, vr, segs, Lmin) {
  const { W, H, lum } = P, m = new Uint8Array(W * H); let N = 0;
  for (let i = 0; i < W * H; i++) if (ink[i] && hr[i] >= 3 && vr[i] >= 3) m[i] = 1;
  for (const s of segs) { const b = boxPad(segBox(s), 2, W, H); if (s.ax === 's') { const d = segDir(s), L = s.len; for (let q = -2; q <= L + 2; q += .6) for (let v = -s.t / 2 - 3; v <= s.t / 2 + 3; v += .6) { const x = Math.round(s.a[0] + d[0] * q - d[1] * v), y = Math.round(s.a[1] + d[1] * q + d[0] * v); if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = 0; } } else for (let y = Math.floor(b[1]); y < b[3]; y++) for (let x = Math.floor(b[0]); x < b[2]; x++) m[y * W + x] = 0; }
  for (let i = 0; i < W * H; i++) N += m[i];
  if (N < Lmin * 4) return [];
  const stride = Math.max(1, Math.ceil(N / 60000)), diag = Math.ceil(Math.hypot(W, H)), nR = 2 * diag + 1, angs = [];
  for (let d = 8; d <= 172; d++) if (Math.abs(d - 90) >= 8) angs.push(d * Math.PI / 180);
  const cs = angs.map(Math.cos), sn = angs.map(Math.sin), acc = new Int32Array(angs.length * nR);
  let q = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!m[y * W + x] || (q++ % stride)) continue; for (let k = 0; k < angs.length; k++) acc[k * nR + Math.round(x * sn[k] - y * cs[k]) + diag]++; }
  const out = [], on = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < W && y < H && m[y * W + x]; };
  for (let it = 0; it < 60; it++) {
    let best = 0, bi = -1; for (let i = 0; i < acc.length; i++) if (acc[i] > best) { best = acc[i]; bi = i; }
    if (best * stride < Lmin * 1.2) break;
    const k = (bi / nR) | 0, ri = bi % nR, rho = ri - diag, d = [cs[k], sn[k]], n = [sn[k], -cs[k]];
    for (let dk = -3; dk <= 3; dk++) { const kk = k + dk; if (kk < 0 || kk >= angs.length) continue; for (let dr = -6; dr <= 6; dr++) { const r = ri + dr; if (r >= 0 && r < nR) acc[kk * nR + r] = 0; } }
    let st = null, gap = 0; const runs = [];
    for (let t = -diag; t <= diag; t++) { const o = on(rho * n[0] + t * d[0], rho * n[1] + t * d[1]); if (o) { if (st === null) st = t; gap = 0; } else if (st !== null && ++gap > 3) { runs.push([st, t - gap]); st = null; gap = 0; } }
    for (const [t0, t1] of runs) {
      if (t1 - t0 < Lmin * 1.3) continue;
      const ths = [], pts = [];
      for (let t = t0; t <= t1; t += 2) { const x = rho * n[0] + t * d[0], y = rho * n[1] + t * d[1]; let up = 0, dn = 0; while (up < 40 && on(x + n[0] * (up + 1), y + n[1] * (up + 1))) up++; while (dn < 40 && on(x - n[0] * (dn + 1), y - n[1] * (dn + 1))) dn++; ths.push(up + dn + 1); pts.push([t, (up - dn) / 2, up + dn + 1]); }
      const th = median(ths); if (t1 - t0 < th * 3.5) continue;
      const good = pts.filter(p => p[2] <= th * 1.5 + 1), mt = good.reduce((a, p) => a + p[0], 0) / good.length, mo = good.reduce((a, p) => a + p[1], 0) / good.length; let sxx = 0, sxy = 0; for (const p of good) { sxx += (p[0] - mt) ** 2; sxy += (p[0] - mt) * (p[1] - mo); }
      const kk = sxx ? sxy / sxx : 0, off = t => mo + kk * (t - mt), pt = t => [rho * n[0] + t * d[0] + n[0] * off(t), rho * n[1] + t * d[1] + n[1] * off(t)], a = pt(t0), b = pt(t1);
      let dark = 0, nd = 0; for (let t = t0; t <= t1; t += 2) { const p = pt(t), x = Math.round(p[0]), y = Math.round(p[1]); if (x >= 0 && y >= 0 && x < W && y < H) { dark += lum[y * W + x]; nd++; } }
      out.push({ ax: 's', a, b, t: th, len: Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])), lum: nd ? dark / nd : 0 });
      for (let t = t0 - 2; t <= t1 + 2; t += .6) for (let v = -th / 2 - 3; v <= th / 2 + 3; v += .6) { const p = pt(t), x = Math.round(p[0] + n[0] * v), y = Math.round(p[1] + n[1] * v); if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = 0; }
    }
  }
  return out;
}
const segDir = s => { const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1; return [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L]; };
const segPt = (s, q) => [s.a[0] + (s.b[0] - s.a[0]) * q, s.a[1] + (s.b[1] - s.a[1]) * q];
const segPoly = s => { const d = segDir(s), h = s.t / 2; return [[s.a[0] - d[1] * h, s.a[1] + d[0] * h], [s.b[0] - d[1] * h, s.b[1] + d[0] * h], [s.b[0] + d[1] * h, s.b[1] - d[0] * h], [s.a[0] + d[1] * h, s.a[1] - d[0] * h]]; };
const segBox = s => { const p = segPoly(s); return [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))]; };
const segEnds = s => [s.a, s.b];
const boxPad = (b, p, W, H) => [Math.max(0, b[0] - p), Math.max(0, b[1] - p), Math.min(W, b[2] + p), Math.min(H, b[3] + p)];
const boxHit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/* ---------- examining a tracing ---------- */
const MUST_ENCLOSE = new Set(['bedroom', 'master', 'bath', 'walkin', 'staff', 'utility', 'study', 'pooja', 'cabin', 'meeting']);
function wallFrames(tr) {
  return (tr.walls || []).map((w, i) => { if (!numOk(w?.a) || !numOk(w?.b)) return null; const ax = axisOf(w), k = ax === 'h' ? 0 : 1, j = 1 - k, L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, d = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
    return ax ? { i, w, ax, d, u0: Math.min(w.a[k], w.b[k]), u1: Math.max(w.a[k], w.b[k]), c: (w.a[j] + w.b[j]) / 2, t: clamp(+w.t || 6, 2, 80) } : { i, w, ax: null, d }; }).filter(Boolean);
}
function distToWalls(WF, p, tol) {   // is p on (within tol of) a traced wall?
  for (const f of WF) {
    if (f.ax) { const u = f.ax === 'h' ? p[0] : p[1], v = f.ax === 'h' ? p[1] : p[0]; if (u >= f.u0 - tol && u <= f.u1 + tol && Math.abs(v - f.c) <= f.t / 2 + tol) return f; }
    else { const a = f.w.a, b = f.w.b, dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0, 1); if (Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) <= (+f.w.t || 6) / 2 + tol) return f; }
  }
  return null;
}
const parallel = (d1, d2) => Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) < .42;      // within about 25°
// Room sizes the way a person checks them: measure across each room between the faces of the walls on either side,
// in several places, and compare with the size printed in the room. Works whatever shape the outline was traced in.
function measureRooms(tr, WF, doorW) {
  const unitK = tr.units === 'm' ? 3.28084 : 1, nm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rooms = (tr.rooms || []).filter(r => Array.isArray(r?.poly) && r.poly.length >= 3 && r.poly.every(numOk));
  const endPad = (median(WF.map(f => +f.w.t || 6)) || 6) / 2 + 2;
  const cast = (p, d) => { let best = null; for (const f of WF) { const a = f.w.a, b = f.w.b, ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1, den = d[0] * ey - d[1] * ex, sin = Math.abs(den) / L; if (sin < .45) continue;
      const s = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den; if (s <= 0) continue; const hw = (+f.w.t || 6) / 2, u = ((p[0] + d[0] * s - a[0]) * ex + (p[1] + d[1] * s - a[1]) * ey) / (L * L), pad = endPad / L; if (u < -pad || u > 1 + pad) continue;
      const face = Math.max(0, s - hw / sin); if (!best || face < best.face) best = { face, c: s, i: f.i }; } return best; };
  const out = [];
  for (const l of tr.labels || []) {
    const D = (l.dims || []).map(Number).filter(v => v > 0).map(v => v * unitK); if (D.length < 2) continue;
    const r = rooms.find(r => nm(r.name) === nm(l.room)) || rooms.find(r => nm(r.name).includes(nm(l.room)) || nm(l.room).includes(nm(r.name)));
    if (!r) { out.push({ room: l.room, D, missing: true, m: [null, null] }); continue; }
    const xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]), bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], c = centroid(r.poly), m = [null, null];
    for (const k of [0, 1]) {                 // k = 0: left-to-right, 1: top-to-bottom
      const j = 1 - k, span = bb[2 + k] - bb[k], reach = Math.max(doorW * .9, span * .22), hits = [];
      for (let q = 0; q < 11; q++) {
        const v = bb[j] + (q + .5) / 11 * (bb[2 + j] - bb[j]); let start = null;
        for (const f of [.5, .35, .65, .2, .8]) { const u = bb[k] + f * span, p = k ? [v, u] : [u, v]; if (pip(p, r.poly)) { start = p; break; } }
        if (!start) continue;
        const A = cast(start, k ? [0, -1] : [-1, 0]), B = cast(start, k ? [0, 1] : [1, 0]); if (!A || !B) continue;
        const fa = start[k] - A.face, fb = start[k] + B.face;        // the two wall faces
        if (fa < bb[k] - reach || fb > bb[2 + k] + reach) continue;  // no wall on that side near the room: an open side here
        hits.push({ span: fb - fa, cspan: A.c + B.c, fa, fb, wa: A.i, wb: B.i });
      }
      if (hits.length >= 5) { hits.sort((a, b) => a.span - b.span); m[k] = { ...hits[hits.length >> 1], n: hits.length }; }   // walls on both sides along most of the room, not just at a corner
    }
    out.push({ room: r.name, r, D, m, at: c, bb });
  }
  // which printed number is which direction, and the scale (pixels per foot). A photographed plan is squeezed a little
  // more one way than the other and drifts across the page, so each direction has its own scale, allowed to drift gently.
  const both = out.filter(o => o.m[0] && o.m[1]);
  for (const o of both) { const wp = o.m[0].span, hp = o.m[1].span, d = o.D; o.flip = Math.abs(Math.log((d[0] / wp) / (d[1] / hp))) > Math.abs(Math.log((d[1] / wp) / (d[0] / hp))) + .06; }
  const obs = conv => out.flatMap(o => [0, 1].filter(k => o.m[k] && o.flip != null).map(k => ({ o, k, r: (conv ? o.m[k].cspan : o.m[k].span) / (o.flip ? o.D[1 - k] : o.D[k]) })));
  const axisMed = ob => { const all = median(ob.map(x => x.r)); return [0, 1].map(k => { const v = ob.filter(x => x.k === k).map(x => x.r); return v.length >= 3 ? median(v) : all; }); };
  let pick = null; for (const conv of [0, 1]) { const ob = obs(conv); if (ob.length < 2) continue; const md = axisMed(ob), mad = median(ob.map(x => Math.abs(x.r / md[x.k] - 1))); if (!pick || mad < pick.mad - .004) pick = { conv, md, mad, s: median(ob.map(x => x.r)) }; }
  if (!pick) return { rooms: out, s: null, conv: 0, scaleAt: () => null };
  for (const o of out) if (o.flip == null && (o.m[0] || o.m[1])) { const k = o.m[0] ? 0 : 1, f = (pick.conv ? o.m[k].cspan : o.m[k].span) / pick.md[k]; o.flip = Math.abs(Math.log(f / o.D[1 - k])) < Math.abs(Math.log(f / o.D[k])) - .12; }
  const all = obs(pick.conv).filter(x => Math.abs(x.r / pick.md[x.k] - 1) < .25), md = axisMed(all);
  const fitAxis = k => {
    const ob = all.filter(x => x.k === k); let co = [md[k], 0, 0]; if (ob.length < 8) return co;
    const cx = ob.reduce((a, x) => a + x.o.at[0], 0) / ob.length, cy = ob.reduce((a, x) => a + x.o.at[1], 0) / ob.length, w = ob.map(() => 1);
    for (let it = 0; it < 4; it++) {
      const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bv = [0, 0, 0];
      ob.forEach((x, q) => { const v = [1, x.o.at[0] - cx, x.o.at[1] - cy]; for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) S[i][j] += w[q] * v[i] * v[j]; bv[i] += w[q] * v[i] * x.r; } });
      const M = S.map((r, i) => [...r, bv[i]]); let okM = true;
      for (let i = 0; i < 3 && okM; i++) { let pv = i; for (let q = i + 1; q < 3; q++) if (Math.abs(M[q][i]) > Math.abs(M[pv][i])) pv = q; [M[i], M[pv]] = [M[pv], M[i]]; if (Math.abs(M[i][i]) < 1e-9) { okM = false; break; } for (let q = 0; q < 3; q++) if (q !== i) { const f = M[q][i] / M[i][i]; for (let j = i; j < 4; j++) M[q][j] -= f * M[i][j]; } }
      if (!okM) return [md[k], 0, 0]; const sol = M.map((r, i) => r[3] / r[i]);
      co = [sol[0] - sol[1] * cx - sol[2] * cy, sol[1], sol[2]];
      ob.forEach((x, q) => { const e = Math.abs(x.r / (co[0] + co[1] * x.o.at[0] + co[2] * x.o.at[1]) - 1); w[q] = e < .025 ? 1 : .025 / e; });
    }
    // a photo's scale drifts by a few percent, not more: otherwise keep one scale for this direction
    const ex = [Math.min(...ob.map(x => x.o.at[0])), Math.max(...ob.map(x => x.o.at[0])), Math.min(...ob.map(x => x.o.at[1])), Math.max(...ob.map(x => x.o.at[1]))];
    return Math.abs(co[1]) * (ex[1] - ex[0]) > md[k] * .08 || Math.abs(co[2]) * (ex[3] - ex[2]) > md[k] * .08 || !(co[0] > 0) ? [md[k], 0, 0] : co;
  };
  const cos = [fitAxis(0), fitAxis(1)], scaleAt = (p, k) => cos[k][0] + cos[k][1] * p[0] + cos[k][2] * p[1];
  for (const o of out) { o.ft = [null, null]; o.want = o.flip ? [o.D[1], o.D[0]] : o.D.slice(0, 2); for (const k of [0, 1]) if (o.m[k]) o.ft[k] = (pick.conv ? o.m[k].cspan : o.m[k].span) / scaleAt(o.at, k); }
  return { rooms: out, s: pick.s, conv: pick.conv, scaleAt, axis: [cos[0][0] + cos[0][1] * (out[0]?.at?.[0] || 0) + cos[0][2] * (out[0]?.at?.[1] || 0), cos[1][0]].map(v => Math.round(v * 100) / 100), md };
}
function auditTrace(tr, P, SEGS, dismissed = new Set()) {
  const issues = [], W = P.W, H = P.H, add = (id, kind, pen, text, box) => issues.push({ id, kind, pen, text, box: box.map(Math.round), off: dismissed.has(id) });
  const WF = wallFrames(tr), ops = (tr.openings || []).filter(o => numOk(o?.a) && numOk(o?.b));
  const rooms = (tr.rooms || []).map((r, i) => ({ i, r, poly: Array.isArray(r?.poly) && r.poly.length >= 3 && r.poly.every(numOk) ? r.poly : null })).filter(x => x.poly);
  const bboxOf = poly => [Math.min(...poly.map(p => p[0])), Math.min(...poly.map(p => p[1])), Math.max(...poly.map(p => p[0])), Math.max(...poly.map(p => p[1]))];
  const tMed = median(WF.filter(f => f.ax).map(f => f.t)) || 6;
  const doorW = median(ops.filter(o => o.type === 'door').map(o => Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]))) || Math.max(16, Math.max(W, H) * .03);
  const nm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. printed sizes: does each room measure what the plan says, between the faces of its walls?
  const MR = measureRooms(tr, WF, doorW), sizes = []; let sizedOk = 0, sized = 0;
  const dirName = ['left-to-right', 'top-to-bottom'], where = (o, k) => `between walls[${o.m[k].wa}] (face at ${k ? 'y' : 'x'}=${Math.round(o.m[k].fa)}) and walls[${o.m[k].wb}] (face at ${k ? 'y' : 'x'}=${Math.round(o.m[k].fb)})`;
  for (const o of MR.rooms) {
    if (o.missing) continue;
    const type = normType(o.r.type, o.r.name), bad = [0, 1].filter(k => o.ft[k] != null && Math.abs(o.ft[k] - o.want[k]) > Math.max(.45, o.want[k] * .045));
    if (o.ft.some(v => v != null)) { sized++; if (!bad.length) sizedOk++; }
    sizes.push(`${o.room}: prints ${o.want.map(fmtFtIn).join(' × ')}, measures ${o.ft.map((v, k) => v == null ? 'open side' : `${fmtFtIn(v)} (${Math.round(o.m[k].span)} px)`).join(' × ')}${bad.length ? '  ← OFF' : ''}`);
    if (bad.length) add('size:' + o.room, 'size', 6, `"${o.room}" prints ${o.want.map(fmtFtIn).join(' × ')} (left-to-right × top-to-bottom) but ${bad.map(k => `${dirName[k]} it measures ${fmtFtIn(o.ft[k])} ${where(o, k)}: ${fmtFtIn(Math.abs(o.ft[k] - o.want[k]))} too ${o.ft[k] > o.want[k] ? 'big' : 'small'} (about ${Math.round(Math.abs(o.ft[k] - o.want[k]) * MR.scaleAt(o.at, k))} px)`).join('; and ')}. One of those walls is in the wrong place or has the wrong thickness, a wall of this room is missing, or the printed size was misread.`, boxPad(o.bb, tMed * 2, W, H));
    else if (o.ft.every(v => v == null) && !['terrace', 'balcony'].includes(type)) add('unsized:' + o.room, 'unsized', 2, `"${o.room}" prints ${o.D.slice(0, 2).map(fmtFtIn).join(' × ')} but no pair of facing walls was found on its sides, so its size cannot be checked. Its walls are missing or its outline is in the wrong place (dismiss this if the room really is open on two adjoining sides).`, boxPad(o.bb, tMed * 2, W, H));
  }
  const labelled = (tr.labels || []).filter(l => (l.dims || []).filter(v => +v > 0).length >= 2);
  if (!MR.s && labelled.length >= 2) add('scale', 'scale', 10, `The plan prints ${labelled.length} room sizes but none could be measured between traced walls. Check that the sized rooms exist, are named as printed, and have their walls traced.`, [0, 0, W, H]);

  // 2. wall-like ink the tracing does not explain
  const fx = (tr.fixtures || []).filter(f => Array.isArray(f?.bbox) && f.bbox.length >= 4).map(f => [Math.min(f.bbox[0], f.bbox[2]), Math.min(f.bbox[1], f.bbox[3]), Math.max(f.bbox[0], f.bbox[2]), Math.max(f.bbox[1], f.bbox[3])]);
  const dls = (tr.dimLines || []).filter(d => numOk(d?.a) && numOk(d?.b)), names = (tr.labels || []).filter(l => numOk(l.pos));
  const thick = median(SEGS.filter(s => s.t >= 4).map(s => s.t)) || tMed, hull = WF.length ? bboxOf(WF.flatMap(f => [f.w.a, f.w.b])) : [0, 0, W, H];
  let wallInk = 0, wallInkExplained = 0; const loose = [];
  const wallLum = median(SEGS.filter(s => s.t >= 4 && distToWalls(WF.filter(f => parallel(f.d, segDir(s))), segPt(s, .5), 3)).map(s => s.lum)) || 70;
  for (const s of SEGS) {
    const wallLike = s.t >= Math.max(3, tMed * .55) && s.t <= Math.max(tMed, thick) * 2.6, longThin = s.t < Math.max(3, tMed * .55) && s.len >= doorW * 2.6;
    if (!wallLike && !longThin) continue;
    const b = segBox(s), d = segDir(s), nrm = [-d[1], d[0]], mid = segPt(s, .5); if (!boxHit(b, boxPad(hull, tMed * 3, W, H))) continue;      // titles, borders, legends outside the home
    if (s.ax !== 's' && s.len > (s.ax === 'h' ? W : H) * .92) continue;                 // a page border
    if (s.ax === 'h' && s.len < doorW * 3.2 && names.some(l => Math.abs(l.pos[0] - mid[0]) < doorW * 1.8 && Math.abs(l.pos[1] - mid[1]) < doorW * .7)) continue;   // the lettering of a room name
    // covered by a traced wall along most of its length?
    let cov = 0; const n = Math.max(6, Math.round(s.len / 6));
    const along = WF.filter(f => parallel(f.d, d)); for (let k = 0; k < n; k++) if (distToWalls(along, segPt(s, (k + .5) / n), Math.max(4, tMed * .6))) cov++;
    const frac = cov / n; if (wallLike) { wallInk += s.len; wallInkExplained += s.len * Math.min(1, frac / .7); }
    if (frac >= .6) continue;
    if (fx.some(q => { const p = boxPad(q, 5, W, H); return b[0] >= p[0] && b[1] >= p[1] && b[2] <= p[2] && b[3] <= p[3]; })) continue;   // the outline of drawn furniture
    if (dls.some(l => { const [e0, e1] = segEnds(s); return Math.hypot(e0[0] - l.a[0], e0[1] - l.a[1]) + Math.hypot(e1[0] - l.b[0], e1[1] - l.b[1]) < 30 || Math.hypot(e0[0] - l.b[0], e0[1] - l.b[1]) + Math.hypot(e1[0] - l.a[0], e1[1] - l.a[1]) < 30; })) continue;
    if (s.hatch) continue;                                                // hatching, decking, tiles
    if (s.t >= 5 && s.lum > wallLum + 45) continue;                       // a pale band beside dark walls is a fill (rug, counter top), not a wall
    // a wall meets other walls or separates two spaces; a line floating inside one room is furniture, a rug or a counter
    const [e0, e1] = segEnds(s), reach = tMed * 1.5 + 6, touch = [e0, e1].filter(e => WF.some(f => !parallel(f.d, d) && distToWalls([f], e, reach))).length;
    const off = s.t / 2 + 5, sides = [.25, .5, .75].map(q => { const p = segPt(s, q); return [rooms.find(x => pip([p[0] + nrm[0] * off, p[1] + nrm[1] * off], x.poly)), rooms.find(x => pip([p[0] - nrm[0] * off, p[1] - nrm[1] * off], x.poly))]; });
    const oneRoom = sides.every(([a, b2]) => a && a === b2 && a === sides[0][0]);
    if (oneRoom && touch === 0) continue;
    if (oneRoom && touch === 1 && !wallLike) continue;
    loose.push({ s, frac, wallLike, weight: s.len * (wallLike ? 2.5 : 1) * (1 - frac) * (oneRoom ? .5 : 1.5) * (touch === 2 ? 1.6 : 1) });
  }
  loose.sort((a, b) => b.weight - a.weight);
  for (const { s, frac, wallLike } of loose.slice(0, 9)) {
    const [e0, e1] = segEnds(s), near = WF.filter(f => parallel(f.d, segDir(s)) && distToWalls([f], segPt(s, .5), s.t + 8))[0];
    add('ink:' + s.id, 'ink', wallLike ? 4 : 2, `Line ${s.id}: a ${wallLike ? 'wall-thick' : 'long thin'} ${s.ax === 'h' ? 'horizontal' : s.ax === 'v' ? 'vertical' : 'sloping'} line of ink from (${Math.round(e0[0])},${Math.round(e0[1])}) to (${Math.round(e1[0])},${Math.round(e1[1])}), ${Math.round(s.t)} px thick, is ${frac > .1 ? `only ${Math.round(frac * 100)}% ` : 'not '}covered by a traced wall${near ? ` (walls[${near.i}] runs beside it, a few pixels off or too short)` : ''}. If it is a wall (or part of one), add, move or extend the wall; if it is furniture, a counter, a railing, a step, a floor pattern or a dimension line, dismiss it.`, boxPad(segBox(s), 10, W, H));
  }

  // 3. room outlines: enclosed where they must be, with a way in
  const sideRooms = (p, n, d) => [rooms.find(x => pip([p[0] + n[0] * d, p[1] + n[1] * d], x.poly)), rooms.find(x => pip([p[0] - n[0] * d, p[1] - n[1] * d], x.poly))];
  const links = new Map(rooms.map(x => [x.i, new Set()])), hasWay = new Set(), outside = new Set();
  for (const o of ops) {
    if (o.type === 'window') continue;
    const m = [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2], L = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) || 1, n = [-(o.b[1] - o.a[1]) / L, (o.b[0] - o.a[0]) / L];
    const [A, B] = sideRooms(m, n, tMed / 2 + Math.max(6, doorW * .35));
    if (A) hasWay.add(A.i); if (B) hasWay.add(B.i);
    if (A && B && A !== B) { links.get(A.i).add(B.i); links.get(B.i).add(A.i); }
    if ((A && !B) || (B && !A)) outside.add((A || B).i);
  }
  for (const x of rooms) {
    const type = normType(x.r.type, x.r.name), must = MUST_ENCLOSE.has(type), n = x.poly.length; let open = 0, per = 0, worst = null;
    for (let k = 0; k < n; k++) {
      const a = x.poly[k], b = x.poly[(k + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 2) continue; per += L;
      const steps = Math.max(2, Math.round(L / 5)); let run = 0, runStart = null;
      for (let q = 0; q <= steps; q++) {
        const p = [a[0] + (b[0] - a[0]) * q / steps, a[1] + (b[1] - a[1]) * q / steps], on = q < steps && !distToWalls(WF, p, 5);
        if (on) { if (!run) runStart = p; run += L / steps; }
        if ((!on || q === steps) && run) {
          open += run;
          if (run > doorW * .8) {       // an open stretch: what is on the other side?
            const mid = [(runStart[0] + p[0]) / 2, (runStart[1] + p[1]) / 2], nn = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L], [A, B] = sideRooms(mid, nn, tMed / 2 + 8), other = A === x ? B : A;
            if (other && other !== x) { links.get(x.i).add(other.i); links.get(other.i).add(x.i); hasWay.add(x.i); hasWay.add(other.i); }
            if (must && run > doorW * 1.5 && (!worst || run > worst.run)) worst = { run, a: runStart, b: p };
          }
          run = 0;
        }
      }
    }
    if (worst) add('open:' + x.r.name, 'open', 5, `"${x.r.name}" (${type}) has no wall along its outline from (${worst.a.map(Math.round)}) to (${worst.b.map(Math.round)}). Either a wall is missing there, or the room outline does not follow its walls, or it is a doorway that should be listed as an opening.`, boxPad([Math.min(worst.a[0], worst.b[0]), Math.min(worst.a[1], worst.b[1]), Math.max(worst.a[0], worst.b[0]), Math.max(worst.a[1], worst.b[1])], doorW * 1.5, W, H));
    if (!hasWay.has(x.i) && !['other'].includes(type) && polyArea(x.poly) > doorW * doorW * 1.2) add('noway:' + x.r.name, 'noway', 6, `"${x.r.name}" has no door, sliding door or opening on any of its walls. Find its door on the plan (look for a swing arc or a gap in the wall) and add it.`, bboxOf(x.poly));
  }
  // reachable from the entrance?
  if (rooms.length > 1) {
    let start = null;
    if (numOk(tr.entrance)) { let bd = 1e9; for (const x of rooms) { const c = centroid(x.poly), inside = pip(tr.entrance, x.poly), d = inside ? 0 : Math.hypot(c[0] - tr.entrance[0], c[1] - tr.entrance[1]); if (outside.has(x.i) && d < bd) { bd = d; start = x.i; } } }
    if (start == null) start = [...outside][0] ?? rooms.slice().sort((a, b) => links.get(b.i).size - links.get(a.i).size)[0].i;
    const seen = new Set([start]), q = [start]; while (q.length) for (const j of links.get(q.shift())) if (!seen.has(j)) { seen.add(j); q.push(j); }
    for (const x of rooms) if (!seen.has(x.i) && hasWay.has(x.i) && !outside.has(x.i)) add('cut:' + x.r.name, 'cut', 4, `"${x.r.name}" cannot be reached from the entrance through the traced doors and openings. A door or opening on the way to it is missing or sits on the wrong wall.`, bboxOf(x.poly));
  }

  // 4. labels sit inside the room they name; every sized label has a room
  for (const l of tr.labels || []) {
    if (!numOk(l.pos)) continue;
    const inside = rooms.filter(x => pip(l.pos, x.poly)), match = inside.find(x => nm(x.r.name) === nm(l.room) || nm(x.r.name).includes(nm(l.room)) || nm(l.room).includes(nm(x.r.name)));
    if (match) continue;
    const own = rooms.find(x => nm(x.r.name) === nm(l.room)); if (own && own.poly.some((a, k) => { const b = own.poly[(k + 1) % own.poly.length], dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((l.pos[0] - a[0]) * dx + (l.pos[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1); return Math.hypot(l.pos[0] - a[0] - t * dx, l.pos[1] - a[1] - t * dy) < doorW * .6; })) continue;
    add('label:' + l.room, 'label', 4, inside.length ? `The printed name "${l.room}" at (${l.pos.map(Math.round)}) falls inside the room traced as "${inside[0].r.name}". Either the room is misnamed, or the outlines of the two rooms are swapped or merged.` : `The printed name "${l.room}" at (${l.pos.map(Math.round)}) is not inside any traced room. That room is missing or its outline is in the wrong place.`, boxPad([l.pos[0], l.pos[1], l.pos[0], l.pos[1]], doorW * 2.5, W, H));
  }

  // 5. floor that no room covers, and rooms that overlap (coarse grid)
  const g = Math.max(4, Math.round(Math.max(W, H) / 220)), GW = Math.ceil(W / g), GH = Math.ceil(H / g), cell = new Int16Array(GW * GH).fill(-1), wallC = new Uint8Array(GW * GH);
  for (const f of WF) { const a = f.w.a, b = f.w.b, L = Math.hypot(b[0] - a[0], b[1] - a[1]), st = Math.max(1, Math.ceil(L / (g * .5))), hw = Math.max(1, Math.ceil(((+f.w.t || 6) / 2) / g));
    for (let k = 0; k <= st; k++) { const x = Math.floor((a[0] + (b[0] - a[0]) * k / st) / g), y = Math.floor((a[1] + (b[1] - a[1]) * k / st) / g); for (let dy = -hw + 1; dy < hw; dy++) for (let dx = -hw + 1; dx < hw; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < GW && Y < GH) wallC[Y * GW + X] = 1; } } }
  const over = new Map();
  for (const x of rooms) { const b = bboxOf(x.poly); for (let Y = Math.max(0, Math.floor(b[1] / g)); Y <= Math.min(GH - 1, Math.floor(b[3] / g)); Y++) for (let X = Math.max(0, Math.floor(b[0] / g)); X <= Math.min(GW - 1, Math.floor(b[2] / g)); X++) {
    if (!pip([(X + .5) * g, (Y + .5) * g], x.poly)) continue; const k = Y * GW + X;
    if (cell[k] >= 0 && cell[k] !== x.i && !wallC[k]) { const key = Math.min(cell[k], x.i) + '/' + Math.max(cell[k], x.i); over.set(key, (over.get(key) || 0) + 1); } cell[k] = x.i; } }
  for (const [key, n] of over) { const [a, b] = key.split('/').map(Number), A = rooms.find(x => x.i === a), B = rooms.find(x => x.i === b), small = Math.min(polyArea(A.poly), polyArea(B.poly)) / (g * g);
    if (n > Math.max(12, small * .15)) add('overlap:' + A.r.name + '/' + B.r.name, 'overlap', 4, `The outlines of "${A.r.name}" and "${B.r.name}" overlap. Each piece of floor belongs to one room: redraw the outlines so they meet at the wall between them.`, bboxOf(polyArea(A.poly) < polyArea(B.poly) ? A.poly : B.poly)); }
  // outside = cells reachable from the image edge without crossing a wall; what is left and unclaimed is uncovered floor
  const out = new Uint8Array(GW * GH), st2 = [];
  const push = (X, Y) => { if (X < 0 || Y < 0 || X >= GW || Y >= GH) return; const k = Y * GW + X; if (out[k] || wallC[k] || cell[k] >= 0) return; out[k] = 1; st2.push(X, Y); };
  for (let X = 0; X < GW; X++) { push(X, 0); push(X, GH - 1); } for (let Y = 0; Y < GH; Y++) { push(0, Y); push(GW - 1, Y); }
  while (st2.length) { const Y = st2.pop(), X = st2.pop(); push(X + 1, Y); push(X - 1, Y); push(X, Y + 1); push(X, Y - 1); }
  const seenG = new Uint8Array(GW * GH), gaps = [];
  for (let Y = 0; Y < GH; Y++) for (let X = 0; X < GW; X++) { const k0 = Y * GW + X; if (out[k0] || wallC[k0] || cell[k0] >= 0 || seenG[k0]) continue;
    let n = 0, bx = [X, Y, X, Y]; const q = [X, Y]; seenG[k0] = 1;
    while (q.length) { const y = q.pop(), x = q.pop(); n++; bx = [Math.min(bx[0], x), Math.min(bx[1], y), Math.max(bx[2], x), Math.max(bx[3], y)];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x2 = x + dx, y2 = y + dy; if (x2 < 0 || y2 < 0 || x2 >= GW || y2 >= GH) continue; const k = y2 * GW + x2; if (!out[k] && !wallC[k] && cell[k] < 0 && !seenG[k]) { seenG[k] = 1; q.push(x2, y2); } } }
    if (n * g * g > doorW * doorW * 1.4) gaps.push({ n, box: [bx[0] * g, bx[1] * g, (bx[2] + 1) * g, (bx[3] + 1) * g] }); }
  gaps.sort((a, b) => b.n - a.n);
  gaps.slice(0, 6).forEach(q => add(`gap:${Math.round(q.box[0] / 20)}_${Math.round(q.box[1] / 20)}`, 'gap', 5, `Floor inside the walls around (${Math.round((q.box[0] + q.box[2]) / 2)},${Math.round((q.box[1] + q.box[3]) / 2)}), about ${Math.round(q.box[2] - q.box[0])} × ${Math.round(q.box[3] - q.box[1])} px, belongs to no room. Either a room is missing (a passage, toilet, store, duct), or a neighbouring room's outline stops short of its walls.`, boxPad(q.box, doorW, W, H)));
  const roomArea = rooms.reduce((s, x) => s + polyArea(x.poly), 0), inCells = cell.reduce((s, v) => s + (v >= 0 ? 1 : 0), 0);
  let enclosed = 0; for (let k = 0; k < cell.length; k++) if (cell[k] >= 0 && !out[k]) enclosed++;   // rooms are never 'out' by construction; leak shows as rooms touching outside without walls
  // does the outer wall go all the way round? count room-edge cells that touch outside cells with no wall between
  let leak = 0, edge = 0; for (let Y = 1; Y < GH - 1; Y++) for (let X = 1; X < GW - 1; X++) { const k = Y * GW + X; if (cell[k] < 0) continue; const rm = rooms.find(x => x.i === cell[k]); if (!rm || isOutdoorType(normType(rm.r.type, rm.r.name))) continue;
    for (const d of [1, -1, GW, -GW]) if (out[k + d]) { leak++; break; } }
  if (leak > Math.max(10, Math.sqrt(inCells) * .9)) add('shell', 'shell', 12, `The outer walls do not close all the way round: indoor rooms touch the outside with no wall between along about ${Math.round(leak * g)} px of their outline. Trace the exterior wall along every outside edge of every indoor room (windows and sliding doors sit on that wall as openings).`, hull);

  // 6. doors: sensible widths, sitting on a gap
  ops.forEach((o, i) => { if (o.type !== 'door') return; const L = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]); if (L < doorW * .5 || L > doorW * 1.9) add('door:' + i + ':' + Math.round(o.a[0] / 10) + '_' + Math.round(o.a[1] / 10), 'door', 2, `Door openings[${i}] at (${o.a.map(Math.round)})–(${o.b.map(Math.round)}) is ${Math.round(L)} px wide while the other doors are about ${Math.round(doorW)} px. Check its two jambs.`, boxPad([Math.min(o.a[0], o.b[0]), Math.min(o.a[1], o.b[1]), Math.max(o.a[0], o.b[0]), Math.max(o.a[1], o.b[1])], doorW * 1.5, W, H)); });

  const live = issues.filter(i => !i.off), pen = live.reduce((s, i) => s + i.pen, 0);
  return { issues, open: live, score: Math.max(0, Math.round(100 - pen)), parts: { rooms: rooms.length, sized, sizedOk, sizes, pxPerFt: MR.md ? MR.md.map(v => Math.round(v * 100) / 100) : null, inkExplained: wallInk ? Math.round(100 * wallInkExplained / wallInk) : 100, doorW, tMed, scale: MR.s || null } };
}

/* ---------- Claude's edits ---------- */
function applyDeepEdits(tr, edits, SEGS) {
  const log = [], W = tr.walls ||= [], O = tr.openings ||= [], R = tr.rooms ||= [], Lb = tr.labels ||= [];
  const pt = p => numOk(p) ? [+p[0], +p[1]] : null, segById = id => SEGS.find(s => s.id === String(id).toUpperCase());
  const delW = new Set(), delO = new Set(), delR = new Set(), list = (Array.isArray(edits) ? edits : []).slice(0, 120), n = { wallMoved: 0, wallAdded: 0, openMoved: 0, openAdded: 0, roomMoved: 0 }, pl = (k, w) => `${k} ${w}${k > 1 ? 's' : ''}`;
  // changes in place first, then additions, then removals, so every index means what it meant in the JSON Claude was shown
  for (const e of list) {
    if (!e || typeof e !== 'object') continue; const i = +e.i;
    if (e.op === 'wall~' && W[i]) { const a = pt(e.a), b = pt(e.b); if (a) W[i].a = a; if (b) W[i].b = b; if (+e.t > 0) W[i].t = +e.t; if (typeof e.ext === 'boolean') W[i].ext = e.ext; if (a || b || +e.t > 0) W[i].pin = 1; n.wallMoved++; }
    else if (e.op === 'open~' && O[i]) { const a = pt(e.a), b = pt(e.b); if (a) O[i].a = a; if (b) O[i].b = b; if (['door', 'slider', 'window', 'opening'].includes(e.type)) O[i].type = e.type; if (e.hinge) O[i].hinge = e.hinge; if (pt(e.into)) O[i].into = pt(e.into); delete O[i].auto; n.openMoved++; }
    else if (e.op === 'room~' && R[i]) { if (Array.isArray(e.poly) && e.poly.length >= 3 && e.poly.every(numOk)) R[i].poly = e.poly.map(pt); if (e.name) R[i].name = String(e.name).slice(0, 40); if (e.type) R[i].type = String(e.type); if (Array.isArray(e.poly)) R[i].pin = 1; n.roomMoved++; }
    else if (e.op === 'label~') { const l = Lb.find(l => l.room === e.room); const d = (e.dims || []).map(Number).filter(v => v > 0); if (l && d.length >= 2) { l.dims = d.slice(0, 2); log.push(`re-read the size of ${e.room}`); } else if (!l && d.length >= 2 && e.room) { Lb.push({ room: String(e.room), dims: d.slice(0, 2), pos: pt(e.pos) || undefined }); log.push(`added the printed size of ${e.room}`); } if (l && e.to) { l.room = String(e.to); log.push(`label ${e.room} → ${e.to}`); } }
    else if (e.op === 'entrance' && pt(e.at)) { tr.entrance = pt(e.at); log.push('moved the entrance'); }
    else if (e.op === 'wall-' && W[i]) delW.add(W[i]);
    else if (e.op === 'open-' && O[i]) delO.add(O[i]);
    else if (e.op === 'room-' && R[i]) delR.add(R[i]);
  }
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    if (e.op === 'wall+') {
      let a = pt(e.a), b = pt(e.b), t = +e.t > 0 ? +e.t : null; const s = e.seg ? segById(e.seg) : null;
      if (s) { const k = Math.abs(s.b[0] - s.a[0]) >= Math.abs(s.b[1] - s.a[1]) ? 0 : 1, at = v => segPt(s, clamp((v - s.a[k]) / ((s.b[k] - s.a[k]) || 1), 0, 1));   // from/to run along x for a flat line, y for an upright one
        a = e.from != null && isFinite(+e.from) ? at(+e.from) : s.a.slice(); b = e.to != null && isFinite(+e.to) ? at(+e.to) : s.b.slice(); t = t || s.t; }
      if (a && b && Math.hypot(b[0] - a[0], b[1] - a[1]) > 3) { W.push({ a, b, t: t || 6, ext: !!e.ext, pin: 1 }); n.wallAdded++; }
    }
    else if (e.op === 'open+') { const a = pt(e.a), b = pt(e.b); if (a && b && ['door', 'slider', 'window', 'opening'].includes(e.type)) { O.push({ type: e.type, a, b, ...(e.hinge ? { hinge: e.hinge } : {}), ...(pt(e.into) ? { into: pt(e.into) } : {}) }); n.openAdded++; } }
    else if (e.op === 'room+') { if (Array.isArray(e.poly) && e.poly.length >= 3 && e.poly.every(numOk) && e.name) { R.push({ name: String(e.name).slice(0, 40), type: String(e.type || 'other'), poly: e.poly.map(pt), pin: 1 }); log.push(`added the room ${e.name}`); } }
  }
  if (n.wallMoved) log.unshift(`moved ${pl(n.wallMoved, 'wall')}`); if (n.wallAdded) log.push(`added ${pl(n.wallAdded, 'wall')}`); if (n.openMoved) log.push(`changed ${pl(n.openMoved, 'opening')}`); if (n.openAdded) log.push(`added ${pl(n.openAdded, 'opening')}`); if (n.roomMoved) log.push(`re-outlined ${pl(n.roomMoved, 'room')}`);
  if (delW.size) { tr.walls = W.filter(w => !delW.has(w)); log.push(`removed ${delW.size} wall${delW.size > 1 ? 's' : ''}`); }
  if (delO.size) { tr.openings = O.filter(o => !delO.has(o)); log.push(`removed ${delO.size} opening${delO.size > 1 ? 's' : ''}`); }
  if (delR.size) { tr.rooms = R.filter(r => !delR.has(r)); log.push(`removed ${[...delR].map(r => r.name).join(', ')}`); }
  return log;
}
// A question's edits name walls, openings and rooms by their index in the tracing Claude was shown. The tracing keeps
// changing after the question is asked, so each index is turned into the thing itself (its position, or the room's name)
// and found again when the person answers.
function pinAskEdits(tr, edits) {
  return (Array.isArray(edits) ? edits : []).slice(0, 12).map(e => { if (!e || typeof e !== 'object') return null; const i = +e.i;
    if (/^wall[~-]$/.test(e.op)) return tr.walls?.[i] ? { ...e, ref: { a: tr.walls[i].a, b: tr.walls[i].b } } : null;
    if (/^open[~-]$/.test(e.op)) return tr.openings?.[i] ? { ...e, ref: { a: tr.openings[i].a, b: tr.openings[i].b } } : null;
    if (/^room[~-]$/.test(e.op)) return tr.rooms?.[i] ? { ...e, ref: { name: tr.rooms[i].name } } : null;
    return e; }).filter(Boolean);
}
function applyAnswer(tr, edits, SEGS, P) {
  const near = (list, ref) => { let best = -1, bd = 18; (list || []).forEach((o, k) => { if (!numOk(o?.a) || !numOk(o?.b)) return; const d = Math.min(Math.hypot(o.a[0] - ref.a[0], o.a[1] - ref.a[1]) + Math.hypot(o.b[0] - ref.b[0], o.b[1] - ref.b[1]), Math.hypot(o.a[0] - ref.b[0], o.a[1] - ref.b[1]) + Math.hypot(o.b[0] - ref.a[0], o.b[1] - ref.a[1])); if (d < bd) { bd = d; best = k; } }); return best; };
  const list = (edits || []).map(e => { if (!e.ref) return e; const i = e.ref.name ? (tr.rooms || []).findIndex(r => r.name === e.ref.name) : near(/^wall/.test(e.op) ? tr.walls : tr.openings, e.ref); return i >= 0 ? { ...e, i } : null; }).filter(Boolean);
  if (!list.length) return [];
  const did = applyDeepEdits(tr, list, SEGS); refinePinned(tr, P); snapRoomsToWalls(tr);
  for (const w of tr.walls || []) delete w.pin; for (const r of tr.rooms || []) delete r.pin;
  return did;
}
// what is still unsettled, in words for the person whose home it is
function plainIssue(i) {
  const room = (i.id.split(':')[1] || '').split('/')[0];
  return ({ size: `${room} does not measure its printed size`, unsized: `${room} could not be measured`, ink: 'a drawn line that may be a wall', open: `${room} may be missing a wall`, noway: `${room} has no door`, cut: `${room} cannot be reached`, label: `${room} may be in the wrong place`, overlap: `${room} overlaps the room next to it`, gap: 'a patch of floor has no room', shell: 'the outer wall has a gap', door: 'a door looks the wrong width', scale: 'the printed sizes could not be matched' })[i.kind] || 'something to check';
}
// The pixel snap tidies a first reading, but a wall Claude has placed on purpose (from a measured line, in a close-up)
// stays where Claude put it: next to a grey fill the snap would otherwise widen it to swallow the fill.
function refinePinned(tr, P) {
  const keep = new Map((tr.walls || []).filter(w => w.pin).map(w => [w, { a: w.a.slice(), b: w.b.slice(), t: w.t }]));
  const polys = new Map((tr.rooms || []).filter(r => r.pin && Array.isArray(r.poly)).map(r => [r, r.poly.map(p => p.slice())]));
  const rf = refineTrace(tr, P);
  for (const w of tr.walls || []) { const k = keep.get(w); if (k) { w.a = k.a; w.b = k.b; w.t = k.t; } }
  for (const r of tr.rooms || []) { const k = polys.get(r); if (k) r.poly = k; }
  return rf;
}
// room outlines are pulled onto the centreline of the wall they run along, so Claude need not be pixel-exact with them
function snapRoomsToWalls(tr) {
  const WF = wallFrames(tr).filter(f => f.ax); let n = 0;
  for (const r of tr.rooms || []) {
    if (!Array.isArray(r?.poly) || r.poly.length < 3 || !r.poly.every(numOk)) continue; const N = r.poly.length, moves = [];
    for (let i = 0; i < N; i++) {
      const a = r.poly[i], b = r.poly[(i + 1) % N], ax = Math.abs(a[1] - b[1]) <= 2 && Math.abs(a[0] - b[0]) > 4 ? 'h' : Math.abs(a[0] - b[0]) <= 2 && Math.abs(a[1] - b[1]) > 4 ? 'v' : null; if (!ax) continue;
      const k = ax === 'h' ? 0 : 1, j = 1 - k, lo = Math.min(a[k], b[k]), hi = Math.max(a[k], b[k]), c = (a[j] + b[j]) / 2; let best = null;
      for (const f of WF) { if (f.ax !== ax) continue; const d = Math.abs(f.c - c); if (d > f.t / 2 + (r.pin ? 1.5 : 6) || Math.min(hi, f.u1) - Math.max(lo, f.u0) < (hi - lo) * .3) continue; if (!best || d < best.d) best = { d, c: f.c }; }
      if (best && best.d > .01) moves.push([i, j, best.c]);
    }
    for (const [i, j, c] of moves) { r.poly[i][j] = c; r.poly[(i + 1) % N][j] = c; n++; }
  }
  return n;
}

/* ---------- what Claude is shown: the problem close up, with rulers and the measured lines ---------- */
async function deepCrop(src, tr, SEGS, box, label, focus = new Set(), doorW = 24) {
  const im = await loadImg(src), W = im.naturalWidth, H = im.naturalHeight;
  let [x0, y0, x1, y1] = box.map(Math.round); const minS = 140;
  if (x1 - x0 < minS) { const c = (x0 + x1) / 2; x0 = Math.round(c - minS / 2); x1 = x0 + minS; } if (y1 - y0 < minS) { const c = (y0 + y1) / 2; y0 = Math.round(c - minS / 2); y1 = y0 + minS; }
  x0 = clamp(x0, 0, W - 2); y0 = clamp(y0, 0, H - 2); x1 = clamp(x1, x0 + 2, W); y1 = clamp(y1, y0 + 2, H);
  // as large as fits: two panels side by side for a tall area, one above the other for a wide one (long edge about 2300 px)
  const bw = x1 - x0, bh = y1 - y0, M = 34, gap = 30, zs = Math.min((2300 - M - gap) / (2 * bw), 1500 / bh), zt = Math.min(1500 / bw, (2300 - M - gap) / (2 * bh)), stack = zt > zs, z = clamp(stack ? zt : zs, 1, 9), pw = Math.round(bw * z), ph = Math.round(bh * z);
  const c = document.createElement('canvas'); c.width = stack ? M + pw + 6 : M + pw + gap + pw + 6; c.height = stack ? M + ph + gap + ph + 6 : M + ph + 6; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const panels = stack ? [[M, M], [M, M + ph + gap]] : [[M, M], [M + pw + gap, M]];
  g.drawImage(im, x0, y0, bw, bh, panels[0][0], panels[0][1], pw, ph);
  g.globalAlpha = .62; g.drawImage(im, x0, y0, bw, bh, panels[1][0], panels[1][1], pw, ph); g.globalAlpha = 1;
  // rulers in plan pixels on both panels: numbered lines, with a fainter line halfway between
  const step = [2, 5, 10, 20, 50, 100, 200].find(s => s * z >= 40) || 200, half = step / 2;
  g.font = '11px sans-serif';
  for (const [px, py] of panels) {
    for (let x = Math.ceil(x0 / half) * half; x <= x1; x += half) { const X = Math.round(px + (x - x0) * z) + .5, major = x % step === 0; g.strokeStyle = major ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.09)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X, py - (major ? 5 : 0)); g.lineTo(X, py + ph); g.stroke(); if (major) { g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(String(x), X, py - 6); } }
    for (let y = Math.ceil(y0 / half) * half; y <= y1; y += half) { const Y = Math.round(py + (y - y0) * z) + .5, major = y % step === 0; g.strokeStyle = major ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.09)'; g.beginPath(); g.moveTo(px - (major ? 5 : 0), Y); g.lineTo(px + pw, Y); g.stroke(); if (major && px === M) { g.fillStyle = '#111'; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(String(y), M - 6, Y); } }
    g.strokeStyle = '#000'; g.strokeRect(px + .5, py + .5, pw, ph);
  }
  g.textAlign = 'left'; g.textBaseline = 'top'; g.font = 'bold 12px sans-serif'; g.fillStyle = '#000'; g.fillText(`${label}: plan pixels x ${x0}–${x1}, y ${y0}–${y1}, enlarged ${r1(z)}× (${stack ? 'top' : 'left'}: the plan; ${stack ? 'bottom' : 'right'}: the tracing and measured lines over it)`, M, 4);
  // right panel: tracing + measured lines, clipped to the panel
  g.save(); g.beginPath(); g.rect(panels[1][0], panels[1][1], pw, ph); g.clip();
  const X = x => panels[1][0] + (x - x0) * z, Y = y => panels[1][1] + (y - y0) * z, B = [x0, y0, x1, y1], tag = (t, x, y, col) => { g.font = 'bold 12px sans-serif'; const w = g.measureText(t).width; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x - w / 2 - 2, y - 8, w + 4, 15); g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); };
  (tr.rooms || []).forEach((r, i) => { if (!Array.isArray(r.poly) || !r.poly.every(numOk)) return; g.beginPath(); r.poly.forEach((p, k) => k ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.closePath(); g.setLineDash([7, 5]); g.strokeStyle = 'rgba(150,60,220,.9)'; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]); });
  (tr.walls || []).forEach((w, i) => { if (!numOk(w.a) || !numOk(w.b)) return; const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, n = [-(w.b[1] - w.a[1]) / L, (w.b[0] - w.a[0]) / L], h = (+w.t || 6) / 2, col = w.ext ? '220,20,20' : '255,110,0';
    const q = [[w.a[0] + n[0] * h, w.a[1] + n[1] * h], [w.b[0] + n[0] * h, w.b[1] + n[1] * h], [w.b[0] - n[0] * h, w.b[1] - n[1] * h], [w.a[0] - n[0] * h, w.a[1] - n[1] * h]];
    g.beginPath(); q.forEach((p, k) => k ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.closePath(); g.fillStyle = `rgba(${col},.04)`; g.fill(); g.strokeStyle = `rgba(${col},.95)`; g.lineWidth = 1.5; g.stroke();
    g.setLineDash([2, 4]); g.beginPath(); g.moveTo(X(w.a[0]), Y(w.a[1])); g.lineTo(X(w.b[0]), Y(w.b[1])); g.stroke(); g.setLineDash([]); });
  const col = { door: '#00a651', slider: '#00b5d8', window: '#1e4dff', opening: '#ff00b4' };
  (tr.openings || []).forEach((o, i) => { if (!numOk(o.a) || !numOk(o.b)) return; g.strokeStyle = col[o.type] || '#00a651'; g.globalAlpha = .75; g.lineWidth = clamp(2 * z, 5, 12); g.beginPath(); g.moveTo(X(o.a[0]), Y(o.a[1])); g.lineTo(X(o.b[0]), Y(o.b[1])); g.stroke(); g.globalAlpha = 1;
    // a door's hinge end is marked with a dot, and a short tick shows the side it swings into
    if (o.type === 'door') { const h = o.hinge === 'b' ? o.b : o.a; g.fillStyle = '#004d26'; g.beginPath(); g.arc(X(h[0]), Y(h[1]), clamp(1.6 * z, 4, 9), 0, 7); g.fill(); if (numOk(o.into)) { const m = [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2], L = Math.hypot(o.into[0] - m[0], o.into[1] - m[1]) || 1, q = Math.min(L, 12); g.strokeStyle = '#004d26'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(m[0]), Y(m[1])); g.lineTo(X(m[0] + (o.into[0] - m[0]) / L * q), Y(m[1] + (o.into[1] - m[1]) / L * q)); g.stroke(); } } });
  const names = (tr.labels || []).filter(l => numOk(l.pos)), lettering = s => s.ax === 'h' && s.len < doorW * 3.2 && names.some(l => Math.abs(l.pos[0] - (s.a[0] + s.b[0]) / 2) < doorW * 1.8 && Math.abs(l.pos[1] - (s.a[1] + s.b[1]) / 2) < doorW * .7);
  const inBox = SEGS.filter(s => boxHit(segBox(s), B)), shown = [...inBox.filter(s => focus.has(s.id)), ...inBox.filter(s => !focus.has(s.id) && s.t >= 3 && s.len >= doorW * 1.1 && !s.hatch && !lettering(s))].slice(0, 26);
  for (const s of shown) { const q = segPoly(s); g.strokeStyle = '#007a8a'; g.lineWidth = 1; g.setLineDash([4, 3]); g.beginPath(); q.forEach((p, k) => k ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.closePath(); g.stroke(); g.setLineDash([]); }
  (tr.walls || []).forEach((w, i) => { if (!numOk(w.a) || !numOk(w.b)) return; const m = [clamp((w.a[0] + w.b[0]) / 2, x0 + 8 / z, x1 - 8 / z), clamp((w.a[1] + w.b[1]) / 2, y0 + 8 / z, y1 - 8 / z)]; if (boxHit([Math.min(w.a[0], w.b[0]) - 1, Math.min(w.a[1], w.b[1]) - 1, Math.max(w.a[0], w.b[0]) + 1, Math.max(w.a[1], w.b[1]) + 1], B)) tag('w' + i, X(m[0]), Y(m[1]), '#b00000'); });
  (tr.openings || []).forEach((o, i) => { if (!numOk(o.a) || !numOk(o.b)) return; const m = [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2]; if (m[0] >= x0 && m[0] <= x1 && m[1] >= y0 && m[1] <= y1) tag('o' + i, X(m[0]), Y(m[1]) + 14, '#00622f'); });
  (tr.rooms || []).forEach((r, i) => { if (!Array.isArray(r.poly) || !r.poly.every(numOk)) return; const m = centroid(r.poly); if (m[0] >= x0 && m[0] <= x1 && m[1] >= y0 && m[1] <= y1) tag(`r${i} ${r.name}`, X(m[0]), Y(m[1]), '#6a16b8'); });
  for (const s of shown) { const b = segBox(s), fl = Math.abs(s.b[0] - s.a[0]) >= Math.abs(s.b[1] - s.a[1]), m = [clamp((Math.max(b[0], x0) + Math.min(b[2], x1)) / 2, x0 + 10 / z, x1 - 10 / z), clamp((Math.max(b[1], y0) + Math.min(b[3], y1)) / 2, y0 + 6 / z, y1 - 6 / z)]; tag(s.id, X(m[0]) + (fl ? 0 : s.t * z / 2 + 16), Y(m[1]) + (fl ? -s.t * z / 2 - 10 : 0), '#005f6b'); }
  g.restore();
  return { image: c.toDataURL('image/jpeg', .85), box: B, segs: shown };
}
const segLine = s => `${s.id}: ${s.ax === 'h' ? `horizontal at y=${r1(s.a[1])}, x ${Math.round(s.a[0])}–${Math.round(s.b[0])}` : s.ax === 'v' ? `vertical at x=${r1(s.a[0])}, y ${Math.round(s.a[1])}–${Math.round(s.b[1])}` : `sloping ${Math.round(Math.min(Math.abs(Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0])) % (Math.PI / 2), Math.PI / 2 - Math.abs(Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0])) % (Math.PI / 2)) * 180 / Math.PI)}° off ${Math.abs(s.b[0] - s.a[0]) >= Math.abs(s.b[1] - s.a[1]) ? 'level' : 'upright'}, from (${r1(s.a[0])},${r1(s.a[1])}) to (${r1(s.b[0])},${r1(s.b[1])})`}, ${s.t} px thick, ${s.lum < 90 ? 'dark' : s.lum < 150 ? 'grey' : 'pale'}`;

const DEEP_PROMPT = ({ W, H, tr, audit, crops, log, round, maxRounds, extraSegs }) => `You are correcting a tracing of a residential floor plan before it becomes a 3D home someone will walk through. Work like a careful draftsperson: look closely, use the measured numbers, fix what is wrong, and leave alone what is right. Accuracy matters more than speed. This is round ${round} of up to ${maxRounds}.${round === 1 ? ' This first round is a full sweep: the close-ups cover the whole home in overlapping tiles. Go through every tile, wall by wall and door by door, comparing its left half (the drawing) with its right half (the tracing), and fix everything you find, not only what the checks list.' : ''}

IMAGES
1. The floor plan, ${W}×${H} pixels (origin top-left, x right, y down).
2. The same plan, faded, with the current tracing drawn over it: red = exterior walls, orange = interior walls, green = doors, cyan = sliding doors, blue = windows, magenta = open doorways, dashed purple = room outlines.
${crops.map((c, i) => `${i + 3}. Close-up ${c.label}${c.recheck ? ' (an area changed last round, shown again so you can check the result)' : ''} of plan pixels x ${c.box[0]}–${c.box[2]}, y ${c.box[1]}–${c.box[3]}. It has two panels of the same area: first (left or top) the plan itself, enlarged, with a numbered grid in plan pixels; second (right or bottom) the plan with the tracing over it. Walls are red/orange outlines at their traced thickness with a dotted centreline; a door's hinge end has a dark dot and a tick on the side it swings into; w12 = walls[12], o3 = openings[3], r5 = rooms[5]; teal dashed boxes labelled H7 / V12 / S3 are straight lines of ink the code measured in the drawing (H level, V upright, S sloping).`).join('\n')}

THE CURRENT TRACING (indices are the positions in these arrays):
${JSON.stringify(compactTrace(tr))}

ROOM SIZES, measured between the faces of the traced walls and converted with the plan's own scale${audit.parts.pxPerFt ? ` (about ${audit.parts.pxPerFt[0]} px per foot left-to-right and ${audit.parts.pxPerFt[1]} top-to-bottom, taken from all the sized rooms together)` : ''}, as left-to-right × top-to-bottom:
${audit.parts.sizes.join('\n') || '(no printed sizes could be measured)'}

WHAT THE CHECKS FOUND (score ${audit.score}/100; ${audit.parts.sizedOk} of ${audit.parts.sized} sized rooms measure what the plan prints):
${audit.open.length ? audit.open.map(i => `- [${i.id}] ${i.text}${i.crop ? ` See close-up ${i.crop}.` : ''}`).join('\n') : '- nothing: every check passes.'}

MEASURED LINES in the close-ups (exact positions from the image; use these numbers rather than estimating coordinates):
${(() => { const seen = new Set(), out = []; for (const c of crops) { const fresh = c.segs.filter(s => !seen.has(s.id)); fresh.forEach(s => seen.add(s.id)); if (fresh.length) out.push(`in ${c.label}:`, ...fresh.map(segLine)); } const rest = (extraSegs || []).filter(s => !seen.has(s.id)); if (rest.length) out.push('elsewhere:', ...rest.map(segLine)); return out.join('\n') || '(none)'; })()}
${log.length ? '\nEARLIER ROUNDS:\n' + log.map(l => '- ' + l).join('\n') + '\n' : ''}
HOW TO JUDGE
- The drawing is the authority. A wall exists only where a wall is drawn; furniture, kitchen counters, wardrobes, railings, steps, floor patterns, hatching, text and dimension lines are not walls. Exterior walls are usually thick and dark; internal partitions may be thin or grey.
- A room's printed size is measured between the inner faces of its walls, so both a wall's position and its thickness matter. If a room does not measure its printed size, find which of the two named walls is misplaced or too thick or thin by comparing with the measured lines, or re-read the printed numbers digit by digit in the close-up.
- Room outlines run along wall centrelines, corner by corner, and neighbouring rooms meet at the wall between them. Anywhere within the wall's thickness is close enough: the code pulls outlines onto the centreline. Every room needs a door, sliding door or open doorway; a gap in a drawn wall is an opening and must be listed.
- A wall that ends against another wall (a T) ends on that wall's centreline; it need not end at one of its endpoints.
- A wall drawn at an angle is traced at that angle, from end to end, and a wall that bends is traced as two walls meeting at the bend. The S lines help with these, but an S line can run through a bend or pick up a counter edge or lettering beside the wall: check it against the drawing. A wall that is only a degree or two off level or upright on a photographed plan is a level or upright wall: trace it exactly level or upright through its middle.
- Doors: a door is drawn as a straight leaf and a quarter-circle arc. The hinge is the end of the opening the leaf is attached to (the centre of the arc); the arc ends at the other jamb. "into" is a point inside the room the leaf swings into.
- Brochure drawings are not always drawn to their printed sizes. If the two walls named in a size check sit exactly on their drawn lines and the size is still off, dismiss the check and say so; the printed size is applied later. Never move a wall off its drawn line to make a size fit.
- Walls of service ledges, ducts and planters outside the home's outer wall are left out.
- A balcony, deck or terrace edge drawn as a thin railing line has no wall: outline the room out to the railing and list nothing there (the railing is added automatically).
- Coordinates may be decimals.
- A side of a room with no wall drawn (living to dining or kitchen, a walk-in opening off a bedroom) is fine: outline the room where its floor ends and list nothing there.
- Boxes with a cross through them, shafts, and ribbed ledges outside the outer walls are service ledges and ducts, not rooms and not floor: leave them outside the tracing and dismiss checks about them.
- On a photographed plan the scale drifts a little across the page; the measuring allows for that, so a size is only flagged when it is off by more than 4.5% or 5 inches, whichever is larger.
- If a check is wrong about the drawing (the line is a wardrobe, the room really is open to the next), dismiss it with a short reason. Do not change a correct tracing to satisfy a check.
- If you cannot tell from the drawing, ask: give the question and the edits for each answer.

REPLY with only one JSON object:
{
 "edits": [
   {"op":"wall+","seg":"V12","ext":false}                      add a wall exactly on a measured line; optional "from"/"to" limit it (y values for an upright line, x values for a flat one), optional "t"
   {"op":"wall+","a":[x,y],"b":[x,y],"t":6,"ext":false}        add a wall by coordinates
   {"op":"wall~","i":12,"a":[x,y],"b":[x,y],"t":6,"ext":true}  move, extend, shorten, re-thicken or re-class walls[12] (give only the fields that change)
   {"op":"wall-","i":12}                                        remove walls[12]
   {"op":"open+","type":"door|slider|window|opening","a":[x,y],"b":[x,y],"hinge":"a","into":[x,y]}
   {"op":"open~","i":3,"type":"door","a":[x,y],"b":[x,y]}      {"op":"open-","i":3}
   {"op":"room+","name":"Passage","type":"passage","poly":[[x,y],...]}
   {"op":"room~","i":5,"name":"...","type":"...","poly":[[x,y],...]}      {"op":"room-","i":5}
   {"op":"label~","room":"Bedroom 2","dims":[10.58,14]}        correct a misread printed size (decimals; 10'7" is 10.58)
   {"op":"entrance","at":[x,y]}                                 move the main entrance point (the middle of the main door)
 ],
 "dismiss": [ {"id":"ink:H7","why":"wardrobe outline"} ],
 "zoom": [ [x0,y0,x1,y1] ],                                    up to 3 areas you want to see enlarged next round
 "ask": [ {"q":"Is there a door between the kitchen and the utility area?","box":[x0,y0,x1,y1],"yes":[ ...edits ],"no":[ ...edits ]} ],
 "notes": "one sentence on what you fixed",
 "done": false                                                  true when you would sign this tracing off
}
Every index refers to the arrays exactly as printed above, whatever else you change in the same reply (removals are applied last). In wall~, open~ and room~ give only the fields that change (open~ also takes "hinge" and "into"). A wall that changes thickness partway is two walls end to end. Include only what changes; an empty "edits" list is fine. Walls that look horizontal or vertical must be exactly horizontal or vertical, and walls that meet share the same endpoint.`;

/* ---------- the session ---------- */
// close-ups for a round: what Claude asked to see, then the worst problems; neighbouring problems share a close-up
async function deepRoundInputs(src, cur, P, SEGS, audit, zoomReq, round = 2, maxCrops = 5, prev = null) {
  const boxes = [], tiles = [];
  {
    // the first round is a sweep: the whole home in overlapping close-ups, so every wall gets looked at once at full size
    const pts = [...(cur.walls || []).flatMap(w => [w.a, w.b]), ...(cur.rooms || []).flatMap(r => r.poly || [])].filter(numOk);
    if (pts.length > 3) {
      const hb = boxPad([Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))], audit.parts.doorW, P.W, P.H), hw = hb[2] - hb[0], hh = hb[3] - hb[1];
      const n = Math.min(maxCrops, 8), wide = hw >= hh, ratio = wide ? hw / hh : hh / hw, long = n >= 8 && ratio > 1.55 ? 4 : n >= 6 ? 3 : 2, nx = wide ? long : 2, ny = wide ? 2 : long, tw = hw / nx, th = hh / ny, ov = .09;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) tiles.push({ box: boxPad([hb[0] + i * tw - tw * ov, hb[1] + j * th - th * ov, hb[0] + (i + 1) * tw + tw * ov, hb[1] + (j + 1) * th + th * ov].map(Math.round), 0, P.W, P.H), ids: [], tile: true });
    }
  }
  if (round === 1 && maxCrops >= 4 && tiles.length) { boxes.push(...tiles); for (const it of audit.open) { const c = [(it.box[0] + it.box[2]) / 2, (it.box[1] + it.box[3]) / 2], b = boxes.find(b => c[0] >= b.box[0] && c[0] <= b.box[2] && c[1] >= b.box[1] && c[1] <= b.box[3]); if (b) b.ids.push(it.id); } }
  const want = boxes.length ? [] : [...(zoomReq || []).map(b => ({ box: b, ids: [] })), ...audit.open.slice().sort((a, b) => b.pen - a.pen).map(i => ({ box: i.box, ids: [i.id] }))];
  for (const w of want) {
    if (w.box[2] - w.box[0] > P.W * .7 && w.box[3] - w.box[1] > P.H * .7) continue;      // whole-plan problems are shown by images 1 and 2
    const padded = boxPad(w.box, Math.max(14, audit.parts.doorW * .8), P.W, P.H), hit = boxes.find(b => { const u = [Math.min(b.box[0], padded[0]), Math.min(b.box[1], padded[1]), Math.max(b.box[2], padded[2]), Math.max(b.box[3], padded[3])]; return boxHit(b.box, padded) && (u[2] - u[0]) < P.W * .42 && (u[3] - u[1]) < P.H * .42; });
    if (hit) { hit.box = [Math.min(hit.box[0], padded[0]), Math.min(hit.box[1], padded[1]), Math.max(hit.box[2], padded[2]), Math.max(hit.box[3], padded[3])]; hit.ids.push(...w.ids); }
    else if (boxes.length < maxCrops) boxes.push({ box: padded, ids: [...w.ids] });
  }
  if (round > 1 && prev && boxes.length < maxCrops && tiles.length) {
    const key = o => JSON.stringify([o.a, o.b, o.t, o.type]), old = new Set([...(prev.walls || []), ...(prev.openings || [])].map(key)), moved = [...(cur.walls || []), ...(cur.openings || [])].filter(o => numOk(o?.a) && numOk(o?.b) && !old.has(key(o))).map(o => [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2]);
    const inB = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3], rank = tiles.map(t => ({ t, n: moved.filter(p => inB(p, t.box) && !boxes.some(b => inB(p, b.box))).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
    for (const x of rank) if (boxes.length < maxCrops) boxes.push(x.t);
  }
  const extraSegs = audit.open.filter(i => i.kind === 'ink').map(i => SEGS.find(s => 'ink:' + s.id === i.id)).filter(Boolean), focus = new Set(extraSegs.map(s => s.id)), crops = [];
  for (let k = 0; k < boxes.length; k++) { const label = 'C' + (k + 1), c = await deepCrop(src, cur, SEGS, boxes[k].box, label, focus, audit.parts.doorW); crops.push({ ...c, label, recheck: round > 1 && !!boxes[k].tile }); for (const id of boxes[k].ids) { const it = audit.open.find(i => i.id === id); if (it) it.crop = label; } }
  return { crops, extraSegs };
}
async function deepRead({ tr, P, src, sample, signal, maxRounds = 7, onRound, ctx, maxImages = 10 }) {
  const SEGS = inkSegments(P), dismissed = new Set(), log = [], asks = [];
  const work = structuredClone(tr); refineTrace(work, P); snapRoomsToWalls(work);
  let cur = work, audit = auditTrace(cur, P, SEGS, dismissed), best = { tr: structuredClone(cur), audit }, zoomReq = [], idle = 0;
  const first = audit.score, history = [first]; let prevTr = null, stopped = null, rounds = 0;
  for (let round = 1; round <= maxRounds; round++) {
    if (signal?.aborted) break;
    if (!audit.open.length && round > 1) break;
    const { crops, extraSegs } = await deepRoundInputs(src, cur, P, SEGS, audit, zoomReq, round, Math.max(0, Math.min(8, (maxImages || 10) - 2)), prevTr);
    onRound?.({ round, maxRounds, audit, best: best.audit.score });
    const overlay = await traceOverlay(src, cur);
    if (ctx) ctx(round);
    let ans;
    try { ans = await sample.json(DEEP_PROMPT({ W: P.W, H: P.H, tr: cur, audit, crops, log, round, maxRounds, extraSegs }), { images: [dataURLtoBlob(src), dataURLtoBlob(overlay), ...crops.map(c => dataURLtoBlob(c.image))], modelTier: 'complex', signal }); }
    catch (e) { if (e?.code === 'cancelled') throw e; if (round === 1 && !['invalid_json', 'empty_completion', 'upstream_error', 'network'].includes(e?.code)) throw e;   // a limit or a refusal: nothing to retry
      log.push(`round ${round}: no answer (${e?.code || 'error'})`); stopped = e?.code || 'error'; if (++idle >= 2 || ['rate_limited', 'not_available', 'no_plan', 'signin_required', 'paywall'].includes(e?.code)) break; continue; }
    rounds = round;
    const next = structuredClone(cur), did = applyDeepEdits(next, ans?.edits, SEGS);
    const rf = refinePinned(next, P); snapRoomsToWalls(next);
    for (const d of (Array.isArray(ans?.dismiss) ? ans.dismiss : []).slice(0, 30)) if (d?.id && audit.issues.some(i => i.id === d.id)) dismissed.add(String(d.id));
    zoomReq = (Array.isArray(ans?.zoom) ? ans.zoom : []).filter(b => Array.isArray(b) && b.length >= 4 && b.every(v => isFinite(+v))).slice(0, 3).map(b => [Math.min(+b[0], +b[2]), Math.min(+b[1], +b[3]), Math.max(+b[0], +b[2]), Math.max(+b[1], +b[3])]);
    for (const a of (Array.isArray(ans?.ask) ? ans.ask : []).slice(0, 4)) if (a?.q && !asks.some(x => x.q === a.q)) asks.push({ q: String(a.q).slice(0, 240), box: Array.isArray(a.box) && a.box.length >= 4 ? a.box.map(Number) : null, yes: pinAskEdits(cur, a.yes), no: pinAskEdits(cur, a.no) });
    const after = auditTrace(next, P, SEGS, dismissed), nd = (Array.isArray(ans?.dismiss) ? ans.dismiss.length : 0);
    // a round that makes things clearly worse is undone, and Claude is told what broke
    const fresh = after.open.filter(i => !audit.open.some(j => j.id === i.id));
    if (after.score < audit.score - 6 && did.length) {
      log.push(`round ${round}: your edits (${did.slice(0, 6).join('; ')}) were undone because they created new problems: ${fresh.slice(0, 3).map(i => i.text.split('. ')[0]).join(' | ')}`);
      audit = auditTrace(cur, P, SEGS, dismissed);
    } else {
      prevTr = cur; cur = next; audit = after;
      log.push(`round ${round}: ${did.length ? did.slice(0, 8).join('; ') : 'no edits'}${nd ? `; dismissed ${nd}` : ''}${rf.stats.dropped ? `; ${rf.stats.dropped} wall(s) you kept or added lie on plain floor and were removed by the pixel check` : ''}${ans?.notes ? ` — your note: ${String(ans.notes).slice(0, 400)}` : ''} → score ${after.score}`);
    }
    history.push(audit.score);
    if (audit.score > best.audit.score || (audit.score === best.audit.score && audit.open.length <= best.audit.open.length)) best = { tr: structuredClone(cur), audit };
    idle = did.length || nd || zoomReq.length ? 0 : idle + 1;
    if ((ans?.done && !audit.open.length) || idle >= 2) break;
    if (ans?.done && !did.length && !nd && !zoomReq.length) break;
  }
  for (const w of best.tr.walls || []) delete w.pin; for (const r of best.tr.rooms || []) delete r.pin;
  return { tr: best.tr, audit: best.audit, first, history, log, asks: asks.slice(0, 3), SEGS, rounds, stopped, dismissed: [...dismissed] };
}
