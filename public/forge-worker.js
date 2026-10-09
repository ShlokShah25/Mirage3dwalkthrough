/* ================= Forge kernel =================
   Solids are signed distance fields: a function that says, for any point, how far it is from the surface (negative inside).
   Everything a model is built from (boxes, cylinders, extrusions, text, an imported mesh) is such a field, and joining,
   cutting, rounding and hollowing are simple operations on fields. So any program yields a valid closed solid, which is
   what a 3D printer needs. Units are millimetres, Z is up, and solids sit on the bed (z = 0) unless moved.
   The mesher (further down) turns the final field into triangles, keeping flat faces flat and edges sharp. */
const D2R = Math.PI / 180;
const clampN = (v, a, b) => v < a ? a : v > b ? b : v;
const num = (v, d) => { v = +v; return Number.isFinite(v) ? v : d; };
const pos = (v, d, what) => { v = +v; if (!(v > 0) || !Number.isFinite(v)) { if (d !== undefined && (v === undefined || Number.isNaN(v))) return d; throw new Error(`${what || 'A size'} must be a positive number, got ${v}`); } return v; };
const isOpts = o => o && typeof o === 'object' && !(o instanceof Shape) && !(o instanceof Solid) && !Array.isArray(o);

/* ---------------- 2D shapes ---------------- */
class Shape {
  // subclasses set: bb = [x0, y0, x1, y1] (where the shape is), L (how steep the field can be, 1 for a true distance)
  move(x = 0, y = 0) { return new Xf2(this, 0, num(x, 0), num(y, 0), 1, false); }
  rotate(deg) { return new Xf2(this, num(deg, 0) * D2R, 0, 0, 1, false); }
  scale(s) { return new Xf2(this, 0, 0, 0, pos(s, 1, 'scale'), false); }
  mirror(axis = 'x') { return new Mirror2(this, axis === 'y' ? 1 : 0); }
  grow(r) { r = num(r, 0); return r ? new Offset2(this, r) : this; }
  shrink(r) { return this.grow(-num(r, 0)); }
  offset(r) { return this.grow(r); }
  round(r) { r = num(r, 0); return r > 0 ? this.shrink(r).grow(r) : this; }
  outline(t) { return new Diff2(this, this.shrink(pos(t, 1, 'outline thickness')), 0); }
  extrude(h, opts) { return extrude(this, h, opts); }
  revolve(opts) { return revolve(this, opts); }
  bounds() { const b = this.bb; return { min: [b[0], b[1]], max: [b[2], b[3]], size: [b[2] - b[0], b[3] - b[1]] }; }
}
class Circle2 extends Shape { constructor(r) { super(); this.r = r; this.bb = [-r, -r, r, r]; this.L = 1; } d(x, y) { return Math.hypot(x, y) - this.r; } }
class Rect2 extends Shape {
  constructor(w, h, r) { super(); this.hx = w / 2; this.hy = h / 2; this.r = Math.min(r, w / 2, h / 2); this.bb = [-w / 2, -h / 2, w / 2, h / 2]; this.L = 1; }
  d(x, y) { const r = this.r, qx = Math.abs(x) - this.hx + r, qy = Math.abs(y) - this.hy + r; return Math.hypot(qx > 0 ? qx : 0, qy > 0 ? qy : 0) + Math.min(Math.max(qx, qy), 0) - r; }
}
class Ellipse2 extends Shape {   // a bound, not an exact distance (exact on the axes)
  constructor(a, b) { super(); this.a = a; this.b = b; this.m = Math.min(a, b); this.bb = [-a, -b, a, b]; this.L = 1; }
  d(x, y) { const k = Math.hypot(x / this.a, y / this.b); if (k < 1e-9) return -this.m; const g = Math.hypot(x / (this.a * this.a), y / (this.b * this.b)); return k * (k - 1) / g; }
}
// One or more closed outlines (the second and later ones can be holes), with the true distance to the nearest edge.
class Poly2 extends Shape {
  constructor(contours, evenOdd) {
    super(); const seg = []; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of contours) { const n = c.length; if (n < 3) continue; for (let i = 0; i < n; i++) { const a = c[i], b = c[(i + 1) % n]; if (a[0] === b[0] && a[1] === b[1]) continue; seg.push(a[0], a[1], b[0], b[1]); x0 = Math.min(x0, a[0]); y0 = Math.min(y0, a[1]); x1 = Math.max(x1, a[0]); y1 = Math.max(y1, a[1]); } }
    if (seg.length < 12) throw new Error('A polygon needs at least 3 different points');
    this.s = new Float64Array(seg); this.eo = !!evenOdd; this.bb = [x0, y0, x1, y1]; this.L = 1;
  }
  d(x, y) {
    const s = this.s; let best = Infinity, wn = 0;
    for (let i = 0; i < s.length; i += 4) {
      const ax = s[i], ay = s[i + 1], bx = s[i + 2], by = s[i + 3], ex = bx - ax, ey = by - ay, px = x - ax, py = y - ay;
      const t = clampN((px * ex + py * ey) / (ex * ex + ey * ey), 0, 1), dx = px - ex * t, dy = py - ey * t, q = dx * dx + dy * dy; if (q < best) best = q;
      if (ay <= y) { if (by > y && ex * py - ey * px > 0) wn++; } else if (by <= y && ex * py - ey * px < 0) wn--;
    }
    const inside = this.eo ? (wn & 1) : wn !== 0; return inside ? -Math.sqrt(best) : Math.sqrt(best);
  }
}
// A field sampled on a grid, for outlines with too many edges to measure one by one (letters, gears).
class Grid2 extends Shape {
  constructor(src, cell) {
    super(); const b = src.bb, pad = cell * 3; this.x0 = b[0] - pad; this.y0 = b[1] - pad; this.c = cell;
    this.nx = Math.ceil((b[2] - b[0] + 2 * pad) / cell) + 1; this.ny = Math.ceil((b[3] - b[1] + 2 * pad) / cell) + 1;
    const a = this.a = new Float32Array(this.nx * this.ny); for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) a[j * this.nx + i] = src.d(this.x0 + i * cell, this.y0 + j * cell);
    this.bb = b.slice(); this.L = Math.max(1, src.L || 1) * 1.42;
  }
  d(x, y) {
    const c = this.c, nx = this.nx, ny = this.ny, mx = (nx - 1) * c, my = (ny - 1) * c; let u = x - this.x0, v = y - this.y0, out = 0;
    if (u < 0 || v < 0 || u > mx || v > my) { const cu = clampN(u, 0, mx), cv = clampN(v, 0, my); out = Math.hypot(u - cu, v - cv); u = cu; v = cv; }
    let i = Math.floor(u / c), j = Math.floor(v / c); if (i > nx - 2) i = nx - 2; if (j > ny - 2) j = ny - 2;
    const fu = u / c - i, fv = v / c - j, a = this.a, k = j * nx + i, v0 = a[k] + (a[k + 1] - a[k]) * fu, v1 = a[k + nx] + (a[k + nx + 1] - a[k + nx]) * fu;
    return v0 + (v1 - v0) * fv + out;
  }
}
class Xf2 extends Shape {
  constructor(k, ang, tx, ty, s, _) { super(); this.k = k; this.c = Math.cos(ang); this.sn = Math.sin(ang); this.tx = tx; this.ty = ty; this.sc = s; this.L = k.L;
    const b = k.bb, P = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(([x, y]) => [(x * this.c - y * this.sn) * s + tx, (x * this.sn + y * this.c) * s + ty]);
    this.bb = [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))]; }
  d(x, y) { const s = this.sc, u = (x - this.tx) / s, v = (y - this.ty) / s; return this.k.d(u * this.c + v * this.sn, -u * this.sn + v * this.c) * s; }
}
class Mirror2 extends Shape { constructor(k, ax) { super(); this.k = k; this.ax = ax; this.L = k.L; const b = k.bb; this.bb = ax ? [b[0], -b[3], b[2], -b[1]] : [-b[2], b[1], -b[0], b[3]]; } d(x, y) { return this.ax ? this.k.d(x, -y) : this.k.d(-x, y); } }
class Offset2 extends Shape { constructor(k, r) { super(); this.k = k; this.r = r; this.L = k.L; const b = k.bb, g = Math.max(r, 0); this.bb = [b[0] - g, b[1] - g, b[2] + g, b[3] + g]; } d(x, y) { return this.k.d(x, y) - this.r; } }
const bb2dist = (b, x, y) => { const dx = Math.max(b[0] - x, 0, x - b[2]), dy = Math.max(b[1] - y, 0, y - b[3]); return Math.hypot(dx, dy); };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; };
const smax = (a, b, k) => -smin(-a, -b, k);
class Union2 extends Shape {
  constructor(ks, k) { super(); this.ks = ks; this.k = k; this.L = Math.max(...ks.map(q => q.L)); this.bb = [Math.min(...ks.map(q => q.bb[0])) - k, Math.min(...ks.map(q => q.bb[1])) - k, Math.max(...ks.map(q => q.bb[2])) + k, Math.max(...ks.map(q => q.bb[3])) + k]; }
  d(x, y) { const ks = this.ks, k = this.k; let m = Infinity; for (let i = 0; i < ks.length; i++) { const q = ks[i]; if (bb2dist(q.bb, x, y) >= m + k) continue; const v = q.d(x, y); m = k > 0 && m < Infinity ? smin(m, v, k) : Math.min(m, v); } return m; }
}
class Inter2 extends Shape {
  constructor(ks, k) { super(); this.ks = ks; this.k = k; this.L = Math.max(...ks.map(q => q.L)); this.bb = [Math.max(...ks.map(q => q.bb[0])), Math.max(...ks.map(q => q.bb[1])), Math.min(...ks.map(q => q.bb[2])), Math.min(...ks.map(q => q.bb[3]))]; }
  d(x, y) { const ks = this.ks, k = this.k; let m = -Infinity; for (let i = 0; i < ks.length; i++) { const v = ks[i].d(x, y); m = k > 0 && m > -Infinity ? smax(m, v, k) : Math.max(m, v); } return m; }
}
class Diff2 extends Shape {
  constructor(a, b, k) { super(); this.a = a; this.b = b; this.k = k; this.L = Math.max(a.L, b.L); this.bb = a.bb.slice(); }
  d(x, y) { const r = this.a.d(x, y), bd = bb2dist(this.b.bb, x, y); if (bd > this.k && -bd <= r - this.k) return r; const v = -this.b.d(x, y); return this.k > 0 ? smax(r, v, this.k) : Math.max(r, v); }
}

