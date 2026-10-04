/* ---------- furniture catalog ---------- */
const CAT = {
  'rug': { label: 'Rug', cat: 'Decor', d: { w: 8, d: 6, h: .03, finish: '#cdbfa8' }, nc: true,
    build(it) { const g = G(); bx(g, it.w, .03, it.d, it.finish.startsWith('#') ? tintMat('rug', rugTex(), it.finish, 1) : mat(it.finish), 0, .005, 0); return g; } },
  'sofa-curved': { label: 'Curved sofa', cat: 'Living', d: { w: 10, d: 4.8, h: 2.6, finish: 'fabric-main', accent: 'fabric-second' },
    build(it) {
      const g = G(), m = mat(it.finish), a = mat(it.accent), R = it.w / 2, d = Math.min(it.d, R * 1.6), cz = R - d / 2;
      const pm = Math.acos(Math.max(-1, Math.min(1, (R - d) / R))), N = Math.max(7, Math.round(R * 1.8)), dp = 2 * pm / N, bt = .8, sd = Math.min(2.5, d - 1.2), h = it.h, ch = 2 * Math.sin(dp / 2);
      for (let i = 0; i < N; i++) {
        const p = -pm + (i + .5) * dp, s = Math.sin(p), c = Math.cos(p), rB = R - bt / 2, rS = R - bt - sd / 2;
        rb(g, ch * R * 1.05, h - .35, bt, .3, m, rB * s, .35, cz - rB * c, -p);
        rb(g, ch * (R - bt) * 1.05, .7, sd, .12, m, rS * s, 0, cz - rS * c, -p);
        rb(g, ch * (R - bt) * 1.0, .42, sd - .1, .18, m, rS * s, .68, cz - rS * c, -p);
        if (i % 2) { const rP = R - bt - .3; rb(g, 1.25, 1.05, .38, .17, a, rP * s, 1.08, cz - rP * c, -p, -.28); }
      }
      return g;
    } },
  'sofa': { label: 'Sofa', cat: 'Living', d: { w: 7, d: 3, h: 2.4, finish: 'linen', accent: 'fabric-accent' },
    build(it) {
      const g = G(), m = mat(it.finish), a = mat(it.accent), w = it.w, d = it.d, h = it.h, arm = .55, iw = w - 2 * arm;
      bx(g, w - .3, .2, d - .3, mat('wood-dark')); rb(g, w, .7, d, .15, m, 0, .2, 0);
      const n = Math.max(1, Math.round(iw / 2.6)), cw = iw / n;
      for (let i = 0; i < n; i++) { const x = -iw / 2 + cw * (i + .5); rb(g, cw - .04, .45, d - .85, .18, m, x, .88, .4); rb(g, cw - .04, h - 1.05, .75, .25, m, x, .88, -d / 2 + .42, 0, -.12); }
      for (const s of [-1, 1]) rb(g, arm, 1.55, d, .2, m, s * (w / 2 - arm / 2), .2, 0);
      rb(g, 1.2, 1.0, .35, .15, a, -iw / 2 + .8, 1.3, -d / 2 + .95, .25, -.3); rb(g, 1.2, 1.0, .35, .15, a, iw / 2 - .8, 1.3, -d / 2 + .95, -.25, -.3);
      return g;
    } },
  'armchair': { label: 'Armchair', cat: 'Living', d: { w: 2.6, d: 2.6, h: 2.6, finish: 'fabric-main' },
    build(it) {
      const g = G(), m = mat(it.finish), w = it.w, d = it.d, h = it.h;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(g, .05, .04, .4, mat('wood-dark'), sx * (w / 2 - .3), 0, sz * (d / 2 - .3), 10);
      rb(g, w, .75, d, .25, m, 0, .35, 0); rb(g, w - .8, .4, d - .75, .15, m, 0, 1.05, .3);
      rb(g, w, h - .35, .7, .3, m, 0, .35, -d / 2 + .35, 0, -.08);
      for (const s of [-1, 1]) rb(g, .45, 1.5, d - .2, .2, m, s * (w / 2 - .22), .35, .1);
      return g;
    } },
  'table-round': { label: 'Round table', cat: 'Living', d: { w: 3, d: 3, h: 1.3, finish: 'stone', accent: 'black-metal' },
    build(it) {
      const g = G(), m = mat(it.finish), r = it.w / 2, h = it.h;
      if (h > 1.8) { cy(g, r, r, .12, m, 0, h - .12, 0, 40); cy(g, .1, .14, h - .12, mat(it.accent), 0, 0, 0, 14); cy(g, r * .42, r * .48, .08, mat(it.accent), 0, 0, 0, 28); }
      else { cy(g, r, r, .22, m, 0, h - .22, 0, 48); cy(g, r * .62, r * .55, h - .22, m, 0, 0, 0, 40); }
      return g;
    } },
  'pouf': { label: 'Pouf', cat: 'Living', d: { w: 1.6, d: 1.6, h: 1.3, finish: 'fabric-main' },
    build(it) { const g = G(); cy(g, it.w / 2 * .94, it.w / 2, it.h, mat(it.finish), 0, 0, 0, 32); return g; } },
  'console': { label: 'Console / sideboard', cat: 'Living', d: { w: 5, d: 1.4, h: 2.4, y: 0, finish: 'wood-dark' },
    build(it) {
      const g = G(), m = mat(it.finish), w = it.w, d = it.d, h = it.h, dark = mat('#2a211b'), fl = it.y > 0, y0 = fl ? 0 : .25;
      if (!fl) bx(g, w - .3, .25, d - .3, mat('black-metal'));
      bx(g, w, h - y0, d, m, 0, y0, 0);
      const n = Math.max(2, Math.round(w / 1.8)); for (let i = 1; i < n; i++) bx(g, .02, h - y0 - .1, .02, dark, -w / 2 + w * i / n, y0 + .05, d / 2 + .005);
      if (it.top) bx(g, w + .04, .08, d + .04, mat(it.top), 0, h, 0);
      if (fl) bx(g, w - .4, .03, .06, mat('led'), 0, -.03, d / 2 - .2);
      return g;
    } },
  'tv': { label: 'TV', cat: 'Living', d: { w: 5.4, d: .15, h: 3.1, y: 3.4 }, nc: true,
    build(it) { const g = G(); bx(g, it.w, it.h, .12, mat('black-metal'), 0, 0, .16); bx(g, it.w - .08, it.h - .08, .01, mat('screen'), 0, .04, .225); return g; } },   // stands proud of any wall panelling
  'panel-slats': { label: 'Fluted wood wall', cat: 'Walls', d: { w: 8, d: .22, h: 9.6, finish: 'wood-light' },
    build(it) {
      const g = G(), w = it.w, h = it.h, d = it.d; bx(g, w, h, .06, mat('wood-dark'), 0, 0, -d / 2 + .03);
      const n = Math.max(2, Math.floor(w / .26)), L = [];
      for (let i = 0; i < n; i++) L.push([-w / 2 + .08 + i * (w - .16) / (n - 1), h / 2, .03]);
      const im = inst(g, new THREE.BoxGeometry(.13, h, d - .06), mat(it.finish), L); im.castShadow = true; return g;
    } },
  'panel-stone': { label: 'Stone wall', cat: 'Walls', d: { w: 6, d: .1, h: 9.6, finish: 'stone' }, nc: true,
    build(it) { const g = G(); bx(g, it.w, it.h, it.d, mat(it.finish)); return g; } },
  'panel-upholstered': { label: 'Upholstered wall', cat: 'Walls', d: { w: 8, d: .3, h: 9.6, finish: 'linen' }, nc: true,
    build(it) {
      const g = G(), m = mat(it.finish), w = it.w, h = it.h, d = it.d; bx(g, w, h, .06, mat('wood-dark'), 0, 0, -d / 2 + .03);
      const cols = Math.max(1, Math.round(w / 2.2)), rows = 3, cw = w / cols, rh = (h - .1) / rows;
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) rb(g, cw - .05, rh - .05, d - .08, .1, m, -w / 2 + cw * (c + .5), .05 + rh * r, .04);
      return g;
    } },
  'artwork': { label: 'Artwork', cat: 'Decor', d: { w: 3, d: .1, h: 2.4, y: 4, seed: 1 }, nc: true, extras: [['seed', 'Painting', 'num', 1, 99]],
    build(it) { const g = G(); bx(g, it.w, it.h, .1, mat(it.frame || 'wood-light')); add(g, new THREE.PlaneGeometry(it.w - .22, it.h - .22), paintMat(it.seed || 1), 0, it.h / 2, .052); return g; } },
  'mirror': { label: 'Mirror', cat: 'Bath', d: { w: 2.4, d: .1, h: 3, y: 4.2, arch: true }, nc: true, extras: [['arch', 'Arched top', 'bool']],
    build(it) {
      const g = G();
      const shp = (W, Hh) => { const s = new THREE.Shape(); s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); if (it.arch) { s.lineTo(W / 2, Hh - W / 2); s.absarc(0, Hh - W / 2, W / 2, 0, Math.PI, false); } else { s.lineTo(W / 2, Hh); s.lineTo(-W / 2, Hh); } s.lineTo(-W / 2, 0); return new THREE.ShapeGeometry(s, 24); };
      add(g, shp(it.w + .25, it.h + .2), mat('led-soft'), 0, -.1, -.01); add(g, shp(it.w, it.h), mat('mirror'), 0, 0, .02); return g;
    } },
  'curtain': { label: 'Sheer curtain', cat: 'Decor', d: { w: 2, d: .4, h: 9.6 }, nc: true,
    build(it) {
      const g = G(), W = it.w, Hh = it.h, seg = Math.max(8, Math.round(W * 12)), geo = new THREE.PlaneGeometry(W, Hh, seg, 1), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) / W * seg * Math.PI * .5) * .12);
      geo.computeVertexNormals(); add(g, geo, mat('sheer'), 0, Hh / 2 + .05, 0); bx(g, W + .2, .08, .12, mat('black-metal'), 0, Hh + .02, 0); return g;
    } },
  'vase': { label: 'Vase with stems', cat: 'Decor', d: { w: .8, d: .8, h: 1.4, y: 0 }, nc: true,
    build(it) {
      const g = G(), h = it.h, R = rng(it.id || 'v'), vh = h * .42; cy(g, .15, .22, vh, mat('#d8ccba'), 0, 0, 0, 18);
      for (let i = 0; i < 6; i++) { const t = V((R() - .5) * .7, vh + h * .55 + R() * h * .2, (R() - .5) * .7); rod(g, V(0, vh - .05, 0), t, .012, mat('bark')); add(g, new THREE.IcosahedronGeometry(.12 + R() * .08, 0), mat(R() < .5 ? 'leaf' : '#c9b18c'), t.x, t.y, t.z); }
      return g;
    } },
  'plant-tree': { label: 'Olive tree', cat: 'Plants', d: { w: 2.2, d: 2.2, h: 7, finish: 'concrete' },
    build(it) {
      const g = G(), R = rng(it.id || 't'), w = it.w, h = it.h, ph = Math.min(1.8, h * .25);
      cy(g, w * .4, w * .32, ph, mat(it.finish), 0, 0, 0, 28); cy(g, w * .37, w * .37, .04, mat('soil'), 0, ph - .1, 0, 20);
      for (let i = 0; i < 3; i++) rod(g, V(0, ph - .05, 0), V((R() - .5) * .6, ph + (h - ph) * (.45 + R() * .2), (R() - .5) * .6), .05, mat('bark'));
      const cH = ph + (h - ph) * .72;
      for (let i = 0; i < 12; i++) { const r = .4 + R() * .42, m2 = add(g, new THREE.IcosahedronGeometry(r, 1), mat(R() < .5 ? 'leaf' : 'leaf-dark'), (R() - .5) * w * .9, cH + (R() - .5) * (h - ph) * .45, (R() - .5) * w * .9); m2.scale.set(1, .8, 1); }
      g.userData.colliders = [{ x: 0, z: 0, hx: w * .4, hz: w * .4, ang: 0, y0: 0, y1: h }]; return g;
    } },
  'plant-pot': { label: 'Potted plant', cat: 'Plants', d: { w: 1.5, d: 1.5, h: 3, finish: 'terracotta' },
    build(it) {
      const g = G(), R = rng(it.id || 'p'), w = it.w, h = it.h, ph = h * .38;
      cy(g, w * .45, w * .36, ph, mat(it.finish), 0, 0, 0, 24); cy(g, w * .42, w * .42, .03, mat('soil'), 0, ph - .06, 0, 16);
      if (it.flowers) {
        for (let i = 0; i < 7; i++) add(g, new THREE.IcosahedronGeometry(w * .2 + R() * w * .1, 1), mat('leaf'), (R() - .5) * w * .6, ph + .15 + R() * (h - ph) * .55, (R() - .5) * w * .6);
        const L = []; for (let i = 0; i < 40; i++) { const a = R() * 7, rr = R() * w * .45; L.push([Math.cos(a) * rr, ph + (h - ph) * (.45 + R() * .55), Math.sin(a) * rr, .7 + R() * .7]); }
        inst(g, new THREE.IcosahedronGeometry(.1, 0), mat(it.flowers), L);
      } else {
        for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 + R() * .3, tl = .35 + R() * .6, L = (h - ph) * (.7 + R() * .4); const lf = rod(g, V(0, ph, 0), V(Math.cos(a) * Math.sin(tl) * L, ph + Math.cos(tl) * L, Math.sin(a) * Math.sin(tl) * L), .06, mat(R() < .5 ? 'leaf' : 'leaf-dark')); lf.scale.set(2.4, 1, .4); }
      }
      g.userData.colliders = [{ x: 0, z: 0, hx: w * .45, hz: w * .45, ang: 0, y0: 0, y1: h }]; return g;
    } },
  'planter-flowers': { label: 'Flower planter', cat: 'Plants', d: { w: 5, d: 1.2, h: 1.6, finish: 'concrete' },
    build(it) {
      const g = G(), R = rng(it.id || 'f'), w = it.w, d = it.d, h = it.h;
      bx(g, w, h, d, mat(it.finish)); bx(g, w - .14, .02, d - .14, mat('soil'), 0, h - .08, 0);
      const L = []; for (let i = 0; i < Math.round(w * 4); i++) L.push([(R() - .5) * (w - .4), h + .1 + R() * .55, (R() - .5) * (d - .4), .28 + R() * .3, .8]);
      inst(g, new THREE.IcosahedronGeometry(1, 1), mat('leaf'), L);
      const cols = Array.isArray(it.flowers) ? it.flowers : it.flowers ? [it.flowers] : ['#d9467e', '#b8327a', '#f1eee6'];
      cols.forEach(c => { const F = []; for (let i = 0; i < Math.round(w * 24 / cols.length); i++) F.push([(R() - .5) * (w - .3), h + .35 + R() * .65, (R() - .5) * (d - .2), .6 + R() * .8]); inst(g, new THREE.IcosahedronGeometry(.1, 0), mat(c), F); });
      return g;
    } },
  'lamp-floor': { label: 'Floor lamp', cat: 'Lighting', d: { w: 1.3, d: 1.3, h: 5.4 },
    build(it) { const g = G(), h = it.h; cy(g, .45, .5, .08, mat('black-metal'), 0, 0, 0, 24); cy(g, .035, .035, h - 1, mat('brass'), 0, .08, 0, 8); cy(g, .55, .65, 1, mat('lamp'), 0, h - 1, 0, 28); g.userData.colliders = [{ x: 0, z: 0, hx: .5, hz: .5, ang: 0, y0: 0, y1: h }]; return g; } },
  'lamp-table': { label: 'Table lamp', cat: 'Lighting', d: { w: .9, d: .9, h: 1.3 }, nc: true,
    build(it) { const g = G(); lampOn(g, 0, 0, 0, it.h / 1.25); return g; } },
  'pendants': { label: 'Pendant lights', cat: 'Lighting', d: { w: 5, d: 1.4, h: 1, y: 6.9, count: 3, finish: 'lamp-white' }, nc: true, extras: [['count', 'Lights', 'num', 1, 6]],
    build(it, ctx) {
      const g = G(), n = it.count || 3, s = it.h;
      for (let i = 0; i < n; i++) { const x = n === 1 ? 0 : -it.w / 2 + it.w * (i + .5) / n; cy(g, .012, .012, Math.max(.1, ctx.H - it.y - s * .5), mat('black-metal'), x, s * .5, 0, 4); const sh = add(g, new THREE.SphereGeometry(.75 * s, 28, 14), mat(it.finish), x, s * .3, 0); sh.scale.set(1, .5, .72); }
      return g;
    } },
  'linear-light': { label: 'Linear light', cat: 'Lighting', d: { w: 6, d: .4, h: .2, y: 8.2 }, nc: true,
    build(it, ctx) { const g = G(); bx(g, it.w, .14, .35, mat('black-metal')); bx(g, it.w - .15, .02, .25, mat('led'), 0, -.015, 0); for (const s of [-1, 1]) cy(g, .01, .01, Math.max(.1, ctx.H - it.y - .14), mat('black-metal'), s * (it.w / 2 - .4), .14, 0, 4); return g; } },
  'lantern': { label: 'Lantern', cat: 'Lighting', d: { w: .8, d: .8, h: 1.6 },
    build(it) {
      const g = G(), w = it.w, h = it.h, k = mat('black-metal'); bx(g, w, .08, w, k); bx(g, w, .08, w, k, 0, h - .08, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, .05, h, .05, k, sx * (w / 2 - .025), 0, sz * (w / 2 - .025));
      bx(g, w - .1, h - .16, w - .1, mat('glass'), 0, .08, 0); cy(g, .12, .12, .35, mat('lamp'), 0, .08, 0, 12); return g;
    } },
  'pool-table': { label: 'Pool / dining table', cat: 'Dining', d: { w: 4.3, d: 7.8, h: 2.65, finish: 'wood-dark', accent: 'felt', top: true }, extras: [['top', 'Dining top on (off = play pool)', 'bool']],
    build(it) {
      const g = G(), w = it.w, d = it.d, wd = mat(it.finish), felt = mat(it.accent), k = mat('black-metal');
      for (const s of [-1, 1]) rb(g, w - 1.3, 1.75, 1.1, .12, wd, 0, 0, s * (d / 2 - 1.6));
      rb(g, w - 1.6, .25, d - 3, .08, wd, 0, .3, 0); rb(g, w, .7, d, .1, wd, 0, 1.75, 0);
      bx(g, w - .7, .05, d - .7, felt, 0, 2.45, 0);
      for (const s of [-1, 1]) { bx(g, w - .7, .12, .18, felt, 0, 2.48, s * (d / 2 - .44)); bx(g, .18, .12, d - .7, felt, s * (w / 2 - .44), 2.48, 0); bx(g, w, .1, .35, wd, 0, 2.45, s * (d / 2 - .175)); bx(g, .35, .1, d - .7, wd, s * (w / 2 - .175), 2.45, 0); }
      for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) cy(g, .19, .19, .06, k, sx * (w / 2 - .38), 2.5, sz * (d / 2 - .38), 16);
      if (it.top) rb(g, w + .1, .14, d + .1, .05, mat(it.topFinish || 'marble'), 0, 2.55, 0);
      else {
        const cols = ['#f2c14e', '#2c5aa0', '#c0392b', '#5b2c83', '#e67e22', '#1e7a46', '#7b241c', '#111111']; let q = 0;
        for (let r = 0; r < 5; r++) for (let c = 0; c <= r; c++) add(g, new THREE.SphereGeometry(.095, 12, 8), mat(cols[q++ % 8]), (c - r / 2) * .2, 2.595, -d / 4 - r * .175);
        add(g, new THREE.SphereGeometry(.095, 12, 8), mat('white-ceramic'), 0, 2.595, d / 4);
        rod(g, V(-w / 2 + .6, 2.62, d / 4 + .3), V(-w / 2 + .9, 2.62, d / 2 + 2.6), .025, wd);
      }
      return g;
    } },
  'dining-chair': { label: 'Dining chair', cat: 'Dining', d: { w: 1.7, d: 1.8, h: 3.0, finish: 'linen', accent: 'wood-dark' },
    build(it) {
      const g = G(), w = it.w, d = it.d, up = mat(it.finish), wd = mat(it.accent);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(g, .05, .04, 1.35, wd, sx * (w / 2 - .2), 0, sz * (d / 2 - .22), 8);
      rb(g, w, .35, d - .1, .12, up, 0, 1.3, .05); rb(g, w, 1.35, .3, .14, up, 0, 1.55, -d / 2 + .2, 0, -.12); return g;
    } },
  'bar-stool': { label: 'Bar stool', cat: 'Kitchen', d: { w: 1.4, d: 1.4, h: 3.1, finish: 'fabric-second', accent: 'wood-dark' },
    build(it) {
      const g = G(), up = mat(it.finish), wd = mat(it.accent);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(g, .035, .035, 2.05, wd, sx * .45, 0, sz * .45, 8);
      add(g, new THREE.TorusGeometry(.5, .025, 6, 28), mat('brass'), 0, .8, 0, 0, Math.PI / 2);
      rb(g, 1.35, .28, 1.3, .12, up, 0, 2.02, 0); rb(g, 1.35, .75, .22, .1, up, 0, 2.28, -.55, 0, -.15); return g;
    } },
  'kitchen-counter': { label: 'Counter run', cat: 'Kitchen', d: { w: 6, d: 2, h: 3, finish: 'wood-light', top: 'marble', upper: false, backsplash: true }, extras: [['upper', 'Wall cabinets', 'bool'], ['backsplash', 'Stone backsplash', 'bool']],
    build(it) {
      const g = G(), w = it.w, d = it.d, h = it.h, body = mat(it.finish), top = mat(it.top || 'marble'), dark = mat('#2a211b'), k = mat('black-metal');
      bx(g, w, .35, d - .3, k, 0, 0, -.15); bx(g, w, h - .48, d - .05, body, 0, .35, -.025);
      for (let x = -w / 2 + 2; x < w / 2 - .1; x += 2) bx(g, .02, h - .5, .02, dark, x, .36, d / 2 - .02);
      bx(g, w, .02, .02, dark, 0, 1.9, d / 2 - .02); bx(g, w + .04, .13, d + .06, top, 0, h - .13, .02);
      if (it.sink != null) { const sx = it.sink; bx(g, 2, .02, 1.3, k, sx, h + .001, .05); cy(g, .04, .05, 1.1, k, sx, h, -d / 2 + .35, 10); bx(g, .06, .06, .6, k, sx, h + 1.05, -d / 2 + .6); }
      if (it.hobAt != null) bx(g, 2.4, .015, 1.6, mat('screen'), it.hobAt, h, .05);
      if (it.backsplash) bx(g, w, 1.9, .06, top, 0, h, -d / 2 + .03);
      if (it.upper) { bx(g, w, 2.4, 1.1, body, 0, 5.3, -d / 2 + .55); bx(g, w - .3, .03, .08, mat('led'), 0, 5.26, -d / 2 + .95); for (let x = -w / 2 + 1.5; x < w / 2 - .1; x += 1.5) bx(g, .02, 2.3, .02, dark, x, 5.35, -d / 2 + 1.11); }
      return g;
    } },
  'island': { label: 'Kitchen island', cat: 'Kitchen', d: { w: 7, d: 2.9, h: 3, finish: 'marble', accent: 'wood-dark', hob: false }, extras: [['hob', 'Hob on the island', 'bool']],
    build(it) {
      const g = G(), w = it.w, d = it.d, h = it.h, mb = mat(it.finish), ac = mat(it.accent), bd = d - 1.1;
      bx(g, w - .3, h - .45, bd, ac, 0, .3, -d / 2 + bd / 2); bx(g, w - .5, .3, bd - .25, mat('black-metal'), 0, 0, -d / 2 + bd / 2);
      bx(g, w - .4, .03, .05, mat('led'), 0, h - .2, -d / 2 + bd + .08);
      bx(g, w, .16, d, mb, 0, h - .16, 0); for (const s of [-1, 1]) bx(g, .16, h - .16, d, mb, s * (w / 2 - .08), 0, 0);
      if (it.hob) bx(g, 2.4, .015, 1.5, mat('screen'), 0, h, -.35);
      return g;
    } },
  'tall-unit': { label: 'Tall kitchen unit', cat: 'Kitchen', d: { w: 2.2, d: 2, h: 8.2, finish: 'wood-dark', sections: ['pantry'] },
    build(it) {
      const g = G(), m = mat(it.finish), w = it.w, d = it.d, h = it.h, secs = it.sections || ['pantry'], sw = w / secs.length, dark = mat('#241c16'), brass = mat('brass');
      secs.forEach((s, i) => {
        const x = -w / 2 + sw * (i + .5);
        if (s === 'wine') {
          bx(g, sw, h, d - .9, m, x, 0, -.45); bx(g, .12, h, d, m, x - sw / 2 + .06, 0, 0); bx(g, .12, h, d, m, x + sw / 2 - .06, 0, 0); bx(g, sw, .5, d, m, x, 0, 0); bx(g, sw, .5, d, m, x, h - .5, 0);
          bx(g, sw - .25, h - 1, .02, mat('wine-glow'), x, .5, d / 2 - .89);
          const cols = Math.max(2, Math.floor((sw - .4) / .3)), L = [];
          for (let r = 0; r < 12; r++) for (let c = 0; c < cols; c++) cy(g, .1, .1, .7, mat('#2b1a14'), x - (cols - 1) * .15 + c * .3, .7 + r * .55, d / 2 - .45, 8, Math.PI / 2);
          bx(g, sw - .24, h - 1, .03, mat('glass-bronze'), x, .5, d / 2 - .03);
        } else {
          bx(g, sw - .02, h, d, m, x, 0, 0);
          if (s === 'fridge') { bx(g, .02, h - .2, .02, dark, x, .1, d / 2 + .005); for (const q of [-1, 1]) bx(g, .05, 2.4, .06, brass, x + q * .14, 2.6, d / 2 + .04); }
          else if (s === 'oven') { bx(g, sw - .45, 1.4, .03, mat('screen'), x, 2.9, d / 2 + .01); bx(g, sw - .45, 1.4, .03, mat('screen'), x, 4.55, d / 2 + .01); bx(g, sw, .02, .02, dark, x, 2.6, d / 2 + .005); bx(g, sw, .02, .02, dark, x, 6.3, d / 2 + .005); }
          else { bx(g, .02, h - .2, .02, dark, x, .1, d / 2 + .005); bx(g, .05, 1.8, .06, brass, x + .14, 3, d / 2 + .04); }
        }
      });
      return g;
    } },
  'hood': { label: 'Cooker hood', cat: 'Kitchen', d: { w: 3, d: 1.8, h: 1, y: 6.6, finish: 'black-metal' }, nc: true,
    build(it, ctx) { const g = G(), m = mat(it.finish); bx(g, it.w, it.h, it.d, m); bx(g, .9, Math.max(.1, ctx.H - it.y - it.h), .9, m, 0, it.h, 0); bx(g, it.w - .3, .02, .1, mat('led'), 0, -.01, it.d / 2 - .2); return g; } },
  'bed': { label: 'Bed', cat: 'Bedroom', d: { w: 5.4, d: 7.2, h: 4, finish: 'linen', accent: 'fabric-accent' }, extras: [['low', 'Low loft bed', 'bool']],
    build(it) {
      const g = G(), m = mat(it.finish), a = mat(it.accent), w = it.w, d = it.d, low = it.low, hh = it.h, hbT = .35, bz = -d / 2, white = mat('linen-white');
      const nc = Math.max(3, Math.round(w / .75)); for (let i = 0; i < nc; i++) rb(g, w / nc - .03, hh, hbT, .12, m, -w / 2 + w / nc * (i + .5), 0, bz + hbT / 2);
      const bl = d - hbT, cz = bz + hbT + bl / 2, baseY = low ? 0 : .3, baseH = low ? .45 : 1.0;
      if (!low) { bx(g, w - .8, .3, bl - 1, mat('black-metal'), 0, 0, cz); bx(g, w - .75, .03, bl - .95, mat('led'), 0, .01, cz); }
      rb(g, w, baseH, bl, .18, m, 0, baseY, cz);
      const bt = baseY + baseH; rb(g, w - .2, .7, bl - .2, .2, white, 0, bt, cz);
      const mt = bt + .7; rb(g, w + .08, .22, bl - 1.3, .1, white, 0, mt - .12, cz + .62); rb(g, w + .3, .14, 1.9, .06, a, 0, mt + .02, cz + bl / 2 - 1.4);
      const np = w > 4.5 ? 2 : 1; for (let i = 0; i < np; i++) rb(g, (w - .4) / np - .15, .5, 1.0, .22, white, -w / 2 + .2 + (w - .4) / np * (i + .5), mt - .05, bz + hbT + .75, 0, -.45);
      if (w > 4) for (const s of [-1, 1]) rb(g, 1.2, .9, .35, .15, a, s * .85, mt, bz + hbT + 1.4, 0, -.3);
      if (it.posts) fourPosts(g, w, d, it.posts);
      return g;
    } },
  'nightstand': { label: 'Nightstand', cat: 'Bedroom', d: { w: 1.8, d: 1.5, h: 1.8, finish: 'wood-dark' },
    build(it) { const g = G(), w = it.w, d = it.d, h = it.h; bx(g, w, h - .2, d, mat(it.finish), 0, .2, 0); bx(g, w - .2, .2, d - .2, mat('black-metal')); bx(g, w - .1, .02, .02, mat('#2a211b'), 0, h * .55, d / 2 + .005); if (it.lamp !== false) lampOn(g, 0, h, -.1); return g; } },
  'wardrobe': { label: 'Wardrobe', cat: 'Bedroom', d: { w: 6, d: 2, h: 9, finish: 'wood-light' }, extras: [['glass', 'Glass doors, lit inside', 'bool']],
    build(it) {
      const g = G(), m = mat(it.finish), w = it.w, d = it.d, h = it.h, nd = Math.max(1, Math.round(w / 1.7)), dw = w / nd, dark = mat('#2a211b'), brass = mat('brass');
      if (it.glass) {
        const R = rng(it.id || 'w'); bx(g, w, h, .1, m, 0, 0, -d / 2 + .05); for (const s of [-1, 1]) bx(g, .1, h, d, m, s * (w / 2 - .05), 0, 0); bx(g, w, .1, d, m, 0, h - .1, 0); bx(g, w, .3, d, m);
        bx(g, w - .3, h - 1.2, .02, mat('led-soft'), 0, .6, -d / 2 + .11); for (const y of [6.9, 7.8]) bx(g, w - .2, .06, d - .2, m, 0, y, 0);
        bx(g, w - .3, .05, .05, brass, 0, 6.2, 0);
        const pal = ['#e7dfd3', '#b9a58c', '#6f7552', '#2f2b28', '#d8cbb7', '#8a6a52'];
        for (let x = -w / 2 + .3; x < w / 2 - .3; x += .17 + R() * .1) { const hh = 2.3 + R() * 1.3; bx(g, .1 + R() * .08, hh, 1.35, mat(pal[R() * 6 | 0]), x, 6.15 - hh, 0); }
        bx(g, w, h - .4, .03, mat('glass-bronze'), 0, .3, d / 2 - .02); for (let i = 0; i <= nd; i++) bx(g, .05, h - .4, .05, mat('black-metal'), -w / 2 + dw * i, .3, d / 2 - .02);
      } else {
        bx(g, w, h, d, m); for (let i = 1; i < nd; i++) bx(g, .02, h - .1, .02, dark, -w / 2 + dw * i, .05, d / 2 + .003);
        for (let i = 0; i < nd; i += 2) { const sx = -w / 2 + dw * (i + 1); if (sx < w / 2 - .05) for (const q of [-1, 1]) bx(g, .04, 1.8, .05, brass, sx + q * .12, 3, d / 2 + .03); }
      }
      return g;
    } },
  'bench': { label: 'Bench', cat: 'Bedroom', d: { w: 4.5, d: 1.5, h: 1.5, finish: 'fabric-main' },
    build(it) { const g = G(); for (const s of [-1, 1]) bx(g, .12, it.h - .5, it.d - .2, mat('wood-dark'), s * (it.w / 2 - .4), 0, 0); rb(g, it.w, .55, it.d, .2, mat(it.finish), 0, it.h - .55, 0); return g; } },
  'desk': { label: 'Desk', cat: 'Work', d: { w: 4.5, d: 2, h: 2.5, finish: 'wood-light', monitors: 1 }, extras: [['monitors', 'Monitors', 'num', 0, 3]],
    build(it) {
      const g = G(), m = mat(it.finish), w = it.w, d = it.d, h = it.h, k = mat('black-metal');
      bx(g, w, .12, d, m, 0, h - .12, 0); for (const s of [-1, 1]) bx(g, .12, h - .12, d - .1, m, s * (w / 2 - .06), 0, 0);
      bx(g, w - .3, 1, .05, m, 0, h - 1.12, -d / 2 + .1); bx(g, 1.4, .35, d - .3, m, w / 2 - .9, h - .47, 0);
      const n = it.monitors || 0; for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 2.1; bx(g, .5, .03, .4, k, x, h, -d / 2 + .45); bx(g, .07, .7, .07, k, x, h, -d / 2 + .4); bx(g, 2.0, 1.15, .08, k, x, h + .6, -d / 2 + .5); bx(g, 1.94, 1.09, .01, mat('screen'), x, h + .63, -d / 2 + .545); }
      bx(g, 1.4, .04, .45, mat('#e3ddd3'), 0, h, .2); lampOn(g, -w / 2 + .5, h, -d / 2 + .4, .7);
      return g;
    } },
  'office-chair': { label: 'Desk chair', cat: 'Work', d: { w: 1.8, d: 1.8, h: 3.4, finish: 'fabric-second' },
    build(it) {
      const g = G(), m = mat(it.finish), k = mat('black-metal');
      for (let i = 0; i < 5; i++) { const a = i * 6.283 / 5; bx(g, .9, .07, .12, k, Math.cos(a) * .45, .12, Math.sin(a) * .45, -a); cy(g, .07, .07, .1, k, Math.cos(a) * .88, 0, Math.sin(a) * .88, 8); }
      cy(g, .07, .07, 1.3, k, 0, .15, 0, 10); rb(g, 1.7, .35, 1.6, .15, m, 0, 1.45, 0); rb(g, 1.6, 1.7, .3, .14, m, 0, 1.85, -.75, 0, -.12); return g;
    } },
  'bookshelf': { label: 'Bookshelf', cat: 'Work', d: { w: 3, d: 1.1, h: 6, finish: 'wood-dark', lit: true }, extras: [['lit', 'Shelf lights', 'bool']],
    build(it) {
      const g = G(), m = mat(it.finish), w = it.w, d = it.d, h = it.h, R = rng(it.id || 'b');
      for (const s of [-1, 1]) bx(g, .08, h, d, m, s * (w / 2 - .04), 0, 0); bx(g, w, .08, d, m, 0, h - .08, 0); bx(g, w, .2, d, m); bx(g, w, h, .04, m, 0, 0, -d / 2 + .02);
      const pal = ['#d9cbb4', '#6f7552', '#b4724f', '#efe8dd', '#8a7663', '#2f2b28', '#c9b18c'];
      for (let y = .2; y < h - .9; y += 1.25) {
        bx(g, w - .16, .06, d, m, 0, y, 0); if (it.lit) bx(g, w - .3, .02, .04, mat('led'), 0, y + 1.17, d / 2 - .12);
        for (let x = -w / 2 + .15; x < w / 2 - .25;) { if (R() < .12) { cy(g, .1, .13, .5, mat('#d8ccba'), x + .15, y + .06, 0, 12); x += .4; continue; } const bw = .08 + R() * .1, bh = .6 + R() * .35; bx(g, bw, bh, d * .75, mat(pal[R() * 7 | 0]), x + bw / 2, y + .06, 0); x += bw + .01; }
      }
      return g;
    } },
  'vanity': { label: 'Vanity', cat: 'Bath', d: { w: 3.2, d: 1.7, h: 1.3, y: 1.7, finish: 'wood-light', top: 'marble', basins: 1 }, extras: [['basins', 'Basins', 'num', 1, 2]],
    build(it) {
      const g = G(), w = it.w, d = it.d, h = it.h, k = mat('black-metal');
      bx(g, w, h - .12, d, mat(it.finish)); bx(g, w + .04, .12, d + .04, mat(it.top || 'marble'), 0, h - .12, 0); bx(g, w - .3, .03, .06, mat('led'), 0, -.03, d / 2 - .3); bx(g, .02, h - .2, .02, mat('#2a211b'), 0, .05, d / 2 + .005);
      const n = it.basins || 1; for (let i = 0; i < n; i++) { const x = n === 1 ? 0 : (i ? 1 : -1) * w / 4; cy(g, .5, .4, .32, mat('white-ceramic'), x, h, .08, 28); cy(g, .03, .035, .95, k, x, h, -d / 2 + .2, 10); bx(g, .05, .05, .42, k, x, h + .9, -d / 2 + .38); }
      return g;
    } },
  'wc': { label: 'WC', cat: 'Bath', d: { w: 1.3, d: 1.9, h: 2 },
    build(it) { const g = G(), d = it.d, c = mat('white-ceramic'); bx(g, .7, .45, .04, mat('black-metal'), 0, 3.0, -d / 2 + .02); rb(g, 1.2, .95, 1.7, .42, c, 0, .95, -d / 2 + .9); rb(g, 1.18, .07, 1.62, .03, c, 0, 1.9, -d / 2 + .9); return g; } },
  'shower-glass': { label: 'Shower glass', cat: 'Bath', d: { w: 3.6, d: .1, h: 7 },
    build(it, ctx) {
      const g = G(), w = it.w, h = it.h, k = mat('black-metal');
      bx(g, w, h, .03, mat('glass')); bx(g, w, .06, .07, k, 0, h - .06, 0); for (const s of [-1, 1]) bx(g, .06, h, .07, k, s * w / 2, 0, 0);
      cy(g, .02, .02, Math.max(.1, ctx.H - 7.4), k, 0, 7.4, -1.3, 6); bx(g, 1, .04, 1, k, 0, 7.35, -1.3); bx(g, w - .4, .02, .18, k, 0, .005, -.6);
      g.userData.colliders = [{ x: 0, z: 0, hx: w / 2, hz: .05, ang: 0, y0: 0, y1: h }]; return g;
    } },
  'bathtub': { label: 'Bathtub', cat: 'Bath', d: { w: 2.6, d: 5.5, h: 1.9 },
    build(it) { const g = G(); rb(g, it.w, it.h, it.d, .6, mat('white-ceramic')); rb(g, it.w - .4, .05, it.d - .45, .02, mat('#cfd9d6'), 0, it.h - .3, 0); return g; } },
  'outdoor-sofa': { label: 'Outdoor sofa', cat: 'Outdoor', d: { w: 6, d: 2.4, h: 2.6, finish: 'teak', accent: 'linen' },
    build(it) {
      const g = G(), tk = mat(it.finish), c = mat(it.accent), w = it.w, d = it.d, h = it.h;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, .18, .3, .18, tk, sx * (w / 2 - .2), 0, sz * (d / 2 - .2));
      bx(g, w, .25, d, tk, 0, .3, 0); for (const s of [-1, 1]) bx(g, .25, 1.4, d, tk, s * (w / 2 - .125), .3, 0);
      const iw = w - .5, n = Math.max(1, Math.round(iw / 2.4)), cw = iw / n;
      for (let i = 0; i < n; i++) { const x = -iw / 2 + cw * (i + .5); rb(g, cw - .04, .45, d - .75, .15, c, x, .55, .33); rb(g, cw - .04, h - 1.0, .6, .2, c, x, .55, -d / 2 + .35, 0, -.12); }
      return g;
    } },
  'outdoor-chair': { label: 'Outdoor chair', cat: 'Outdoor', d: { w: 2.2, d: 2.2, h: 2.5, finish: 'teak', accent: 'linen' },
    build(it) { return CAT['outdoor-sofa'].build(it); } },
  'loft-platform': { label: 'Loft platform', cat: 'Structure', d: { w: 7, d: 7, h: 6.5, finish: 'wood-light', rails: 'E,S', post: 'SE' },
    build(it) {
      const g = G(), w = it.w, d = it.d, h = it.h, t = .6, wood = mat(it.finish), cols = [];
      const s = new THREE.Shape(); s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2); s.lineTo(-w / 2, d / 2); s.lineTo(-w / 2, -d / 2);
      const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }); geo.rotateX(Math.PI / 2); add(g, geo, floorMat('wood', '#c9a47d'), 0, h, 0);
      bx(g, w, t, .06, wood, 0, h - t, d / 2 + .03); bx(g, .06, t, d, wood, w / 2 + .03, h - t, 0);
      bx(g, w, .03, .05, mat('led'), 0, h - t - .03, d / 2 - .06); bx(g, .05, .03, d, mat('led'), w / 2 - .06, h - t - .03, 0);
      const seg = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0); if (L < .05) return; const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, an = Math.atan2(z1 - z0, x1 - x0); bx(g, L, 2.5, .04, mat('glass'), cx, h, cz, -an); bx(g, L, .1, .1, mat('brass'), cx, h + 2.5, cz, -an); cols.push({ x: cx, z: cz, hx: L / 2, hz: .12, ang: an, y0: h, y1: h + 2.8 }); };
      const rails = String(it.rails || '').toUpperCase().split(',');
      if (rails.includes('S')) seg(-w / 2, d / 2 - .05, w / 2, d / 2 - .05);
      if (rails.includes('N')) seg(-w / 2, -d / 2 + .05, w / 2, -d / 2 + .05);
      if (rails.includes('W')) seg(-w / 2 + .05, -d / 2, -w / 2 + .05, d / 2);
      if (rails.includes('E')) { const x = w / 2 - .05, gp = it.gapE; if (gp) { seg(x, -d / 2, x, -d / 2 + gp[0]); seg(x, -d / 2 + gp[1], x, d / 2); } else seg(x, -d / 2, x, d / 2); }
      if (it.post) { const px = /E/.test(it.post) ? w / 2 - .22 : -w / 2 + .22, pz = /S/.test(it.post) ? d / 2 - .22 : -d / 2 + .22; bx(g, .44, h - t, .44, wood, px, 0, pz); cols.push({ x: px, z: pz, hx: .22, hz: .22, ang: 0, y0: 0, y1: h }); }
      cols.push({ x: 0, z: 0, hx: w / 2, hz: d / 2, ang: 0, y0: h - t, y1: h });
      g.userData.colliders = cols; g.userData.surfaces = [{ type: 'rect', x: 0, z: 0, hx: w / 2, hz: d / 2, ang: 0, y: h }]; return g;
    } },
  'stair-curved': { label: 'Curved staircase', cat: 'Structure', noSize: true, d: { w: 6.5, d: 6.5, h: 9.4, rIn: .6, rOut: 3.25, a0: 90, a1: -90, rise: 6.5, steps: 9, finish: 'wood-light', accent: 'plaster' },
    extras: [['rise', 'Top height (ft)', 'num', 2, 9], ['steps', 'Steps', 'num', 3, 16], ['rOut', 'Radius (ft)', 'num', 2, 5]],
    build(it) {
      const g = G(), wood = mat(it.finish), pl = mat(it.accent || 'plaster'), rIn = +it.rIn, rOut = +it.rOut, rise = +it.rise, steps = Math.round(it.steps);
      const A0 = it.a0 * D2R, A1 = it.a1 * D2R, span = A1 - A0, cols = [], surf = [];
      for (let i = 0; i < steps; i++) {
        const ta = A0 + span * i / steps, tb = A0 + span * (i + 1) / steps, y = rise * (i + 1) / (steps + 1), cw = tb < ta;
        const s = new THREE.Shape(); s.moveTo(rIn * Math.cos(ta), rIn * Math.sin(ta)); s.lineTo(rOut * Math.cos(ta), rOut * Math.sin(ta)); s.absarc(0, 0, rOut, ta, tb, cw); s.lineTo(rIn * Math.cos(tb), rIn * Math.sin(tb)); s.absarc(0, 0, rIn, tb, ta, !cw);
        const geo = new THREE.ExtrudeGeometry(s, { depth: .2, bevelEnabled: false, curveSegments: 10 }); geo.rotateX(Math.PI / 2); add(g, geo, wood, 0, y, 0);
        bx(g, (rOut - rIn) * .8, .02, .04, mat('led'), (rIn + rOut) / 2 * Math.cos(tb), y - .2, (rIn + rOut) / 2 * Math.sin(tb), -tb);
        const tm = (ta + tb) / 2, rm = (rIn + rOut) / 2;
        cols.push({ x: rm * Math.cos(tm), z: rm * Math.sin(tm), hx: (rOut - rIn) / 2, hz: rm * Math.abs(tb - ta) / 2, ang: tm, y0: y - .2, y1: y });
        surf.push({ type: 'sector', x: 0, z: 0, r0: Math.max(0, rIn - .3), r1: rOut + .1, a0: Math.min(ta, tb), a1: Math.max(ta, tb), y });
      }
      const NS = 40, rw = rOut + .1, pts = [];
      for (let k = 0; k < NS; k++) {
        const f = (k + .5) / NS, aa = A0 + span * f, top = rise * (f * steps + 1) / (steps + 1) + 2.9, L = rw * Math.abs(span) / NS * 1.06, x = rw * Math.cos(aa), z = rw * Math.sin(aa), tg = Math.atan2(Math.cos(aa), -Math.sin(aa));
        bx(g, L, top, .18, pl, x, 0, z, -tg); cols.push({ x, z, hx: L / 2, hz: .12, ang: tg, y0: 0, y1: top });
      }
      for (let k = 0; k <= NS; k++) { const f = k / NS, aa = A0 + span * f; pts.push(V(rw * Math.cos(aa), rise * (f * steps + 1) / (steps + 1) + 2.95, rw * Math.sin(aa))); }
      add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, .06, 8), mat('brass'), 0, 0, 0);
      cy(g, rIn * .85, rIn * .85, rise + 2.9, pl, 0, 0, 0, 24); cols.push({ x: 0, z: 0, hx: rIn * .85, hz: rIn * .85, ang: 0, y0: 0, y1: 99 });
      g.userData.colliders = cols; g.userData.surfaces = surf; return g;
    } },
};
const CAT_ORDER = ['Living', 'Dining', 'Kitchen', 'Bedroom', 'Work', 'Bath', 'Plants', 'Lighting', 'Decor', 'Walls', 'Outdoor', 'Structure'];
const FINISHES = [['wood-light', 'Style: light wood'], ['wood-dark', 'Style: dark wood'], ['stone', 'Style: stone'], ['marble', 'Style: marble'], ['stone-dark', 'Style: dark stone'], ['fabric-main', 'Style: main fabric'], ['fabric-second', 'Style: second fabric'], ['fabric-accent', 'Style: accent fabric'], ['metal', 'Style: metal'], ['oak', 'Oak'], ['walnut', 'Walnut'], ['teak', 'Teak'], ['travertine', 'Travertine'], ['marble-dark', 'Dark marble'], ['concrete', 'Concrete'], ['terracotta', 'Terracotta'], ['linen', 'Linen'], ['linen-white', 'White linen'], ['felt', 'Green felt'], ['black-metal', 'Black metal'], ['brass', 'Brass'], ['chrome', 'Chrome'], ['white-ceramic', 'White ceramic'], ['plaster', 'Plaster']];
// four-poster frame for a bed: a post at each corner and a rail around the top ("posts": true, or a finish for the frame)
function fourPosts(g, w, d, fin) {
  const m = mat(typeof fin === 'string' ? fin : 'wood-dark'), t = .22, top = 7, x = w / 2 - t / 2, z = d / 2 - t / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, t, top, t, m, sx * x, 0, sz * z);
  for (const sz of [-1, 1]) bx(g, w - t, .16, .16, m, 0, top - .16, sz * z);
  for (const sx of [-1, 1]) bx(g, .16, .16, d - t, m, sx * x, top - .16, 0);
}
const NOTES = {
  'rug': 'floor rug; put under sofas, beds and dining tables',
  'sofa-curved': 'curved C-shaped sofa; front is the open side of the curve',
  'sofa': 'straight sofa; back against a wall or floating facing the TV',
  'armchair': 'lounge chair', 'table-round': 'coffee/side/bistro table; h>1.8 makes a pedestal table',
  'pouf': 'round ottoman', 'console': 'sideboard, TV unit, dresser or entry console; y>0 floats it on the wall',
  'tv': 'wall-mounted TV; set y≈3.4', 'panel-slats': 'fluted wood feature wall cladding, d 0.22, on a wall face',
  'panel-stone': 'stone feature wall cladding, d 0.1, on a wall face', 'panel-upholstered': 'upholstered headboard wall, d 0.3',
  'artwork': 'framed art on a wall; y is bottom height; seed 1-99 picks the painting', 'mirror': 'mirror on a wall; arch:true for arched',
  'curtain': 'sheer curtain stack beside windows/sliders, against the glazed wall', 'vase': 'decor; set y to the table height',
  'plant-tree': 'olive tree in a large pot', 'plant-pot': 'potted plant; flowers:"#hex" for a flowering pot', 'planter-flowers': 'long planter box with flowers, for balconies/terraces; flowers: ["#hex",...]',
  'lamp-floor': 'floor lamp', 'lamp-table': 'table lamp; set y to the surface height', 'pendants': 'row of pendant lights over a table/island; y≈6.9, count',
  'linear-light': 'linear suspended light over an island; y≈8', 'lantern': 'outdoor lantern',
  'pool-table': 'pool table; top:true adds a dining top (doubles as dining table)', 'dining-chair': 'dining chair; front faces the table',
  'bar-stool': 'counter stool; front faces the island', 'kitchen-counter': 'base cabinets + worktop along a wall; sink: x-offset along its width, hobAt: x-offset, upper:true for wall cabinets, backsplash:true',
  'island': 'kitchen island with waterfall stone ends; its FRONT is the seating overhang side; hob:true', 'tall-unit': 'tall kitchen column; sections: any of "fridge","oven","pantry","wine"',
  'hood': 'cooker hood above a hob; y≈6.8', 'bed': 'bed; back = headboard against a wall; low:true for a loft/platform bed; posts:true (or a finish) makes it a four-poster',
  'nightstand': 'bedside table with lamp; beside the bed at the headboard end', 'wardrobe': 'full-height wardrobe; glass:true for a lit glass walk-in unit',
  'bench': 'upholstered bench, e.g. at the foot of a bed', 'desk': 'desk; monitors: 0-3', 'office-chair': 'desk chair; front faces the desk',
  'bookshelf': 'open bookshelf; lit:true', 'vanity': 'floating bathroom vanity (y≈1.7); basins 1-2', 'wc': 'wall-hung toilet; back against a wall',
  'shower-glass': 'glass shower screen; the shower area is BEHIND it (its back side)', 'bathtub': 'freestanding bathtub',
  'outdoor-sofa': 'teak outdoor sofa', 'outdoor-chair': 'teak outdoor lounge chair',
  'loft-platform': 'raised sleeping loft deck (h = deck height); rails like "E,S" (sides with guard rails), gapE:[from,to] ft along the east edge, post:"SE"; only if the brief asks',
  'stair-curved': 'curved stair to a loft: x,z = centre; rIn, rOut, a0/a1 = start/end angles in degrees (0 = +x, 90 = +z), rise, steps; only with a loft',
};

