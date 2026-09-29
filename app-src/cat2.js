/* ---------- premium catalog: statement pieces and architectural treatments ---------- */
const PX_ = (g, s, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const me = add(g, new THREE.SphereGeometry(s, 20, 12), m, x, y, z); me.scale.set(sx, sy, sz); return me; };
function flutes(g, w, h, m, z, y0 = 0, pitch = .16) {  // vertical half-round flutes across width w
  const n = Math.max(2, Math.floor(w / pitch)), step = w / n, geo = new THREE.CylinderGeometry(step * .48, step * .48, h, 10, 1, false, 0, Math.PI);
  for (let i = 0; i < n; i++) { const me = add(g, geo, m, -w / 2 + step * (i + .5), y0 + h / 2, z); me.rotation.y = -Math.PI / 2; }
}
function books(g, x, y, z, n = 4, ry = 0) {
  const cols = ['#e8e0d2', '#2f3a33', '#a88b6a', '#d9cbb3', '#3c3a37', '#b9a58a']; let yy = y;
  for (let i = 0; i < n; i++) { const h = .09 + (i % 2) * .03, w = .95 - i * .06, d = .7 - i * .03; bx(g, w, h, d, mat(cols[(i * 3 + Math.round(x * 7)) % cols.length]), x, yy, z, ry + (i % 2 ? .08 : -.05)); yy += h; }
  return yy;
}
function sculpture(g, x, y, z, s = 1, m = mat('white-ceramic')) { PX_(g, .22 * s, m, x, y + .22 * s, z, 1, 1, 1); const t = add(g, new THREE.TorusGeometry(.2 * s, .06 * s, 10, 28), m, x + .3 * s, y + .26 * s, z); t.rotation.y = .6; }
function vaseBranch(g, x, y, z, s = 1) { cy(g, .14 * s, .2 * s, .5 * s, mat('white-ceramic'), x, y, z, 18); leafyTwigs(g, x, y, z, s); }