/* ---------------- 3D solids ---------------- */
const bb3dist = (b, x, y, z) => { const dx = Math.max(b[0] - x, 0, x - b[3]), dy = Math.max(b[1] - y, 0, y - b[4]), dz = Math.max(b[2] - z, 0, z - b[5]); return Math.sqrt(dx * dx + dy * dy + dz * dz); };
const bbUnion = bs => [0, 1, 2].map(i => Math.min(...bs.map(b => b[i]))).concat([3, 4, 5].map(i => Math.max(...bs.map(b => b[i]))));
const rotM = (rx, ry, rz) => {   // turn about X, then Y, then Z (degrees)
  const a = rx * D2R, b = ry * D2R, c = rz * D2R, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa, sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa, -sb, cb * sa, cb * ca];
};
const mmul = (A, B) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]));
const axisM = (ax, deg) => { let [x, y, z] = ax; const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l; const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R), t = 1 - c; return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c]; };
class Solid {
  // subclasses set: bb = [x0, y0, z0, x1, y1, z1], L
  move(x = 0, y = 0, z = 0) { if (Array.isArray(x)) [x, y, z] = x; return new Xf3(this, null, [num(x, 0), num(y, 0), num(z, 0)], 1); }
  moveX(v) { return this.move(v, 0, 0); } moveY(v) { return this.move(0, v, 0); } moveZ(v) { return this.move(0, 0, v); }
  rotate(rx = 0, ry = 0, rz = 0) { if (Array.isArray(rx)) [rx, ry, rz] = rx; return new Xf3(this, rotM(num(rx, 0), num(ry, 0), num(rz, 0)), [0, 0, 0], 1); }
  rotateX(a) { return this.rotate(a, 0, 0); } rotateY(a) { return this.rotate(0, a, 0); } rotateZ(a) { return this.rotate(0, 0, a); }
  rotateAbout(axis, deg, point = [0, 0, 0]) { const m = axisM(axis, num(deg, 0)); return this.move(-point[0], -point[1], -point[2])._m(m).move(point[0], point[1], point[2]); }
  _m(m) { return new Xf3(this, m, [0, 0, 0], 1); }
  scale(s, sy, sz) { if (Array.isArray(s)) [s, sy, sz] = s; if (sy === undefined && sz === undefined) return new Xf3(this, null, [0, 0, 0], pos(s, 1, 'scale')); return new Scale3(this, pos(s, 1, 'scale'), pos(sy, 1, 'scale'), pos(sz, 1, 'scale')); }
  mirror(axis = 'x') { const i = { x: 0, y: 1, z: 2 }[axis] ?? 0, m = [1, 0, 0, 0, 1, 0, 0, 0, 1]; m[i * 4] = -1; return new Xf3(this, m, [0, 0, 0], 1); }
  grow(r) { r = num(r, 0); return r ? new Offset3(this, r) : this; }
  shrink(r) { return this.grow(-num(r, 0)); }
  round(r) { r = num(r, 0); return r > 0 ? this.shrink(r).grow(r) : this; }
  shell(t) { return new Shell3(this, pos(t, 1, 'wall thickness')); }
  clip(o = {}) {       // keep the part inside the given ranges: clip({ z: [0, 20] }) or clip({ zmax: 20 })
    const b = [-Infinity, -Infinity, -Infinity, Infinity, Infinity, Infinity];
    'xyz'.split('').forEach((a, i) => { if (Array.isArray(o[a])) { b[i] = num(o[a][0], -Infinity); b[i + 3] = num(o[a][1], Infinity); } if (o[a + 'min'] !== undefined) b[i] = +o[a + 'min']; if (o[a + 'max'] !== undefined) b[i + 3] = +o[a + 'max']; });
    return new Inter3([this, new Slab3(b)], 0);
  }
  bounds() { const b = this.bb; return { min: [b[0], b[1], b[2]], max: [b[3], b[4], b[5]], size: [b[3] - b[0], b[4] - b[1], b[5] - b[2]], center: [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2] }; }
  center(axes = 'xy') { const b = this.bb; return this.move(axes.includes('x') ? -(b[0] + b[3]) / 2 : 0, axes.includes('y') ? -(b[1] + b[4]) / 2 : 0, axes.includes('z') ? -(b[2] + b[5]) / 2 : 0); }
  onBed() { return this.move(0, 0, -this.bb[2]); }
  fit(o = {}) {        // one scale for the whole solid so that it measures this much: fit({ z: 80 }) makes it 80 mm tall
    const b = this.bb; let s = Infinity; 'xyz'.split('').forEach((a, i) => { const want = +(o[a] ?? o[{ x: 'width', y: 'depth', z: 'height' }[a]]); if (want > 0) s = Math.min(s, want / (b[i + 3] - b[i])); });
    return Number.isFinite(s) && s > 0 ? this.scale(s) : this;
  }
}
class Box3 extends Solid {
  constructor(hx, hy, hz, r) { super(); this.hx = hx; this.hy = hy; this.hz = hz; this.r = Math.min(r, hx, hy, hz); this.bb = [-hx, -hy, -hz, hx, hy, hz]; this.L = 1; }
  d(x, y, z) { const r = this.r, qx = Math.abs(x) - this.hx + r, qy = Math.abs(y) - this.hy + r, qz = Math.abs(z) - this.hz + r, ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0; return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r; }
}
class Slab3 extends Solid { constructor(b) { super(); this.bb = b; this.L = 1; } d(x, y, z) { const b = this.bb; return Math.max(b[0] - x, x - b[3], b[1] - y, y - b[4], b[2] - z, z - b[5]); } }
class Sphere3 extends Solid { constructor(r) { super(); this.r = r; this.bb = [-r, -r, -r, r, r, r]; this.L = 1; } d(x, y, z) { return Math.sqrt(x * x + y * y + z * z) - this.r; } }
// A cylinder or cone standing on z = 0, optionally with rounded rims.
class Cyl3 extends Solid {
  constructor(r1, r2, h, rr) { super(); this.r1 = r1; this.r2 = r2; this.hh = h / 2; this.rr = rr; const R = Math.max(r1, r2); this.bb = [-R, -R, 0, R, R, h]; this.L = 1; }
  d(x, y, z) {
    const rr = this.rr, r1 = this.r1 - rr, r2 = this.r2 - rr, h = this.hh - rr, qx = Math.sqrt(x * x + y * y), qy = z - this.hh;
    if (r1 === r2) { const dx = qx - r1, dy = Math.abs(qy) - h; return Math.min(Math.max(dx, dy), 0) + Math.hypot(dx > 0 ? dx : 0, dy > 0 ? dy : 0) - rr; }
    const k2x = r2 - r1, k2y = 2 * h, cax = qx - Math.min(qx, qy < 0 ? r1 : r2), cay = Math.abs(qy) - h;
    const t = clampN(((r2 - qx) * k2x + (h - qy) * k2y) / (k2x * k2x + k2y * k2y), 0, 1), cbx = qx - r2 + k2x * t, cby = qy - h + k2y * t, s = (cbx < 0 && cay < 0) ? -1 : 1;
    return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby)) - rr;
  }
}
class Torus3 extends Solid { constructor(R, r) { super(); this.R = R; this.r = r; this.bb = [-R - r, -R - r, -r, R + r, R + r, r]; this.L = 1; } d(x, y, z) { return Math.hypot(Math.hypot(x, y) - this.R, z) - this.r; } }
// A round bar along a path of points (rounded ends and joints).
class Tube3 extends Solid {
  constructor(pts, r) { super(); this.p = pts; this.r = r; this.L = 1; this.bb = [0, 1, 2].map(i => Math.min(...pts.map(p => p[i])) - r).concat([0, 1, 2].map(i => Math.max(...pts.map(p => p[i])) + r)); }
  d(x, y, z) { const p = this.p; let best = Infinity; for (let i = 0; i < p.length - 1 || (i === 0 && p.length === 1); i++) { const a = p[i], b = p[i + 1] || a, ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], px = x - a[0], py = y - a[1], pz = z - a[2], l2 = ex * ex + ey * ey + ez * ez, t = l2 > 0 ? clampN((px * ex + py * ey + pz * ez) / l2, 0, 1) : 0, dx = px - ex * t, dy = py - ey * t, dz = pz - ez * t, q = dx * dx + dy * dy + dz * dz; if (q < best) best = q; } return Math.sqrt(best) - this.r; }
}
class Half3 extends Solid { constructor(n, o) { super(); const l = Math.hypot(...n) || 1; this.n = n.map(v => v / l); this.o = o; this.bb = [-Infinity, -Infinity, -Infinity, Infinity, Infinity, Infinity]; this.L = 1; } d(x, y, z) { return x * this.n[0] + y * this.n[1] + z * this.n[2] - this.o; } }
// A 2D shape pulled up from z = 0 to z = h, optionally twisting or narrowing on the way.
class Extrude3 extends Solid {
  constructor(sh, h, twist, top) {
    super(); this.sh = sh; this.h = h; this.tw = twist * D2R / h; this.top = top; const b = sh.bb, R = Math.max(Math.hypot(b[0], b[1]), Math.hypot(b[2], b[1]), Math.hypot(b[2], b[3]), Math.hypot(b[0], b[3])), g = Math.max(1, top);
    this.bb = twist ? [-R * g, -R * g, 0, R * g, R * g, h] : [Math.min(b[0], b[0] * top), Math.min(b[1], b[1] * top), 0, Math.max(b[2], b[2] * top), Math.max(b[3], b[3] * top), h];
    this.plain = !twist && top === 1; this.ms = Math.min(1, top); this.L = (sh.L || 1) * (this.plain ? 1 : Math.sqrt(1 + (R * this.tw) ** 2 + (R * (top - 1) / h / this.ms) ** 2));
  }
  d(x, y, z) {
    let d2;
    if (this.plain) d2 = this.sh.d(x, y);
    else { const zc = clampN(z, 0, this.h), a = -this.tw * zc, c = Math.cos(a), s = Math.sin(a), k = 1 + (this.top - 1) * zc / this.h; d2 = this.sh.d((x * c - y * s) / k, (x * s + y * c) / k) * this.ms; }
    const dz = Math.abs(z - this.h / 2) - this.h / 2; return Math.min(Math.max(d2, dz), 0) + Math.hypot(d2 > 0 ? d2 : 0, dz > 0 ? dz : 0);
  }
}
// A 2D profile (x = distance from the axis, y = height) spun around the Z axis.
class Revolve3 extends Solid {
  constructor(sh) { super(); this.sh = sh; const b = sh.bb, R = Math.max(Math.abs(b[0]), Math.abs(b[2])); this.bb = [-R, -R, b[1], R, R, b[3]]; this.L = sh.L || 1; }
  d(x, y, z) { return this.sh.d(Math.sqrt(x * x + y * y), z); }
}
// A screw thread around Z from z = 0 to z = len (ISO-like 60 degree profile).
class Thread3 extends Solid {
  constructor(dia, pitch, len) { super(); this.rm = dia / 2 - .27 * pitch; this.a = .27 * pitch; this.p = pitch; this.len = len; const R = dia / 2; this.bb = [-R, -R, 0, R, R, len]; this.L = 1.7; }
  d(x, y, z) { const rho = Math.sqrt(x * x + y * y); let u = z / this.p - Math.atan2(y, x) / (2 * Math.PI); u -= Math.floor(u); const f = rho - (this.rm + this.a * (1 - 4 * Math.abs(u - .5))); return Math.max(f, -z, z - this.len); }
}
// An imported mesh, sampled once into a grid of distances (see voxelize).
class Grid3 extends Solid {
  constructor(g) { super(); Object.assign(this, g); this.bb = g.bb; this.L = 1.75; }
  d(x, y, z) {
    const c = this.c, nx = this.nx, ny = this.ny, nz = this.nz, mx = (nx - 1) * c, my = (ny - 1) * c, mz = (nz - 1) * c; let u = x - this.x0, v = y - this.y0, w = z - this.z0, out = 0;
    if (u < 0 || v < 0 || w < 0 || u > mx || v > my || w > mz) { const cu = clampN(u, 0, mx), cv = clampN(v, 0, my), cw = clampN(w, 0, mz); out = Math.sqrt((u - cu) ** 2 + (v - cv) ** 2 + (w - cw) ** 2); u = cu; v = cv; w = cw; }
    let i = Math.floor(u / c), j = Math.floor(v / c), k = Math.floor(w / c); if (i > nx - 2) i = nx - 2; if (j > ny - 2) j = ny - 2; if (k > nz - 2) k = nz - 2;
    const fu = u / c - i, fv = v / c - j, fw = w / c - k, a = this.a, sx = nx, sxy = nx * ny, q = k * sxy + j * sx + i;
    const c00 = a[q] + (a[q + 1] - a[q]) * fu, c10 = a[q + sx] + (a[q + sx + 1] - a[q + sx]) * fu, c01 = a[q + sxy] + (a[q + sxy + 1] - a[q + sxy]) * fu, c11 = a[q + sxy + sx] + (a[q + sxy + sx + 1] - a[q + sxy + sx]) * fu;
    const c0 = c00 + (c10 - c00) * fv, c1 = c01 + (c11 - c01) * fv; return c0 + (c1 - c0) * fw + out;
  }
}
// Rigid move (rotation matrix m, then translation t) with one scale for all axes: distances stay true.
class Xf3 extends Solid {
  constructor(k, m, t, s) {
    super(); if (k instanceof Xf3) { const km = k.m || [1, 0, 0, 0, 1, 0, 0, 0, 1], M = m || [1, 0, 0, 0, 1, 0, 0, 0, 1]; const nt = [0, 1, 2].map(i => (M[i * 3] * k.t[0] + M[i * 3 + 1] * k.t[1] + M[i * 3 + 2] * k.t[2]) * s + t[i]); m = (m || k.m) ? mmul(M, km) : null; t = nt; s = s * k.s; k = k.k; }   // fold a chain of moves into one
    this.k = k; this.m = m; this.t = t; this.s = s; this.L = k.L;
    const b = k.bb, M = m || [1, 0, 0, 0, 1, 0, 0, 0, 1], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let c = 0; c < 8; c++) { const p = [b[c & 1 ? 3 : 0], b[c & 2 ? 4 : 1], b[c & 4 ? 5 : 2]]; for (let i = 0; i < 3; i++) { let v = 0; for (let j = 0; j < 3; j++) if (M[i * 3 + j] !== 0) v += M[i * 3 + j] * p[j]; v = v * s + t[i]; if (Number.isNaN(v)) { lo[i] = -Infinity; hi[i] = Infinity; continue; } if (v < lo[i]) lo[i] = v; if (v > hi[i]) hi[i] = v; } }   // endless parts (a halfspace) stay endless
    this.bb = [lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]];
  }
  d(x, y, z) { const t = this.t, s = this.s, m = this.m, u = (x - t[0]) / s, v = (y - t[1]) / s, w = (z - t[2]) / s; return m ? this.k.d(m[0] * u + m[3] * v + m[6] * w, m[1] * u + m[4] * v + m[7] * w, m[2] * u + m[5] * v + m[8] * w) * s : this.k.d(u, v, w) * s; }
}
class Scale3 extends Solid {   // different scale per axis: the field becomes a safe under-estimate
  constructor(k, sx, sy, sz) { super(); this.k = k; this.sx = sx; this.sy = sy; this.sz = sz; this.m = Math.min(sx, sy, sz); this.L = k.L; const b = k.bb; this.bb = [b[0] * sx, b[1] * sy, b[2] * sz, b[3] * sx, b[4] * sy, b[5] * sz]; }
  d(x, y, z) { return this.k.d(x / this.sx, y / this.sy, z / this.sz) * this.m; }
}
class Offset3 extends Solid { constructor(k, r) { super(); this.k = k; this.r = r; this.L = k.L; const b = k.bb, g = Math.max(r, 0); this.bb = [b[0] - g, b[1] - g, b[2] - g, b[3] + g, b[4] + g, b[5] + g]; } d(x, y, z) { return this.k.d(x, y, z) - this.r; } }
class Shell3 extends Solid { constructor(k, t) { super(); this.k = k; this.t = t; this.L = k.L; this.bb = k.bb.slice(); } d(x, y, z) { const v = this.k.d(x, y, z); return Math.max(v, -(v + this.t)); } }
class Union3 extends Solid {
  constructor(ks, k) { super(); this.ks = ks; this.k = k; this.L = Math.max(...ks.map(q => q.L)); const b = bbUnion(ks.map(q => q.bb)); this.bb = [b[0] - k, b[1] - k, b[2] - k, b[3] + k, b[4] + k, b[5] + k]; }
  d(x, y, z) { const ks = this.ks, k = this.k; let m = Infinity; for (let i = 0; i < ks.length; i++) { const q = ks[i]; if (bb3dist(q.bb, x, y, z) >= m + k) continue; const v = q.d(x, y, z); m = k > 0 && m < Infinity ? smin(m, v, k) : (v < m ? v : m); } return m; }
  // the same, when only values below m0 matter (exact below m0, m0 otherwise): whole groups far from the point are never asked
  dMin(x, y, z, m0) { const ks = this.ks; let m = m0; for (let i = 0; i < ks.length; i++) { const q = ks[i]; if (bb3dist(q.bb, x, y, z) >= m) continue; const v = q.dMin ? q.dMin(x, y, z, m) : q.d(x, y, z); if (v < m) m = v; } return m; }
}
class Inter3 extends Solid {
  constructor(ks, k) { super(); this.ks = ks; this.k = k; this.L = Math.max(...ks.map(q => q.L)); this.bb = [0, 1, 2].map(i => Math.max(...ks.map(q => q.bb[i]))).concat([3, 4, 5].map(i => Math.min(...ks.map(q => q.bb[i])))); }
  d(x, y, z) { const ks = this.ks, k = this.k; let m = -Infinity; for (let i = 0; i < ks.length; i++) { const v = ks[i].d(x, y, z); m = k > 0 && m > -Infinity ? smax(m, v, k) : (v > m ? v : m); } return m; }
}
class Diff3 extends Solid {
  constructor(a, b, k) { super(); this.a = a; this.b = b; this.k = k; this.L = Math.max(a.L, b.L); this.bb = a.bb.slice(); }
  d(x, y, z) { const r = this.a.d(x, y, z), k = this.k, b = this.b, bd = bb3dist(b.bb, x, y, z); if (bd > k && -bd <= r - k) return r; if (k === 0 && b.dMin && b.k === 0) { const u = b.dMin(x, y, z, -r); return u < -r ? -u : r; } const v = -b.d(x, y, z); return k > 0 ? smax(r, v, k) : (r > v ? r : v); }
}

