/* ---------- Statement pieces: coloured accent light, studio and cinema rooms, fire, wine, built-ins ---------- */
const hexOr = (v, d) => /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : d;
// a surface that glows in any colour (LED strips, neon, flame, screens)
function ledMat(c, k = 1.25) { const key = `glow:${c}:${k}`; return MC[key] ||= emis(c, c, k); }   // kept under 1.5 so the colour stays a colour and does not burn out to white
// the wash of light a strip throws on the wall beside it: brightest at the strip, fading out
function haloTex(kind) {
  const key = 'halo-' + kind; if (TX[key]) return TX[key];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), im = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const u = x / 127, v = 1 - y / 127; let a;
    if (kind === 'radial') { const r = Math.hypot(u - .5, v - .5) * 2; a = Math.max(0, 1 - r) ** 2; }
    else a = (1 - v) ** 2.2 * Math.min(1, Math.sin(Math.PI * u) * 3.2);
    const i = (y * 128 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (TX[key] = t);
}
function haloMat(c, kind = 'edge', op = .75) { const key = `halo:${kind}:${c}:${op}`; return MC[key] ||= new THREE.MeshBasicMaterial({ map: haloTex(kind), color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }); }
function halo(g, w, h, c, x, y, z, rz = 0, kind = 'edge', op = .75) { const me = add(g, new THREE.PlaneGeometry(w, h), haloMat(c, kind, op), x, y, z, 0, 0, rz); me.castShadow = false; me.receiveShadow = false; return me; }
function tube(g, pts, r, m, closed = false) { const me = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V(...p)), closed), Math.max(24, pts.length * 8), r, 6, closed), m); g.add(me); return me; }