function decorBath(g, x, y, z) { cy(g, .12, .12, .35, mat('stone-dark'), x, y, z, 14); cy(g, .1, .1, .5, mat('glass-bronze'), x + .3, y, z, 14); bx(g, .5, .12, .35, mat('linen-white'), x - .45, y, z); }
Object.assign(CAT, {
  'kitchen-luxe': { label: 'Designer kitchen run', cat: 'Kitchen', d: { w: 10, d: 2.1, h: 3, finish: 'wood-dark', top: 'marble', accent: 'brass', shelves: true },
    extras: [['shelves', 'Open shelves (off = wall cabinets)', 'bool']],
    build(it, ctx) {
      const g = G(), w = it.w, d = it.d, h = it.h, body = mat(it.finish), top = mat(it.top || 'marble'), ac = mat(it.accent || 'brass'), back = -d / 2;
      bx(g, w - .1, .35, d - .35, mat('black-metal'), 0, 0, -.17); bx(g, w - .3, .03, .04, mat('led-soft'), 0, .05, d / 2 - .34);
      bx(g, w, h - .5, d - .08, body, 0, .35, -.04); flutes(g, w - .05, h - .6, body, d / 2 - .06, .4, .14);
      for (let x = -w / 2 + 2; x < w / 2 - .5; x += 2) bx(g, .9, .03, .04, ac, x + 1, h - .32, d / 2 + .02);
      bx(g, w + .04, .16, d + .08, top, 0, h - .15, .02);
      const bh = Math.min(ctx.H, 10) - h - .9; bx(g, w, bh, .08, top, 0, h, back + .04);
      if (it.sink != null) { const sx = it.sink; bx(g, 2.2, .02, 1.3, mat('stone-dark'), sx, h + .012, .1); rod(g, V(sx, h, back + .35), V(sx, h + 1.2, back + .35), .04, ac); rod(g, V(sx, h + 1.2, back + .35), V(sx, h + 1.2, back + .85), .035, ac); }
      if (it.hobAt != null) { bx(g, 2.6, .015, 1.7, mat('screen'), it.hobAt, h, .1); }
      if (it.shelves !== false) {
        const L = -w / 2 + .3, Rr = w / 2 - .3, gap = it.hobAt != null ? [it.hobAt - 1.6, it.hobAt + 1.6] : null, segs = gap ? [[L, gap[0]], [gap[1], Rr]] : [[L, Rr]];
        for (const yy of [h + 1.9, h + 3.2]) { for (const [a, b] of segs) if (b - a > .8) { bx(g, b - a, .12, .9, mat(it.finish === 'wood-dark' ? 'wood-light' : 'wood-dark'), (a + b) / 2, yy, back + .5); bx(g, b - a - .2, .03, .04, mat('led'), (a + b) / 2, yy - .03, back + .8); }
          for (let x = -w / 2 + .8, i = 0; x < w / 2 - .8; x += .7, i++) { if (i % 4 === 3 || (gap && x > gap[0] - .3 && x < gap[1] + .3)) continue; if (i % 3 === 0) cy(g, .18, .15, .45, mat('white-ceramic'), x, yy + .12, back + .5, 16); else if (i % 3 === 1) cy(g, .12, .12, .6, mat('glass-bronze'), x, yy + .12, back + .5, 14); else { const pl = add(g, new THREE.CylinderGeometry(.35, .35, .04, 24), mat('stone'), x, yy + .45, back + .2); pl.rotation.x = Math.PI / 2 - .15; } } }
      } else { bx(g, w, 2.6, 1.15, body, 0, h + 2.2, back + .6); bx(g, w - .3, .03, .06, mat('led'), 0, h + 2.17, back + 1.1); }
      return g;
    } },
  'vanity-luxe': { label: 'Floating vanity with lit mirror', cat: 'Bath', d: { w: 3.6, d: 1.8, h: 8, finish: 'wood-dark', top: 'marble', wall: 'stone-dark' },
    build(it) {
      const g = G(), w = it.w, d = it.d, back = -d / 2, ww = w + 1.2;
      bx(g, ww, it.h, .1, mat(it.wall || 'stone-dark'), 0, 0, back + .05);
      bx(g, w, 1.1, d - .15, mat(it.finish), 0, 1.0, back + .12 + (d - .15) / 2); flutes(g, w - .05, 1.0, mat(it.finish), back + d - .02, 1.05, .12);
      bx(g, w - .3, .03, .05, mat('led-soft'), 0, .95, back + d - .3);
      bx(g, w + .06, .12, d, mat(it.top || 'marble'), 0, 2.1, back + d / 2 + .05);
      cy(g, .55, .38, .45, mat('white-ceramic'), 0, 2.22, back + d * .55, 30);
      rod(g, V(0, 3.2, back + .1), V(0, 3.2, back + .6), .035, mat('brass'));
      const R = Math.min(1.3, w / 2 - .1); const ring = add(g, new THREE.TorusGeometry(R, .06, 10, 60), mat('brass'), 0, 5.0, back + .16);
      add(g, new THREE.CircleGeometry(R - .03, 48), mat('mirror'), 0, 5.0, back + .15);
      const glow = add(g, new THREE.TorusGeometry(R - .02, .05, 8, 60), mat('led'), 0, 5.0, back + .12);
      for (const sx of [-1, 1]) { bx(g, .4, .06, .4, mat('brass'), sx * (w / 2 + .3), 5.4, back + .3); PX_(g, .18, mat('lamp-white'), sx * (w / 2 + .3), 5.35, back + .35, 1, 1.3, 1); }
      decorBath(g, w / 2 - .55, 2.22, back + .45);
      return g;
    } },
  'tub-freestanding': { label: 'Freestanding tub', cat: 'Bath', d: { w: 5.4, d: 2.6, h: 1.9, finish: 'white-ceramic' },
    build(it) {
      const g = G(), w = it.w, d = it.d, h = it.h, m = mat(it.finish);
      const t = add(g, new THREE.CylinderGeometry(1, .82, h, 48, 1), m, 0, h / 2, 0); t.scale.set(w / 2, 1, d / 2);
      const water = add(g, new THREE.CircleGeometry(1, 48), mat('glass'), 0, h - .25, 0); water.rotation.x = -Math.PI / 2; water.scale.set(w / 2 - .15, d / 2 - .15, 1);
      rod(g, V(w / 2 + .4, 0, 0), V(w / 2 + .4, h + 1.2, 0), .05, mat('brass')); rod(g, V(w / 2 + .4, h + 1.2, 0), V(w / 2 - .1, h + 1.2, 0), .04, mat('brass'));
      return g;
    } },
  'tv-wall': { label: 'TV feature wall', cat: 'Walls', d: { w: 10, d: 1.1, h: 9.6, finish: 'stone', accent: 'wood-dark', fluted: false },
    extras: [['fluted', 'Fluted wood instead of stone', 'bool']],
    build(it, ctx) {
      const g = G(), w = it.w, d = it.d, H = Math.min(it.h, ctx.H), back = -d / 2;
      if (it.fluted) { bx(g, w, H, .08, mat('wood-dark'), 0, 0, back + .04); flutes(g, w, H, mat(it.accent || 'wood-light'), back + .1, 0, .18); }
      else { bx(g, w, H, .12, mat(it.finish), 0, 0, back + .06); for (let i = 1; i < 4; i++) bx(g, w, .012, .01, mat('#bfb2a0'), 0, H * i / 4, back + .125); }
      bx(g, .05, H - .8, .05, mat('led'), -w / 2 + .9, .4, back + .16); bx(g, .05, H - .8, .05, mat('led'), w / 2 - .9, .4, back + .16);
      const cw = w * .72; bx(g, cw, .8, .78, mat(it.fluted ? 'stone' : it.accent), 0, .55, back + .12 + .39);
      bx(g, cw - .2, .025, .05, mat('led'), 0, .5, back + .6);
      bx(g, 4.9, 2.8, .1, mat('black-metal'), 0, 3.3, back + .22); bx(g, 4.82, 2.72, .012, mat('screen'), 0, 3.34, back + .275);
      const ty = 1.35; books(g, -cw / 2 + .8, ty, back + .5); vaseBranch(g, cw / 2 - .7, ty, back + .5, .8); sculpture(g, cw / 2 - 1.6, ty, back + .5, .8);
      return g;
    } },
  'bed-luxe': { label: 'Luxe bed', cat: 'Bedroom', d: { w: 6.4, d: 7.4, h: 4.6, finish: 'fabric-main', accent: 'fabric-accent', wall: 'fabric-second' },
    build(it) {
      const g = G(), w = it.w, d = it.d, m = mat(it.finish), a = mat(it.accent), hw = w + 3.2, back = -d / 2;
      if (it.panel === 'walnut') {
        bx(g, hw, it.h + 1.2, .14, mat('wood-dark'), 0, 0, back + .07); const cw = w + .6; rb(g, cw, it.h - .6, .3, .1, mat(it.wall || 'fabric-second'), 0, 1.6, back + .25);
        for (let y = 1.9; y < it.h + .9; y += .45) bx(g, cw - .1, .02, .02, mat('#6b5a48'), 0, y, back + .41);
        for (const s of [-1, 1]) bx(g, .04, it.h + 1, .04, mat('led'), s * (cw / 2 + .12), .1, back + .16);
      } else {
        bx(g, hw, it.h, .12, mat(it.wall || it.finish), 0, 0, back + .06);
        const n = Math.round(hw / .55); for (let i = 0; i < n; i++) rb(g, hw / n - .05, it.h - .5, .28, .12, mat(it.wall || it.finish), -hw / 2 + hw / n * (i + .5), .25, back + .22);
      }
      bx(g, hw, .03, .06, mat('led-soft'), 0, it.h + .02, back + .15);
      rb(g, w + .3, 1.15, d - .4, .2, m, 0, .12, .2); bx(g, w - .2, .08, d - .9, mat('black-metal'), 0, .04, .2);
      rb(g, w, .55, d - .7, .22, mat('linen-white'), 0, 1.15, .18);
      rb(g, w + .06, .28, d * .62, .14, mat(it.finish), 0, 1.55, d * .17);
      rb(g, w + .1, .12, 1.6, .06, a, 0, 1.78, d * .28);
      for (const s of [-1, 1]) { pillow(g, mat('linen-white'), s * w * .24, 2.05, back + .95, w * .44, .8, s * .05, -.32); pillow(g, mat('linen'), s * w * .22, 1.95, back + 1.35, w * .38, .66, -s * .06, -.22); }
      pillow(g, a, 0, 1.92, back + 1.72, 1.3, .55, 0, -.16);
      for (const s of [-1, 1]) { rb(g, 1.6, .15, 1.5, .05, mat('wood-dark'), s * (w / 2 + .95), 1.7, back + .9); bx(g, .02, .02, .02, m, 0, 0, 0);
        cy(g, .012, .012, 2.3, mat('brass'), s * (w / 2 + .95), 4.3, back + .9, 4); PX_(g, .28, mat('lamp-white'), s * (w / 2 + .95), 4.15, back + .9, 1, 1.1, 1); vaseBranch(g, s * (w / 2 + .95) + s * .4, 1.85, back + .9, .45); }
      return g;
    } },
  'lounge-chair': { label: 'Lounge chair', cat: 'Living', d: { w: 2.8, d: 3, h: 2.8, finish: 'fabric-main', accent: 'wood-dark' },
    build(it) {
      const g = G(), m = mat(it.finish), sh = mat(it.accent), w = it.w, d = it.d;
      rb(g, w, .18, d - .5, .09, sh, 0, 1.0, .1, 0, .08); rb(g, w, it.h - .7, .2, .1, sh, 0, 1.05, -d / 2 + .3, 0, -.32);
      rb(g, w - .3, .35, d - .8, .16, m, 0, 1.12, .15, 0, .08); rb(g, w - .35, it.h - 1.2, .32, .15, m, 0, 1.25, -d / 2 + .5, 0, -.32);
      for (const s of [-1, 1]) rb(g, .16, .65, d - .9, .06, sh, s * (w / 2 - .08), 1.1, 0);
      cy(g, .08, .1, 1.0, mat('black-metal'), 0, 0, 0, 12); for (let i = 0; i < 5; i++) { const a = i * 1.2566; rod(g, V(0, .06, 0), V(Math.cos(a) * 1.1, .02, Math.sin(a) * 1.1), .05, mat('black-metal')); }
      return g;
    } },
  'accent-barrel': { label: 'Barrel accent chair', cat: 'Living', d: { w: 2.5, d: 2.4, h: 2.4, finish: 'fabric-main' },
    build(it) {
      const g = G(), m = mat(it.finish), R = it.w / 2, N = 14;
      for (let i = 0; i < N; i++) { const p = -2.1 + (i + .5) * 4.2 / N, s = Math.sin(p), c = Math.cos(p); rb(g, 4.2 / N * R * 1.1, it.h, .42, .18, m, (R - .21) * s, 0, -(R - .21) * c, -p); }
      cy(g, R - .3, R - .25, .95, m, 0, 0, .05, 30); cy(g, R - .4, R - .35, .25, mat('linen-white'), 0, .95, .1, 30);
      return g;
    } },
  'coffee-plinth': { label: 'Sculptural stone coffee table', cat: 'Living', d: { w: 4.4, d: 2.6, h: 1.25, finish: 'stone' },
    build(it) {
      const g = G(), m = mat(it.finish), w = it.w, d = it.d;
      rb(g, w * .62, it.h, d, d / 2 - .02, m, -w * .18, 0, 0); rb(g, w * .5, it.h * .72, d * .8, d * .4 - .02, m, w * .24, 0, .08);
      const yy = books(g, -w * .28, it.h, -.1, 3, .3); sculpture(g, -w * .28, yy, -.1, .7); cy(g, .35, .22, .18, mat('white-ceramic'), w * .26, it.h * .72, .1, 24);
      return g;
    } },
  'sideboard-fluted': { label: 'Fluted sideboard', cat: 'Living', d: { w: 6, d: 1.5, h: 2.6, finish: 'wood-dark', top: 'stone' },
    build(it) {
      const g = G(), w = it.w, d = it.d, h = it.h;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(g, .04, .04, .45, mat('brass'), sx * (w / 2 - .25), 0, sz * (d / 2 - .2), 8);
      bx(g, w, h - .45, d - .06, mat(it.finish), 0, .45, -.03); flutes(g, w - .1, h - .6, mat(it.finish), d / 2 - .02, .52, .12);
      bx(g, w + .06, .09, d + .04, mat(it.top || 'stone'), 0, h, 0);
      vaseBranch(g, w / 2 - .8, h + .09, 0, .7); books(g, -w / 2 + 1, h + .09, 0); sculpture(g, 0, h + .09, 0, .8);
      return g;
    } },
  'chandelier': { label: 'Chandelier', cat: 'Lighting', d: { w: 3.4, d: 3.4, h: 2, y: 6.6, finish: 'brass' }, nc: true,
    build(it, ctx) {
      const g = G(), R = it.w / 2, m = mat(it.finish), top = Math.max(.3, ctx.H - it.y);
      cy(g, .03, .03, top, m, 0, it.h * .5, 0, 6);
      for (const [rr, yy, n] of [[R, .15, 12], [R * .62, .7, 8], [R * .3, 1.2, 5]]) {
        const t = add(g, new THREE.TorusGeometry(rr, .025, 6, 48), m, 0, yy, 0); t.rotation.x = Math.PI / 2;
        for (let i = 0; i < n; i++) { const a = i * 2 * Math.PI / n; cy(g, .01, .01, it.h * .5 - yy + .6, m, Math.cos(a) * rr, yy, Math.sin(a) * rr, 3); PX_(g, .16, mat('lamp-white'), Math.cos(a) * rr, yy - .05, Math.sin(a) * rr); }
      }
      return g;
    } },
  'pendant-drum': { label: 'Statement drum pendant', cat: 'Lighting', d: { w: 2.8, d: 2.8, h: 1.1, y: 6.8, finish: 'linen' }, nc: true,
    build(it, ctx) {
      const g = G(), R = it.w / 2; cy(g, .012, .012, Math.max(.2, ctx.H - it.y - it.h), mat('black-metal'), 0, it.h, 0, 4);
      const sh = add(g, new THREE.CylinderGeometry(R, R, it.h, 48, 1, true), mat(it.finish), 0, it.h / 2, 0); sh.material.side = THREE.DoubleSide;
      cy(g, R * .92, R * .92, .02, mat('lamp-white'), 0, .12, 0, 40); PX_(g, .25, mat('lamp'), 0, .55, 0);
      return g;
    } },
  'sconce': { label: 'Wall sconce', cat: 'Lighting', d: { w: .6, d: .6, h: .9, y: 5.2, finish: 'brass' }, nc: true,
    build(it) { const g = G(), back = -it.d / 2; cy(g, .18, .18, .04, mat(it.finish), 0, .25, back + .02, 20, Math.PI / 2); rod(g, V(0, .45, back + .03), V(0, .45, back + .35), .025, mat(it.finish)); PX_(g, .2, mat('lamp-white'), 0, .45, back + .38); return g; } },
  'lamp-arc': { label: 'Arc floor lamp', cat: 'Lighting', d: { w: 1.4, d: 5, h: 7, finish: 'brass' }, nc: true,
    build(it) {
      const g = G(), m = mat(it.finish), back = -it.d / 2 + .6; rb(g, 1.2, .35, 1.2, .1, mat('marble'), 0, 0, back);
      let p = V(0, .35, back); for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * .62, q = V(0, .35 + Math.sin(a) * (it.h - 1.2), back + (1 - Math.cos(a)) * (it.d - 1.4)); rod(g, p, q, .035, m); p = q; }
      const sh = add(g, new THREE.SphereGeometry(.7, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, p.y - .55, p.z); sh.material.side = THREE.DoubleSide; PX_(g, .18, mat('lamp'), 0, p.y - .6, p.z);
      return g;
    } },
  'ceiling-cove': { label: 'False ceiling with cove light', cat: 'Structure', d: { w: 12, d: 10, h: .6, y: 9, finish: 'plaster', band: 1.6 }, nc: true, noSize: false,
    build(it, ctx) {
      const g = G(), w = it.w, d = it.d, b = it.band || 1.6, y0 = ctx.H - it.y - .6 > 0 ? 0 : 0, m = mat(it.finish), top = ctx.H - it.y, th = Math.max(.35, top - .02);
      bx(g, w, th, b, m, 0, 0, -d / 2 + b / 2); bx(g, w, th, b, m, 0, 0, d / 2 - b / 2); bx(g, b, th, d - 2 * b, m, -w / 2 + b / 2, 0, 0); bx(g, b, th, d - 2 * b, m, w / 2 - b / 2, 0, 0);
      const e = mat('led'), iw = w - 2 * b, id = d - 2 * b;
      bx(g, iw, .05, .06, e, 0, th + .01, -id / 2 + .04); bx(g, iw, .05, .06, e, 0, th + .01, id / 2 - .04); bx(g, .06, .05, id, e, -iw / 2 + .04, th + .01, 0); bx(g, .06, .05, id, e, iw / 2 - .04, th + .01, 0);
      for (const [x, z] of [[-w / 2 + b / 2, -d / 2 + b / 2], [w / 2 - b / 2, -d / 2 + b / 2], [-w / 2 + b / 2, d / 2 - b / 2], [w / 2 - b / 2, d / 2 - b / 2]]) cy(g, .12, .12, .02, mat('lamp-white'), x, -.01, z, 16);
      return g;
    } },
  'wall-molding': { label: 'Classic wall moulding', cat: 'Walls', d: { w: 8, d: .1, h: 8, y: .4, finish: '#f1ebe1' }, nc: true,
    build(it) {
      const g = G(), m = mat('plaster'), w = it.w, h = it.h, z = -it.d / 2 + .04, n = Math.max(1, Math.round(w / 3)), pw = w / n - .35;
      bx(g, w, h, .02, mat(it.finish), 0, 0, z - .02);
      for (let i = 0; i < n; i++) { const cx = -w / 2 + w / n * (i + .5);
        for (const [y0, hh] of [[.3, h * .28], [.3 + h * .28 + .35, h * .62 - .95]]) { bx(g, pw, .06, .06, m, cx, y0, z); bx(g, pw, .06, .06, m, cx, y0 + hh, z); bx(g, .06, hh, .06, m, cx - pw / 2, y0, z); bx(g, .06, hh, .06, m, cx + pw / 2, y0, z); } }
      bx(g, w, .18, .1, m, 0, h - .18, z);
      return g;
    } },
  'arch-niche': { label: 'Arched lit niche', cat: 'Walls', d: { w: 3.2, d: .8, h: 7.2, finish: 'plaster', accent: 'stone' },
    build(it) {
      const g = G(), w = it.w, h = it.h, back = -it.d / 2, m = mat(it.finish), iw = w - .7, ih = h - .35 - iw / 2;
      bx(g, iw, ih + iw / 2, .08, mat(it.accent), 0, .35, back + .05); const topY = .35 + ih + iw / 2; if (h - topY > .05) bx(g, w, h - topY, it.d, m, 0, topY, 0);
      for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) { const a = Math.PI / 2 * (i + .5) / 6, r = iw / 2, xe = Math.cos(a) * r, ye = .35 + ih + Math.sin(a) * r, fill = w / 2 - .35 - xe; if (fill > .02) bx(g, fill + .02, topY - ye + .02, it.d, m, sx * (xe + fill / 2), ye - .01, 0); }
      bx(g, .35, h, it.d, m, -w / 2 + .175, 0, 0); bx(g, .35, h, it.d, m, w / 2 - .175, 0, 0); bx(g, iw, .35, it.d, m, 0, 0, 0);
      for (let i = 0; i < 12; i++) { const a0 = Math.PI * i / 12, a1 = Math.PI * (i + 1) / 12, r = iw / 2, x0 = Math.cos(a0) * r, y0 = .35 + ih + Math.sin(a0) * r, x1 = Math.cos(a1) * r, y1 = .35 + ih + Math.sin(a1) * r; const seg = bx(g, Math.hypot(x1 - x0, y1 - y0) + .02, .35, it.d, m, (x0 + x1) / 2, (y0 + y1) / 2 - .175, 0); seg.rotation.z = Math.atan2(y1 - y0, x1 - x0); }
      bx(g, iw, .04, .06, mat('led-soft'), 0, .35 + ih + iw / 2 - .2, back + .2);
      for (const yy of [2.2, 4.0]) { bx(g, iw, .08, it.d - .2, mat('wood-dark'), 0, yy, 0); }
      vaseBranch(g, 0, .35, 0, .8); sculpture(g, -.3, 2.28, 0, .8); books(g, .3, 4.08, 0, 3);
      return g;
    } },
  'bar-unit': { label: 'Bar unit', cat: 'Living', d: { w: 4.5, d: 1.6, h: 7.8, finish: 'wood-dark', top: 'marble' },
    build(it) {
      const g = G(), w = it.w, d = it.d, h = it.h, back = -d / 2, m = mat(it.finish);
      bx(g, w, h, .08, m, 0, 0, back + .04); bx(g, .1, h, d, m, -w / 2 + .05, 0, 0); bx(g, .1, h, d, m, w / 2 - .05, 0, 0); bx(g, w, .1, d, m, 0, h - .1, 0); bx(g, w, 3, d, m, 0, 0, 0);
      bx(g, w + .05, .08, d + .05, mat(it.top), 0, 3, 0); bx(g, w - .3, h - 3.3, .05, mat('wine-glow'), 0, 3.1, back + .1);
      for (const yy of [4.3, 5.6]) { bx(g, w - .2, .04, d - .3, mat('glass'), 0, yy, 0); for (let i = 0; i < 6; i++) cy(g, .1, .1, .75, mat(i % 2 ? '#3b2416' : '#1f3a2c'), -w / 2 + .5 + i * .68, yy + .04, 0, 12); }
      for (let i = 0; i < 4; i++) cy(g, .12, .06, .45, mat('glass'), -w / 2 + .8 + i * .9, 3.08, .1, 14);
      for (const s of [-1, 1]) bx(g, w / 2 - .12, h - 3.4, .04, mat('glass-bronze'), s * w / 4, 3.15, d / 2 - .03);
      return g;
    } },
  'pooja-unit': { label: 'Pooja unit (mandir)', cat: 'Decor', d: { w: 3.4, d: 1.5, h: 7, finish: 'wood-dark', accent: 'brass' },
    build(it) {
      const g = G(), w = it.w, d = it.d, h = it.h, back = -d / 2, m = mat(it.finish), a = mat(it.accent);
      bx(g, w, h, .08, m, 0, 0, back + .04); bx(g, w, 2.4, d, m, 0, 0, 0); bx(g, w + .06, .1, d + .06, mat('marble'), 0, 2.4, 0);
      bx(g, .12, h - 2.4, d, m, -w / 2 + .06, 2.4, 0); bx(g, .12, h - 2.4, d, m, w / 2 - .06, 2.4, 0); bx(g, w, .5, d, m, 0, h - .5, 0);
      bx(g, w - .3, h - 3.2, .04, mat('led-soft'), 0, 2.6, back + .1);
      const jx = .22; for (let x = -w / 2 + .25; x < w / 2 - .2; x += jx) bx(g, .03, h - 3.1, .03, a, x, 2.5, d / 2 - .05);
      for (let y = 2.6; y < h - .6; y += jx) bx(g, w - .3, .03, .03, a, 0, y, d / 2 - .05);
      for (const s of [-1, 1]) { rod(g, V(s * .8, h - .5, 0), V(s * .8, h - 1.4, 0), .01, a); cy(g, .02, .12, .2, a, s * .8, h - 1.6, 0, 12); }
      cy(g, .16, .08, .08, a, 0, 2.5, .1, 16); PX_(g, .06, mat('led'), 0, 2.64, .1, .7, 1.4, .7);
      return g;
    } },
  'jhoola': { label: 'Jhoola (swing)', cat: 'Living', d: { w: 4.2, d: 1.9, h: 2.8, finish: 'teak', accent: 'fabric-accent' },
    build(it, ctx) {
      const g = G(), w = it.w, d = it.d, m = mat(it.finish), sy = 1.4;
      rb(g, w, .12, d, .04, m, 0, sy, 0); rb(g, w, 1.1, .1, .04, m, 0, sy + .1, -d / 2 + .05, 0, -.12); for (const s of [-1, 1]) rb(g, .1, .7, d, .04, m, s * (w / 2 - .05), sy + .1, 0);
      rb(g, w - .3, .3, d - .3, .12, mat(it.accent), 0, sy + .12, .08); for (const s of [-1, 1]) rb(g, 1.1, .8, .3, .12, mat('fabric-second'), s * (w / 4), sy + .4, -d / 2 + .35, 0, -.2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(g, V(sx * (w / 2 - .1), sy + .12, sz * (d / 2 - .1)), V(sx * (w / 2 - .1), ctx.H - .05, sz * .1), .025, mat('brass'));
      return g;
    } },
  'floor-vase': { label: 'Floor vase with branches', cat: 'Decor', d: { w: 1.2, d: 1.2, h: 4.5, finish: 'terracotta' },
    build(it) { const g = G(); cy(g, .28, .38, 1.6, mat(it.finish), 0, 0, 0, 22); const lm = mat('leaf');
      for (let i = 0; i < 7; i++) { const a = i * .9, top = V(Math.cos(a) * .6, 3 + (i % 3) * .5, Math.sin(a) * .6); rod(g, V(0, 1.5, 0), top, .02, mat('bark')); PX_(g, .22, lm, top.x, top.y, top.z, 1.3, .6, 1.3); }
      return g; } },
  'decor-set': { label: 'Styled decor (books, bowl, sculpture)', cat: 'Decor', d: { w: 1.6, d: 1, h: .6, y: 1.3 }, nc: true,
    build(it) { const g = G(); const yy = books(g, -.3, 0, 0, 3); sculpture(g, -.3, yy, 0, .6); cy(g, .3, .2, .15, mat('brass'), .45, 0, 0, 24); return g; } },
  'rug-round': { label: 'Round rug', cat: 'Decor', d: { w: 7, d: 7, h: .03, finish: '#d6c8b2' }, nc: true,
    build(it) { const g = G(); cy(g, it.w / 2, it.w / 2, .03, tintMat('rug', rugTex(), it.finish, 1), 0, .005, 0, 64); return g; } },
});
Object.assign(NOTES, {
  'kitchen-luxe': 'premium kitchen counter run: fluted handleless fronts with brass pulls, thick stone top, full-height stone backsplash, floating shelves with ceramics and LED (shelves:false gives wall cabinets); back to wall; sink and hobAt are x offsets from centre like kitchen-counter; use for the main kitchen wall',
  'vanity-luxe': 'floating fluted vanity with vessel basin, brass wall tap, round backlit brass mirror, sconces and a full-height stone wall behind (wall = stone token); back to wall; do NOT add a separate mirror; use in every bathroom instead of vanity',
  'tub-freestanding': 'oval freestanding tub with a brass floor filler; master bathrooms with at least 8 ft free; keep 1.5 ft around it',
  'tv-wall': 'FEATURE WALL for the living room: full-height stone (or fluted:true wood) cladding with LED side reveals, floating console and TV; back flat against the wall, sofa faces it',
  'bed-luxe': 'panel:"walnut" gives a walnut-panelled headboard wall with a textured upholstered centre (Evening Luxe). Premium bed with a full-width channel-tufted headboard wall, bedside shelves and hanging bedside pendants built in (do NOT add nightstands with it); back against the wall; wall = headboard fabric token',
  'lounge-chair': 'sculptural lounge chair with wood shell; reading corners, beside windows',
  'accent-barrel': 'curved boucle barrel accent chair; pairs of two facing the sofa',
  'coffee-plinth': 'sculptural two-part stone coffee table styled with books and objects; centre of the seating group',
  'sideboard-fluted': 'fluted sideboard with stone top and styled decor; against a wall in dining or living',
  'chandelier': 'three-tier brass chandelier; centre of dining table or double-height/large living; y≈6.3–6.8',
  'pendant-drum': 'large statement drum pendant; over dining tables, beds or seating groups; y≈6.8',
  'sconce': 'wall sconce; pairs flanking mirrors, art, beds or TV walls; back to wall; y≈5.2',
  'lamp-arc': 'brass arc floor lamp whose shade reaches over a sofa; base behind/beside the sofa, front points toward the sofa',
  'ceiling-cove': 'FALSE CEILING with a recessed cove LED tray: centre it in the room, w and d ≈ room size minus 0.3 ft; rot 0; y = ceiling height − 0.6; use in living, dining and master bedroom',
  'wall-molding': 'classic panel moulding on a wall (Classic Luxe, Modern Indian); back to wall; w = wall run length',
  'arch-niche': 'arched backlit niche with shelves and decor; back to wall; great beside TV walls, in foyers and passages',
  'bar-unit': 'bar cabinet with glass shelves, backlit bottles and stone counter; back to wall in living/dining',
  'pooja-unit': 'pooja mandir with brass jaali doors, bells and a diya glow; back to wall; Indian homes, usually living, dining or foyer',
  'jhoola': 'wooden swing hung from the ceiling on brass chains; Indian homes, living corner or balcony; keep 3 ft free in front',
  'floor-vase': 'tall terracotta floor vase with branches; corners and beside consoles',
  'decor-set': 'styled cluster of books, sculpture and brass bowl; put on consoles, coffee tables, sideboards using y = surface height',
  'rug-round': 'round rug; under round dining tables or lounge corners',
});