/* ---------------- the modelling vocabulary (what a model's code may call) ---------------- */
const flat = a => a.flat(Infinity).filter(Boolean);
function takeOpts(args) { const o = args.length && isOpts(args[args.length - 1]) ? args.pop() : {}; return o; }
const kOf = o => Math.max(0, num(o.fillet ?? o.blend ?? o.smooth, 0));
const dimOf = list => { const d = list[0] instanceof Shape ? 2 : 3; for (const q of list) { if (!(q instanceof Shape) && !(q instanceof Solid)) throw new Error('union/cut/intersect take shapes or solids, got ' + (q === undefined ? 'undefined' : typeof q)); if ((q instanceof Shape ? 2 : 3) !== d) throw new Error('Cannot combine a flat shape with a solid: extrude the shape first'); } return d; };
function union(...args) { const o = takeOpts(args), ks = flat(args); if (!ks.length) throw new Error('union needs at least one solid'); if (ks.length === 1) return ks[0]; const k = kOf(o); if (dimOf(ks) === 2) return new Union2(ks, k); if (!k) return new Union3(groupFar(ks), 0);
  const b = bbUnion(ks.map(q => q.bb)); return new Inter3([new Union3(ks, k), new Slab3(b)], 0); }   // a blended join would bulge where two faces are flush (both resting on the bed): the box that holds the parts trims that off
