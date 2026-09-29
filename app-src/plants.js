/* ---------- real-looking plants: branching trunks, thousands of textured leaf cards, ribbed planters ---------- */
const LEAFK = {
  ficus: { w: .42, tip: .9, base: ['#2f4a26', '#3d5a2c', '#4a6a33'], rough: .42, veins: 5 },
  olive: { w: .2, tip: .95, base: ['#7c8a66', '#6b7a58', '#8e9a78'], rough: .7, veins: 0 },
  fiddle: { w: .7, tip: .55, base: ['#2e4a22', '#3b5a2a', '#46682f'], rough: .38, veins: 7, fiddle: true },
  palm: { w: .1, tip: .98, base: ['#3f5f2e', '#4d6d36', '#35522a'], rough: .5, veins: 0 },
  shrub: { w: .45, tip: .8, base: ['#3a5a2c', '#4b6b33', '#2f4a24'], rough: .55, veins: 3 },
};
function leafTex(kind) {
  return TX['leaf-' + kind] ||= (() => {
    const K = LEAFK[kind], c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    const shape = () => { g.beginPath(); g.moveTo(64, 250);
      const half = y => { const t = (250 - y) / 244; let w = Math.sin(Math.PI * Math.pow(t, K.tip)) * 60 * K.w / .5; if (K.fiddle) w *= .75 + .35 * Math.sin(Math.PI * Math.min(1, t * 1.25)); return Math.min(62, w); };
      for (let y = 250; y >= 6; y -= 4) g.lineTo(64 + half(y), y); g.lineTo(64, 4); for (let y = 6; y <= 250; y += 4) g.lineTo(64 - half(y), y); g.closePath(); };
    shape(); const gr = g.createLinearGradient(0, 256, 0, 0); gr.addColorStop(0, '#b9c79a'); gr.addColorStop(.35, '#ffffff'); gr.addColorStop(1, '#d7e0c2'); g.fillStyle = gr; g.fill();
    g.save(); shape(); g.clip();
    g.strokeStyle = 'rgba(255,255,230,.55)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(64, 250); g.lineTo(64, 8); g.stroke();
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,230,.3)';
    for (let i = 1; i <= K.veins; i++) { const y = 250 - i * 230 / (K.veins + 1); for (const s of [-1, 1]) { g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + s * 30, y - 14, 64 + s * 58, y - 38); g.stroke(); } }
    g.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 300; i++) g.fillRect(Math.random() * 128, Math.random() * 256, 1, 1);
    g.lineWidth = 4; g.strokeStyle = 'rgba(40,50,20,.35)'; shape(); g.stroke(); g.restore();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  })();
}
function leafMat(kind) { const k = 'leafm-' + kind; return MC[k] ||= new THREE.MeshStandardMaterial({ map: leafTex(kind), alphaTest: .5, side: THREE.DoubleSide, roughness: LEAFK[kind].rough, metalness: 0, envMapIntensity: .7 }); }
const LEAFGEO = (() => { const g = new THREE.PlaneGeometry(1, 1, 2, 5); g.translate(0, .5, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, .22 * y * y + Math.abs(x) * .18); } g.computeVertexNormals(); return g; })();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _s = new THREE.Vector3(), _c = new THREE.Color();
// list: [{p, d (unit dir the leaf points), L, W}]
function leafCloud(g, kind, list, R) {
  if (!list.length) return null; const K = LEAFK[kind], im = new THREE.InstancedMesh(LEAFGEO, leafMat(kind), list.length);
  list.forEach((l, i) => {
    _q.setFromUnitVectors(_up, l.d); _q2.setFromAxisAngle(l.d, R() * Math.PI * 2); _q.premultiply(_q2);
    _m4.compose(l.p, _q, _s.set(l.W, l.L, l.L)); im.setMatrixAt(i, _m4);
    _c.set(K.base[(R() * K.base.length) | 0]).offsetHSL((R() - .5) * .03, (R() - .5) * .08, (R() - .5) * .08); im.setColorAt(i, _c);
  });
  im.castShadow = false; im.receiveShadow = true; im.userData.keep = true; g.add(im); return im;
}
function taper(g, a, b, r0, r1, m) { const dir = new THREE.Vector3().subVectors(b, a), L = dir.length(); if (L < 1e-3) return; const me = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, L, 7), m); me.position.copy(a).addScaledVector(dir, .5); me.quaternion.setFromUnitVectors(_up, dir.normalize()); me.castShadow = true; g.add(me); }
const jitter = (d, R, a) => { const v = d.clone().add(new THREE.Vector3((R() - .5) * a, (R() - .5) * a * .6, (R() - .5) * a)); return v.normalize(); };
function grow(g, R, a, d, len, rad, depth, tips, bark, spread = 1.1, lift = .25) {
  const b = a.clone().addScaledVector(d, len); taper(g, a, b, rad, rad * .72, bark);
  tips.push({ a, b, d, depth });
  if (depth <= 0) return;
  const n = 2 + (R() < .45 ? 1 : 0);
  for (let i = 0; i < n; i++) { const nd = jitter(d, R, spread); nd.y += lift; nd.normalize(); grow(g, R, b, nd, len * (.66 + R() * .14), rad * .66, depth - 1, tips, bark, spread, lift); }
}
function ribbedPot(g, rTop, rBot, h, m, ribs = 26, x = 0, z = 0) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, ribs * 3, 6, false), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const px = p.getX(i), pz = p.getZ(i), th = Math.atan2(pz, px), k = 1 + .035 * Math.cos(th * ribs), yy = p.getY(i) / h + .5, belly = 1 + .12 * Math.sin(Math.PI * yy) * (1 - yy * .4); p.setX(i, px * k * belly); p.setZ(i, pz * k * belly); }
  geo.computeVertexNormals(); const me = add(g, geo, m, x, h / 2, z); me.castShadow = true;
  cy(g, rTop * .96, rTop * .96, .03, mat('soil'), x, h - .08, z, 24); return me;
}
const potMat = f => mat(f === 'terracotta' ? 'terracotta' : f === 'concrete' ? 'concrete' : f || 'stone-dark');
// leafy tree (ficus by default, olive with kind:'olive') in a large planter
function leafyTree(g, R, h, w, kind, potF) {
  const ph = Math.min(2.2, h * .24), pr = Math.max(.7, w * .34); ribbedPot(g, pr, pr * .78, ph, potMat(potF));
  const bark = mat('bark'), segs = [], trunkTop = V((R() - .5) * .3, ph + (h - ph) * .3, (R() - .5) * .3);
  taper(g, V(0, ph - .1, 0), trunkTop, .15, .1, bark);
  const crown = h - trunkTop.y - .3, n = 4;
  for (let i = 0; i < n; i++) { const a = i / n * 6.283 + R() * .8, d = V(Math.cos(a) * .8, 1, Math.sin(a) * .8).normalize(); grow(g, R, trunkTop, d, crown * .28, .085, 3, segs, bark, 1.25, .12); }
  const fine = segs.filter(t => t.depth <= 1), L = [], sz = kind === 'olive' ? [.36, .09] : [.4, .19], N = kind === 'olive' ? 2600 : 2000;
  const cy0 = trunkTop.y + crown * .55, rx = Math.max(w * .6, 1.6), ry = crown * .5;
  for (let k = 0; k < N; k++) {
    const t = fine[(R() * fine.length) | 0], p = t.a.clone().lerp(t.b, R() * 1.1).add(V((R() - .5) * .9, (R() - .5) * .7, (R() - .5) * .9));
    const e = V(p.x / rx, (p.y - cy0) / ry, p.z / rx); if (e.length() > 1.15) p.sub(V(p.x, p.y - cy0, p.z).multiplyScalar(.2));
    const out = V(p.x, (p.y - cy0) * .6, p.z).normalize(); const d = out.multiplyScalar(.6).add(V((R() - .5) * 1.1, -.25 + R() * .55, (R() - .5) * 1.1)).normalize(); const s2 = .75 + R() * .55;
    L.push({ p, d, L: sz[0] * s2, W: sz[1] * s2 });
  }
  leafCloud(g, kind === 'olive' ? 'olive' : 'ficus', L, R);
}
function fiddleFig(g, R, h, w, potF) {
  const ph = Math.min(1.6, h * .3), pr = Math.max(.5, w * .38); ribbedPot(g, pr, pr * .8, ph, potF ? potMat(potF) : mat('white-ceramic'));
  const L = [], stems = h > 3.5 ? 3 : 2;
  for (let s = 0; s < stems; s++) {
    let p = V((R() - .5) * .3, ph - .05, (R() - .5) * .3), d = V((R() - .5) * .35, 1, (R() - .5) * .35).normalize(); const sh = (h - ph) * (.7 + R() * .3) * (s ? .85 : 1), segs = 8;
    for (let k = 0; k < segs; k++) { const q = p.clone().addScaledVector(d, sh / segs); taper(g, p, q, .045, .035, mat('bark')); p = q; d = jitter(d, R, .15);
      if (k >= 3) for (let j = 0; j < 2; j++) { const a = R() * 6.283, ld = V(Math.cos(a), .55 + R() * .6, Math.sin(a)).normalize(), sc = .75 + (k / segs) * .35 + R() * .2; L.push({ p: p.clone(), d: ld, L: .95 * sc, W: .62 * sc }); } }
    for (let j = 0; j < 3; j++) L.push({ p: p.clone(), d: jitter(V(0, 1, 0), R, .9), L: .8, W: .55 });
  }
  leafCloud(g, 'fiddle', L, R);
}
function palmPot(g, R, h, w, potF) {
  const ph = Math.min(1.4, h * .3), pr = Math.max(.45, w * .36); ribbedPot(g, pr, pr * .82, ph, potMat(potF));
  const L = [];
  for (let f = 0; f < 11; f++) { const a = f / 11 * 6.283 + R() * .4, tilt = .25 + R() * .6, len = (h - ph) * (.8 + R() * .35), base = V(0, ph, 0), dir = V(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    const tip = base.clone().addScaledVector(dir, len); tip.y -= len * .18; taper(g, base, tip, .02, .01, mat('leaf-dark'));
    for (let k = 3; k < 16; k++) { const t = k / 16, p = base.clone().lerp(tip, t); p.y += Math.sin(Math.PI * t) * len * .15; for (const s of [-1, 1]) { const side = V(-dir.z, 0, dir.x).multiplyScalar(s); const d = side.clone().multiplyScalar(.8).add(V(0, -.3 - t * .4, 0)).add(dir.clone().multiplyScalar(.4)).normalize(); L.push({ p, d, L: .55 * (1 - t * .5), W: .09 }); } } }
  leafCloud(g, 'palm', L, R);
}
function shrubBall(L, R, c, r, n, size = .22) { for (let i = 0; i < n; i++) { const u = R() * 2 - 1, a = R() * 6.283, s = Math.sqrt(1 - u * u), nrm = V(Math.cos(a) * s, Math.abs(u) * .8 + .2, Math.sin(a) * s).normalize(), p = c.clone().addScaledVector(nrm, r * (.75 + R() * .3)); const d = nrm.clone().add(V((R() - .5) * .8, .2, (R() - .5) * .8)).normalize(); const k = .8 + R() * .5; L.push({ p, d, L: size * k, W: size * .55 * k }); } }
// leafy twigs for vases (replaces blob branches)
function leafyTwigs(g, x, y, z, s, R = rng('tw' + x + z)) {
  const L = [];
  for (let i = 0; i < 5; i++) { const a = i * 1.26 + R() * .4, top = V(x + Math.cos(a) * .4 * s, y + (1.3 + (i % 3) * .3) * s, z + Math.sin(a) * .4 * s); rod(g, V(x, y + .4 * s, z), top, .012 * s, mat('bark'));
    for (let k = 0; k < 9; k++) { const p = V(x, y + .4 * s, z).lerp(top, .45 + R() * .6); const d = V(Math.cos(a) + (R() - .5), .3 + R() * .5, Math.sin(a) + (R() - .5)).normalize(); L.push({ p, d, L: .22 * s, W: .08 * s }); } }
  leafCloud(g, 'olive', L, R);
}

Object.assign(CAT, {
  'plant-tree': { label: 'Indoor tree', cat: 'Plants', d: { w: 2.4, d: 2.4, h: 7.5, finish: 'stone-dark', kind: 'ficus' }, extras: [['kind', 'Tree (ficus / olive)', 'text']],
    build(it) { const g = G(), R = rng(it.id || 't' + it.x); leafyTree(g, R, it.h, it.w, it.kind === 'olive' || /olive/i.test(it.name || '') ? 'olive' : 'ficus', it.finish); g.userData.colliders = [{ x: 0, z: 0, hx: it.w * .38, hz: it.w * .38, ang: 0, y0: 0, y1: it.h }]; return g; } },
  'plant-pot': { label: 'Potted plant', cat: 'Plants', d: { w: 1.6, d: 1.6, h: 4.2, finish: 'white-ceramic', kind: 'fiddle' }, extras: [['kind', 'Plant (fiddle / palm)', 'text']],
    build(it) {
      const g = G(), R = rng(it.id || 'p' + it.x), w = it.w, h = it.h;
      if (it.flowers) { const ph = h * .38; ribbedPot(g, w * .42, w * .34, ph, potMat(it.finish)); const L = []; shrubBall(L, R, V(0, ph + (h - ph) * .35, 0), w * .45, 220, .16); leafCloud(g, 'shrub', L, R); const F = []; for (let i = 0; i < 40; i++) { const a = R() * 7, rr = R() * w * .45; F.push([Math.cos(a) * rr, ph + (h - ph) * (.45 + R() * .45), Math.sin(a) * rr, .7 + R() * .7]); } inst(g, new THREE.IcosahedronGeometry(.08, 0), mat(it.flowers), F); }
      else if (it.kind === 'palm') palmPot(g, R, h, w, it.finish);
      else if (h < 2.6) { const ph = h * .45; ribbedPot(g, w * .42, w * .34, ph, potMat(it.finish)); const L = []; shrubBall(L, R, V(0, ph + (h - ph) * .3, 0), w * .42, 160, .2); leafCloud(g, 'shrub', L, R); }
      else fiddleFig(g, R, h, w, it.finish);
      g.userData.colliders = [{ x: 0, z: 0, hx: w * .42, hz: w * .42, ang: 0, y0: 0, y1: h }]; return g;
    } },
  'planter-flowers': { label: 'Planter', cat: 'Plants', d: { w: 5, d: 1.4, h: 1.8, finish: 'stone-dark' },
    build(it) {
      const g = G(), R = rng(it.id || 'f' + it.x), w = it.w, d = it.d, h = it.h; rb(g, w, h, d, .06, mat(it.finish)); bx(g, w - .14, .02, d - .14, mat('soil'), 0, h - .08, 0);
      const L = []; const n = Math.max(2, Math.round(w / 1.1)); for (let i = 0; i < n; i++) shrubBall(L, R, V(-w / 2 + (i + .5) * w / n + (R() - .5) * .3, h + .35 + R() * .25, (R() - .5) * (d - .6)), .55 + R() * .25, 150, .2);
      leafCloud(g, 'shrub', L, R);
      if (it.flowers !== false) { const cols = Array.isArray(it.flowers) ? it.flowers : it.flowers ? [it.flowers] : ['#f1eee6', '#e9d9c4']; cols.forEach(c => { const F = []; for (let i = 0; i < Math.round(w * 14 / cols.length); i++) F.push([(R() - .5) * (w - .3), h + .5 + R() * .6, (R() - .5) * (d - .3), .6 + R() * .8]); inst(g, new THREE.IcosahedronGeometry(.08, 0), mat(c), F); }); }
      return g;
    } },
  'floor-vase': { label: 'Floor vase with branches', cat: 'Decor', d: { w: 1.2, d: 1.2, h: 4.5, finish: 'terracotta' },
    build(it) { const g = G(), R = rng(it.id || 'fv' + it.x); ribbedPot(g, .3, .36, 1.6, mat(it.finish), 18); leafyTwigs(g, 0, 1.2, 0, 1.9, R); return g; } },
});
Object.assign(NOTES, {
  'plant-tree': 'large leafy indoor tree in a stone planter (kind: ficus or olive); corners of living rooms, beside glass, on balconies; 7–8.5 ft tall',
  'plant-pot': 'potted plant (kind: fiddle for a fiddle-leaf fig, palm for a kentia palm; h under 2.6 gives a round shrub); beside sofas, consoles, beds, in bathrooms',
  'planter-flowers': 'long stone planter with dense shrubs (flowers: colour or false); balcony edges and terraces',
});
