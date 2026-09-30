/* ---------- Evening Luxe catalogue: walnut panelling, lit joinery, marble island, walk-in closet, spa bath ---------- */
// a soft cushion: a squashed sphere, slightly tilted back
function pillow(g, m, x, y, z, w = 1.3, h = 1.2, ry = 0, rx = -.25) { const me = add(g, new THREE.SphereGeometry(.5, 22, 14), m, x, y, z, ry, rx); me.scale.set(w, h, .42); me.castShadow = true; return me; }
function ledV(g, x, y, z, h) { bx(g, .04, h, .04, mat('led'), x, y, z); }
function ledH(g, x, y, z, w) { bx(g, w, .035, .04, mat('led'), x, y, z); }
function decorShelf(g, x0, x1, y, z, R) {  // styled objects along a shelf
  let x = x0 + .2;
  while (x < x1 - .3) {
    const k = R();
    if (k < .3) { const top = books(g, x + .45, y, z, 3 + (R() * 2 | 0)); x += 1.0; if (R() < .5) sculpture(g, x - .55, top, z, .5); }
    else if (k < .55) { cy(g, .18, .12, .55 + R() * .4, mat(R() < .5 ? 'white-ceramic' : 'stone-dark'), x + .25, y, z, 16); x += .6; }
    else if (k < .7) { cy(g, .3, .22, .12, mat('brass'), x + .35, y, z, 20); x += .8; }
    else if (k < .82) { vaseBranch(g, x + .25, y, z, .55); x += .7; }
    else x += .5;
  }
}
function hangingClothes(g, x0, x1, y, z, R) {
  const cols = ['#e9e2d6', '#c9b9a3', '#8a7560', '#3d3530', '#f2eee8', '#6f6255', '#b7a48e', '#2d2a28', '#5b6570', '#a4926f'];
  rod(g, V(x0, y, z), V(x1, y, z), .025, mat('brass'));
  for (let x = x0 + .18; x < x1 - .12; x += .2 + R() * .08) {
    const len = 2.3 + R() * 1.4, m = mat(cols[(R() * cols.length) | 0]), ry = Math.PI / 2 + (R() - .5) * .12;
    rod(g, V(x, y + .08, z), V(x, y - .12, z), .008, mat('black-metal'));
    const sh = add(g, new THREE.CylinderGeometry(.06, .08, 1.35, 12), m, x, y - .2, z, ry, 0, Math.PI / 2); sh.scale.set(1, 1, 1.4);   // shoulders
    const body = add(g, new THREE.BoxGeometry(.13, len, 1.25), m, x, y - .22 - len / 2, z, 0); body.rotation.y = (R() - .5) * .08;
  }
}
function foldedStack(g, x, y, z, R) { const cols = ['#e9e2d6', '#c9b9a3', '#8a7560', '#f2eee8', '#6f6255']; let yy = y; for (let i = 0; i < 4; i++) { rb(g, .9, .12, .8, .04, mat(cols[(R() * cols.length) | 0]), x, yy, z); yy += .12; } }