function cut(a, ...rest) { const o = takeOpts(rest), tools = flat(rest); if (!(a instanceof Solid) && !(a instanceof Shape)) throw new Error('cut needs a solid to cut from'); if (!tools.length) return a; const k = kOf(o), d = dimOf([a, ...tools]), tool = tools.length === 1 ? tools[0] : (d === 2 ? new Union2(tools, 0) : new Union3(groupFar(tools), 0)); return d === 2 ? new Diff2(a, tool, k) : new Diff3(a, tool, k); }
function intersect(...args) { const o = takeOpts(args), ks = flat(args); if (!ks.length) throw new Error('intersect needs at least one solid'); if (ks.length === 1) return ks[0]; return dimOf(ks) === 2 ? new Inter2(ks, kOf(o)) : new Inter3(ks, kOf(o)); }
// Many parts in one union (a field of holes, a row of fins) are bundled by neighbourhood, so a point only asks the nearby ones.
function groupFar(ks) {
  if (ks.length <= 10) return ks;
  const ax = [0, 1, 2].map(i => Math.max(...ks.map(q => q.bb[i + 3])) - Math.min(...ks.map(q => q.bb[i]))), a = ax.indexOf(Math.max(...ax.filter(Number.isFinite)));
  if (a < 0) return ks; const s = ks.slice().sort((p, q) => (p.bb[a] + p.bb[a + 3]) - (q.bb[a] + q.bb[a + 3])), n = Math.ceil(Math.sqrt(s.length)), out = [];
  for (let i = 0; i < s.length; i += n) { const g = s.slice(i, i + n); out.push(g.length === 1 ? g[0] : new Union3(g, 0)); }
  return out;
}
// 2D
function rect(w, h, o = {}) { if (isOpts(h)) { o = h; h = w; } return new Rect2(pos(w, undefined, 'rect width'), pos(h ?? w, undefined, 'rect height'), Math.max(0, num(typeof o === 'number' ? o : (o.r ?? o.radius), 0))); }
function circle(r) { if (isOpts(r)) r = r.r ?? (r.d ?? r.diameter) / 2; return new Circle2(pos(r, undefined, 'circle radius')); }
function ellipse(a, b) { return new Ellipse2(pos(a, undefined, 'ellipse radius'), pos(b, undefined, 'ellipse radius')); }
function polygon(pts) { if (!Array.isArray(pts) || pts.length < 3) throw new Error('polygon needs a list of at least 3 [x, y] points'); const many = Array.isArray(pts[0][0]); return autoGrid(new Poly2(many ? pts : [pts], many)); }
function ngon(n, r) { n = Math.max(3, Math.round(n)); r = pos(r, undefined, 'ngon radius'); return polygon(Array.from({ length: n }, (_, i) => [r * Math.cos(2 * Math.PI * i / n), r * Math.sin(2 * Math.PI * i / n)])); }
function star(n, ro, ri) { n = Math.max(3, Math.round(n)); return polygon(Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? pos(ri, undefined, 'star inner radius') : pos(ro, undefined, 'star outer radius'), a = Math.PI * i / n + Math.PI / 2; return [r * Math.cos(a), r * Math.sin(a)]; })); }
function slot(len, w) { len = pos(len, undefined, 'slot length'); w = pos(w, undefined, 'slot width'); return new Rect2(Math.max(len, w), w, w / 2); }   // overall length, width; round ends
function ring(ro, ri) { return new Diff2(circle(ro), circle(ri), 0); }
function sector(r, a0, a1) { r = pos(r, undefined, 'sector radius'); const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 6)), p = [[0, 0]]; for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * D2R; p.push([r * 1.02 * Math.cos(a), r * 1.02 * Math.sin(a)]); } return new Inter2([new Poly2([p], false), new Circle2(r)], 0); }
const autoGrid = p => p.s.length / 4 > 48 ? new Grid2(p, Math.max(.02, Math.min(p.bb[2] - p.bb[0], p.bb[3] - p.bb[1]) / 220, Math.max(p.bb[2] - p.bb[0], p.bb[3] - p.bb[1]) / 900)) : p;
// 3D
function box(w, d, h, o = {}) { if (Array.isArray(w)) { o = d || {}; [w, d, h] = w; } w = pos(w, undefined, 'box width'); d = pos(d, undefined, 'box depth'); h = pos(h, undefined, 'box height'); const r = Math.max(0, num(typeof o === 'number' ? o : (o.r ?? o.radius ?? o.round), 0)); return new Xf3(new Box3(w / 2, d / 2, h / 2, r), null, [0, 0, h / 2], 1); }
function cylinder(r, h, o = {}) { if (isOpts(r)) { o = r; h = o.h ?? o.height; r = o.r ?? (o.d ?? o.diameter) / 2; } r = pos(r, undefined, 'cylinder radius'); h = pos(h, undefined, 'cylinder height'); const r2 = o.r2 !== undefined ? Math.max(0, +o.r2) : (o.d2 !== undefined ? Math.max(0, o.d2 / 2) : r), rr = Math.max(0, Math.min(num(o.round ?? o.fillet, 0), h / 2, Math.min(r, r2 || r))); return new Cyl3(r, r2, h, rr); }
function cone(r1, r2, h) { if (h === undefined) { h = r2; r2 = 0; } return new Cyl3(pos(r1, undefined, 'cone radius'), Math.max(0, +r2 || 0), pos(h, undefined, 'cone height'), 0); }
function sphere(r) { if (isOpts(r)) r = r.r ?? (r.d ?? r.diameter) / 2; return new Sphere3(pos(r, undefined, 'sphere radius')); }
function torus(R, r) { return new Torus3(pos(R, undefined, 'torus radius'), pos(r, undefined, 'torus tube radius')); }
const pt3 = (p, what) => { if (!Array.isArray(p) || p.length < 2) throw new Error(`${what} needs [x, y, z] points`); return [num(p[0], 0), num(p[1], 0), num(p[2], 0)]; };
function tube(points, r) { if (!Array.isArray(points) || !points.length) throw new Error('tube needs a list of [x, y, z] points'); return new Tube3(points.map(p => pt3(p, 'tube')), pos(r, undefined, 'tube radius')); }
function capsule(a, b, r) { return tube([a, b], r); }
function rod(a, b, r, o = {}) {       // a straight bar with flat ends from point a to point b
  a = pt3(a, 'rod'); b = pt3(b, 'rod'); r = pos(r, undefined, 'rod radius'); const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...v); if (!(len > 0)) throw new Error('rod needs two different points');
  const z = v.map(q => q / len), up = Math.abs(z[2]) < .99 ? [0, 0, 1] : [1, 0, 0], x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]], xl = Math.hypot(...x), X = x.map(q => q / xl), Y = [z[1] * X[2] - z[2] * X[1], z[2] * X[0] - z[0] * X[2], z[0] * X[1] - z[1] * X[0]];
  return new Xf3(cylinder(r, len, o), [X[0], Y[0], z[0], X[1], Y[1], z[1], X[2], Y[2], z[2]], a, 1);
}
function halfspace(normal, offset = 0) { return new Half3(pt3(normal, 'halfspace'), num(offset, 0)); }   // everything on the far side of a plane is removed when intersected
function extrude(shape, h, o = {}) { if (!(shape instanceof Shape)) throw new Error('extrude needs a flat shape (rect, circle, polygon, text …)'); h = pos(h, undefined, 'extrude height'); const e = new Extrude3(shape, h, num(o.twist, 0), Math.max(.01, num(o.taper ?? o.scaleTop, 1))); return o.center ? e.move(0, 0, -h / 2) : e; }
function revolve(shape, o = {}) { if (!(shape instanceof Shape)) throw new Error('revolve needs a flat profile (x = distance from the axis, y = height)'); const r = new Revolve3(shape), a = num(o.angle, 360); if (a >= 360) return r; const R = Math.max(Math.abs(shape.bb[0]), Math.abs(shape.bb[2])) * 1.5 + 1; return new Inter3([r, new Extrude3(sector(R, 0, a), shape.bb[3] - shape.bb[1] + 2, 0, 1).move(0, 0, shape.bb[1] - 1)], 0); }
function thread(dia, pitch, len) { return new Thread3(pos(dia, undefined, 'thread diameter'), pos(pitch, undefined, 'thread pitch'), pos(len, undefined, 'thread length')); }
// helpers for repeating things
function array(solid, n, step) { const s = pt3(step, 'array'); return union(Array.from({ length: Math.max(1, Math.round(n)) }, (_, i) => i ? solid.move(s[0] * i, s[1] * i, s[2] * i) : solid)); }
function polar(solid, n, o = {}) { n = Math.max(1, Math.round(n)); const R = num(o.radius ?? o.r, 0), a0 = num(o.start, 0), span = num(o.angle, 360), step = span >= 360 ? span / n : span / Math.max(1, n - 1); return union(Array.from({ length: n }, (_, i) => (R ? solid.move(R, 0, 0) : solid).rotate(0, 0, a0 + step * i))); }
function grid(solid, nx, ny, dx, dy) { const out = []; nx = Math.max(1, Math.round(nx)); ny = Math.max(1, Math.round(ny)); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out.push(solid.move((i - (nx - 1) / 2) * dx, (j - (ny - 1) / 2) * dy, 0)); return union(out); }

/* ---------------- lettering: a small TrueType reader ---------------- */
const FONTS = {};   // name → parsed font
function parseFont(buf) {
  const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, buf.byteLength), u16 = o => dv.getUint16(o), i16 = o => dv.getInt16(o), u32 = o => dv.getUint32(o), tabs = {};
  const n = u16(4); for (let i = 0; i < n; i++) { const o = 12 + i * 16; tabs[String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3))] = u32(o + 8); }
  for (const t of ['head', 'hhea', 'hmtx', 'maxp', 'loca', 'glyf', 'cmap']) if (!(t in tabs)) throw new Error('This font file is not supported (needs TrueType outlines)');
  const em = u16(tabs.head + 18), long = i16(tabs.head + 50), nGlyph = u16(tabs.maxp + 4), nH = u16(tabs.hhea + 34);
  let cap = 0; if (tabs['OS/2'] && u16(tabs['OS/2']) >= 2) cap = i16(tabs['OS/2'] + 88);
  // character → glyph (formats 4 and 12)
  const cm = tabs.cmap, nt = u16(cm + 2); let sub = 0, best = -1;
  for (let i = 0; i < nt; i++) { const p = u16(cm + 4 + i * 8), e = u16(cm + 6 + i * 8), off = u32(cm + 8 + i * 8), f = u16(cm + off), sc = (f === 12 ? 4 : f === 4 ? 2 : 0) + ((p === 3 && (e === 1 || e === 10)) || p === 0 ? 1 : 0); if (sc > best && (f === 4 || f === 12)) { best = sc; sub = cm + off; } }
  if (!sub) throw new Error('This font has no usable character map');
  const fmt = u16(sub); let glyphOf;
  if (fmt === 4) { const sc = u16(sub + 6) / 2, end = sub + 14, start = end + sc * 2 + 2, delta = start + sc * 2, ro = delta + sc * 2;
    glyphOf = c => { for (let i = 0; i < sc; i++) { if (c <= u16(end + i * 2)) { const s = u16(start + i * 2); if (c < s) return 0; const r = u16(ro + i * 2); if (!r) return (c + i16(delta + i * 2)) & 0xffff; const g = u16(ro + i * 2 + r + (c - s) * 2); return g ? (g + i16(delta + i * 2)) & 0xffff : 0; } } return 0; };
  } else { const ng = u32(sub + 12); glyphOf = c => { for (let i = 0; i < ng; i++) { const o = sub + 16 + i * 12; if (c >= u32(o) && c <= u32(o + 4)) return u32(o + 8) + c - u32(o); } return 0; }; }
  const loc = g => long ? u32(tabs.loca + g * 4) : u16(tabs.loca + g * 2) * 2, adv = g => u16(tabs.hmtx + Math.min(g, nH - 1) * 4);
  function outline(g, depth = 0) {      // → list of contours, each a list of [x, y] in font units, curves already flattened
    if (g >= nGlyph || depth > 4) return []; const o0 = loc(g), o1 = loc(g + 1); if (o1 <= o0) return [];
    let o = tabs.glyf + o0; const nc = i16(o); o += 10;
    if (nc < 0) {       // a glyph made of other glyphs (accented letters)
      const out = []; for (; ;) { const fl = u16(o), gi = u16(o + 2); o += 4; let dx, dy; if (fl & 1) { dx = i16(o); dy = i16(o + 2); o += 4; } else { dx = dv.getInt8(o); dy = dv.getInt8(o + 1); o += 2; }
        let a = 1, b = 0, c = 0, d = 1; const f2 = q => i16(q) / 16384; if (fl & 8) { a = d = f2(o); o += 2; } else if (fl & 0x40) { a = f2(o); d = f2(o + 2); o += 4; } else if (fl & 0x80) { a = f2(o); b = f2(o + 2); c = f2(o + 4); d = f2(o + 6); o += 8; }
        for (const ct of outline(gi, depth + 1)) out.push(ct.map(([x, y]) => [x * a + y * c + dx, x * b + y * d + dy])); if (!(fl & 0x20)) break; }
      return out;
    }
    const ends = []; for (let i = 0; i < nc; i++) { ends.push(u16(o)); o += 2; } const np = nc ? ends[nc - 1] + 1 : 0; o += 2 + u16(o);
    const fl = []; while (fl.length < np) { const f = dv.getUint8(o++); fl.push(f); if (f & 8) { let r = dv.getUint8(o++); while (r-- > 0) fl.push(f); } }
    const xs = [], ys = []; let v = 0; for (let i = 0; i < np; i++) { const f = fl[i]; if (f & 2) { const q = dv.getUint8(o++); v += f & 16 ? q : -q; } else if (!(f & 16)) { v += i16(o); o += 2; } xs.push(v); } v = 0;
    for (let i = 0; i < np; i++) { const f = fl[i]; if (f & 4) { const q = dv.getUint8(o++); v += f & 32 ? q : -q; } else if (!(f & 32)) { v += i16(o); o += 2; } ys.push(v); }
    const out = []; let s = 0;
    for (const e of ends) {
      const pts = []; for (let i = s; i <= e; i++) pts.push([xs[i], ys[i], fl[i] & 1]); s = e + 1; if (pts.length < 2) continue;
      // start on a point that is on the curve (or on the midpoint between two control points)
      let st = pts.findIndex(p => p[2]); let ring; if (st < 0) { const a = pts[0], b = pts[pts.length - 1]; ring = [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 1], ...pts]; } else ring = pts.slice(st).concat(pts.slice(0, st));
      const c = [[ring[0][0], ring[0][1]]]; let cur = ring[0];
      for (let i = 1; i <= ring.length; i++) { const p = ring[i % ring.length]; if (p[2]) { c.push([p[0], p[1]]); cur = p; continue; } const nx = ring[(i + 1) % ring.length], endp = nx[2] ? nx : [(p[0] + nx[0]) / 2, (p[1] + nx[1]) / 2, 1];
        for (let k = 1; k <= 6; k++) { const t = k / 6, u = 1 - t; c.push([u * u * cur[0] + 2 * u * t * p[0] + t * t * endp[0], u * u * cur[1] + 2 * u * t * p[1] + t * t * endp[1]]); } cur = endp; if (nx[2]) i++; }
      if (c.length > 1 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) c.pop(); if (c.length >= 3) out.push(c);
    }
    return out;
  }
  let capH = cap; if (!(capH > 0)) { const h = outline(glyphOf(72)); capH = h.length ? Math.max(...h.flat().map(p => p[1])) : em * .72; }
  return { em, capH, glyphOf, adv, outline, shapes: new Map() };
}
function addFont(name, buf) { FONTS[name] = parseFont(buf); }
// text('Hello', 10): letters 10 mm tall (capital height), centred on the origin. Options: font, align ('center' | 'left' | 'right'), spacing.
function text(str, size = 10, o = {}) {
  str = String(str ?? ''); size = pos(size, 10, 'text size'); const name = FONTS[o.font] ? o.font : (o.font && Object.keys(FONTS).find(k => k.includes(String(o.font).toLowerCase()))) || Object.keys(FONTS)[0];
  const F = FONTS[name]; if (!F) throw new Error('No font is loaded for text'); const k = size / F.capH, sp = num(o.spacing, 0), parts = []; let x = 0;
  for (const ch of str) {
    const g = F.glyphOf(ch.codePointAt(0)), a = F.adv(g) * k;
    if (ch !== ' ') { let sh = F.shapes.get(g); if (sh === undefined) { const c = F.outline(g); sh = c.length ? new Grid2(new Poly2(c, false), F.capH / 90) : null; F.shapes.set(g, sh); } if (sh) parts.push(new Xf2(sh, 0, x, 0, k, false)); }
    x += a + sp;
  }
  if (!parts.length) throw new Error(`text("${str}") has no printable letters in this font`);
  const w = x - sp, al = o.align || 'center', ox = al === 'left' ? 0 : al === 'right' ? -w : -w / 2, oy = o.baseline ? 0 : -size / 2, u = parts.length === 1 ? parts[0] : new Union2(parts, 0);
  return new Xf2(u, 0, ox, oy, 1, false);
}

