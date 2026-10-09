/* ================= custom pieces and richer materials =================
   A "custom" piece is any piece Claude can describe as parts: cushions, rounded boxes, cylinders, turned (lathe) forms,
   bent tubes, cut-out shapes and arches, each with a material. It is how a piece seen in a client's photo gets built when
   the catalog has nothing close. Units are feet. In a piece's own frame x runs left to right, y up from the floor, and its
   front faces +z (its back is at -z), the same as every catalog piece. */

/* ---------- materials Pinterest rooms rely on ---------- */
const boucleTex = hex => ctex('bou-' + hex, 256, (g, s, R) => {
  g.fillStyle = hex; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) { const x = R() * s, y = R() * s, r = 1.2 + R() * 2.6; g.lineWidth = .8 + R() * 1.1; g.strokeStyle = `rgba(${R() < .55 ? '255,255,255' : '0,0,0'},${.08 + R() * .16})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); }
  speckle(g, s, R, 1500, .08);
}, 4);
const linenTex = hex => ctex('lin-' + hex, 256, (g, s, R) => {
  g.fillStyle = hex; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 2) { g.fillStyle = `rgba(0,0,0,${.02 + R() * .05})`; g.fillRect(0, y, s, 1); }
  for (let x = 0; x < s; x += 2) { g.fillStyle = `rgba(255,255,255,${.02 + R() * .05})`; g.fillRect(x, 0, 1, s); }
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${R() < .5 ? '255,255,255' : '60,50,40'},${.05 + R() * .07})`; g.fillRect(0, R() * s, s, 1 + R() * 1.5); }   // slubs
}, 3);
const leatherTex = () => ctex('leather', 256, (g, s, R) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(0,0,0,${R() * .07})`; g.beginPath(); g.arc(R() * s, R() * s, .6 + R() * 2.2, 0, 7); g.fill(); }
  for (let i = 0; i < 40; i++) { const x = R() * s, y = R() * s, r = 20 + R() * 60, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${R() < .5 ? '255,255,255' : '0,0,0'},.06)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
}, 2);
// rattan: tight basket weave of round strands
const rattanTex = hex => ctex('rat-' + hex, 256, (g, s, R) => {
  g.fillStyle = shade(hex, .55); g.fillRect(0, 0, s, s); const n = 16, c = s / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const vert = (i + j) % 2 === 0, x = i * c, y = j * c, gr = vert ? g.createLinearGradient(x, 0, x + c, 0) : g.createLinearGradient(0, y, 0, y + c);
    gr.addColorStop(0, shade(hex, .7)); gr.addColorStop(.5, shade(hex, 1.12)); gr.addColorStop(1, shade(hex, .72)); g.fillStyle = gr;
    for (let k = 0; k < 3; k++) vert ? g.fillRect(x + k * c / 3 + .5, y + .5, c / 3 - 1, c - 1) : g.fillRect(x + .5, y + k * c / 3 + .5, c - 1, c / 3 - 1);
  }
}, 3);
// cane webbing: the open octagonal weave; the holes are cut out with an alpha map
const caneTex = hex => ctex('cane-' + hex, 256, (g, s) => {
  g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, s, s); const n = 8, c = s / n; g.lineCap = 'round';
  const strand = (x0, y0, x1, y1, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  for (let i = -n; i <= 2 * n; i++) { strand(i * c, 0, i * c + s, s, 5, shade(hex, .9)); strand(i * c, s, i * c + s, 0, 5, shade(hex, .9)); }
  for (let i = 0; i <= n; i++) { strand(i * c + c / 2, 0, i * c + c / 2, s, 4.5, hex); strand(0, i * c + c / 2, s, i * c + c / 2, 4.5, shade(hex, 1.05)); }
}, 4);
const juteTex = hex => ctex('jute-' + hex, 256, (g, s, R) => {
  g.fillStyle = shade(hex, .7); g.fillRect(0, 0, s, s); const rows = 16, h = s / rows;
  for (let r = 0; r < rows; r++) for (let x = 0; x < s; x += h * .7) { g.fillStyle = shade(hex, .9 + R() * .25); g.beginPath(); g.ellipse(x + (r % 2) * h * .35, r * h + h / 2, h * .42, h * .3, (r % 2 ? 1 : -1) * .7, 0, 7); g.fill(); }
  speckle(g, s, R, 2500, .1);
}, 2);
const flutedTex = () => ctex('fluted', 128, (g, s) => { for (let x = 0; x < s; x++) { const v = Math.round(200 + 55 * Math.cos((x / s) * Math.PI * 2 * 8)); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, s); } }, 1);
function matExtra(kind, a, b) {
  const col = new THREE.Color(a), light = col.clone().lerp(new THREE.Color('#ffffff'), .4), V2 = v => new THREE.Vector2(v, v);
  switch (kind) {
    case 'boucle': { const t = boucleTex(a); return phys({ map: t, normalMap: nmap('bou-' + a, 2.5), normalScale: V2(.55), roughness: 1, sheen: .7, sheenRoughness: .9, sheenColor: light }); }
    case 'linen': { const t = linenTex(a); return phys({ map: t, normalMap: nmap('lin-' + a, 2), normalScale: V2(.5), roughness: .95, sheen: .6, sheenRoughness: .8, sheenColor: light }); }
    case 'leather': leatherTex(); return phys({ color: a, map: TX.leather, normalMap: nmap('leather', 1.5), normalScale: V2(.3), roughness: b === 'matte' ? .7 : .45, clearcoat: .3, clearcoatRoughness: .45 });
    case 'metal': return std({ color: a, roughness: b === 'brushed' ? .34 : b === 'matte' ? .55 : .18, metalness: 1, envMapIntensity: 1 });
    case 'lacquer': return phys({ color: a, roughness: .2, clearcoat: 1, clearcoatRoughness: .08 });
    case 'matte': case 'paint': return std({ color: a, roughness: .88 });
    case 'ceramic': return phys({ color: a, roughness: b === 'matte' ? .75 : .22, clearcoat: b === 'matte' ? 0 : .7, clearcoatRoughness: .15 });
    case 'stoneware': return std({ color: a, map: fabricTex('#ffffff'), roughness: .85 });
    case 'rattan': { const t = rattanTex(a); return std({ map: t, normalMap: nmap('rat-' + a, 3), normalScale: V2(.8), roughness: .75 }); }
    case 'cane': { const t = caneTex(a); return std({ map: t, alphaTest: .5, transparent: false, side: THREE.DoubleSide, roughness: .7 }); }
    case 'jute': { const t = juteTex(a); return std({ map: t, normalMap: nmap('jute-' + a, 4), normalScale: V2(.9), roughness: 1 }); }
    case 'fluted': { const t = flutedTex(); t.repeat.set(+b || 6, 1); const m = std({ color: a, map: t, normalMap: nmap('fluted', 6), normalScale: V2(1.2), roughness: .6 }); return m; }
    case 'glass': return std({ color: a, transparent: true, opacity: b ? clamp(+b, .05, .95) : .3, roughness: .05, metalness: .2, envMapIntensity: 1.3, depthWrite: false, side: THREE.DoubleSide });
    case 'glow': { const m = emis(a, a, b ? clamp(+b * .55, .1, 2) : .55); m.color.set(a); return m; }   // a lit shade: glowing, but still shaded so its form reads
  }
  return null;
}

/* ---------- parts ---------- */
const cpn = (v, d, lo = -60, hi = 60) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const cpv3 = (a, d = [0, 0, 0]) => Array.isArray(a) ? [0, 1, 2].map(i => cpn(a[i], d[i])) : d.slice();
const cpPts = (a, n, max = 160) => (Array.isArray(a) ? a : []).slice(0, max).filter(p => Array.isArray(p) && p.length >= n).map(p => p.slice(0, n).map(v => cpn(v, 0)));
const CP_MAX = 160;
// a soft box: a sphere pushed out toward a box (superellipsoid), so edges are rounded and faces bulge like a filled cushion
function cushionGeo(w, h, d, e) {
  const geo = new THREE.SphereGeometry(1, 40, 24), p = geo.attributes.position, f = v => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, f(p.getX(i)) * w / 2, f(p.getY(i)) * h / 2, f(p.getZ(i)) * d / 2);
  geo.computeVertexNormals(); return geo;
}
function archShape(w, h) { const s = new THREE.Shape(), r = Math.min(w / 2, h); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-w / 2, 0); return s; }
// one part → a mesh added to g. Positions: box, cyl, cushion, shape, arch stand on at[1]; sphere and torus are centred on at.
function cpAdd(g, p, matFor) {
  const at = cpv3(p.at), rot = cpv3(p.rot).map(v => v * D2R), m = matFor(p.m); let geo;
  switch (p.s) {
    case 'box': { const w = cpn(p.w, 1, .005, 40), h = cpn(p.h, 1, .005, 40), d = cpn(p.d, 1, .005, 40), r = cpn(p.r, 0, 0, 5);
      geo = r > .004 ? new RoundedBoxGeometry(w, h, d, r > .08 ? 4 : 2, Math.min(r, w / 2, h / 2, d / 2) - .002) : new THREE.BoxGeometry(w, h, d); geo.translate(0, h / 2, 0); break; }
    case 'cushion': { const w = cpn(p.w, 1, .02, 40), h = cpn(p.h, .5, .02, 40), d = cpn(p.d, 1, .02, 40); geo = cushionGeo(w, h, d, cpn(p.round, .3, .08, 1)); geo.translate(0, h / 2, 0); break; }
    case 'cyl': { const r = cpn(p.r, .5, .003, 30), r2 = cpn(p.r2, r, 0, 30), h = cpn(p.h, 1, .005, 40), seg = Math.round(cpn(p.seg, Math.max(12, Math.min(64, Math.max(r, r2) * 48)), 3, 96));
      geo = new THREE.CylinderGeometry(r2, r, h, seg); geo.translate(0, h / 2, 0); break; }
    case 'sphere': { const r = cpn(p.r, .5, .003, 30); geo = p.half ? new THREE.SphereGeometry(r, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(r, 40, 24);
      const sc = cpv3(p.scale, [1, 1, 1]).map(v => Math.max(.02, v)); geo.scale(sc[0], sc[1], sc[2]); if (p.half) geo = geo.toNonIndexed(); break; }
    case 'torus': { geo = new THREE.TorusGeometry(cpn(p.R, .5, .01, 30), cpn(p.r, .05, .003, 10), 14, 56, cpn(p.arc, 360, 1, 360) * D2R); break; }
    case 'lathe': { let pts = cpPts(p.pts, 2).map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)); if (pts.length < 2) return;
      // a smooth turned outline through the given points, unless "sharp" asks for straight segments
      if (!p.sharp && pts.length > 2) { const c = new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(q.x, q.y, 0)), false, 'centripetal'); pts = c.getPoints(Math.min(96, pts.length * 10)).map(q => new THREE.Vector2(Math.max(0, q.x), q.y)); }
      geo = new THREE.LatheGeometry(pts, 56); break; }
    case 'tube': { const pts = cpPts(p.pts, 3).map(q => new THREE.Vector3(...q)); if (pts.length < 2) return; const curve = pts.length === 2 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts, !!p.closed, 'centripetal');
      geo = new THREE.TubeGeometry(curve, Math.min(200, Math.max(8, Math.round(curve.getLength() * 14))), cpn(p.r, .04, .003, 5), 12, !!p.closed); break; }
    case 'shape': case 'arch': {
      let shape;
      if (p.s === 'arch') shape = archShape(cpn(p.w, 2, .05, 40), cpn(p.h, 3, .05, 40));
      else { const pts = cpPts(p.pts, 2); if (pts.length < 3) return; shape = new THREE.Shape(pts.map(q => new THREE.Vector2(q[0], q[1]))); for (const hole of Array.isArray(p.holes) ? p.holes.slice(0, 20) : []) { const hp = cpPts(hole, 2); if (hp.length >= 3) shape.holes.push(new THREE.Path(hp.map(q => new THREE.Vector2(q[0], q[1])))); } }
      const depth = cpn(p.depth ?? p.d, .1, .003, 20), bev = cpn(p.bevel, 0, 0, Math.min(.5, depth / 2.2));
      geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(.002, depth - bev * 2), bevelEnabled: bev > 0, bevelSize: bev, bevelThickness: bev, bevelSegments: 3, curveSegments: 32 }); geo.translate(0, 0, -depth / 2 + bev);
      if (p.s === 'shape' || p.s === 'arch') { geo.computeBoundingBox(); }
      break; }
    default: return;
  }
  worldUV(geo);
  const me = add(g, geo, m, at[0], at[1], at[2], rot[1], rot[0], rot[2]); return me;
}
// texture coordinates in feet, projected from the side each face looks to: fabric weave, wood grain and stone keep their
// real size whatever the size of the part (otherwise one texture is stretched over a whole sofa cushion)
function worldUV(geo) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getZ(i); } else if (ax >= az) { uv[i * 2] = p.getZ(i); uv[i * 2 + 1] = p.getY(i); } else { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getY(i); }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
// repeats: "mirror": "x" | "z" | "xz" (a mirrored copy, or four for "xz"); "repeat": {"n": 5, "step": [dx, dy, dz]}; "around": {"n": 8, "r": 1.2} (copies around the vertical axis, each turned to face out)
function cpExpand(p) {
  let list = [p];
  const rep = p.repeat, ar = p.around;
  if (rep && Math.round(+rep.n) > 1) { const n = Math.min(60, Math.round(+rep.n)), st = cpv3(rep.step); list = list.flatMap(q => Array.from({ length: n }, (_, i) => ({ ...q, at: cpv3(q.at).map((v, k) => v + st[k] * i) }))); }
  if (ar && Math.round(+ar.n) > 1) { const n = Math.min(72, Math.round(+ar.n)), r = cpn(ar.r, 0, 0, 30), a0 = cpn(ar.start, 0, -360, 360); list = list.flatMap(q => Array.from({ length: n }, (_, i) => { const th = (a0 + 360 * i / n) * D2R, a = cpv3(q.at), rt = cpv3(q.rot); return { ...q, at: [a[0] + Math.sin(th) * r, a[1], a[2] + Math.cos(th) * r], rot: [rt[0], rt[1] + th / D2R, rt[2]] }; })); }
  // a mirrored copy is moved across the centre line, its turns reversed and its shape flipped, so even bent tubes and cut shapes come out as true mirror images
  const mir = String(p.mirror || '');
  if (mir.includes('x')) list = list.flatMap(q => { const a = cpv3(q.at), rt = cpv3(q.rot), f = q._f || [1, 1]; return [q, { ...q, at: [-a[0], a[1], a[2]], rot: [rt[0], -rt[1], -rt[2]], _f: [-f[0], f[1]] }]; });
  if (mir.includes('z')) list = list.flatMap(q => { const a = cpv3(q.at), rt = cpv3(q.rot), f = q._f || [1, 1]; return [q, { ...q, at: [a[0], a[1], -a[2]], rot: [-rt[0], -rt[1], rt[2]], _f: [f[0], -f[1]] }]; });
  return list;
}
function cpParts(parts) { const out = []; for (const p of Array.isArray(parts) ? parts : []) { if (!p || typeof p !== 'object' || !['box', 'cushion', 'cyl', 'sphere', 'torus', 'lathe', 'tube', 'shape', 'arch'].includes(p.s)) continue; out.push(...cpExpand(p)); if (out.length >= CP_MAX) break; } return out.slice(0, CP_MAX); }
// build the parts, then fit the piece to its w × d × h (the parts' own size unless the piece was resized) with its footprint centred and its bottom at 0
function cpBuild(it, parts, roomTokens) {
  const g = G(), matFor = s => { s = String(s || it.finish || 'fabric-main'); return mat(TOKEN_NAMES.includes(s) && roomTokens ? resolveSpec(s, roomTokens) : s); };
  for (const p of cpParts(parts)) { try { const me = cpAdd(g, p, matFor); if (me && p._f && (p._f[0] < 0 || p._f[1] < 0)) { me.geometry.scale(p._f[0], 1, p._f[1]); if (p._f[0] * p._f[1] < 0) flipWinding(me.geometry); } } catch (e) { console.warn('custom part failed', p, e); } }
  if (!g.children.length) { rb(g, it.w || 2, it.h || 2, it.d || 2, .2, matFor(it.finish)); return g; }
  const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const nat = [size.x, size.z, size.y], want = [+it.w || nat[0], +it.d || nat[1], +it.h || nat[2]], k = want.map((v, i) => nat[i] > .01 ? v / nat[i] : 1);
  const inner = new THREE.Group(); for (const ch of [...g.children]) inner.add(ch);
  inner.position.set(-c.x * k[0], -box.min.y * k[2], -c.z * k[1]); inner.scale.set(k[0], k[2], k[1]); inner.updateMatrixWorld(true);
  // bake the fit into each part so the engine can merge them by material
  for (const ch of [...inner.children]) { ch.updateMatrix(); ch.applyMatrix4(inner.matrix); g.add(ch); }
  return g;
}
function flipWinding(geo) { if (geo.index) { const a = geo.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } geo.index.needsUpdate = true; } else { const p = geo.attributes; for (const k of Object.keys(p)) { const at = p[k], n = at.itemSize; for (let i = 0; i < at.count; i += 3) for (let c = 0; c < n; c++) { const t = at.array[(i + 1) * n + c]; at.array[(i + 1) * n + c] = at.array[(i + 2) * n + c]; at.array[(i + 2) * n + c] = t; } at.needsUpdate = true; } } if (geo.attributes.normal) geo.computeVertexNormals(); }
// the natural size of a parts list (feet), so placement and the fit checks know a custom piece's footprint before it is built
const CP_SIZE = new Map();
function customSize(parts) {
  const key = JSON.stringify(parts); if (CP_SIZE.has(key)) return CP_SIZE.get(key);
  const g = G(); for (const p of cpParts(parts)) { try { const me = cpAdd(g, p, () => undefined); if (me && p._f) me.geometry.scale(p._f[0], 1, p._f[1]); } catch { } }
  const box = new THREE.Box3().setFromObject(g), s = box.isEmpty() ? [2, 2, 2] : [box.max.x - box.min.x, box.max.z - box.min.z, box.max.y - box.min.y].map(v => r2(Math.max(.05, v)));
  g.traverse(o => o.geometry?.dispose()); if (CP_SIZE.size > 300) CP_SIZE.clear(); CP_SIZE.set(key, s); return s;
}
// called wherever a custom piece enters the home: keeps a clean parts list and records its size
function prepCustom(it) {
  if (it.type !== 'custom') return it;
  it.parts = (Array.isArray(it.parts) ? it.parts : []).slice(0, 80).map(p => JSON.parse(JSON.stringify(p)));
  const [w, d, h] = customSize(it.parts); for (const [k, v] of [['w', w], ['d', d], ['h', h]]) if (!(+it[k] > 0)) it[k] = v;
  return it;
}

CAT['custom'] = { label: 'Custom piece', cat: 'Custom', d: { w: 2, d: 2, h: 2, finish: 'fabric-main' },
  build(it) { const g = cpBuild(it, it.parts, project?.roomStyles?.[it.room]?.tokens); if (it.h < .35) g.userData.colliders = []; return g; } };   // a flat piece (a rug, a mat) is walked over
NOTES['custom'] = 'any piece the catalog lacks, built from "parts" (see CUSTOM PIECES); give "parts" and a short "name"';

/* ---------- Pinterest-style pieces, written as parts ---------- */
const PIECE = (label, cat, d, partsOf, note, extra = {}) => ({ label, cat, d, ...extra, build(it) { return cpBuild(it, partsOf(it), project?.roomStyles?.[it.room]?.tokens); }, _note: note });
Object.assign(CAT, {
  'sofa-cloud': PIECE('Cloud sofa', 'Living', { w: 8.5, d: 3.6, h: 2.3, finish: 'boucle:#ece6db', accent: 'fabric-second' }, it => {
    const w = 8.5, d = 3.6, P = [], n = 3, iw = w - 2.2, cw = iw / n;
    P.push({ s: 'cushion', w, h: 1.0, d, at: [0, 0, 0], round: .25, m: it.finish });
    for (let i = 0; i < n; i++) P.push({ s: 'cushion', w: cw + .08, h: .62, d: d - 1.0, at: [-iw / 2 + cw * (i + .5), .82, .45], round: .32, m: it.finish }, { s: 'cushion', w: cw + .06, h: 1.25, d: .95, at: [-iw / 2 + cw * (i + .5), .8, -d / 2 + .55], round: .38, rot: [-8, 0, 0], m: it.finish });
    P.push({ s: 'cushion', w: 1.15, h: 1.55, d, at: [w / 2 - .57, .2, 0], round: .3, m: it.finish, mirror: 'x' });
    P.push({ s: 'cushion', w: 1.35, h: 1.25, d: .38, at: [-iw / 2 + .9, 1.25, -.75], round: .5, rot: [-14, 12, 0], m: it.accent, mirror: 'x' });
    return P; }, 'deep low sofa with plump rounded cushions all over (bouclé by default); Pinterest "cloud" look'),
  'sofa-channel': PIECE('Channel-tufted sofa', 'Living', { w: 7.5, d: 3.1, h: 2.5, finish: 'velvet-emerald', accent: 'brass' }, it => {
    const P = [], ch = 10, W = 7.4, bend = .45; P.push({ s: 'cushion', w: 7.2, h: .62, d: 2.3, at: [0, .55, .3], round: .3, m: it.finish }, { s: 'box', w: 7.1, h: .3, d: 2.7, r: .12, at: [0, .25, .1], m: it.finish });
    // vertical channels along a gentle curve: the ends come forward like arms
    for (let i = 0; i < ch; i++) { const x = -W / 2 + W * (i + .5) / ch, u = x / (W / 2), z = -1.05 + bend * u * u, ang = -Math.atan(2 * bend * u / (W / 2)) / D2R; P.push({ s: 'cushion', w: W / ch * 1.12, h: 1.95 - .35 * u * u, d: .6, at: [x, .45, z], rot: [-6, ang, 0], round: .45, m: it.finish }); }
    P.push({ s: 'cyl', r: .07, r2: .05, h: .28, at: [3.3, 0, .95], m: it.accent, mirror: 'xz' }); return P; }, 'velvet sofa with a gently curved back of vertical channels; front faces +z'),
  'chair-cane': PIECE('Cane armchair', 'Living', { w: 2.4, d: 2.6, h: 2.7, finish: 'wood:#9c7650', accent: 'linen:#e8ddcc' }, it => {
    const f = it.finish; return [
      { s: 'box', w: .12, h: 1.25, d: .12, r: .03, at: [1.1, 0, .95], m: f, mirror: 'xz' },
      { s: 'box', w: .12, h: .1, d: 2.3, r: .03, at: [1.1, 1.25, 0], m: f, mirror: 'x' },
      { s: 'box', w: 2.3, h: .1, d: .1, r: .03, at: [0, .55, .95], m: f, mirror: 'z' },
      { s: 'box', w: .05, h: .55, d: 2.0, at: [1.1, .65, 0], m: 'cane:#c9a46c', mirror: 'x' },
      { s: 'box', w: 2.05, h: 1.35, d: .05, at: [0, 1.25, -1.0], rot: [-10, 0, 0], m: 'cane:#c9a46c' },
      { s: 'box', w: 2.25, h: .1, d: .12, r: .03, at: [0, 2.6, -1.18], m: f },
      { s: 'box', w: .12, h: 1.45, d: .12, r: .03, at: [1.1, 1.2, -1.1], rot: [-10, 0, 0], m: f, mirror: 'x' },
      { s: 'cushion', w: 2.05, h: .38, d: 2.05, at: [0, .62, .05], round: .3, m: it.accent },
      { s: 'cushion', w: 1.8, h: 1.1, d: .32, at: [0, 1.05, -.8], rot: [-10, 0, 0], round: .4, m: it.accent }]; }, 'wooden armchair with woven cane sides and back, loose linen cushions'),
  'chair-shell': PIECE('Shell lounge chair', 'Living', { w: 2.6, d: 2.5, h: 2.4, finish: 'boucle:#efe8dc', accent: 'wood:#7a5236' }, it => [
    { s: 'cushion', w: 2.6, h: .85, d: 2.4, at: [0, .55, 0], round: .45, m: it.finish },
    { s: 'shape', pts: Array.from({ length: 25 }, (_, i) => { const a = Math.PI * i / 24; return [Math.cos(a) * 1.3, Math.sin(a) * 1.25]; }), depth: .45, bevel: .15, at: [0, 1.15, -.95], rot: [-6, 0, 0], m: it.finish },
    { s: 'cyl', r: .06, r2: .045, h: .58, at: [.85, 0, .8], rot: [8, 0, -8], m: it.accent, mirror: 'xz' }], 'rounded upholstered lounge chair with a curved shell back on thin legs'),
  'chair-bentwood': PIECE('Bentwood dining chair', 'Dining', { w: 1.75, d: 1.8, h: 2.65, finish: 'wood:#a57b52', accent: 'cane:#c9a46c' }, it => {
    const f = it.finish; return [
      { s: 'cyl', r: .055, r2: .045, h: 1.48, at: [.7, 0, .68], m: f, mirror: 'x' },
      { s: 'tube', pts: [[-.7, 0, -.68], [-.72, 1.5, -.72], [-.6, 2.5, -.82], [0, 2.62, -.86], [.6, 2.5, -.82], [.72, 1.5, -.72], [.7, 0, -.68]], r: .055, m: f },
      { s: 'torus', R: .78, r: .05, at: [0, 1.45, 0], rot: [90, 0, 0], m: f },
      { s: 'cyl', r: .78, h: .06, at: [0, 1.45, 0], seg: 40, m: it.accent },
      { s: 'box', w: 1.25, h: .22, d: .06, r: .03, at: [0, 2.15, -.8], rot: [-8, 0, 0], m: f }]; }, 'light curved wooden dining chair, round woven seat, bent back'),
  'table-pedestal': PIECE('Pedestal dining table', 'Dining', { w: 4.6, d: 4.6, h: 2.5, finish: 'stone:travertine:#d8c6ab', accent: 'stone:travertine:#d8c6ab' }, it => [
    { s: 'cyl', r: 2.3, h: .14, at: [0, 2.36, 0], seg: 72, m: it.finish },
    { s: 'lathe', pts: [[.95, 0], [.95, .1], [.62, .5], [.5, 1.2], [.55, 2.0], [.75, 2.36]], m: it.accent }], 'round dining table on a sculptural stone pedestal; w = diameter (4.6 seats 6)'),
  'coffee-pebble': PIECE('Pebble coffee table', 'Living', { w: 4.2, d: 2.6, h: 1.15, finish: 'stone:travertine:#dccbb2' }, it => [
    { s: 'shape', pts: Array.from({ length: 40 }, (_, i) => { const a = Math.PI * 2 * i / 40; return [Math.cos(a) * 2.1 * (1 + .06 * Math.sin(3 * a)), Math.sin(a) * 1.3 * (1 + .08 * Math.cos(2 * a))]; }), depth: 1.15, bevel: .18, at: [0, 0, 0], rot: [-90, 0, 0], m: it.finish }], 'organic pebble-shaped low coffee table in stone or wood'),
  'side-drum': PIECE('Drum side table', 'Living', { w: 1.5, d: 1.5, h: 1.75, finish: 'wood:#6b4a33' }, it => [
    { s: 'cyl', r: .75, h: .12, at: [0, 1.63, 0], m: it.finish }, { s: 'cyl', r: .5, r2: .42, h: 1.63, at: [0, 0, 0], m: it.finish }, { s: 'cyl', r: .62, h: .1, at: [0, 0, 0], m: it.finish }], 'round side table on a solid drum base'),
  'mirror-arch': PIECE('Arched mirror', 'Decor', { w: 2.6, d: .15, h: 6.2, y: 0, finish: 'brass' }, it => [
    { s: 'arch', w: 2.6, h: 6.2, depth: .1, bevel: .02, at: [0, 0, 0], m: it.finish }, { s: 'arch', w: 2.42, h: 6.05, depth: .03, at: [0, .08, .055], m: 'mirror' }], 'tall arched mirror; leans on the floor (y 0) or hangs (set y); wall-mounted, back to wall', { nc: true }),
  'cabinet-arch': PIECE('Arched display cabinet', 'Living', { w: 3.2, d: 1.4, h: 6.8, finish: 'wood:#8a6142', accent: 'glass:#e8f0ee' }, it => [
    { s: 'arch', w: 3.2, h: 6.8, depth: 1.4, at: [0, 0, 0], m: it.finish },
    { s: 'arch', w: 2.8, h: 6.3, depth: .05, at: [0, .25, .7], m: it.accent },
    { s: 'box', w: 2.8, h: .06, d: 1.1, at: [0, 2.1, .05], m: it.finish, repeat: { n: 3, step: [0, 1.4, 0] } },
    { s: 'lathe', pts: [[0, 0], [.22, 0], [.3, .25], [.18, .55], [.12, .7], [.14, .8]], at: [-.6, 2.16, 0], m: 'ceramic:#e9e3d8:matte' },
    { s: 'box', w: .9, h: .25, d: .7, at: [.6, 3.56, 0], m: 'lacquer:#4a3b2f' }], 'tall arched cabinet with glass front and styled shelves'),
  'lamp-mushroom': PIECE('Mushroom table lamp', 'Lighting', { w: 1.2, d: 1.2, h: 1.6, finish: 'ceramic:#e8dcc6', accent: 'glow:#ffdcb0' }, it => [
    { s: 'sphere', r: .6, half: true, scale: [1, .8, 1], at: [0, 1.12, 0], m: it.finish },
    { s: 'sphere', r: .5, scale: [1, .4, 1], at: [0, 1.12, 0], m: it.accent },
    { s: 'cyl', r: .2, r2: .14, h: 1.12, at: [0, 0, 0], m: it.finish }], 'glowing mushroom-dome table lamp; put it "on" a table', { nc: true }),
  'lamp-paper': PIECE('Paper floor lamp', 'Lighting', { w: 1.4, d: 1.4, h: 5.2, finish: 'glow:#fff0d8:.9', accent: 'black-metal' }, it => [
    { s: 'lathe', pts: [[0, 0], [.45, 0], [.62, .5], [.7, 1.4], [.62, 2.3], [.45, 2.7], [0, 2.75]], at: [0, 2.3, 0], m: it.finish },
    { s: 'cyl', r: .03, h: 2.4, at: [0, 0, 0], m: it.accent }, { s: 'tube', pts: [[0, 0, 0], [.6, 0, 0]], r: .025, around: { n: 3, r: 0 }, m: it.accent }], 'tall glowing paper floor lamp on a thin stand'),
  'pendant-paper': PIECE('Paper lantern pendant', 'Lighting', { w: 2.0, d: 2.0, h: 1.7, y: 6.9, finish: 'glow:#fff2de:.9' }, it => [
    { s: 'sphere', r: 1.1, scale: [1, .82, 1], at: [0, .9, 0], m: it.finish }, { s: 'cyl', r: .015, h: 3, at: [0, 1.7, 0], m: 'black-metal' }], 'large round paper lantern pendant; "over" a table or centred in a room', { nc: true }),
  'bed-wing': PIECE('Upholstered wing bed', 'Bedroom', { w: 6.6, d: 7.4, h: 4.6, finish: 'linen:#d9ccba', accent: 'linen:#f4efe7' }, it => {
    const P = [], f = it.finish, a = it.accent;
    P.push({ s: 'box', w: 6.4, h: 1.1, d: 6.9, r: .25, at: [0, 0, .25], m: f });
    P.push({ s: 'cushion', w: 6.0, h: .75, d: 6.5, at: [0, 1.0, .35], round: .2, m: 'linen-white' });
    for (let i = 0; i < 7; i++) P.push({ s: 'cushion', w: 6.6 / 7 + .06, h: 4.6, d: .55, at: [-3.3 + 6.6 / 7 * (i + .5), 0, -3.4], round: .5, m: f });
    P.push({ s: 'cushion', w: .9, h: 3.4, d: 1.4, at: [3.05, 0, -2.6], round: .5, m: f, mirror: 'x' });
    P.push({ s: 'cushion', w: 2.3, h: .95, d: .5, at: [1.3, 1.7, -2.6], rot: [-15, 0, 0], round: .5, m: 'linen-white', mirror: 'x' });
    P.push({ s: 'cushion', w: 1.6, h: .8, d: .4, at: [0, 1.75, -2.25], rot: [-12, 0, 0], round: .5, m: a });
    P.push({ s: 'cushion', w: 6.25, h: .2, d: 4.4, at: [0, 1.66, 1.05], round: .45, m: a }, { s: 'box', w: 6.25, h: .95, d: .08, r: .03, at: [0, .85, 3.3], m: a });
    return P; }, 'bed with a tall channel-stitched headboard that wraps round at the sides; w 6.6 king, 5.6 queen'),
  'bed-platform': PIECE('Low platform bed', 'Bedroom', { w: 8.2, d: 7.6, h: 3.0, finish: 'wood:#b48a60', accent: 'linen:#e9e1d4' }, it => [
    { s: 'box', w: 8.2, h: .55, d: 7.6, r: .05, at: [0, 0, 0], m: it.finish },
    { s: 'box', w: 6.4, h: 2.4, d: .25, r: .05, at: [0, .55, -3.68], m: it.finish },
    { s: 'cushion', w: 6.0, h: .7, d: 6.6, at: [0, .55, .35], round: .2, m: 'linen-white' },
    { s: 'cushion', w: 2.2, h: .85, d: .45, at: [1.25, 1.2, -2.9], rot: [-15, 0, 0], round: .5, m: it.accent, mirror: 'x' },
    { s: 'cushion', w: 6.05, h: .18, d: 4.4, at: [0, 1.17, 1.15], round: .45, m: it.accent },
    { s: 'box', w: .85, h: .04, d: 1.2, at: [3.6, .55, -2.9], m: it.finish, mirror: 'x' }], 'Japandi low wooden platform bed whose frame runs out as a side ledge each side (nightstands built in)'),
  'bench-curved': PIECE('Curved bench', 'Bedroom', { w: 4.6, d: 1.6, h: 1.5, finish: 'boucle:#e9e2d6', accent: 'wood:#7a5236' }, it => [
    { s: 'shape', pts: Array.from({ length: 30 }, (_, i) => { const a = Math.PI * (.15 + .7 * i / 29); return [Math.cos(a) * -3.0, Math.sin(a) * 3.0 - 2.4]; }).concat(Array.from({ length: 30 }, (_, i) => { const a = Math.PI * (.85 - .7 * i / 29); return [Math.cos(a) * -1.75, Math.sin(a) * 1.75 - 1.2]; })), depth: .6, bevel: .2, at: [0, .9, 0], rot: [-90, 0, 0], m: it.finish },
    { s: 'cyl', r: .06, h: .9, at: [1.9, 0, -.15], m: it.accent, mirror: 'x' }, { s: 'cyl', r: .06, h: .9, at: [0, 0, .4], m: it.accent }], 'curved upholstered bench; at the foot of a bed or by a window'),
  'shelves-floating': PIECE('Floating shelves', 'Decor', { w: 4, d: .9, h: 3.2, y: 3.4, finish: 'wood-light' }, it => [
    { s: 'box', w: 4, h: .14, d: .9, at: [0, 0, 0], m: it.finish, repeat: { n: 3, step: [0, 1.4, 0] } },
    { s: 'box', w: .55, h: .62, d: .45, at: [-1.2, .14, 0], m: 'lacquer:#d8c9b2' }, { s: 'lathe', pts: [[0, 0], [.18, 0], [.25, .2], [.12, .5], [.08, .62]], at: [.9, .14, 0], m: 'ceramic:#2f2b28:matte' },
    { s: 'box', w: .9, h: .5, d: .6, at: [-.9, 1.54, 0], m: 'linen:#c9b9a2' }, { s: 'sphere', r: .2, at: [1.0, 1.75, 0], m: 'stoneware:#d6c7b0' },
    { s: 'box', w: .12, h: .7, d: .5, at: [-1.6, 2.94, 0], m: 'lacquer:#7b4b33', repeat: { n: 5, step: [.14, 0, 0] } }, { s: 'lathe', pts: [[0, 0], [.14, 0], [.18, .3], [.1, .7], [.05, .9]], at: [1.1, 2.94, 0], m: 'ceramic:#efe8dc' }], 'three wall shelves styled with books, vases and objects; wall-mounted (set y for the lowest shelf)', { nc: true }),
  'vase-branches': PIECE('Vase with branches', 'Decor', { w: 1.6, d: 1.6, h: 4.2, finish: 'stoneware:#d9cbb4' }, it => [
    { s: 'lathe', pts: [[0, 0], [.32, 0], [.45, .5], [.4, 1.1], [.2, 1.45], [.16, 1.6]], at: [0, 0, 0], m: it.finish },
    { s: 'tube', pts: [[0, 1.4, 0], [.2, 2.4, .1], [.55, 3.3, .2], [.75, 4.1, .1]], r: .02, m: 'bark' }, { s: 'tube', pts: [[0, 1.4, 0], [-.25, 2.6, -.1], [-.6, 3.4, 0], [-.7, 4.0, .2]], r: .02, m: 'bark' },
    { s: 'sphere', r: .12, scale: [1, .45, 1.6], at: [.3, 2.8, .15], rot: [0, 30, 40], m: 'leaf', repeat: { n: 6, step: [.08, .2, -.03] } }, { s: 'sphere', r: .12, scale: [1, .45, 1.6], at: [-.3, 2.9, -.05], rot: [0, -30, -40], m: 'leaf-dark', repeat: { n: 6, step: [-.07, .18, .03] } }], 'floor vase with a few olive branches; corners and consoles'),
  'decor-books': PIECE('Books and objects', 'Decor', { w: 1.6, d: 1.1, h: .7, finish: 'lacquer:#c9b9a2' }, it => [
    { s: 'box', w: 1.1, h: .1, d: .8, at: [-.2, 0, 0], m: 'lacquer:#e8e0d2' }, { s: 'box', w: 1.0, h: .09, d: .75, at: [-.2, .1, 0], rot: [0, 8, 0], m: it.finish }, { s: 'box', w: .95, h: .08, d: .7, at: [-.2, .19, 0], rot: [0, -5, 0], m: 'lacquer:#2f3a34' },
    { s: 'lathe', pts: [[0, 0], [.08, 0], [.2, .06], [.24, .14]], at: [-.2, .27, 0], m: 'ceramic:#2b2826:matte' }, { s: 'lathe', pts: [[0, 0], [.12, 0], [.17, .2], [.08, .45], [.06, .55]], at: [.55, 0, .05], m: 'stoneware:#cdbb9f' }], 'a stack of books with a bowl and a small vase; put it "on" a coffee table, console or shelf', { nc: true }),
});
for (const k of ['sofa-cloud', 'sofa-channel', 'chair-cane', 'chair-shell', 'chair-bentwood', 'table-pedestal', 'coffee-pebble', 'side-drum', 'mirror-arch', 'cabinet-arch', 'lamp-mushroom', 'lamp-paper', 'pendant-paper', 'bed-wing', 'bed-platform', 'bench-curved', 'shelves-floating', 'vase-branches', 'decor-books']) NOTES[k] = CAT[k]._note;