Object.assign(CAT, {
  'wall-panel-wood': { label: 'Walnut wall panelling', cat: 'Walls', d: { w: 10, d: .25, h: 10, finish: 'wood-dark', leds: 2, reveal: 2 }, nc: true,
    extras: [['leds', 'LED reveal lines', 'num', 0, 6]],
    build(it, ctx) {
      const g = G(), w = it.w, H = Math.min(it.h, ctx.H), back = -it.d / 2, m = mat(it.finish), n = Math.max(2, Math.round(w / 2));
      for (let i = 0; i < n; i++) { const pw = w / n; bx(g, pw - .025, H, .14, m, -w / 2 + pw * (i + .5), 0, back + .07); }
      bx(g, w, H, .02, mat('#1d1510'), 0, 0, back + .01);
      const L = it.leds | 0; for (let i = 1; i <= L; i++) { const x = L === 2 ? (i === 1 ? -1 : 1) * (w / 2 - Math.max(1, w * .18)) : -w / 2 + w * i / (L + 1); ledV(g, x, .1, back + .14, H - .2); }   // a pair frames the wall rather than crossing a TV or bed
      bx(g, w, .06, .06, mat('led-soft'), 0, .12, back + .17);
      return g;
    } },
  'feature-stone': { label: 'Stone feature wall with lit frame', cat: 'Walls', d: { w: 6, d: .3, h: 10, finish: 'stone', frame: 'wood-dark' }, nc: true,
    build(it, ctx) {
      const g = G(), w = it.w, H = Math.min(it.h, ctx.H), back = -it.d / 2;
      bx(g, w, H, .1, mat(it.finish), 0, 0, back + .05); for (let y = 2; y < H; y += 2.5) bx(g, w, .015, .012, mat('#8f7f6c'), 0, y, back + .105);
      for (const s of [-1, 1]) { bx(g, .35, H, it.d, mat(it.frame), s * (w / 2 + .17), 0, 0); ledV(g, s * (w / 2 - .02), .1, back + .12, H - .2); }
      return g;
    } },
  'sectional': { label: 'Deep sectional sofa', cat: 'Living', d: { w: 11, d: 3.4, h: 2.6, finish: 'fabric-main', accent: 'fabric-accent', chaise: 6, side: 'right' },
    extras: [['chaise', 'Return length (ft)', 'num', 0, 9], ['side', 'Return side (left / right)', 'text']],
    build(it) {
      const g = G(), w = it.w, d = it.d, m = mat(it.finish), a = mat(it.accent), a2 = mat('fabric-second'), R = rng(it.id || 'sec'), back = -d / 2, sh = .75;
      const seat = (x, z, sw, sd, ry = 0) => { rb(g, sw, 1.0, sd, .12, m, x, .25, z, ry); rb(g, sw - .06, .5, sd - .1, .2, m, x, 1.2, z + .04, ry); };
      bx(g, w - .3, .25, d - .3, mat('#2a211b'), 0, 0, 0);
      const nSeats = Math.max(2, Math.round((w - .8) / 3)), sw = (w - .8) / nSeats;
      for (let i = 0; i < nSeats; i++) seat(-w / 2 + .4 + sw * (i + .5), .1, sw, d - .85);
      rb(g, w, 1.6, .75, .18, m, 0, .25, back + .38);
      for (let i = 0; i < nSeats; i++) rb(g, sw - .1, 1.25, .6, .25, m, -w / 2 + .4 + sw * (i + .5), 1.5, back + .8, 0, -.2);
      const side = it.side === 'left' ? -1 : 1, ch = +it.chaise || 0;
      rb(g, .4, 1.9, d, .16, m, -side * (w / 2 - .2), .25, 0);
      if (ch > d) { const cx = side * (w / 2 - 1.6), cz = back + ch / 2; rb(g, 3.2, 1.0, ch, .12, m, cx, .25, cz); rb(g, 3.1, .5, ch - .1, .2, m, cx, 1.2, cz + .03); rb(g, .4, 1.9, ch, .16, m, side * (w / 2 - .2), .25, cz); }
      else rb(g, .4, 1.9, d, .16, m, side * (w / 2 - .2), .25, 0);
      const pil = [a, a2, mat('linen-white'), a, a2];
      for (let i = 0; i < 5; i++) { const x = -w / 2 + 1 + i * (w - 2) / 4 + (R() - .5) * .3; pillow(g, pil[i], x, 2.35, back + 1.15, 1.35, 1.2, (R() - .5) * .35, -.28); }
      const th = add(g, new THREE.BoxGeometry(1.6, .06, 2.2, 1, 1, 1), mat('fabric-second'), side * (w / 2 - 1.3), 1.72, .2, .25); th.rotation.z = .04;
      return g;
    } },
  'coffee-nest': { label: 'Nesting round coffee tables', cat: 'Living', d: { w: 4.6, d: 3.4, h: 1.3, finish: 'wood-dark', top: 'stone-dark' },
    build(it) {
      const g = G(), w = it.w, h = it.h, R = rng(it.id || 'cn');
      cy(g, 1.45, 1.35, .14, mat(it.top || 'stone-dark'), -w * .15, h - .14, -.1, 48); cy(g, .9, 1.0, h - .14, mat(it.finish), -w * .15, 0, -.1, 32);
      cy(g, 1.0, .95, .12, mat(it.finish), w * .22, h * .72 - .12, .45, 40); cy(g, .6, .7, h * .72 - .12, mat('stone-dark'), w * .22, 0, .45, 28);
      const yy = books(g, -w * .22, h, -.2, 2, .4); sculpture(g, -w * .22, yy, -.2, .5); vaseBranch(g, -w * .02, h, -.35, .45); cy(g, .3, .2, .1, mat('brass'), w * .22, h * .72, .45, 20);
      return g;
    } },
  'lounge-leather': { label: 'Leather lounge chair', cat: 'Living', d: { w: 2.9, d: 3, h: 2.7, finish: 'leather-cognac', accent: 'wood-dark' },
    build(it) {
      const g = G(), w = it.w, d = it.d, m = mat(it.finish), fr = mat(it.accent);
      for (const s of [-1, 1]) { rb(g, .16, 1.8, d - .2, .07, fr, s * (w / 2 - .08), 0, 0); }
      rb(g, w - .3, .45, d - .6, .18, m, 0, .9, .15); rb(g, w - .3, 1.5, .45, .2, m, 0, 1.2, -d / 2 + .45, 0, -.28);
      rb(g, w - .2, .1, d - .5, .04, fr, 0, .82, .1);
      return g;
    } },
  'table-dining-long': { label: 'Long dining table', cat: 'Dining', d: { w: 9, d: 3.6, h: 2.5, finish: 'wood-dark', base: 'stone-dark' },
    build(it) {
      const g = G(), w = it.w, d = it.d, h = it.h;
      rb(g, w, .16, d, .05, mat(it.finish), 0, h - .16, 0);
      for (const s of [-1, 1]) { rb(g, .9, h - .16, d * .55, .08, mat(it.base || 'stone-dark'), s * w * .3, 0, 0); }
      for (const x of [-w * .28, 0, w * .28]) { if (x === 0) vaseBranch(g, 0, h, 0, .7); else cy(g, .45, .35, .12, mat('brass'), x, h, 0, 24); }
      return g;
    } },
  'dining-chair-luxe': { label: 'Upholstered dining chair', cat: 'Dining', d: { w: 1.8, d: 1.9, h: 2.9, finish: 'fabric-second', accent: 'wood-dark' },
    build(it) {
      const g = G(), w = it.w, d = it.d, m = mat(it.finish), fr = mat(it.accent);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(g, .045, .035, 1.5, fr, sx * (w / 2 - .15), 0, sz * (d / 2 - .18), 8);
      rb(g, w, .35, d - .1, .12, m, 0, 1.45, .03);
      const b = add(g, new THREE.CylinderGeometry(w * .62, w * .62, 1.25, 28, 1, true, -Math.PI * .38, Math.PI * .76), m, 0, 2.35, .15); b.rotation.y = Math.PI; b.material.side = THREE.DoubleSide; b.scale.z = .55;
      return g;
    } },
  'pendant-linear': { label: 'Linear brass pendant', cat: 'Lighting', d: { w: 6, d: .6, h: .5, y: 6.8, finish: 'brass' }, nc: true,
    build(it, ctx) {
      const g = G(), w = it.w, top = Math.max(.2, ctx.H - it.y - it.h);
      for (const s of [-1, 1]) cy(g, .01, .01, top, mat('black-metal'), s * w * .4, it.h, 0, 4);
      rb(g, w, .18, .28, .05, mat(it.finish), 0, it.h - .18, 0); bx(g, w - .15, .03, .16, mat('led'), 0, it.h - .2, 0);
      for (let i = 0; i < 5; i++) { const x = -w * .4 + i * w * .2; cy(g, .015, .015, .3, mat(it.finish), x, it.h - .48, 0, 4); PX_(g, .13, mat('lamp-white'), x, it.h - .55, 0); }
      return g;
    } },
  'pendant-globes': { label: 'Globe pendant cluster', cat: 'Lighting', d: { w: 3, d: 3, h: 2.5, y: 6.3, finish: 'brass', count: 7 }, nc: true,
    build(it, ctx) {
      const g = G(), R = rng(it.id || 'pg'), n = it.count || 7, top = ctx.H - it.y;
      bx(g, it.w * .5, .05, .5, mat(it.finish), 0, top - .06, 0);
      for (let i = 0; i < n; i++) { const a = i / n * 6.283 + R(), r = it.w * .35 * Math.sqrt(R()), x = Math.cos(a) * r, z = Math.sin(a) * r, yy = R() * it.h; cy(g, .008, .008, top - yy - .25, mat('black-metal'), x, yy + .25, z, 3); PX_(g, .22 + R() * .08, mat('lamp-white'), x, yy, z); }
      return g;
    } },
  'island-waterfall': { label: 'Marble waterfall island', cat: 'Kitchen', d: { w: 8, d: 3.6, h: 3, finish: 'marble', accent: 'wood-dark' },
    build(it) {
      const g = G(), w = it.w, d = it.d, h = it.h, mb = mat(it.finish), ac = mat(it.accent), bd = d - 1.2;
      bx(g, w - .5, h - .5, bd, ac, 0, .35, -d / 2 + bd / 2); flutes(g, w - .6, h - .6, ac, -d / 2 + bd + .02, .4, .14);
      bx(g, w - .6, .3, bd - .3, mat('black-metal'), 0, 0, -d / 2 + bd / 2); bx(g, w - .7, .03, .04, mat('led-soft'), 0, .05, -d / 2 + bd + .05);
      bx(g, w, .2, d, mb, 0, h - .2, 0); for (const s of [-1, 1]) bx(g, .2, h - .2, d, mb, s * (w / 2 - .1), 0, 0);
      bx(g, 2.2, .02, 1.3, mat('stone-dark'), -w * .15, h + .005, -.35); rod(g, V(-w * .15, h, -.95), V(-w * .15, h + 1.1, -.95), .035, mat('brass')); rod(g, V(-w * .15, h + 1.1, -.95), V(-w * .15, h + 1.1, -.5), .03, mat('brass'));
      cy(g, .2, .14, .5, mat('glass'), w * .25, h, -.2, 16); leafyTwigs(g, w * .25, h + .1, -.2, .8);
      return g;
    } },
  'kitchen-tall-luxe': { label: 'Walnut tall kitchen wall', cat: 'Kitchen', d: { w: 8, d: 2.2, h: 9.5, finish: 'wood-dark', ovens: 2, niches: 1 },
    build(it, ctx) {
      const g = G(), w = it.w, d = it.d, H = Math.min(it.h, ctx.H - .1), m = mat(it.finish), back = -d / 2, R = rng(it.id || 'kt');
      const bays = Math.max(2, Math.round(w / 2.2)), bw = w / bays, ov = it.ovens ?? 2;
      for (let i = 0; i < bays; i++) {
        const x = -w / 2 + bw * (i + .5);
        if (i < (it.niches ?? 1)) { bx(g, bw, H, .1, m, x, 0, back + .05); for (const s of [-1, 1]) bx(g, .08, H, d, m, x + s * (bw / 2 - .04), 0, 0); bx(g, bw, .35, d, m, x, 0, 0); bx(g, bw, .5, d, m, x, H - .5, 0);
          for (const yy of [2.2, 3.9, 5.6, 7.3]) if (yy < H - .8) { bx(g, bw - .1, .08, d - .15, m, x, yy, 0); ledH(g, x, yy - .04, d / 2 - .2, bw - .3); decorShelf(g, x - bw / 2 + .1, x + bw / 2 - .1, yy + .08, -.1, R); }
          ledV(g, x - bw / 2 + .1, .4, d / 2 - .1, H - 1); continue; }
        bx(g, bw - .03, H, d, m, x, 0, 0); bx(g, .02, H - .2, .02, mat('#1c140f'), x + bw / 2 - .015, .1, d / 2 + .005);
        if (i >= bays - ov) { bx(g, bw - .5, 1.9, .06, mat('screen'), x, 3.2 + (i - (bays - ov)) * 0, d / 2 + .01); bx(g, bw - .6, .06, .05, mat('black-metal'), x, 4.9, d / 2 + .05); bx(g, bw - .5, .5, .06, mat('#15181b'), x, 2.55, d / 2 + .01); }
        bx(g, .03, .9, .05, mat('brass'), x + bw / 2 - .25, 1.8, d / 2 + .03);
      }
      return g;
    } },
  'kitchen-luxe': { label: 'Designer kitchen run', cat: 'Kitchen', d: { w: 10, d: 2.1, h: 3, finish: 'wood-dark', top: 'marble', accent: 'brass', shelves: true },
    extras: [['shelves', 'Open shelves (off = wall cabinets)', 'bool']],
    build(it, ctx) {
      const g = G(), w = it.w, d = it.d, h = it.h, body = mat(it.finish), top = mat(it.top || 'marble'), ac = mat(it.accent || 'brass'), back = -d / 2, R = rng(it.id || 'kl');
      bx(g, w - .1, .35, d - .35, mat('black-metal'), 0, 0, -.17); bx(g, w - .3, .03, .04, mat('led-soft'), 0, .05, d / 2 - .34);
      bx(g, w, h - .5, d - .08, body, 0, .35, -.04);
      for (let x = -w / 2 + 2; x < w / 2 - .5; x += 2) { bx(g, .02, h - .55, .02, mat('#1c140f'), x, .37, d / 2 - .07); }
      for (let x = -w / 2 + 1; x < w / 2 - .5; x += 2) bx(g, .9, .03, .04, ac, x, h - .32, d / 2 - .06);
      bx(g, w + .04, .16, d + .08, top, 0, h - .15, .02);
      const bh = Math.min(ctx.H, 10) - h - .9; bx(g, w, bh, .08, top, 0, h, back + .04);
      if (it.sink != null) { const sx = it.sink; bx(g, 2.2, .02, 1.3, mat('stone-dark'), sx, h + .012, .1); rod(g, V(sx, h, back + .35), V(sx, h + 1.2, back + .35), .04, ac); rod(g, V(sx, h + 1.2, back + .35), V(sx, h + 1.2, back + .85), .035, ac); }
      if (it.hobAt != null) bx(g, 2.6, .015, 1.7, mat('screen'), it.hobAt, h, .1);
      if (it.shelves !== false) {
        const L = -w / 2 + .3, Rr = w / 2 - .3, gap = it.hobAt != null ? [it.hobAt - 1.6, it.hobAt + 1.6] : null, segs = gap ? [[L, gap[0]], [gap[1], Rr]] : [[L, Rr]];
        for (const yy of [h + 1.9, h + 3.3]) for (const [a, b] of segs) if (b - a > .8) { bx(g, b - a, .12, .9, mat('wood-dark'), (a + b) / 2, yy, back + .5); ledH(g, (a + b) / 2, yy - .04, back + .85, b - a - .2); decorShelf(g, a, b, yy + .12, back + .5, R); }
        if (gap) { bx(g, 2.8, 2.6, 1.6, mat('stone-dark'), it.hobAt, h + 3.6, back + .8); }
      } else { bx(g, w, 2.6, 1.15, body, 0, h + 2.2, back + .6); ledH(g, 0, h + 2.17, back + 1.1, w - .3); }
      return g;
    } },
  'vanity-luxe': { label: 'Floating vanity with lit mirror', cat: 'Bath', d: { w: 4, d: 1.8, h: 8, finish: 'wood-dark', top: 'marble', wall: 'stone' },
    build(it, ctx) {
      const g = G(), w = it.w, d = it.d, back = -d / 2, ww = w + 1.2, H = Math.min(it.h, ctx.H);
      bx(g, ww, H, .1, mat(it.wall || 'stone'), 0, 0, back + .05);
      bx(g, w, 1.1, d - .15, mat(it.finish), 0, 1.0, back + .12 + (d - .15) / 2); bx(g, w - .3, .03, .05, mat('led'), 0, .96, back + d - .3);
      bx(g, w + .06, .35, d, mat(it.top || 'marble'), 0, 2.0, back + d / 2 + .05);
      bx(g, w * .55, .03, 1.0, mat('white-ceramic'), 0, 2.36, back + d * .55);
      rod(g, V(0, 3.3, back + .1), V(0, 3.3, back + .6), .03, mat('black-metal'));
      bx(g, w - .2, 3.2, .06, mat('mirror'), 0, 3.6, back + .14); ledH(g, 0, 3.55, back + .2, w - .4); bx(g, w, .05, .3, mat('led-soft'), 0, 6.85, back + .2);
      decorBath(g, w / 2 - .55, 2.35, back + .45);
      return g;
    } },
  'tub-freestanding': { label: 'Freestanding tub', cat: 'Bath', d: { w: 5.4, d: 2.6, h: 1.9, finish: 'white-ceramic' },
    build(it) {
      const g = G(), w = it.w, d = it.d, h = it.h, m = mat(it.finish);
      const t = add(g, new THREE.CylinderGeometry(1, .82, h, 48, 1), m, 0, h / 2, 0); t.scale.set(w / 2, 1, d / 2);
      const water = add(g, new THREE.CircleGeometry(1, 48), mat('glass'), 0, h - .25, 0); water.rotation.x = -Math.PI / 2; water.scale.set(w / 2 - .15, d / 2 - .15, 1);
      rod(g, V(w / 2 + .4, 0, 0), V(w / 2 + .4, h + 1.2, 0), .04, mat('black-metal')); rod(g, V(w / 2 + .4, h + 1.2, 0), V(w / 2 - .1, h + 1.2, 0), .035, mat('black-metal'));
      return g;
    } },
  'shower-luxe': { label: 'Stone walk-in shower', cat: 'Bath', d: { w: 4, d: 3.5, h: 8, finish: 'stone' },
    build(it, ctx) {
      const g = G(), w = it.w, d = it.d, H = Math.min(it.h, ctx.H), back = -d / 2, m = mat(it.finish);
      bx(g, w, H, .1, m, 0, 0, back + .05); bx(g, .1, H, d, m, -w / 2 + .05, 0, 0);
      bx(g, 1.6, .05, .5, mat('stone-dark'), -w / 2 + 1, 3.6, back + .3); ledH(g, -w / 2 + 1, 3.58, back + .5, 1.4);
      rod(g, V(w * .1, 0, back + .15), V(w * .1, 7, back + .15), .03, mat('black-metal')); rod(g, V(w * .1, 7, back + .15), V(w * .1, 7, back + .9), .025, mat('black-metal')); cy(g, .45, .45, .04, mat('black-metal'), w * .1, 6.9, back + .9, 24);
      bx(g, .03, H - .5, d - .6, mat('glass'), w / 2 - .02, 0, .3); bx(g, .06, .06, d - .6, mat('black-metal'), w / 2 - .02, H - .5, .3);
      bx(g, w - .2, .02, d - .2, mat('stone-dark'), 0, 0, 0);
      return g;
    } },
  'closet-lit': { label: 'Lit walk-in closet wall', cat: 'Bedroom', d: { w: 10, d: 2, h: 9.5, finish: 'wood-dark' },
    build(it, ctx) {
      const g = G(), w = it.w, d = it.d, H = Math.min(it.h, ctx.H - .1), m = mat(it.finish), back = -d / 2, R = rng(it.id || 'cl'), bays = Math.max(2, Math.round(w / 2.5)), bw = w / bays;
      bx(g, w, H, .08, mat('#2a1f18'), 0, 0, back + .04); bx(g, w, .4, d, m, 0, 0, 0); bx(g, w, .5, d, m, 0, H - .5, 0);
      for (let i = 0; i <= bays; i++) { const x = -w / 2 + bw * i; bx(g, .1, H, d, m, x, 0, 0); if (i > 0 && i < bays) ledV(g, x, .5, d / 2 - .05, H - 1.1); }
      ledV(g, -w / 2 + .1, .5, d / 2 - .05, H - 1.1); ledV(g, w / 2 - .1, .5, d / 2 - .05, H - 1.1);
      for (let i = 0; i < bays; i++) {
        const x0 = -w / 2 + bw * i + .08, x1 = x0 + bw - .16, cx = (x0 + x1) / 2, kind = i % 3;
        if (kind === 0) { hangingClothes(g, x0, x1, H - .9, 0, R); bx(g, bw - .16, .08, d - .1, m, cx, H - .8, 0); ledH(g, cx, H - .84, d / 2 - .2, bw - .3); }
        else if (kind === 1) { for (const yy of [1.2, 2.9, 4.6, 6.3]) { bx(g, bw - .16, .08, d - .1, m, cx, yy, 0); ledH(g, cx, yy - .04, d / 2 - .15, bw - .3); foldedStack(g, cx - .45, yy + .08, -.1, R); if (R() < .6) rb(g, .8, .7, .5, .1, mat(R() < .5 ? 'leather-cognac' : '#2d2a28'), cx + .45, yy + .08, -.1); } hangingClothes(g, x0, x1, H - .9, 0, R); }
        else { hangingClothes(g, x0, x1, H - .9, 0, R); hangingClothes(g, x0, x1, 4.4, 0, R); }
        bx(g, bw - .2, H - 1, .03, mat('glass-bronze'), cx, .45, d / 2 - .02);
      }
      return g;
    } },
  'closet-island': { label: 'Closet island', cat: 'Bedroom', d: { w: 4.5, d: 2.4, h: 3.2, finish: 'wood-dark', top: 'glass-bronze' },
    build(it) {
      const g = G(), w = it.w, d = it.d, h = it.h, m = mat(it.finish);
      bx(g, w, h - .1, d, m, 0, 0, 0); for (let y = .7; y < h - .2; y += .7) for (const s of [-1, 1]) bx(g, w - .2, .015, .01, mat('#1c140f'), 0, y, s * (d / 2 + .005));
      bx(g, w + .04, .1, d + .04, mat(it.top || 'glass-bronze'), 0, h - .1, 0); ledH(g, 0, h - .12, d / 2 - .05, w - .2);
      cy(g, .3, .25, .1, mat('brass'), -w * .25, h, 0, 20); vaseBranch(g, w * .25, h, 0, .5);
      return g;
    } },
  'pouf-round': { label: 'Round pouf', cat: 'Living', d: { w: 1.8, d: 1.8, h: 1.4, finish: 'velvet-ink' },
    build(it) { const g = G(); const p = add(g, new THREE.CylinderGeometry(it.w / 2, it.w / 2 * .92, it.h, 32), mat(it.finish), 0, it.h / 2, 0); p.castShadow = true; return g; } },
  'media-wall': { label: 'Walnut media wall with lit shelving', cat: 'Living', d: { w: 12, d: 1.5, h: 9.5, finish: 'wood-dark', stone: 'stone' },
    build(it, ctx) {
      const g = G(), w = it.w, d = it.d, H = Math.min(it.h, ctx.H - .05), m = mat(it.finish), back = -d / 2, R = rng(it.id || 'mw'), sw = Math.min(3, w * .22), cw = w - 2 * sw;
      bx(g, cw, H, .12, mat(it.stone || 'stone'), 0, 0, back + .06);
      bx(g, cw, .7, d, m, 0, .6, 0); ledH(g, 0, .55, d / 2 - .1, cw - .3); bx(g, cw - .4, .015, .01, mat('#1c140f'), 0, .95, d / 2 + .005);
      bx(g, 5.4, 3.05, .1, mat('black-metal'), 0, 3.4, back + .2); bx(g, 5.3, 2.95, .012, mat('screen'), 0, 3.45, back + .26);
      for (const s of [-1, 1]) {
        const x = s * (cw / 2 + sw / 2); bx(g, sw, H, .1, m, x, 0, back + .05); bx(g, .1, H, d, m, x - sw / 2 + .05, 0, 0); bx(g, .1, H, d, m, x + sw / 2 - .05, 0, 0); bx(g, sw, .6, d, m, x, 0, 0); bx(g, sw, .3, d, m, x, H - .3, 0);
        for (const yy of [2.2, 3.9, 5.6, 7.3]) if (yy < H - .6) { bx(g, sw - .1, .07, d - .1, m, x, yy, 0); ledH(g, x, yy - .04, d / 2 - .15, sw - .3); decorShelf(g, x - sw / 2 + .1, x + sw / 2 - .1, yy + .07, -.05, R); }
        ledV(g, s * cw / 2, .6, back + .2, H - .9);
      }
      return g;
    } },
});
Object.assign(NOTES, {
  'wall-panel-wood': 'full-height walnut wall panelling with vertical LED reveal lines (leds: count); back to wall; w = the wall run; use behind beds, sofas, dining and in passages',
  'feature-stone': 'full-height stone feature panel framed by walnut with LED edge lines; back to wall; behind dining, consoles, in foyers',
  'sectional': 'deep cream sectional sofa with loose back cushions and throw pillows; chaise = return length in ft (0 for straight), side = left/right; back to wall or floating facing the TV',
  'coffee-nest': 'two nesting round coffee tables (stone and walnut) styled with books and objects; in front of sofas',
  'lounge-leather': 'cognac leather lounge chair with walnut frame; beside sofas, reading corners, balconies',
  'table-dining-long': 'long walnut dining table on stone pedestals, styled; 8 to 10 ft for 8 seats',
  'dining-chair-luxe': 'upholstered dining chair with a curved back; front faces the table',
  'pendant-linear': 'linear brass pendant; over dining tables and kitchen islands, rot along the table; y ≈ 6.8',
  'pendant-globes': 'cluster of glowing glass globe pendants; over dining tables, stairwells, foyers; y ≈ 6.3',
  'island-waterfall': 'marble waterfall kitchen island with fluted walnut base, sink and tap; front faces the seating side (put bar stools in front)',
  'kitchen-tall-luxe': 'full-height walnut tall-unit wall with built-in ovens and a lit open shelving niche; back to wall',
  'kitchen-luxe': 'premium counter run: handleless fronts with brass pulls, thick stone top, full-height stone backsplash, lit floating shelves styled with ceramics (shelves:false for wall cabinets); back to wall; sink and hobAt are x offsets from centre',
  'vanity-luxe': 'floating vanity with integrated basin, backlit mirror, cove LED and a full-height stone wall behind (wall token); back to wall; use in every bathroom, no separate mirror',
  'tub-freestanding': 'freestanding tub with black floor filler; large master baths; keep 1.5 ft around',
  'shower-luxe': 'stone-walled walk-in shower with a lit niche, rain shower and glass screen; put in the bathroom corner, back and left side against walls',
  'closet-lit': 'walk-in closet wall: walnut bays with bronze glass doors, LED verticals, hanging clothes, lit shelves; back to wall; fill every wall of a walk-in closet or dressing room',
  'closet-island': 'closet island with drawers and a glass top; centre of a walk-in closet (needs 3 ft all round)',
  'pouf-round': 'round velvet pouf; closets, bedrooms, lounges',
  'media-wall': 'walnut media wall: stone TV panel, floating lit console, lit display shelving bays either side; back to wall; living rooms and lounges',
});