/* ---------------- an imported mesh becomes a solid ---------------- */
// positions: Float32Array of xyz, indices: triangle corner indices. Returns a Grid3: distances sampled on a grid of about `res` cells along the longest side.
function voxelize(positions, indices, res = 176, onStep) {
  const nV = positions.length / 3, nT = indices.length / 3, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nV; i++) for (let a = 0; a < 3; a++) { const v = positions[i * 3 + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
  const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]); if (!(ext > 0)) throw new Error('The imported mesh is empty');
  const c = ext / res, pad = 4, nx = Math.ceil((hi[0] - lo[0]) / c) + 2 * pad + 1, ny = Math.ceil((hi[1] - lo[1]) / c) + 2 * pad + 1, nz = Math.ceil((hi[2] - lo[2]) / c) + 2 * pad + 1, x0 = lo[0] - pad * c, y0 = lo[1] - pad * c, z0 = lo[2] - pad * c, N = nx * ny * nz, sxy = nx * ny;
  const P = (t, k) => { const i = indices[t * 3 + k] * 3; return [(positions[i] - x0) / c, (positions[i + 1] - y0) / c, (positions[i + 2] - z0) / c]; };   // in grid units
  // 1. inside or outside: count surface crossings along each of the three axes and take the majority (tolerates small holes in the mesh)
  const votes = new Uint8Array(N), dims = [nx, ny, nz];
  for (let ax = 0; ax < 3; ax++) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3, nu = dims[u], nv = dims[v], na = dims[ax], cols = new Array(nu * nv);
    for (let t = 0; t < nT; t++) {
      const A = P(t, 0), B = P(t, 1), C = P(t, 2), det = (B[u] - A[u]) * (C[v] - A[v]) - (C[u] - A[u]) * (B[v] - A[v]); if (Math.abs(det) < 1e-12) continue;
      const u0 = Math.max(0, Math.ceil(Math.min(A[u], B[u], C[u]) - 1e-9)), u1 = Math.min(nu - 1, Math.floor(Math.max(A[u], B[u], C[u]) + 1e-9)), v0 = Math.max(0, Math.ceil(Math.min(A[v], B[v], C[v]) - 1e-9)), v1 = Math.min(nv - 1, Math.floor(Math.max(A[v], B[v], C[v]) + 1e-9));
      for (let j = v0; j <= v1; j++) for (let i = u0; i <= u1; i++) {
        const pu = i + 1e-4, pv = j + 2e-4, w1 = ((pu - A[u]) * (C[v] - A[v]) - (C[u] - A[u]) * (pv - A[v])) / det, w2 = ((B[u] - A[u]) * (pv - A[v]) - (pu - A[u]) * (B[v] - A[v])) / det; if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue;
        (cols[j * nu + i] ||= []).push(A[ax] + w1 * (B[ax] - A[ax]) + w2 * (C[ax] - A[ax]), det > 0 ? 1 : -1);
      }
    }
    const st = [1, nx, sxy];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const L = cols[j * nu + i]; if (!L) continue; const hits = []; for (let q = 0; q < L.length; q += 2) hits.push([L[q], L[q + 1]]); hits.sort((p, q) => p[0] - q[0]);
      let w = 0, hI = 0; const base = i * st[u] + j * st[v]; for (let k = 0; k < na; k++) { while (hI < hits.length && hits[hI][0] <= k) { w += hits[hI][1]; hI++; } if (w !== 0) votes[base + k * st[ax]]++; } }
    onStep?.(.1 + ax * .1);
  }
  const inside = new Uint8Array(N); for (let i = 0; i < N; i++) inside[i] = votes[i] >= 2 ? 1 : 0;
  // a pocket of "outside" that cannot be reached from the edge of the grid is really inside (shells that overlap or face the wrong way leave such pockets)
  { const seen = new Uint8Array(N), stack = new Int32Array(N); let top = 0; const push = q => { if (!inside[q] && !seen[q]) { seen[q] = 1; stack[top++] = q; } };
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { push(k * sxy + j * nx); push(k * sxy + j * nx + nx - 1); }
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { push(k * sxy + i); push(k * sxy + (ny - 1) * nx + i); }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { push(j * nx + i); push((nz - 1) * sxy + j * nx + i); }
    while (top) { const q = stack[--top], i = q % nx, j = ((q / nx) | 0) % ny, k = (q / sxy) | 0; if (i > 0) push(q - 1); if (i < nx - 1) push(q + 1); if (j > 0) push(q - nx); if (j < ny - 1) push(q + nx); if (k > 0) push(q - sxy); if (k < nz - 1) push(q + sxy); }
    for (let q = 0; q < N; q++) if (!inside[q] && !seen[q]) inside[q] = 1; }
  // 2. distance to the nearest change of inside/outside, exact over the whole grid (two passes of a one-dimensional transform per axis)
  const INFV = 1e20, f = new Float32Array(N), run = (len, get, set) => { const v = new Int32Array(len), zz = new Float32Array(len + 1), g = new Float32Array(len); return (o, s) => { for (let q = 0; q < len; q++) g[q] = get(o + q * s); let k = 0; v[0] = 0; zz[0] = -INFV; zz[1] = INFV;
    for (let q = 1; q < len; q++) { let sI; for (; ;) { const p = v[k]; sI = ((g[q] + q * q) - (g[p] + p * p)) / (2 * q - 2 * p); if (sI <= zz[k] && k > 0) k--; else break; } k++; v[k] = q; zz[k] = sI; zz[k + 1] = INFV; }
    k = 0; for (let q = 0; q < len; q++) { while (zz[k + 1] < q) k++; const p = v[k]; set(o + q * s, (q - p) * (q - p) + g[p]); } }; };
  const edt = want => { const g = new Float32Array(N); for (let i = 0; i < N; i++) g[i] = inside[i] === want ? 0 : INFV;
    const gx = run(nx, i => g[i], (i, v) => { g[i] = v; }), gy = run(ny, i => g[i], (i, v) => { g[i] = v; }), gz = run(nz, i => g[i], (i, v) => { g[i] = v; });
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) gx(k * sxy + j * nx, 1); for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) gy(k * sxy + i, nx); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) gz(j * nx + i, sxy); return g; };
  const dOut = edt(1); onStep?.(.45); const dIn = edt(0); onStep?.(.6);
  for (let i = 0; i < N; i++) f[i] = inside[i] ? -(Math.sqrt(dIn[i]) - .5) : Math.sqrt(dOut[i]) - .5;
  // 3. near the surface, replace the grid estimate with the true distance to the triangles, so the surface is as smooth as the mesh
  const band = 2, near = new Float32Array(N).fill(INFV);
  for (let t = 0; t < nT; t++) {
    const A = P(t, 0), B = P(t, 1), C = P(t, 2), i0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]) - band)), i1 = Math.min(nx - 1, Math.ceil(Math.max(A[0], B[0], C[0]) + band)), j0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]) - band)), j1 = Math.min(ny - 1, Math.ceil(Math.max(A[1], B[1], C[1]) + band)), k0 = Math.max(0, Math.floor(Math.min(A[2], B[2], C[2]) - band)), k1 = Math.min(nz - 1, Math.ceil(Math.max(A[2], B[2], C[2]) + band));
    const abx = B[0] - A[0], aby = B[1] - A[1], abz = B[2] - A[2], acx = C[0] - A[0], acy = C[1] - A[1], acz = C[2] - A[2];
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      // closest point on triangle ABC to (i, j, k)
      const apx = i - A[0], apy = j - A[1], apz = k - A[2], d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz; let qx, qy, qz;
      if (d1 <= 0 && d2 <= 0) { qx = A[0]; qy = A[1]; qz = A[2]; }
      else { const bpx = i - B[0], bpy = j - B[1], bpz = k - B[2], d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
        if (d3 >= 0 && d4 <= d3) { qx = B[0]; qy = B[1]; qz = B[2]; }
        else { const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = A[0] + abx * v; qy = A[1] + aby * v; qz = A[2] + abz * v; }
          else { const cpx = i - C[0], cpy = j - C[1], cpz = k - C[2], d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
            if (d6 >= 0 && d5 <= d6) { qx = C[0]; qy = C[1]; qz = C[2]; }
            else { const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = A[0] + acx * w; qy = A[1] + acy * w; qz = A[2] + acz * w; }
              else { const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); qx = B[0] + (C[0] - B[0]) * w; qy = B[1] + (C[1] - B[1]) * w; qz = B[2] + (C[2] - B[2]) * w; }
                else { const dn = 1 / (va + vb + vc), v = vb * dn, w = vc * dn; qx = A[0] + abx * v + acx * w; qy = A[1] + aby * v + acy * w; qz = A[2] + abz * v + acz * w; } } } } } }
      const dd = (i - qx) * (i - qx) + (j - qy) * (j - qy) + (k - qz) * (k - qz), q = k * sxy + j * nx + i; if (dd < near[q]) near[q] = dd;
    }
    if (onStep && (t & 16383) === 0) onStep(.6 + .4 * t / nT);
  }
  for (let i = 0; i < N; i++) if (near[i] < band * band && Math.abs(f[i]) <= band + 1.5) { const d = Math.sqrt(near[i]); f[i] = inside[i] ? -d : d; }   // only by the real surface: faces buried deep inside the solid are ignored
  for (let i = 0; i < N; i++) f[i] *= c;
  return new Grid3({ a: f, c, nx, ny, nz, x0, y0, z0, bb: [lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]] });
}