Object.assign(CAT, {
  'led-strip': { label: 'RGB LED accent strip', cat: 'Lighting', d: { w: 8, d: .1, h: .1, y: .2, accent: '#ff3df2', wash: 3.2, vertical: false }, nc: true,
    extras: [['wash', 'Glow reach (ft)', 'num', 0, 6], ['vertical', 'Run it up the wall', 'bool']],
    build(it, ctx) {
      const g = G(), c = hexOr(it.accent, '#ff3df2'), back = -it.d / 2, len = it.w, wash = Math.max(0, +it.wash || 0), m = ledMat(c);
      if (it.vertical) { bx(g, .07, len, .05, m, 0, 0, back + .04); if (wash) for (const s of [-1, 1]) halo(g, len, wash, c, s * wash / 2, len / 2, back + .025, s > 0 ? -Math.PI / 2 : Math.PI / 2); }
      else { const down = (+it.y || 0) > ctx.H / 2; bx(g, len, .07, .05, m, 0, 0, back + .04); if (wash) halo(g, len, wash, c, 0, down ? -wash / 2 : wash / 2 + .07, back + .025, down ? Math.PI : 0); }
      return g;
    } },
  'neon-sign': { label: 'Neon wall sign', cat: 'Lighting', d: { w: 3.6, d: .14, h: 1.6, y: 5, accent: '#ff3d8b', shape: 'wave' }, nc: true,
    build(it) {
      const g = G(), c = hexOr(it.accent, '#ff3d8b'), w = it.w, h = it.h, z = -it.d / 2 + .09, m = ledMat(c, 2.4), cy0 = h / 2; let pts, closed = false;
      if (it.shape === 'ring') { const r = Math.min(w, h) / 2 - .06; pts = Array.from({ length: 16 }, (_, i) => [Math.cos(i / 16 * 6.283) * r, cy0 + Math.sin(i / 16 * 6.283) * r, z]); closed = true; }
      else if (it.shape === 'bolt') pts = [[-w * .12, h, z], [-w * .3, h * .52, z], [w * .02, h * .56, z], [-w * .1, 0, z], [w * .3, h * .5, z], [w * .0, h * .46, z], [w * .16, h, z]].map(p => [p[0], p[1], p[2]]);
      else if (it.shape === 'arc') pts = Array.from({ length: 11 }, (_, i) => [Math.cos(Math.PI - i / 10 * Math.PI) * (w / 2 - .05), Math.sin(i / 10 * Math.PI) * (h - .1), z]);
      else if (it.shape === 'line') pts = [[-w / 2, cy0, z], [0, cy0, z], [w / 2, cy0, z]];
      else pts = Array.from({ length: 13 }, (_, i) => [-w / 2 + w * i / 12, cy0 + Math.sin(i / 12 * Math.PI * 3) * (h / 2 - .08), z]);
      tube(g, pts, .035, m, closed); halo(g, w * 1.7, h * 2.2 + 1, c, 0, cy0, -it.d / 2 + .03, 0, 'radial', .5);
      for (const s of [-1, 1]) cy(g, .02, .02, .08, mat('black-metal'), s * w * .3, cy0 - .04, -it.d / 2 + .04, 6, Math.PI / 2);
      return g;
    } },
  'acoustic-panels': { label: 'Acoustic wall panels', cat: 'Walls', d: { w: 8, d: .25, h: 7.5, y: .5, finish: '#3a3d47', accent: '#7c5cff', leds: 2 }, nc: true,
    extras: [['leds', 'LED lines', 'num', 0, 4]],
    build(it) {
      const g = G(), w = it.w, h = it.h, back = -it.d / 2, cols = Math.max(2, Math.round(w / 1.7)), rows = Math.max(2, Math.round(h / 1.7)), tw = w / cols, th = h / rows, m = mat(it.finish), m2 = mat(shade(hexOr(it.finish, '#3a3d47'), 1.45));
      bx(g, w, h, .03, mat('#0d0e10'), 0, 0, back + .015);
      for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { const deep = (r + q) % 2, t = deep ? .17 : .1; bx(g, tw - .07, th - .07, t, deep ? m : m2, -w / 2 + tw * (q + .5), th * r + .035, back + .03 + t / 2); }
      const L = Math.min(rows - 1, Math.max(0, it.leds | 0)), c = hexOr(it.accent, '#7c5cff');
      for (let i = 1; i <= L; i++) { const row = Math.round(rows * i / (L + 1)); bx(g, w - .1, .035, .03, ledMat(c), 0, th * row - .018, back + .05); halo(g, w, 1.7, c, 0, th * row + .85, back + .21, 0, 'edge', .55); halo(g, w, 1.2, c, 0, th * row - .62, back + .21, Math.PI, 'edge', .4); }
      return g;
    } },
  'studio-desk': { label: 'Studio desk (music, DJ or streaming)', cat: 'Work', d: { w: 6.5, d: 2.8, h: 4.3, finish: 'wood-dark', accent: '#00e5ff' },
    build(it) {
      const g = G(), w = it.w, d = it.d, back = -d / 2, m = mat(it.finish), dark = mat('#141518'), c = hexOr(it.accent, '#00e5ff');
      bx(g, w, .12, d, m, 0, 2.4, 0);
      for (const s of [-1, 1]) { bx(g, 1.25, 2.4, d - .35, dark, s * (w / 2 - .625), 0, -.1); for (let i = 0; i < 5; i++) bx(g, 1.0, .05, .02, mat(i % 2 ? 'led-soft' : 'black-metal'), s * (w / 2 - .625), .45 + i * .4, d / 2 - .29); }
      for (const s of [-1, 1]) bx(g, .1, .5, .8, m, s * (w / 2 - .5), 2.52, back + .5);
      bx(g, w - .5, .08, .95, m, 0, 3.02, back + .52);
      for (const s of [-1, 1]) { const x = s * 1.05; bx(g, 1.95, 1.15, .07, mat('screen'), x, 3.25, back + .5, -s * .18); bx(g, 1.8, 1.0, .01, ledMat('#22345e', .55), x + s * .007, 3.325, back + .54, -s * .18); bx(g, .5, .16, .3, dark, x, 3.1, back + .5); }
      bx(g, 2.6, .13, .8, dark, 0, 2.52, .35); bx(g, 2.3, .03, .28, mat('#ecebe7'), 0, 2.65, .52);
      for (let i = 0; i < 8; i++) cy(g, .035, .035, .06, mat(i % 3 ? 'chrome' : 'brass'), -.95 + i * .27, 2.65, .12, 10);
      bx(g, 1.0, .12, .8, mat('black-metal'), w / 2 - 1.5, 2.52, .3); bx(g, .8, .12, .7, mat('black-metal'), -w / 2 + 1.45, 2.52, .3);
      bx(g, w - 2.7, .035, .03, ledMat(c), 0, 2.37, d / 2 - .06); halo(g, w - 2.7, 1.6, c, 0, 1.55, d / 2 - .05, Math.PI, 'edge', .4);
      g.userData.colliders = [{ x: 0, z: 0, hx: w / 2, hz: d / 2, ang: 0, y0: 0, y1: 2.6 }];
      return g;
    } },
  'speaker-pair': { label: 'Studio speakers on stands', cat: 'Work', d: { w: 6, d: 1.1, h: 4.4, finish: '#17181b' },
    build(it) {
      const g = G(), m = mat(it.finish), cone = mat('#2b2d31');
      for (const s of [-1, 1]) { const x = s * (it.w / 2 - .45); cy(g, .36, .4, .07, mat('black-metal'), x, 0, 0, 20); cy(g, .06, .06, 3, mat('black-metal'), x, .07, 0, 10);
        bx(g, .85, 1.3, .9, m, x, 3.05, 0, -s * .2); const fx = x - s * .09, fz = .45;
        cy(g, .27, .27, .04, cone, fx, 3.42, fz, 20, Math.PI / 2).rotation.y = -s * .2; cy(g, .1, .1, .05, mat('chrome'), fx, 4.03, fz, 14, Math.PI / 2).rotation.y = -s * .2; }
      g.userData.colliders = [-1, 1].map(s => ({ x: s * (it.w / 2 - .45), z: 0, hx: .45, hz: .5, ang: 0, y0: 0, y1: it.h }));
      return g;
    } },
  'guitar-wall': { label: 'Guitars on the wall', cat: 'Decor', d: { w: 5, d: .4, h: 3.5, y: 3.3, count: 3 }, nc: true,
    extras: [['count', 'Guitars', 'num', 1, 5]],
    build(it) {
      const g = G(), n = Math.max(1, Math.min(5, it.count | 0 || 3)), back = -it.d / 2, cols = ['#b9814a', '#7a2e1d', '#1b1c1f', '#d7b98a', '#3c4a5c'];
      for (let i = 0; i < n; i++) {
        const x = -it.w / 2 + it.w * (i + .5) / n, m = mat(cols[i % cols.length]), z = back + .16;
        cy(g, .56, .56, .13, m, x, .5, z, 28, Math.PI / 2); cy(g, .42, .42, .13, m, x, 1.18, z, 28, Math.PI / 2);
        cy(g, .15, .15, .02, mat('#0e0e0f'), x, .93, z + .07, 18, Math.PI / 2); bx(g, .34, .06, .04, mat('#0e0e0f'), x, .52, z + .08);
        bx(g, .16, 1.85, .07, mat('#3a2a20'), x, 1.6, z + .02); bx(g, .24, .46, .06, mat('#1a1410'), x, 3.02, z);
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) cy(g, .025, .025, .05, mat('chrome'), x + s * .15, 3.08 + k * .13, z, 8, 0);
        bx(g, .3, .05, .2, mat('black-metal'), x, 2.98, back + .1);
      }
      return g;
    } },
  'recliner-row': { label: 'Cinema recliners', cat: 'Living', d: { w: 9, d: 3.4, h: 3.5, count: 3, finish: 'leather-dark', accent: '#ff8a3c' },
    extras: [['count', 'Seats', 'num', 1, 5]],
    build(it) {
      const g = G(), n = Math.max(1, Math.min(5, it.count | 0 || 3)), arm = .34, sw = (it.w - arm * (n + 1)) / n, d = it.d, m = mat(it.finish), back = -d / 2;
      for (let i = 0; i <= n; i++) { const x = -it.w / 2 + arm / 2 + i * (sw + arm); rb(g, arm, 1.95, d - 1.0, .1, m, x, 0, -.35); bx(g, arm - .1, .03, .5, mat('black-metal'), x, 1.95, .2); cy(g, .1, .08, .04, mat('led-soft'), x, 1.98, .2, 14); }
      for (let i = 0; i < n; i++) { const x = -it.w / 2 + arm + sw / 2 + i * (sw + arm);
        rb(g, sw, 1.0, d - 1.15, .12, m, x, .15, -.3); rb(g, sw - .06, .34, d - 1.5, .14, m, x, 1.12, -.12);
        const b = rb(g, sw - .04, 2.55, .62, .2, m, x, 1.0, back + .42); b.rotation.x = -.2; rb(g, sw - .5, .5, .3, .12, m, x, 3.05, back + .32).rotation.x = -.2;
        rb(g, sw - .08, .42, 1.15, .14, m, x, .62, d / 2 - .62).rotation.x = .12; }
      bx(g, it.w - .2, .035, .03, ledMat(hexOr(it.accent, '#ff8a3c'), 1.2), 0, .05, d / 2 - 1.1);
      return g;
    } },
  'projector-screen': { label: 'Cinema screen', cat: 'Living', d: { w: 10, d: .2, h: 5.6, y: 2.4 }, nc: true,
    build(it) {
      const g = G(), back = -it.d / 2;
      bx(g, it.w, it.h, .09, mat('#0b0b0d'), 0, 0, back + .05); bx(g, it.w - .28, it.h - .28, .02, ledMat('#5d6677', .22), 0, .14, back + .1);
      halo(g, it.w + 3, it.h + 3, '#8fa4c8', 0, it.h / 2, back + .03, 0, 'radial', .22);
      return g;
    } },
  'fireplace-linear': { label: 'Linear fireplace wall', cat: 'Living', d: { w: 6.5, d: 1.1, h: 10, finish: 'stone-dark', accent: '#ff8a3c' },
    build(it, ctx) {
      const g = G(), w = it.w, d = it.d, Hh = Math.min(it.h, ctx.H), back = -d / 2, m = mat(it.finish), c = hexOr(it.accent, '#ff8a3c'), y0 = 1.25, fh = 1.45, fw = w - 1.4;
      bx(g, w, y0, d, m, 0, 0, 0); bx(g, w, Hh - y0 - fh, d, m, 0, y0 + fh, 0); for (const s of [-1, 1]) bx(g, (w - fw) / 2, fh, d, m, s * (w / 2 - (w - fw) / 4), y0, 0);
      bx(g, fw, fh, .08, mat('#08080a'), 0, y0, back + .12); bx(g, fw, .16, d - .3, mat('#141210'), 0, y0, .05); bx(g, fw - .2, .05, .3, ledMat('#ff5a1f', 1.3), 0, y0 + .16, .12);
      const R = rng('fire' + Math.round(w * 10)), n = Math.max(5, Math.round(fw / .42));
      for (let i = 0; i < n; i++) { const x = -fw / 2 + fw * (i + .5) / n, s = .55 + R() * .6; PX_(g, .15, ledMat(c, 2.4), x, y0 + .22 + .22 * s, .12, .75, 1.5 * s, .45); if (R() < .6) PX_(g, .09, ledMat('#ffd27a', 2.6), x + .05, y0 + .2 + .14 * s, .16, .7, 1.4 * s, .45); }
      bx(g, fw, fh, .03, mat('glass'), 0, y0, d / 2 - .06); bx(g, w + .7, .3, d + .55, mat('marble'), 0, 0, .27);
      halo(g, fw + 2.5, 3.2, c, 0, y0 + .6, d / 2 + .04, 0, 'radial', .35);
      return g;
    } },
  'wine-wall': { label: 'Glass wine wall', cat: 'Dining', d: { w: 6, d: 1.4, h: 8.6, finish: 'black-metal' },
    build(it) {
      const g = G(), w = it.w, d = it.d, h = it.h, back = -d / 2, m = mat(it.finish);
      bx(g, w, h, .06, mat('wine-glow'), 0, 0, back + .03); bx(g, w, .12, d, m, 0, 0, 0); bx(g, w, .12, d, m, 0, h - .12, 0); for (const s of [-1, 1]) bx(g, .1, h, d, m, s * (w / 2 - .05), 0, 0);
      const cols = Math.max(3, Math.floor((w - .5) / .36)), rows = Math.max(3, Math.floor((h - .9) / .5)), cs = ['#3b2416', '#1f3a2c', '#2a1a12'];
      for (let r = 0; r < rows; r++) { const y = .45 + r * (h - .9) / rows; bx(g, w - .2, .025, .03, mat('brass'), 0, y - .03, .1);
        for (let q = 0; q < cols; q++) { const x = -w / 2 + .25 + (w - .5) * (q + .5) / cols; cy(g, .11, .11, .78, mat(cs[(r + q) % 3]), x, y + .05, -.05, 10, Math.PI / 2); cy(g, .04, .04, .22, mat(cs[(r + q) % 3]), x, y + .12, .42, 8, Math.PI / 2); } }
      for (const s of [-1, 1]) ledV(g, s * (w / 2 - .14), .15, d / 2 - .12, h - .3);
      bx(g, w - .2, h - .24, .04, mat('glass'), 0, .12, d / 2 - .04); bx(g, .06, h - .24, .06, m, 0, .12, d / 2 - .03);
      return g;
    } },
  'window-seat': { label: 'Window seat with storage', cat: 'Living', d: { w: 6, d: 2, h: 1.55, finish: 'wood-light', accent: 'fabric-main' },
    build(it) {
      const g = G(), w = it.w, d = it.d, m = mat(it.finish), f = mat(it.accent), n = Math.max(2, Math.round(w / 2.2));
      bx(g, w, 1.2, d, m, 0, 0, 0); for (let i = 1; i < n; i++) bx(g, .03, 1.0, .02, mat('#1d1510'), -w / 2 + w * i / n, .1, d / 2 + .005); bx(g, w, .03, .02, mat('#1d1510'), 0, 1.1, d / 2 + .005);
      rb(g, w - .08, .32, d - .1, .12, f, 0, 1.2, 0);
      const cs = ['fabric-accent', 'fabric-second', 'fabric-main'], k = Math.min(4, n + 1); for (let i = 0; i < k; i++) rb(g, 1.25, 1.1, .36, .16, mat(cs[i % 3]), -w / 2 + .8 + i * ((w - 1.6) / Math.max(1, k - 1)), 1.5, -d / 2 + .3, i % 2 ? .1 : -.08).rotation.x = -.22;
      g.userData.surfaces = [{ x: 0, z: 0, hx: w / 2, hz: d / 2, y: 1.52 }];
      return g;
    } },
  'ceiling-slats': { label: 'Timber slat ceiling with light', cat: 'Structure', d: { w: 10, d: 8, h: .35, y: 9.3, finish: 'wood-dark', accent: '#ffd9a8' }, nc: true,
    build(it, ctx) {
      const g = G(), w = it.w, d = it.d, th = Math.max(.25, ctx.H - it.y - .02), m = mat(it.finish), n = Math.max(4, Math.round(w / .5)), c = hexOr(it.accent, '#ffd9a8');
      bx(g, w, .03, d, mat('#15110e'), 0, th - .03, 0);
      for (let i = 0; i < n; i++) bx(g, .2, th - .03, d, m, -w / 2 + w * (i + .5) / n, 0, 0);
      const k = Math.max(1, Math.round(n / 5)); for (let i = k; i < n; i += k) bx(g, .05, .03, d - .3, ledMat(c, 1.5), -w / 2 + w * i / n, th - .09, 0);
      return g;
    } },
  'gym-set': { label: 'Home gym set', cat: 'Work', d: { w: 9, d: 6.5, h: 5, accent: '#ff5a3c' },
    build(it) {
      const g = G(), w = it.w, d = it.d, dark = mat('#17181b'), steel = mat('chrome'), c = hexOr(it.accent, '#ff5a3c'), tx = -w / 2 + 1.5;
      bx(g, w, .04, d, mat('#222429'), 0, 0, 0);
      bx(g, 2.5, .5, 5.6, dark, tx, 0, .2); bx(g, 1.9, .03, 4.6, mat('#0b0b0c'), tx, .5, .3);
      for (const s of [-1, 1]) { rod(g, V(tx + s * 1.1, .5, -1.9), V(tx + s * 1.1, 3.9, -2.4), .06, steel); rod(g, V(tx + s * 1.1, 3.2, -2.3), V(tx + s * 1.1, 3.1, -.6), .05, steel); }
      bx(g, 2.3, .9, .2, dark, tx, 3.7, -2.45, 0, -.25); bx(g, 1.3, .5, .02, ledMat('#22345e', .6), tx, 3.9, -2.33, 0, -.25);
      const rx = w / 2 - 2.2; bx(g, 3.6, .08, 1.3, dark, rx, 1.0, -d / 2 + .8); bx(g, 3.6, .08, 1.3, dark, rx, 2.2, -d / 2 + .8); for (const s of [-1, 1]) bx(g, .1, 2.6, 1.3, dark, rx + s * 1.8, 0, -d / 2 + .8);
      for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) { const x = rx - 1.4 + i * .7, y = 1.08 + r * 1.2, k = .13 + i * .02; cy(g, k, k, .16, mat(r ? '#2b2d31' : c), x, y + k - .08, -d / 2 + .55, 12, Math.PI / 2); cy(g, k, k, .16, mat(r ? '#2b2d31' : c), x, y + k - .08, -d / 2 + 1.05, 12, Math.PI / 2); cy(g, .04, .04, .5, steel, x, y + k - .25, -d / 2 + .8, 8, Math.PI / 2); }
      const bxn = w / 2 - 3.7; bx(g, 1.3, .25, 3.4, dark, bxn, 1.25, d / 2 - 2.1); for (const z of [d / 2 - 3.5, d / 2 - .7]) bx(g, 1.1, 1.25, .12, steel, bxn, 0, z);
      bx(g, 2.1, .05, Math.min(5.2, d - 2), mat(c), w / 2 - 1.25, .04, d / 2 - Math.min(5.2, d - 2) / 2 - .2);
      g.userData.colliders = [{ x: tx, z: .2, hx: 1.3, hz: 2.9, ang: 0, y0: 0, y1: 4 }, { x: rx, z: -d / 2 + .8, hx: 1.9, hz: .7, ang: 0, y0: 0, y1: 2.6 }];
      return g;
    } },
});
Object.assign(NOTES, {
  'led-strip': 'RGB LED ACCENT STRIP: a glowing line in any colour (accent "#hex") with a wash of coloured light on the wall; back to a wall. w = its length. y≈0.2 along the skirting (washes upward), y≈ceiling−0.6 under a cove (washes downward), or behind a bed/TV/desk at y≈2.5; vertical:true runs it up a corner. Use two or three in a room for a real RGB scheme',
  'neon-sign': 'neon wall sign in any colour (accent "#hex"); shape: wave, ring, bolt, arc or line; back to wall, y≈5; one per room, above a bar, desk or bed',
  'acoustic-panels': 'padded acoustic wall panels in a relief grid with LED lines between rows (leds: count, accent "#hex"); back to wall, w = the wall run, y≈0.5; for studios, cinemas, bedrooms',
  'studio-desk': 'production desk with rack sides, two monitors on a bridge, keyboard controller and an LED under-glow (accent "#hex"); back to wall; for a music, DJ, gaming or streaming room. Add an office-chair in front',
  'speaker-pair': 'two studio monitors on stands, w apart, angled in; either side of a desk or screen',
  'guitar-wall': 'guitars hung on the wall (count 1 to 5); back to wall, y≈3.3',
  'recliner-row': 'row of cinema recliners (count seats) with lit arm consoles; faces the screen, 9 to 12 ft away',
  'projector-screen': 'large cinema screen; back to wall, y≈2.4; pair with recliner-row, acoustic-panels and led-strip',
  'fireplace-linear': 'full-height stone chimney wall with a long glazed linear fire (flame colour accent) and a stone hearth; back to wall in living, dining or master bedroom; a signature piece',
  'wine-wall': 'floor-to-ceiling glass wine wall, backlit, with hundreds of bottles; back to wall in dining, living or a bar corner',
  'window-seat': 'built-in window seat with drawers, a long cushion and pillows; back against the wall under a window (the sill should be at or above 1.6 ft)',
  'ceiling-slats': 'timber slat ceiling feature with light lines between slats; centre it over a seating, dining or bed area; y = ceiling height − 0.7',
  'gym-set': 'home gym: treadmill, dumbbell rack, bench and mat on rubber flooring; needs about 9 × 6.5 ft; back to wall',
});