/* ================= the mesher =================
   Splits space into cubes only where the surface is (an octree), finds where the surface crosses each small cube's edges
   and which way it faces there, and puts one corner in each cube at the point that best fits those faces. Flat faces stay
   flat and sharp edges stay sharp, and neighbouring cubes that lie on one plane are merged, so a box is a few triangles
   while a curve gets as many as it needs. */
const QEF_SWEEPS = 6;
function solveQEF(q, out) {     // q: [a00,a01,a02,a11,a12,a22, b0,b1,b2, btb, mx,my,mz, n]; minimises the distance to all the planes, pulled towards the average point
  const n = q[13], mx = q[10] / n, my = q[11] / n, mz = q[12] / n;
  let a00 = q[0], a01 = q[1], a02 = q[2], a11 = q[3], a12 = q[4], a22 = q[5];
  const b0 = q[6] - (a00 * mx + a01 * my + a02 * mz), b1 = q[7] - (a01 * mx + a11 * my + a12 * mz), b2 = q[8] - (a02 * mx + a12 * my + a22 * mz);
  // eigenvectors of the symmetric 3x3 by Jacobi rotations
  let v00 = 1, v01 = 0, v02 = 0, v10 = 0, v11 = 1, v12 = 0, v20 = 0, v21 = 0, v22 = 1;
  for (let s = 0; s < QEF_SWEEPS; s++) {
    if (Math.abs(a01) > 1e-14) { const th = (a11 - a00) / (2 * a01), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c, x00 = a00 - t * a01, x11 = a11 + t * a01, x02 = c * a02 - sn * a12, x12 = sn * a02 + c * a12; a00 = x00; a11 = x11; a01 = 0; a02 = x02; a12 = x12;
      let p = v00, r = v01; v00 = c * p - sn * r; v01 = sn * p + c * r; p = v10; r = v11; v10 = c * p - sn * r; v11 = sn * p + c * r; p = v20; r = v21; v20 = c * p - sn * r; v21 = sn * p + c * r; }
    if (Math.abs(a02) > 1e-14) { const th = (a22 - a00) / (2 * a02), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c, x00 = a00 - t * a02, x22 = a22 + t * a02, x01 = c * a01 - sn * a12, x12 = sn * a01 + c * a12; a00 = x00; a22 = x22; a02 = 0; a01 = x01; a12 = x12;
      let p = v00, r = v02; v00 = c * p - sn * r; v02 = sn * p + c * r; p = v10; r = v12; v10 = c * p - sn * r; v12 = sn * p + c * r; p = v20; r = v22; v20 = c * p - sn * r; v22 = sn * p + c * r; }
    if (Math.abs(a12) > 1e-14) { const th = (a22 - a11) / (2 * a12), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c, x11 = a11 - t * a12, x22 = a22 + t * a12, x01 = c * a01 - sn * a02, x02 = sn * a01 + c * a02; a11 = x11; a22 = x22; a12 = 0; a01 = x01; a02 = x02;
      let p = v01, r = v02; v01 = c * p - sn * r; v02 = sn * p + c * r; p = v11; r = v12; v11 = c * p - sn * r; v12 = sn * p + c * r; p = v21; r = v22; v21 = c * p - sn * r; v22 = sn * p + c * r; }
  }
  const lm = Math.max(Math.abs(a00), Math.abs(a11), Math.abs(a22)), tol = lm * .02; let x = 0, y = 0, z = 0;   // directions the planes barely constrain are left at the average point
  if (Math.abs(a00) > tol) { const k = (v00 * b0 + v10 * b1 + v20 * b2) / a00; x += v00 * k; y += v10 * k; z += v20 * k; }
  if (Math.abs(a11) > tol) { const k = (v01 * b0 + v11 * b1 + v21 * b2) / a11; x += v01 * k; y += v11 * k; z += v21 * k; }
  if (Math.abs(a22) > tol) { const k = (v02 * b0 + v12 * b1 + v22 * b2) / a22; x += v02 * k; y += v12 * k; z += v22 * k; }
  out[0] = mx + x; out[1] = my + y; out[2] = mz + z;
  return (Math.abs(a00) > tol) + (Math.abs(a11) > tol) + (Math.abs(a22) > tol);
}
const qefErr = (q, p) => { const x = p[0], y = p[1], z = p[2]; return x * (q[0] * x + q[1] * y + q[2] * z) + y * (q[1] * x + q[3] * y + q[4] * z) + z * (q[2] * x + q[4] * y + q[5] * z) - 2 * (x * q[6] + y * q[7] + z * q[8]) + q[9]; };
// corner patterns a single vertex can represent: the inside corners are one connected group and so are the outside ones
const SIMPLE = (() => { const t = new Uint8Array(256), nb = c => [c ^ 1, c ^ 2, c ^ 4]; for (let m = 0; m < 256; m++) { const comp = want => { const set = []; for (let c = 0; c < 8; c++) if (((m >> c) & 1) === want) set.push(c); if (!set.length) return 1; const seen = new Set([set[0]]), st = [set[0]]; while (st.length) for (const o of nb(st.pop())) if (((m >> o) & 1) === want && !seen.has(o)) { seen.add(o); st.push(o); } return seen.size === set.length ? 1 : 2; }; t[m] = comp(0) === 1 && comp(1) === 1 ? 1 : 0; } return t; })();

function meshSolid(solid, opt = {}) {
  const bb = solid.bb; if (!bb.every(Number.isFinite)) throw new Error('The model has no finite size (a halfspace or clip on its own is endless: intersect it with something)');
  if (!(bb[3] > bb[0] && bb[4] > bb[1] && bb[5] > bb[2])) throw new Error('The model is empty: its parts do not overlap');
  const f = (x, y, z) => solid.d(x, y, z), LIP = Math.max(1, solid.L || 1) * 1.0005, ext = Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]);
  // cell size: asked for, or chosen so the surface gets about `budget` cells
  let h = opt.cell;
  if (!h) {
    const budget = opt.budget || 300000, h0 = ext / 48; let cnt = 0;
    for (let z = bb[2] - h0 / 2; z < bb[5] + h0; z += h0) for (let y = bb[1] - h0 / 2; y < bb[4] + h0; y += h0) for (let x = bb[0] - h0 / 2; x < bb[3] + h0; x += h0) if (Math.abs(f(x + h0 / 2, y + h0 / 2, z + h0 / 2)) <= h0 * .87 * LIP) cnt++;
    const area = Math.max(cnt, 8) * h0 * h0 * .75; h = clampN(Math.sqrt(area / budget), opt.minCell || .06, opt.maxCell || 2);
  }
  let depth = 1; while (h * (1 << depth) < ext + 4 * h) depth++; if (depth > 12) { depth = 12; h = (ext * 1.02) / ((1 << depth) - 4); }
  const N = 1 << depth, M = N + 1, root = h * N, ox = (bb[0] + bb[3]) / 2 - root / 2 + h * .137, oy = (bb[1] + bb[4]) / 2 - root / 2 + h * .241, oz = (bb[2] + bb[5]) / 2 - root / 2 + h * .319;   // a small offset so faces at round numbers do not fall exactly on grid points
  const tolSq = (opt.tol ?? Math.min(.008, h * .05)) ** 2, corner = new Map(), edges = new Map(), eps = h * .004;
  let evals = 0;
  const cv = (ix, iy, iz) => { const k = (iz * M + iy) * M + ix; let v = corner.get(k); if (v === undefined) { v = f(ox + ix * h, oy + iy * h, oz + iz * h); if (v === 0) v = 1e-12; evals++; corner.set(k, v); } return v; };
  // where the surface crosses a grid edge, and its direction there
  const edge = (ix, iy, iz, ax, va, vb) => {
    const k = ((iz * M + iy) * M + ix) * 3 + ax; let e = edges.get(k); if (e) return e;
    const x0 = ox + ix * h, y0 = oy + iy * h, z0 = oz + iz * h, dx = ax === 0 ? h : 0, dy = ax === 1 ? h : 0, dz = ax === 2 ? h : 0;
    let lo = 0, hi = 1, flo = va, fhi = vb, t = va / (va - vb);
    for (let i = 0; i < 5; i++) { const v = f(x0 + dx * t, y0 + dy * t, z0 + dz * t); evals++; if (Math.abs(v) < h * 1e-5) break; if ((v < 0) === (flo < 0)) { lo = t; flo = v; } else { hi = t; fhi = v; } const lin = lo + (hi - lo) * flo / (flo - fhi); t = i % 2 ? (lo + hi) / 2 : clampN(lin, lo + (hi - lo) * .02, hi - (hi - lo) * .02); }
    const px = x0 + dx * t, py = y0 + dy * t, pz = z0 + dz * t;
    let nx = f(px + eps, py, pz) - f(px - eps, py, pz), ny = f(px, py + eps, pz) - f(px, py - eps, pz), nz = f(px, py, pz + eps) - f(px, py, pz - eps); evals += 6;
    const l = Math.hypot(nx, ny, nz); if (l > 1e-12) { nx /= l; ny /= l; nz /= l; } else { nx = ax === 0 ? 1 : 0; ny = ax === 1 ? 1 : 0; nz = ax === 2 ? 1 : 0; if (va < 0) { nx = -nx; ny = -ny; nz = -nz; } }
    e = [px, py, pz, nx, ny, nz]; edges.set(k, e); return e;
  };
  const P = [0, 0, 0];
  // the best point for a set of crossings (q), kept inside its cube; on a smooth face it is then put exactly on the surface
  const place = (n, q) => {
    const rank = solveQEF(q, P), x0 = ox + n.ix * h, y0 = oy + n.iy * h, z0 = oz + n.iz * h, s = n.size * h, m = s * .02; let x = clampN(P[0], x0 - m, x0 + s + m), y = clampN(P[1], y0 - m, y0 + s + m), z = clampN(P[2], z0 - m, z0 + s + m);
    const e = qefErr(q, [x, y, z]);
    if (rank === 1) for (let i = 0; i < 2; i++) { const v = f(x, y, z); evals++; if (Math.abs(v) < h * 1e-5) break; const gx = f(x + eps, y, z) - f(x - eps, y, z), gy = f(x, y + eps, z) - f(x, y - eps, z), gz = f(x, y, z + eps) - f(x, y, z - eps), g2 = (gx * gx + gy * gy + gz * gz) / (4 * eps * eps); evals += 6; if (!(g2 > 1e-9)) break; const k = v / g2 / (2 * eps); if (Math.abs(k * Math.sqrt(g2) * 2 * eps) > h) break; x -= gx * k; y -= gy * k; z -= gz * k; }
    return [x, y, z, e];
  };
  let leaves = 0;
  const leaf = (ix, iy, iz) => {
    let mask = 0; const v = new Array(8); for (let c = 0; c < 8; c++) { v[c] = cv(ix + (c & 1), iy + ((c >> 1) & 1), iz + (c >> 2)); if (v[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) return null;
    // which crossed edges belong to the same piece of surface: on each face, two crossings join; four (a saddle) join in the pairs that keep the inside corners apart
    const par = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; }, cross = new Array(12);
    for (let ax = 0; ax < 3; ax++) { const u = (ax + 1) % 3, w = (ax + 2) % 3; for (let b = 0; b < 4; b++) { const c = ((b & 1) << u) | ((b >> 1) << w); cross[ax * 4 + b] = (v[c] < 0) !== (v[c | (1 << ax)] < 0); } }
    for (let a = 0; a < 3; a++) { const u = (a + 1) % 3, w = (a + 2) % 3; for (let sd = 0; sd < 2; sd++) {
      const eU = bv => u * 4 + (bv | (sd << 1)), eV = bu => w * 4 + (sd | (bu << 1)), on = [eU(0), eU(1), eV(0), eV(1)].filter(e => cross[e]);
      if (on.length === 2) par[find(on[0])] = find(on[1]);
      else if (on.length === 4) for (let bu = 0; bu < 2; bu++) for (let bv = 0; bv < 2; bv++) if (v[(sd << a) | (bu << u) | (bv << w)] < 0) par[find(eU(bv))] = find(eV(bu));
    } }
    const slotOf = new Int8Array(12).fill(-1), qs = [];
    for (let ax = 0; ax < 3; ax++) { const u = (ax + 1) % 3, w = (ax + 2) % 3; for (let b = 0; b < 4; b++) { const id = ax * 4 + b; if (!cross[id]) continue; const r = find(id); if (slotOf[r] < 0) { slotOf[r] = qs.length; qs.push(new Float64Array(14)); } const sl = slotOf[id] = slotOf[r], q = qs[sl];
      const c = ((b & 1) << u) | ((b >> 1) << w), e = edge(ix + (c & 1), iy + ((c >> 1) & 1), iz + (c >> 2), ax, v[c], v[c | (1 << ax)]), nx = e[3], ny = e[4], nz = e[5], d = nx * e[0] + ny * e[1] + nz * e[2];
      q[0] += nx * nx; q[1] += nx * ny; q[2] += nx * nz; q[3] += ny * ny; q[4] += ny * nz; q[5] += nz * nz; q[6] += nx * d; q[7] += ny * d; q[8] += nz * d; q[9] += d * d; q[10] += e[0]; q[11] += e[1]; q[12] += e[2]; q[13]++; } }
    const n = { ix, iy, iz, size: 1, mask, q: qs.length === 1 ? qs[0] : null, k: null, p: qs.map(q => place({ ix, iy, iz, size: 1 }, q)), ids: null, slot: slotOf }; leaves++; return n;
  };
  const build = (ix, iy, iz, size) => {
    const hs = size * h, v = f(ox + ix * h + hs / 2, oy + iy * h + hs / 2, oz + iz * h + hs / 2); evals++;
    if (Math.abs(v) > hs * .8660254 * LIP) return null;
    if (size === 1) return leaf(ix, iy, iz);
    const s2 = size >> 1, k = new Array(8); let any = false, allLeaf = true;
    for (let c = 0; c < 8; c++) { const ch = build(ix + (c & 1) * s2, iy + ((c >> 1) & 1) * s2, iz + (c >> 2) * s2, s2); k[c] = ch; if (ch) { any = true; if (ch.k || !ch.q) allLeaf = false; } }
    if (!any) return null;
    const node = { ix, iy, iz, size, mask: 0, q: null, k, p: null, ids: null, slot: null };
    if (allLeaf && tolSq > 0) {     // can these eight be one cube? only if one vertex fits all their planes and the surface stays in one piece
      let mask = 0; for (let c = 0; c < 8; c++) if (cv(ix + (c & 1) * size, iy + ((c >> 1) & 1) * size, iz + (c >> 2) * size) < 0) mask |= 1 << c;
      if (mask !== 0 && mask !== 255 && SIMPLE[mask]) {
        let ok = true; const sg = (a, b, c) => cv(ix + a * s2, iy + b * s2, iz + c * s2) < 0, cs = c => (mask >> c) & 1;
        for (let a = 0; a < 3 && ok; a++) for (let b = 0; b < 3 && ok; b++) for (let c = 0; c < 3 && ok; c++) {
          const mids = (a === 1) + (b === 1) + (c === 1); if (!mids) continue; const s = sg(a, b, c) ? 1 : 0; let agree = false;
          for (let o = 0; o < 8 && !agree; o++) { const ca = a === 1 ? (o & 1) : a >> 1, cb = b === 1 ? ((o >> 1) & 1) : b >> 1, cc = c === 1 ? (o >> 2) : c >> 1; if (cs(ca | (cb << 1) | (cc << 2)) === s) agree = true; }
          if (!agree) ok = false;
        }
        if (ok) {
          const q = new Float64Array(14); let nn = 0; for (let c = 0; c < 8; c++) if (k[c]) { const cq = k[c].q; for (let i = 0; i < 14; i++) q[i] += cq[i]; nn++; }
          const pt = place({ ix, iy, iz, size }, q);
          if (pt[3] <= tolSq * q[13]) { leaves -= nn - 1; return { ix, iy, iz, size, mask, q, k: null, p: [pt], ids: null, slot: null }; }
        }
      }
    }
    return node;
  };
  const rootNode = build(0, 0, 0, N);
  if (!rootNode) throw new Error('The model is empty: nothing solid was found');
  // ---- join the cube corners into triangles ----
  const verts = [], tris = [];
  const vid = (n, sl) => { const ids = n.ids || (n.ids = new Int32Array(n.p.length).fill(-1)); if (ids[sl] < 0) { const p = n.p[sl]; ids[sl] = verts.length / 3; verts.push(p[0], p[1], p[2]); } return ids[sl]; };
  const bit = (ax, v) => v << ax, kid = (n, c) => n.k ? n.k[c] : n;
  const procEdge = (n, e) => {       // n: four cubes round one grid edge, indexed (side along u) | (side along v) << 1
    let m = n[0], mq = 0; for (let q = 1; q < 4; q++) if (n[q].size < m.size) { m = n[q]; mq = q; }
    const u = (e + 1) % 3, v = (e + 2) % 3, c0 = bit(u, 1 - (mq & 1)) | bit(v, 1 - (mq >> 1)), inA = (m.mask >> c0) & 1, inB = (m.mask >> (c0 | (1 << e))) & 1; if (inA === inB) return;
    const id = q => { const nd = n[q]; return vid(nd, nd.slot ? Math.max(0, nd.slot[e * 4 + ((1 - (q & 1)) | ((1 - (q >> 1)) << 1))]) : 0); }, a = id(0), b = id(1), c = id(3), d = id(2);
    if (inA) { if (a !== b && b !== c && a !== c) tris.push(a, b, c); if (a !== c && c !== d && a !== d) tris.push(a, c, d); }
    else { if (a !== b && b !== c && a !== c) tris.push(a, c, b); if (a !== c && c !== d && a !== d) tris.push(a, d, c); }
  };
  const edgeProc = (n, e) => {
    if (!n[0] || !n[1] || !n[2] || !n[3]) return; if (!n[0].k && !n[1].k && !n[2].k && !n[3].k) return procEdge(n, e);
    const u = (e + 1) % 3, v = (e + 2) % 3;
    for (let eb = 0; eb < 2; eb++) { const s = new Array(4); for (let q = 0; q < 4; q++) s[q] = kid(n[q], bit(e, eb) | bit(u, 1 - (q & 1)) | bit(v, 1 - (q >> 1))); edgeProc(s, e); }
  };
  const faceProc = (n0, n1, a) => {      // two cubes sharing a face across axis a (n0 on the low side)
    if (!n0 || !n1 || (!n0.k && !n1.k)) return; const u = (a + 1) % 3, v = (a + 2) % 3;
    for (let bu = 0; bu < 2; bu++) for (let bv = 0; bv < 2; bv++) faceProc(kid(n0, bit(a, 1) | bit(u, bu) | bit(v, bv)), kid(n1, bit(u, bu) | bit(v, bv)), a);
    for (let eb = 0; eb < 2; eb++) {
      // edges along u: the plane across them is (v, a)
      { const s = new Array(4); for (let q = 0; q < 4; q++) { const sU = q & 1, sV = q >> 1, par = sV ? n1 : n0; s[q] = kid(par, bit(a, sV ? 0 : 1) | bit(v, sU) | bit(u, eb)); } edgeProc(s, u); }
      // edges along v: the plane across them is (a, u)
      { const s = new Array(4); for (let q = 0; q < 4; q++) { const sU = q & 1, sV = q >> 1, par = sU ? n1 : n0; s[q] = kid(par, bit(a, sU ? 0 : 1) | bit(u, sV) | bit(v, eb)); } edgeProc(s, v); }
    }
  };
  const cellProc = n => {
    if (!n || !n.k) return; for (let c = 0; c < 8; c++) cellProc(n.k[c]);
    for (let a = 0; a < 3; a++) for (let c = 0; c < 8; c++) if (!((c >> a) & 1)) faceProc(n.k[c], n.k[c | (1 << a)], a);
    for (let e = 0; e < 3; e++) { const u = (e + 1) % 3, v = (e + 2) % 3; for (let eb = 0; eb < 2; eb++) { const s = new Array(4); for (let q = 0; q < 4; q++) s[q] = n.k[bit(e, eb) | bit(u, q & 1) | bit(v, q >> 1)]; edgeProc(s, e); } }
  };
  cellProc(rootNode);
  return finishMesh(new Float32Array(verts), new Uint32Array(tris), { cell: h, leaves, evals });
}
// tidy the triangles without opening the surface, make sure it faces outward, and measure it
function finishMesh(positions, indices, info = {}) {
  let tri = Array.from(indices); const X = i => positions[i * 3], Y = i => positions[i * 3 + 1], Z = i => positions[i * 3 + 2];
  const area2 = (a, b, c) => { const nx = (Y(b) - Y(a)) * (Z(c) - Z(a)) - (Z(b) - Z(a)) * (Y(c) - Y(a)), ny = (Z(b) - Z(a)) * (X(c) - X(a)) - (X(b) - X(a)) * (Z(c) - Z(a)), nz = (X(b) - X(a)) * (Y(c) - Y(a)) - (Y(b) - Y(a)) * (X(c) - X(a)); return Math.hypot(nx, ny, nz); };
  const len2 = (a, b) => (X(a) - X(b)) ** 2 + (Y(a) - Y(b)) ** 2 + (Z(a) - Z(b)) ** 2, TINY = 1e-9;
  // 1. two corners of a triangle at the same spot: make them one corner (the sliver disappears, its neighbours close up)
  { const par = new Map(), find = i => { let r = i; while (par.has(r)) r = par.get(r); return r; }; let any = false;
    for (let i = 0; i < tri.length; i += 3) for (let k = 0; k < 3; k++) { const a = find(tri[i + k]), b = find(tri[i + (k + 1) % 3]); if (a !== b && len2(a, b) < 1e-12) { par.set(Math.max(a, b), Math.min(a, b)); any = true; } }
    if (any) { const out = []; for (let i = 0; i < tri.length; i += 3) { const a = find(tri[i]), b = find(tri[i + 1]), c = find(tri[i + 2]); if (a !== b && b !== c && a !== c) out.push(a, b, c); } tri = out; } }
  // 2. three corners on one line: the middle corner lies on the long edge, so split the neighbour across that edge at it instead
  for (let pass = 0; pass < 4; pass++) {
    const bad = []; for (let i = 0; i < tri.length; i += 3) if (area2(tri[i], tri[i + 1], tri[i + 2]) < TINY) bad.push(i); if (!bad.length) break;
    const nV = positions.length / 3, own = new Map(); for (let i = 0; i < tri.length; i += 3) for (let k = 0; k < 3; k++) own.set(tri[i + k] * nV + tri[i + (k + 1) % 3], i);
    const dead = new Set(); let fixed = 0;
    for (const i of bad) { if (dead.has(i)) continue; let k = 0, best = -1; for (let q = 0; q < 3; q++) { const l = len2(tri[i + q], tri[i + (q + 1) % 3]); if (l > best) { best = l; k = q; } }
      const pA = tri[i + k], qB = tri[i + (k + 1) % 3], m = tri[i + (k + 2) % 3], j = own.get(qB * nV + pA); if (j === undefined || dead.has(j) || j === i) continue;
      let c = -1; for (let q = 0; q < 3; q++) if (tri[j + q] !== pA && tri[j + q] !== qB) c = tri[j + q]; if (c < 0 || c === m) continue;
      tri[i] = qB; tri[i + 1] = m; tri[i + 2] = c; tri[j] = m; tri[j + 1] = pA; tri[j + 2] = c; dead.add(i); dead.add(j); fixed++; }
    if (!fixed) break;
  }
  indices = tri; const keep = []; let vol = 0, area = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3, ax = positions[a], ay = positions[a + 1], az = positions[a + 2], bx = positions[b], by = positions[b + 1], bz = positions[b + 2], cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    keep.push(indices[i], indices[i + 1], indices[i + 2]); area += Math.hypot(nx, ny, nz) / 2; vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  let idx = new Uint32Array(keep); if (vol < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } vol = -vol; }
  // every edge should be used by exactly two triangles, once in each direction
  const em = new Map(), nV = positions.length / 3; for (let i = 0; i < idx.length; i += 3) for (let k = 0; k < 3; k++) { const a = idx[i + k], b = idx[i + (k + 1) % 3], key = a < b ? a * nV + b : b * nV + a; em.set(key, (em.get(key) || 0) + (a < b ? 1 : 1024)); }
  let open = 0, odd = 0; for (const v of em.values()) { if (v === 1 || v === 1024) open++; else if (v !== 1025) odd++; }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], used = new Uint8Array(nV); for (let i = 0; i < idx.length; i++) used[idx[i]] = 1;
  for (let i = 0; i < nV; i++) if (used[i]) for (let a = 0; a < 3; a++) { const v = positions[i * 3 + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
  return { positions, indices: idx, stats: { triangles: idx.length / 3, volume: vol, area, min: lo, max: hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], openEdges: open, oddEdges: odd, watertight: open === 0, ...info } };
}

const API = { box, cylinder, cone, sphere, torus, tube, capsule, rod, halfspace, extrude, revolve, thread, union, cut, difference: cut, subtract: cut, intersect, rect, circle, ellipse, polygon, ngon, star, slot, ring, sector, text, array, polar, grid };
/* ================= Forge worker =================
   Runs beside the page so the screen never freezes: it keeps the fonts and any imported shape, runs a model's code,
   turns the result into triangles and measures it. The page sends messages; this answers each one.
   A model's code is written by the AI, so before any of it runs this worker gives up everything it does not need:
   it cannot reach the network or the browser's storage from here on. */
const IN_WORKER = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
const LOCKED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker', 'WebTransport', 'RTCPeerConnection', 'navigator', 'location', 'Function', 'eval'];
const HIDDEN = ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB', 'caches', 'navigator', 'location', 'Function', 'self', 'globalThis', 'postMessage'];   // names the code sees as undefined
const BANNED = /\b(?:constructor|prototype|__proto__|eval|Function|globalThis|import\s*\()/;
const SOURCES = new Map();          // id → the imported shape as a solid, 100 mm along its longest side, centred, sitting on the bed
const API_NAMES = Object.keys(API);
const MakeFn = Function;            // kept before the lock below hides it

function lockDown() {
  if (!IN_WORKER) return;
  for (const k of LOCKED) { try { Object.defineProperty(self, k, { value: undefined, writable: false, configurable: false }); } catch { try { self[k] = undefined; } catch { } } }
}

// The budget is how many surface cubes the mesher may use: more means finer curves and a bigger file.
// tol is how far (mm) a corner may sit from the true surface when flat-looking patches are merged into bigger triangles.
const QUALITY = { draft: { budget: 40000, tol: .012 }, normal: { budget: 260000, tol: .004 }, fine: { budget: 800000, tol: .0015 } };

function lineOf(e) { const m = /(?:<anonymous>|Function|eval[^:]*):(\d+):(\d+)/.exec(String(e?.stack || '')); return m ? Math.max(1, +m[1] - 3) : null; }

function runCode(code, params, source) {
  code = String(code || '');
  if (!code.trim()) throw new Error('The model has no code');
  if (code.length > 60000) throw new Error('The model code is too long');
  const bad = BANNED.exec(code); if (bad) throw new Error(`The model code uses "${bad[0].trim()}", which is not allowed. Use only the modelling vocabulary and plain maths.`);
  let fn;
  // the code runs inside its own function, so it may reuse a vocabulary word as a variable name without a clash
  try { fn = new MakeFn(...API_NAMES, 'p', 'source', ...HIDDEN, '"use strict"; return (() => {\n' + code + '\n})();'); }
  catch (e) { throw Object.assign(new Error('The code does not parse: ' + e.message), { stage: 'parse' }); }
  const p = new Proxy({ ...params }, { get(t, k) { if (typeof k === 'string' && !(k in t)) throw new Error(`The code reads p.${k}, but there is no parameter with that key`); return t[k]; } });
  const src = source || new Proxy({}, { get() { throw new Error('The code uses "source", but this model has no imported or sculpted shape'); } });
  let out;
  try { out = fn(...API_NAMES.map(k => API[k]), p, src); }
  catch (e) { throw Object.assign(new Error(e?.message || String(e)), { stage: 'run', line: lineOf(e) }); }
  if (out instanceof Shape) throw new Error('The code returns a flat shape. Extrude or revolve it into a solid.');
  if (!(out instanceof Solid)) throw new Error('The code must end with: return <a solid>');
  const b = out.bb; if (!b.every(Number.isFinite)) throw new Error('The solid has no end in some direction (a halfspace or clip was returned on its own). Intersect it with a real solid.');
  if (!(b[3] > b[0] && b[4] > b[1] && b[5] > b[2])) throw new Error('The solid is empty: everything was cut away or the parts do not overlap.');
  if (Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]) > 5000) throw new Error('The solid is larger than 5 metres. Sizes are in millimetres.');
  return out;
}

// For the screen: every triangle gets its own corners, smooth across gentle bends and crisp at real edges, plus the list of crisp edges to draw as lines.
function forScreen(positions, indices, creaseDeg = 32) {
  const nT = indices.length / 3, nV = positions.length / 3, fn = new Float32Array(nT * 3), fa = new Float32Array(nT), cosC = Math.cos(creaseDeg * Math.PI / 180);
  for (let t = 0; t < nT; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3, ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2], vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1; fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l; fa[t] = l;
  }
  const start = new Uint32Array(nV + 1); for (let i = 0; i < indices.length; i++) start[indices[i] + 1]++; for (let i = 0; i < nV; i++) start[i + 1] += start[i];
  const fill = start.slice(0, nV), of = new Uint32Array(indices.length); for (let i = 0; i < indices.length; i++) of[fill[indices[i]]++] = (i / 3) | 0;
  const pos = new Float32Array(nT * 9), nrm = new Float32Array(nT * 9);
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const v = indices[t * 3 + k], o = t * 9 + k * 3; pos[o] = positions[v * 3]; pos[o + 1] = positions[v * 3 + 1]; pos[o + 2] = positions[v * 3 + 2];
    const ax = fn[t * 3], ay = fn[t * 3 + 1], az = fn[t * 3 + 2]; let sx = 0, sy = 0, sz = 0;
    for (let q = start[v]; q < start[v + 1]; q++) { const f = of[q], bx = fn[f * 3], by = fn[f * 3 + 1], bz = fn[f * 3 + 2]; if (ax * bx + ay * by + az * bz >= cosC) { sx += bx * fa[f]; sy += by * fa[f]; sz += bz * fa[f]; } }
    const l = Math.hypot(sx, sy, sz) || 1; nrm[o] = sx / l; nrm[o + 1] = sy / l; nrm[o + 2] = sz / l;
  }
  const seen = new Map(), edges = [];
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const a = indices[t * 3 + k], b = indices[t * 3 + (k + 1) % 3], key = a < b ? a * nV + b : b * nV + a, o = seen.get(key);
    if (o === undefined) { seen.set(key, t); continue; }
    if (fn[t * 3] * fn[o * 3] + fn[t * 3 + 1] * fn[o * 3 + 1] + fn[t * 3 + 2] * fn[o * 3 + 2] >= cosC) continue;
    const l2 = (positions[a * 3] - positions[b * 3]) ** 2 + (positions[a * 3 + 1] - positions[b * 3 + 1]) ** 2 + (positions[a * 3 + 2] - positions[b * 3 + 2]) ** 2;
    if (Math.min(fa[t], fa[o]) < .04 * l2) continue;       // a needle-thin triangle has no trustworthy direction: no line for it
    edges.push(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2], positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]);
  }
  return { pos, nrm, edges: new Float32Array(edges) };
}

function build(msg) {
  const t0 = Date.now(), src = msg.sourceId ? SOURCES.get(msg.sourceId) : null;
  const solid = runCode(msg.code, msg.params || {}, src);
  const q = { ...(QUALITY[msg.quality] || QUALITY.normal), ...(msg.budget > 0 ? { budget: msg.budget } : {}), ...(msg.tol > 0 ? { tol: msg.tol } : {}) };
  const mesh = meshSolid(solid, q);
  if (!mesh.stats.triangles) throw new Error('The model came out empty: everything was cut away, or it is thinner than the mesher can see.');
  const view = forScreen(mesh.positions, mesh.indices);
  return { positions: mesh.positions, indices: mesh.indices, stats: { ...mesh.stats, ms: Date.now() - t0, quality: msg.quality || 'normal' }, ...view };
}

// An imported or sculpted mesh (millimetres or not, Z up) becomes a solid: 100 mm along its longest side, centred, on the bed.
function addSource(msg, say) {
  const g = voxelize(msg.positions, msg.indices, msg.res || 176, f => say({ type: 'progress', job: msg.job, f }));
  const b = g.bb, ext = Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]), s = 100 / ext;
  const solid = g.scale(s).center('xy').onBed();
  if (SOURCES.size >= 3) SOURCES.delete(SOURCES.keys().next().value);
  SOURCES.set(msg.id, solid);
  return { size: [(b[3] - b[0]) * s, (b[4] - b[1]) * s, (b[5] - b[2]) * s], original: [b[3] - b[0], b[4] - b[1], b[5] - b[2]] };
}

function handle(msg, say) {
  try {
    if (msg.type === 'font') { addFont(msg.name, msg.buf); say({ type: 'ready', what: 'font', name: msg.name }); }
    else if (msg.type === 'lock') { lockDown(); say({ type: 'ready', what: 'lock' }); }
    else if (msg.type === 'source') { const r = addSource(msg, say); say({ type: 'sourced', id: msg.id, job: msg.job, ...r }); }
    else if (msg.type === 'forget') { SOURCES.delete(msg.id); }
    else if (msg.type === 'build') { const r = build(msg); say({ type: 'built', job: msg.job, ...r }, [r.positions.buffer, r.indices.buffer, r.pos.buffer, r.nrm.buffer, r.edges.buffer]); }
  } catch (e) { say({ type: 'error', job: msg.job, id: msg.id, message: e?.message || String(e), line: e?.line ?? null, stage: e?.stage || msg.type }); }
}
if (IN_WORKER) self.onmessage = ev => handle(ev.data, (m, tr) => self.postMessage(m, tr || []));
