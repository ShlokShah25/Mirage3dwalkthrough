
/* ================= merge a built group into a few meshes ================= */
function mergeGroup(g) {
  const byMat = new Map();
  const bake = (geo0, m4) => { const geo = geo0.index ? geo0.toNonIndexed() : geo0.clone(); geo.applyMatrix4(m4); return geo; };
  for (const c of [...g.children]) {
    if (!c.isMesh || c.userData.keep) continue;
    c.updateMatrix();
    if (c.isInstancedMesh) {
      const m4 = new THREE.Matrix4(), tmp = new THREE.Matrix4();
      for (let i = 0; i < c.count; i++) {
        c.getMatrixAt(i, tmp); m4.multiplyMatrices(c.matrix, tmp);
        const geo = bake(c.geometry, m4);
        for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        if (!byMat.has(c.material)) byMat.set(c.material, []); byMat.get(c.material).push(geo);
      }
      c.geometry.dispose(); g.remove(c); continue;
    }
    let geo = bake(c.geometry, c.matrix);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!byMat.has(c.material)) byMat.set(c.material, []);
    byMat.get(c.material).push(geo); c.geometry.dispose(); g.remove(c);
  }
  for (const [m, geos] of byMat) {
    const merged = mergeGeometries(geos); geos.forEach(x => x.dispose()); if (!merged) continue;
    const me = new THREE.Mesh(merged, m); me.castShadow = !m.transparent && !m.emissive?.getHex(); me.receiveShadow = true; g.add(me);
  }
}

/* ================= world state ================= */
let house = new THREE.Group(); scene.add(house);
const itemsGroup = new THREE.Group(); scene.add(itemsGroup);
const itemGroups = new Map();
let wallCols = [], itemCols = [], allCols = [], surfaces = [], floorMeshes = [], ceilings = [], labels = [], lamps = [], dayLights = [], wallGroup, bounds = null, H = 10;
const S = { center: new THREE.Vector3() };
const WALLMOUNT = new Set(['tv', 'artwork', 'mirror', 'panel-slats', 'panel-stone', 'panel-upholstered', 'curtain', 'sconce', 'wall-molding', 'wall-panel-wood', 'feature-stone']);

function toWorldCollider(c, it, y) {
  const th = -(it.rot || 0) * D2R, cs = Math.cos(th), sn = Math.sin(th), ca = c.ang + th;
  return { cx: it.x + c.x * cs - c.z * sn, cz: it.z + c.x * sn + c.z * cs, hx: c.hx, hz: c.hz, c: Math.cos(ca), s: Math.sin(ca), y0: c.y0 + y, y1: c.y1 + y };
}
function toWorldSurface(s, it, y) {
  const th = -(it.rot || 0) * D2R, cs = Math.cos(th), sn = Math.sin(th);
  const o = { ...s, x: it.x + s.x * cs - s.z * sn, z: it.z + s.x * sn + s.z * cs, y: s.y + y };
  if (s.type === 'rect') o.ang = (s.ang || 0) + th; else { o.a0 = s.a0 + th; o.a1 = s.a1 + th; }
  return o;
}
const withDefaults = it => ({ ...(CAT[it.type]?.d || {}), ...it });
function buildItem(it) {
  const def = CAT[it.type]; if (!def) return null;
  const full = withDefaults(it);
  const rs = project?.roomStyles?.[it.room];
  if (rs?.tokens) for (const k of ['finish', 'accent', 'top', 'topFinish']) if (TOKEN_NAMES.includes(full[k])) full[k] = resolveSpec(full[k], rs.tokens);
  for (const k of ['w', 'd', 'h']) full[k] = Math.max(.05, +full[k] || 1);
  let g; try { g = def.build(full, { H }); } catch (e) { console.warn('item failed', it, e); return null; }
  const locCols = g.userData.colliders || (def.nc ? [] : [{ x: 0, z: 0, hx: full.w / 2, hz: full.d / 2, ang: 0, y0: 0, y1: full.h }]);
  const locSurf = g.userData.surfaces || [];
  mergeGroup(g);
  const y = +full.y || 0;
  g.position.set(it.x, y, it.z); g.rotation.y = (it.rot || 0) * D2R; g.userData.item = it;
  g.userData.cols = locCols.map(c => toWorldCollider(c, it, y));
  g.userData.surf = locSurf.map(s => toWorldSurface(s, it, y));
  return g;
}
function refreshItemPhysics() { itemCols = []; surfaces = []; for (const g of itemGroups.values()) { itemCols.push(...g.userData.cols); surfaces.push(...g.userData.surf); } allCols = wallCols.concat(itemCols); }
function disposeGroup(g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function buildAllItems() {
  for (const g of itemGroups.values()) { itemsGroup.remove(g); disposeGroup(g); }
  itemGroups.clear();
  for (const it of layout.furniture) { it.id ||= newId(); const g = buildItem(it); if (g) { itemsGroup.add(g); itemGroups.set(it.id, g); } }
  refreshItemPhysics();
}
function addItemsLive(list) {
  for (const it of list) { it.id ||= newId(); const g = buildItem(it); if (g) { itemsGroup.add(g); itemGroups.set(it.id, g); } }
  refreshItemPhysics(); drawMapBaseSoon(); shadowsDirty();
}
function removeItemsWhere(fn) {
  shadowsDirty();
  const keep = [];
  for (const it of layout.furniture) { if (fn(it)) { const g = itemGroups.get(it.id); if (g) { itemsGroup.remove(g); disposeGroup(g); itemGroups.delete(it.id); } } else keep.push(it); }
  layout.furniture = keep; refreshItemPhysics(); drawMapBaseSoon();
}
function rebuildItem(it) {
  const old = itemGroups.get(it.id); if (old) { itemsGroup.remove(old); disposeGroup(old); itemGroups.delete(it.id); }
  const g = buildItem(it); if (g) { itemsGroup.add(g); itemGroups.set(it.id, g); }
  refreshItemPhysics(); updateSelBox(); drawMapBaseSoon(); saveSoon(); shadowsDirty();
}

/* ================= shell ================= */
const M = {};
function shellMats() {
  const s = layout.settings; for (const k in M) M[k].dispose?.();
  M.wall = std({ color: s.wallColor || '#e8dfd2', map: plasterTex(), roughness: .92, envMapIntensity: .35 }); M.wall.map.repeat.set(1, 1);
  M.ceil = std({ color: s.ceilingColor || '#f5f0e8', roughness: .95, envMapIntensity: .3 });
  M.frame = std({ color: '#3d3935', roughness: .45, metalness: .6 });
  M.doorFrame = std({ color: shade(s.wallColor || '#e8dfd2', .93), roughness: .6 });
  M.skirt = std({ color: shade(s.wallColor || '#e8dfd2', .9), roughness: .5 });
}
function along(parent, W, s0, s1, y0, y1, depth, m, off = 0, collide = false) {
  const len = s1 - s0; if (len < .01 || y1 - y0 < .01) return;
  const me = new THREE.Mesh(new THREE.BoxGeometry(len, y1 - y0, depth), m);
  const s = (s0 + s1) / 2, cx = W.ax + W.ux * s + W.nx * off, cz = W.az + W.uz * s + W.nz * off;
  me.position.set(cx, (y0 + y1) / 2, cz); me.rotation.y = W.rot; parent.add(me);
  if (collide) wallCols.push({ cx, cz, hx: len / 2, hz: depth / 2, c: W.ux, s: W.uz, y0: y0 < .5 ? -1 : y0, y1, wall: true });
}
function buildWall(w, g) {
  const [ax, az] = w.a, [bx_, bz] = w.b, L = Math.hypot(bx_ - ax, bz - az); if (L < .05) return;
  const ux = (bx_ - ax) / L, uz = (bz - az) / L, W = { ax, az, ux, uz, nx: -uz, nz: ux, rot: Math.atan2(-uz, ux) };
  const t = Math.max(.2, +w.thickness || .5), ext = t / 2, glass = mat('glass');
  let cur = -ext; const solid = [];
  for (const o of [...(w.openings || [])].sort((p, q) => p.start - q.start)) {
    const s0 = Math.max(o.start, cur), s1 = Math.min(o.end, L); if (s1 <= s0) continue;
    along(g, W, cur, s0, 0, H, t, M.wall, 0, true); solid.push([cur, s0]);
    const sill = o.sill || 0, head = Math.min(o.head ?? 7, H);
    if (sill > 0) { along(g, W, s0, s1, 0, sill, t, M.wall, 0, true); solid.push([s0, s1]); }
    if (head < H) along(g, W, s0, s1, head, H, t, M.wall);
    const len = s1 - s0, fw = .16;
    if (o.type === 'window') {
      along(g, W, s0, s1, sill, head, .04, glass);
      along(g, W, s0, s1, sill, sill + fw, t * .7, M.frame); along(g, W, s0, s1, head - fw, head, t * .7, M.frame);
      along(g, W, s0, s0 + fw, sill, head, t * .7, M.frame); along(g, W, s1 - fw, s1, sill, head, t * .7, M.frame);
      along(g, W, s0 - .05, s1 + .05, sill - .06, sill, t + .2, mat('marble'));
      const n = Math.max(1, Math.round(len / 4)); for (let i = 1; i < n; i++) { const m = s0 + len * i / n; along(g, W, m - fw / 2, m + fw / 2, sill, head, t * .5, M.frame); }
    } else if (o.type === 'slider') {
      along(g, W, s0, s1, head - fw, head, t * .9, M.frame); along(g, W, s0, s1, 0, .08, t * .9, M.frame);
      const n = Math.max(2, Math.round(len / 5)), pw = len / n, open = Math.floor(n / 2);
      for (let i = 0; i < n; i++) {
        if (i === open) continue;
        const a = s0 + i * pw, b = a + pw, off = (i % 2 ? 1 : -1) * .09;
        along(g, W, a, b, .08, head - fw, .03, glass, off, true); along(g, W, a, a + fw * .6, .08, head - fw, .1, M.frame, off); along(g, W, b - fw * .6, b, .08, head - fw, .1, M.frame, off);
      }
      const a = s0 + Math.max(0, open - 1) * pw + pw * .15, off = ((open - 1) % 2 ? -1 : 1) * .09;
      along(g, W, a, a + pw, .08, head - fw, .03, glass, off); along(g, W, a, a + fw * .6, .08, head - fw, .1, M.frame, off); along(g, W, a + pw - fw * .6, a + pw, .08, head - fw, .1, M.frame, off);
    } else if (o.type === 'door') {
      const d = t + .1, jw = .22;
      along(g, W, s0, s0 + jw, 0, head, d, M.doorFrame); along(g, W, s1 - jw, s1, 0, head, d, M.doorFrame); along(g, W, s0, s1, head - jw, head, d, M.doorFrame);
      const sw = o.swing || { hinge: 'start', side: 1, open: 90 }, main = /main/i.test(o.name || '');
      const lw = len - 2 * jw, lh = head - jw - .02, ang = (sw.open ?? 90) * D2R, sgn = sw.hinge === 'end' ? -1 : 1, side = sw.side || 1;
      const hs = sw.hinge === 'end' ? s1 - jw : s0 + jw;
      const hx = ax + ux * hs + W.nx * side * (ang ? t / 2 : 0), hz = az + uz * hs + W.nz * side * (ang ? t / 2 : 0);
      const dx = ux * sgn * Math.cos(ang) + W.nx * side * Math.sin(ang), dz = uz * sgn * Math.cos(ang) + W.nz * side * Math.sin(ang);
      const lf = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, .15), main ? mat('wood-dark') : mat('wood-light')); const cx = hx + dx * lw / 2, cz = hz + dz * lw / 2;
      lf.position.set(cx, lh / 2, cz); lf.rotation.y = Math.atan2(-dz, dx); g.add(lf);
      const hd = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .5), mat('metal')); hd.position.set(hx + dx * (lw - .35), 3.3, hz + dz * (lw - .35)); hd.rotation.y = Math.atan2(-dz, dx) + Math.PI / 2; g.add(hd);
      wallCols.push({ cx, cz, hx: lw / 2, hz: .1, c: dx, s: dz, y0: -1, y1: lh });
    }
    cur = s1;
  }
  along(g, W, cur, L + ext, 0, H, t, M.wall, 0, true); solid.push([cur, L + ext]);
  // skirting on both faces of solid runs
  for (const [a, b] of solid) for (const sd of [-1, 1]) along(g, W, Math.max(a, -ext + .02), Math.min(b, L + ext - .02), 0, .33, .05, M.skirt, sd * (t / 2 + .025));
}
const shapeOf = poly => { const s = new THREE.Shape(); poly.forEach(([x, z], i) => i ? s.lineTo(x, z) : s.moveTo(x, z)); return s; };
const isOutdoorType = t => ['balcony', 'terrace', 'deck', 'garden'].includes(t);
const floorY = r => r.kind === 'outdoor' ? -0.25 : r.kind === 'ledge' ? -0.6 : r.under ? -0.006 : 0;   // gap-filling floors sit just under the rooms they meet
function centroid(p) { let x = 0, z = 0; p.forEach(q => { x += q[0]; z += q[1]; }); return [x / p.length, z / p.length]; }
function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; } return Math.abs(a) / 2; }
function pip([x, z], poly) { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; } return ins; }
function roomAt(x, z) { let best = null; for (const r of layout.rooms) if (r.polygon?.length > 2 && pip([x, z], r.polygon)) { if (!best || (best.under && !r.under) || (!r.under === !best.under && ((r.kind === 'room' && best.kind !== 'room') || (r.kind === best.kind && polyArea(r.polygon) < polyArea(best.polygon))))) best = r; } return best; }
function segDist(px, pz, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1; let t = ((px - a[0]) * dx + (pz - a[1]) * dz) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - a[0] - t * dx, pz - a[1] - t * dz); }
/* ---- fake light spill: cove glow on ceilings and walls, downlight scallops (additive, cheap, reads like real lighting) ---- */
const GLOW = new Set();
function glowTex(kind) {
  return TX['glow-' + kind] ||= (() => {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    if (kind === 'grad') { c.width = 4; c.height = 256; for (let y = 0; y < 256; y++) { const v = y / 255, a = Math.exp(-v * 3.2) * (1 - v); g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(0, y, 4, 1); } }
    else { c.width = 128; c.height = 256; const im = g.createImageData(128, 256); for (let y = 0; y < 256; y++) for (let x = 0; x < 128; x++) { const v = y / 255, u = (x - 63.5) / 64, spread = .12 + v * .95, core = Math.exp(-Math.pow(u / spread, 2) * 2.2), top = Math.min(1, v * 14), fall = Math.exp(-v * 2.1) * (1 - v), arc = v < .06 ? Math.exp(-Math.pow(u / .5, 2) * 3) * .6 : 0; const edge = Math.pow(Math.max(0, 1 - u * u), 2), a = Math.min(1, (core * top * fall * 1.25 + arc) * edge); const i = (y * 128 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = a * 255; } g.putImageData(im, 0, 0); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
}
function glowMat(kind, color, base) {
  const k = 'glowm-' + kind + color + base; if (MC[k]) return MC[k];
  const m = new THREE.MeshBasicMaterial({ map: glowTex(kind), color, transparent: true, opacity: base, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: true, side: THREE.DoubleSide });
  m.userData.baseOp = base; GLOW.add(m); return (MC[k] = m);
}
function wallFaceOffset(mx, mz) { let best = null; for (const w of layout.walls) { const d = segDist(mx, mz, w.a, w.b); if (d < 1.2 && (!best || d < best.d)) best = { d, w }; } return best ? best.w.thickness / 2 + .015 : null; }
function openingAt(px, pz, pad = .6) {
  for (const w of layout.walls) { if (segDist(px, pz, w.a, w.b) > w.thickness / 2 + .5) continue; const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), s = ((px - w.a[0]) * (w.b[0] - w.a[0]) + (pz - w.a[1]) * (w.b[1] - w.a[1])) / L;
    if ((w.openings || []).some(o => s > o.start - pad && s < o.end + pad)) return true; }
  return false;
}
// a vertical glow card on a wall face: centre (x,z), facing inward (nx,nz), width w, height h, top at y
function wallCard(grp, kind, m, x, z, nx, nz, w, h, yTop) { const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); me.position.set(x, yTop - h / 2, z); me.rotation.y = Math.atan2(nx, nz); me.renderOrder = 5; grp.add(me); return me; }
function insetPoly(poly, d) {
  const n = poly.length, lines = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    let nx = -dz / L, nz = dx / L; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (!pip([mx + nx * .05, mz + nz * .05], poly)) { nx = -nx; nz = -nz; }
    lines.push({ p: [a[0] + nx * d, a[1] + nz * d], v: [dx / L, dz / L], a, b, n: [nx, nz] });
  }
  const pts = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i - 1 + n) % n], l2 = lines[i], den = l1.v[0] * l2.v[1] - l1.v[1] * l2.v[0];
    if (Math.abs(den) < 1e-4) { pts.push(l2.p); continue; }
    const t = ((l2.p[0] - l1.p[0]) * l2.v[1] - (l2.p[1] - l1.p[1]) * l2.v[0]) / den; pts.push([l1.p[0] + l1.v[0] * t, l1.p[1] + l1.v[1] * t]);
  }
  return { pts, lines };
}
function makeLabel(text, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = 'rgba(14,16,17,.84)'; g.beginPath(); g.roundRect(6, 16, 500, 128, 22); g.fill();
  g.fillStyle = '#EDEBE4'; g.font = '600 46px Geist, Arial'; g.textAlign = 'center'; g.fillText(text.slice(0, 22), 256, sub ? 78 : 96);
  if (sub) { g.fillStyle = '#5BF0D1'; g.font = '32px "Geist Mono", monospace'; g.fillText(sub, 256, 122); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(11, 3.4, 1); sp.renderOrder = 10; return sp;
}
function buildShell() {
  scene.remove(house); house.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isSprite) o.material.map.dispose(); });
  house = new THREE.Group(); scene.add(house);
  wallCols = []; floorMeshes = []; ceilings = []; labels = []; lamps = []; dayLights = [];
  shellMats();
  H = +layout.settings.ceilingHeight || 10; const slab = +layout.settings.slabThickness || .5;
  wallGroup = new THREE.Group(); house.add(wallGroup);
  for (const w of layout.walls) buildWall(w, wallGroup);
  for (const rl of layout.railings || []) {
    const h = rl.height || 3.5, rg = new THREE.Group();
    for (let i = 0; i < rl.points.length - 1; i++) {
      const [ax, az] = rl.points[i], [bx_, bz] = rl.points[i + 1], L = Math.hypot(bx_ - ax, bz - az); if (L < .01) continue;
      const ux = (bx_ - ax) / L, uz = (bz - az) / L, W = { ax, az, ux, uz, nx: -uz, nz: ux, rot: Math.atan2(-uz, ux) }, y0 = -.25, rail = mat('black-metal');
      along(rg, W, 0, L, y0 + h - .12, y0 + h, .16, rail);
      if (rl.style !== 'metal') { along(rg, W, .05, L - .05, y0 + .2, y0 + h - .12, .05, mat('glass'), 0, true); along(rg, W, 0, L, y0, y0 + .2, .2, rail); }
      else { along(rg, W, 0, L, y0 + .4, y0 + .5, .08, rail, 0, true); const n = Math.max(1, Math.round(L / .45)); for (let k = 0; k <= n; k++) { const s = L * k / n; along(rg, W, s - .03, s + .03, y0, y0 + h, .06, rail); } }
    }
    mergeGroup(rg); house.add(rg);
  }
  mergeGroup(wallGroup);
  // world-scale UVs on the walls so the plaster texture has a real size (about 9 ft per tile)
  wallGroup.children.forEach(me => { if (me.material !== M.wall) return; const p = me.geometry.attributes.position, n = me.geometry.attributes.normal, uv = me.geometry.attributes.uv; if (!uv) return;
    for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); const u = ay > .5 ? p.getX(i) : ax > .5 ? p.getZ(i) : p.getX(i), v = ay > .5 ? p.getZ(i) : p.getY(i); uv.setXY(i, u / 9, v / 9); } uv.needsUpdate = true; });
  if (effQ() !== 'fast') {
    const glaz = [];
    for (const w of layout.walls) {
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (L < .05) continue; const ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L;
      for (const o of w.openings || []) {
        if (!['window', 'slider'].includes(o.type) || o.end - o.start < 2.5) continue;
        const sm = (o.start + o.end) / 2, cx = w.a[0] + ux * sm, cz = w.a[1] + uz * sm; let nx = -uz, nz = ux;
        const inA = roomAt(cx + nx * 1.2, cz + nz * 1.2), inB = roomAt(cx - nx * 1.2, cz - nz * 1.2);
        const aIn = inA?.kind === 'room', bIn = inB?.kind === 'room'; if (aIn === bIn) continue; if (!aIn) { nx = -nx; nz = -nz; }
        glaz.push({ w: o.end - o.start, h: Math.min(H, o.head || 7) - (o.sill || 0), y: ((o.sill || 0) + Math.min(H, o.head || 7)) / 2, cx, cz, nx, nz, t: w.thickness });
      }
    }
    glaz.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, effQ() === 'high' ? 10 : 5).forEach(g => {
      const l = new THREE.RectAreaLight('#ffffff', 1, g.w * .95, g.h * .95); l.position.set(g.cx + g.nx * (g.t / 2 + .1), g.y, g.cz + g.nz * (g.t / 2 + .1)); l.lookAt(g.cx + g.nx * 8, g.y - 1.2, g.cz + g.nz * 8);
      l.userData.area = g.w * g.h; house.add(l); dayLights.push(l);
    });
  }
  wallGroup.children.forEach(m => { m.castShadow = !m.material.transparent; });
  const bb = new THREE.Box2();
  layout.rooms.forEach((r, i) => {
    if (!r.polygon || r.polygon.length < 3) return;
    r.polygon.forEach(p => bb.expandByPoint(new THREE.Vector2(p[0], p[1])));
    const geo = new THREE.ExtrudeGeometry(shapeOf(r.polygon), { depth: slab, bevelEnabled: false }); geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, floorMat(r.finish, r.floor || '#d9d2c5')); m.position.y = floorY(r) + i * .0015; m.receiveShadow = true; m.userData.room = r;
    house.add(m); floorMeshes.push(m);
    const [cx, cz] = centroid(r.polygon);
    if (r.kind === 'room') {
      const top = new THREE.Mesh(geo, M.ceil); top.position.y = H + slab + i * .0015; top.castShadow = true; top.receiveShadow = true; house.add(top); ceilings.push(top);
      const xs = r.polygon.map(p => p[0]), zs = r.polygon.map(p => p[1]), spanX = Math.max(...xs) - Math.min(...xs), spanZ = Math.max(...zs) - Math.min(...zs);
      const spots = spanX > 18 ? [[cx - spanX / 4, cz], [cx + spanX / 4, cz]] : spanZ > 18 ? [[cx, cz - spanZ / 4], [cx, cz + spanZ / 4]] : [[cx, cz]];
      for (const [lx, lz] of spots) if (pip([lx, lz], r.polygon)) { const lamp = new THREE.PointLight('#ffe0c2', 14, 0, 1.6); lamp.position.set(lx, H - 2.6, lz); /* hung low enough not to burn a hot spot into the ceiling */ house.add(lamp); lamps.push(lamp); }
      const dg = new THREE.Group(), dl = mat('downlight'), inset = insetPoly(r.polygon, 1.4).pts; let n = 0;
      for (let x = Math.min(...xs) + 2; x < Math.max(...xs) - 1.5 && n < 14; x += 4.5) for (let z = Math.min(...zs) + 2; z < Math.max(...zs) - 1.5 && n < 14; z += 4.5) if (pip([x, z], inset)) { add(dg, new THREE.CircleGeometry(.2, 16), dl, x, H - .005, z, 0, Math.PI / 2); add(dg, new THREE.TorusGeometry(.24, .025, 6, 20), M.frame, x, H - .01, z, 0, Math.PI / 2); n++; }
      if (dg.children.length) { mergeGroup(dg); house.add(dg); ceilings.push(dg); }
      if (r.cove) {
        const { pts, lines } = insetPoly(r.polygon, .55), cg = new THREE.Group(), led = mat('led');
        lines.forEach((ln, k) => {
          const mx = (ln.a[0] + ln.b[0]) / 2, mz = (ln.a[1] + ln.b[1]) / 2;
          if (!layout.walls.some(w => segDist(mx, mz, w.a, w.b) < .6)) return;
          const p0 = pts[k], p1 = pts[(k + 1) % pts.length], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); if (L < .3 || L > 200) return;
          const me = new THREE.Mesh(new THREE.BoxGeometry(L, .05, .08), led); me.position.set((p0[0] + p1[0]) / 2, H - .32, (p0[1] + p1[1]) / 2); me.rotation.y = Math.atan2(-(p1[1] - p0[1]), p1[0] - p0[0]); cg.add(me);
          const lip = new THREE.Mesh(new THREE.BoxGeometry(L, .3, .06), M.ceil); lip.position.set((p0[0] + p1[0]) / 2 + ln.n[0] * .28, H - .3, (p0[1] + p1[1]) / 2 + ln.n[1] * .28); lip.rotation.y = me.rotation.y; cg.add(lip);
        });
        if (cg.children.length) { mergeGroup(cg); house.add(cg); ceilings.push(cg); }
        // light spill from the cove: onto the ceiling tray and washing down the wall
        const gg = new THREE.Group(), gc = glowMat('grad', '#ffdcb0', .5), gw = glowMat('grad', '#ffd6a8', .36);
        lines.forEach((ln, k) => {
          const p0 = pts[k], p1 = pts[(k + 1) % pts.length], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); if (L < .6 || L > 200) return;
          const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2, [nx, nz] = ln.n, ang = Math.atan2(-(p1[1] - p0[1]), p1[0] - p0[0]);
          const off = wallFaceOffset(mx - nx * .55, mz - nz * .55); if (off == null) return;
          const cp = new THREE.Mesh(new THREE.PlaneGeometry(L, 2.6), gc), ux = (p1[0] - p0[0]) / L, uz = (p1[1] - p0[1]) / L; cp.rotation.order = 'YXZ'; cp.rotation.set(Math.PI / 2, ang, (-uz * nx + ux * nz) > 0 ? Math.PI : 0);
          cp.position.set(mx + nx * 1.3, H - .015, mz + nz * 1.3); cp.renderOrder = 5; gg.add(cp);
          const wx = mx - nx * (.55 - off), wz = mz - nz * (.55 - off);
          wallCard(gg, 'grad', gw, wx, wz, nx, nz, L, 3.2, H - .34);
        });
        if (gg.children.length) { house.add(gg); ceilings.push(gg); }
      }
      // wall-washer downlights: a scallop of light on each solid wall run
      if (r.type !== 'passage' || true) {
        const { lines: wl } = insetPoly(r.polygon, 0), sg = new THREE.Group(), sm = glowMat('scallop', '#ffe0bb', .55), ring = mat('led');
        wl.forEach(ln => {
          const L = Math.hypot(ln.b[0] - ln.a[0], ln.b[1] - ln.a[1]); if (L < 4) return; const n = Math.max(1, Math.floor(L / 4.2)), step = L / n;
          for (let i = 0; i < n; i++) {
            const s0 = step * (i + .5), px = ln.a[0] + ln.v[0] * s0, pz = ln.a[1] + ln.v[1] * s0;
            if (openingAt(px, pz, .9)) continue; const off = wallFaceOffset(px, pz); if (off == null) continue;
            if ((layout.furniture || []).some(it => { if (!CAT[it.type] || CAT[it.type].nc && !WALLMOUNT.has(it.type)) return false; const f = withDefaults(it); if ((+f.h || 0) + (+f.y || 0) < 5.5) return false; return Math.hypot(it.x - px, it.z - pz) < Math.max(f.w, f.d) / 2 + 1.2; })) continue;
            const fx = px + ln.n[0] * off, fz = pz + ln.n[1] * off; if (!pip([fx + ln.n[0] * .8, fz + ln.n[1] * .8], r.polygon)) continue;
            wallCard(sg, 'scallop', sm, fx, fz, ln.n[0], ln.n[1], 3.4, Math.min(H - .2, 7.5), H - .05);
            add(sg, new THREE.CircleGeometry(.14, 14), ring, fx + ln.n[0] * 1.1, H - .004, fz + ln.n[1] * 1.1, 0, Math.PI / 2);
          }
        });
        if (sg.children.length) { house.add(sg); ceilings.push(sg); }
      }
    }
    if (r.kind !== 'ledge') { const lb = makeLabel(r.name, r.size || ''); lb.position.set(cx, H + 1.5, cz); lb.visible = false; house.add(lb); labels.push(lb); }
  });
  bounds = bb.isEmpty() ? new THREE.Box2(new THREE.Vector2(0, 0), new THREE.Vector2(40, 30)) : bb;
  S.center.set((bounds.min.x + bounds.max.x) / 2, 0, (bounds.min.y + bounds.max.y) / 2);
  const sc = sun.shadow.camera, R = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y) * .75 + 5;
  sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 10; sc.far = 800; sc.updateProjectionMatrix();
  orbit.target.copy(S.center);
  camera.fov = +layout.settings.fieldOfView || 80; camera.updateProjectionMatrix();
}
function buildAll() { buildShell(); buildAllItems(); applyTime(); applyCut(); setCeilings(mode === 'walk'); drawMapBase(); updateMeta(); shadowsDirty(4); }

/* ================= time of day ================= */
const TIMES = {
  golden: { label: 'Golden hour', top: '#3f5f8c', mid: '#f0b98a', bot: '#243f55', fog: '#e6b48b', sea: '#2e5670', sun: '#ffb069', sunI: 3.4, sunPos: [-110, 26, -150], hs: '#ffd9b8', hg: '#8f7a66', hi: .3, amb: .08, lamp: 14, emis: 1, exp: .95, bloom: .12, ground: '#8a7563', win: '#ffd2a8', winI: 2.2 },
  night: { label: 'Night', top: '#050a14', mid: '#16223a', bot: '#04080f', fog: '#131b2b', sea: '#0b1622', sun: '#9fb4d9', sunI: .22, sunPos: [80, 120, -60], hs: '#34445f', hg: '#15120f', hi: .15, amb: .04, lamp: 28, emis: 1.3, exp: 1.05, bloom: .2, ground: '#1c1915', win: '#8aa0c8', winI: .15 },
  day: { label: 'Daytime', top: '#6fa3c7', mid: '#dce8ec', bot: '#2f5e73', fog: '#dce8ec', sea: '#3f7890', sun: '#fff3df', sunI: 2.8, sunPos: [-60, 110, -90], hs: '#eef4f7', hg: '#d6cfc4', hi: .38, amb: .12, lamp: 6, emis: .45, exp: 1.0, bloom: .05, ground: '#b8ab99', win: '#eaf2ff', winI: 3.2 },
};
TIMES.dusk = { label: 'Dusk', top: '#2b3a63', mid: '#f2b48e', bot: '#1b2436', fog: '#b99aa0', sea: '#243a52', sun: '#ff9a62', sunI: 1.1, sunPos: [-140, 8, -150], hs: '#c9a6a0', hg: '#4a3a30', hi: .1, amb: .025, lamp: 12, emis: 1.35, exp: .92, bloom: .2, ground: '#4d3f35', win: '#f0b89a', winI: 1.1, city: .9 };
TIMES.golden.city = .25; TIMES.night.city = 1.3; TIMES.day.city = 0;
const TIME_ORDER = ['dusk', 'golden', 'night', 'day'];
function applyTime() {
  shadowsDirty();
  const t = TIMES[layout.settings.timeOfDay] || TIMES.golden;
  if (grade) { const du = t === TIMES.dusk || t === TIMES.night; grade.uniforms.warm.value = du ? .03 : .01; grade.uniforms.contrast.value = du ? .2 : .17; grade.uniforms.vig.value = du ? .26 : .2; grade.uniforms.sat.value = du ? .96 : 1.02; }
  skyU.top.value.set(t.top); skyU.mid.value.set(t.mid); skyU.bot.value.set(t.bot); skyU.sunCol.value.set(t.sun).multiplyScalar(t === TIMES.night ? .15 : 1);
  scene.fog.color.set(t.fog); seaMat.color.set(t.sea);
  sea.visible = (layout.settings.view || 'sea') === 'sea'; city.visible = layout.settings.view === 'city';
  cityWin.mats.forEach(m => m.emissiveIntensity = t.city ?? .5); if (cityWin.street) cityWin.street.color.set(t.city ? '#ffcf8a' : '#6b6a60');
  sun.color.set(t.sun); sun.intensity = t.sunI; sun.position.copy(S.center).add(V(...t.sunPos)); sun.target.position.copy(S.center);
  skyU.sunDir.value.set(...t.sunPos).normalize();
  hemi.color.set(t.hs); hemi.groundColor.set(t.hg); hemi.intensity = t.hi; amb.intensity = t.amb;
  lamps.forEach(l => l.intensity = t.lamp);
  dayLights.forEach(l => { l.color.set(t.win || '#ffffff'); l.intensity = (t.winI ?? 0) * (photo ? 0 : 1); });
  EMIS.forEach(m => m.emissiveIntensity = m.userData.baseEI * t.emis);
  GLOW.forEach(m => m.opacity = m.userData.baseOp * (t === TIMES.day ? .25 : t === TIMES.golden ? .6 : t === TIMES.dusk ? 1 : 1.15));
  renderer.toneMappingExposure = t.exp; if (bloom) bloom.strength = t.bloom;
  rebuildEnv(t.ground);
  $('btnTime').textContent = t.label;
}
function cycleTime() { const i = TIME_ORDER.indexOf(layout.settings.timeOfDay || 'golden'); layout.settings.timeOfDay = TIME_ORDER[(i + 1) % TIME_ORDER.length]; applyTime(); saveSoon(); }
$('btnTime').onclick = cycleTime;

/* ================= controls ================= */
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI * .49; orbit.minDistance = 12; orbit.maxDistance = 320; orbit.enabled = false;
let mode = 'walk';
const player = { x: 0, z: 0, y: 0, yaw: 0, pitch: -.05, r: .75 };
function placeSpawn() {
  const s = layout.spawn || {}; let [x, z] = s.position || [S.center.x, S.center.z];
  if (!roomAt(x, z)) { const big = [...layout.rooms].filter(r => r.kind === 'room' && r.polygon?.length > 2).sort((a, b) => polyArea(b.polygon) - polyArea(a.polygon))[0]; if (big) [x, z] = centroid(big.polygon); }
  player.x = x; player.z = z; if (s.lookAt) player.yaw = Math.atan2(-(s.lookAt[0] - x), -(s.lookAt[1] - z));
  player.pitch = -.05; player.y = floorY(roomAt(x, z) || { kind: 'room' });
}
const keys = {};
const typing = e => e.target.closest?.('textarea,input,select');
let activeView = '3d';
addEventListener('keydown', e => {
  if (typing(e) || activeView !== '3d') return;
  keys[e.code] = true;
  if (e.code === 'KeyV') setMode(mode === 'walk' ? 'over' : 'walk');
  if (e.code === 'KeyP') { photo ? exitPhoto() : enterPhoto(); return; }
  if (photo) { if (e.code === 'Escape') exitPhoto(); keys[e.code] = false; return; }
  if (e.code === 'KeyT') cycleTime();
  if (e.code === 'KeyM') $('mapPanel').hidden ^= 1;
  if (selected) {
    if (e.code === 'KeyR') { selected.rot = ((selected.rot || 0) + (e.shiftKey ? -15 : 15)) % 360; rebuildItem(selected); renderSel(); }
    if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); deleteSelected(); }
    if (e.code === 'Escape') select(null);
    if (mode === 'over' && e.code.startsWith('Arrow')) { e.preventDefault(); const st = e.shiftKey ? 1 : .25; if (e.code === 'ArrowLeft') selected.x -= st; if (e.code === 'ArrowRight') selected.x += st; if (e.code === 'ArrowUp') selected.z -= st; if (e.code === 'ArrowDown') selected.z += st; rebuildItem(selected); renderSel(); }
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const cv = renderer.domElement, ray = new THREE.Raycaster();
function visibleDeep(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
function ndc(e) { const r = cv.getBoundingClientRect(); return new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); }
function pick(e) {
  ray.setFromCamera(ndc(e), camera);
  const hits = ray.intersectObjects([house, itemsGroup], true).filter(h => visibleDeep(h.object) && !h.object.isSprite);
  const h = hits[0]; if (!h) return null;
  let o = h.object; while (o && !o.userData.item) o = o.parent;
  return { item: o ? o.userData.item : null, point: h.point, object: h.object };
}
let look = null, press = null, dragItem = null;
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), tmpV = new THREE.Vector3();
cv.addEventListener('pointerdown', e => {
  if (photo) return;
  press = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  if (mode === 'over' && selected) {
    const hit = pick(e);
    if (hit && hit.item === selected) { plane.constant = -(+withDefaults(selected).y || 0); ray.ray.intersectPlane(plane, tmpV); dragItem = { id: e.pointerId, ox: selected.x - tmpV.x, oz: selected.z - tmpV.z, moved: false }; orbit.enabled = false; cv.setPointerCapture(e.pointerId); return; }
  }
  if (mode === 'walk') { look = { id: e.pointerId, x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); }
}, true);
cv.addEventListener('pointermove', e => {
  if (dragItem && e.pointerId === dragItem.id) {
    ray.setFromCamera(ndc(e), camera);
    if (ray.ray.intersectPlane(plane, tmpV)) { selected.x = Math.round((tmpV.x + dragItem.ox) * 20) / 20; selected.z = Math.round((tmpV.z + dragItem.oz) * 20) / 20; const g = itemGroups.get(selected.id); if (g) g.position.set(selected.x, g.position.y, selected.z); selBox?.update(); dragItem.moved = true; }
    return;
  }
  if (!look || e.pointerId !== look.id) return;
  const k = e.pointerType === 'touch' ? .006 : .0038;
  player.yaw -= (e.clientX - look.x) * k; player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch + (e.clientY - look.y) * k));
  look.x = e.clientX; look.y = e.clientY;
});
function endPointer(e) {
  if (dragItem && e.pointerId === dragItem.id) { const moved = dragItem.moved; dragItem = null; orbit.enabled = mode === 'over'; if (moved) { rebuildItem(selected); renderSel(); } press = null; return; }
  if (look && e.pointerId === look.id) look = null;
  if (press && e.pointerId === press.id && e.type === 'pointerup' && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6 && performance.now() - press.t < 600) { const hit = pick(e); select(hit?.item || null); }
  press = null;
}
cv.addEventListener('pointerup', endPointer); cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('dblclick', e => { if (mode !== 'over') return; const hit = pick(e); if (hit && !hit.item && hit.object.userData.room && hit.object.userData.room.kind !== 'ledge') { player.x = hit.point.x; player.z = hit.point.z; player.y = floorY(hit.object.userData.room); setMode('walk'); } });
const joy = $('joy'), knob = joy.querySelector('.knob'), jv = { x: 0, y: 0 }; let jid = null;
if (TOUCH) document.body.classList.add('touch');
joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(jid); moveJoy(e); });
joy.addEventListener('pointermove', e => { if (e.pointerId === jid) moveJoy(e); });
const endJoy = e => { if (e.pointerId === jid) { jid = null; jv.x = jv.y = 0; knob.style.transform = ''; } };
joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
function moveJoy(e) { const r = joy.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } jv.x = x; jv.y = y; knob.style.transform = `translate(${x * 36}px,${y * 36}px)`; }
function collide() {
  const py = player.y;
  for (let it = 0; it < 4; it++) for (const c of allCols) {
    if (c.y1 <= py + STEP || c.y0 >= py + BODY) continue;
    const dx = player.x - c.cx, dz = player.z - c.cz, lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c;
    if (Math.abs(lx) > c.hx + player.r || Math.abs(lz) > c.hz + player.r) continue;
    const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz)), ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
    if (d >= player.r) continue;
    let px, pz;
    if (d > 1e-5) { const k = (player.r - d) / d; px = ex * k; pz = ez * k; }
    else { const ox = c.hx - Math.abs(lx), oz = c.hz - Math.abs(lz); if (ox < oz) { px = Math.sign(lx || 1) * (ox + player.r); pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * (oz + player.r); } }
    player.x += px * c.c - pz * c.s; player.z += px * c.s + pz * c.c;
  }
}
function inSurface(s, x, z) {
  const dx = x - s.x, dz = z - s.z;
  if (s.type === 'rect') { const c = Math.cos(s.ang), sn = Math.sin(s.ang), lx = dx * c + dz * sn, lz = -dx * sn + dz * c; return Math.abs(lx) <= s.hx + .4 && Math.abs(lz) <= s.hz + .4; }
  const r = Math.hypot(dx, dz); if (r < s.r0 || r > s.r1) return false;
  const pad = .12, span = s.a1 - s.a0 + 2 * pad; let a = Math.atan2(dz, dx) - s.a0 + pad; a = ((a % 6.2832) + 6.2832) % 6.2832; return a <= span;
}
function groundAt(x, z, py) { const r = roomAt(x, z); let y = r ? floorY(r) : -1e9; for (const s of surfaces) if (s.y <= py + STEP && s.y > y && inSurface(s, x, z)) y = s.y; return { y, room: r }; }
function move(f, s, dt, fast) {
  const l = Math.hypot(f, s); if (l > 1) { f /= l; s /= l; }
  const ws = +layout.settings.walkSpeed || 4.2, sp = (fast ? ws * 2 : ws) * dt, fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), ox = player.x, oz = player.z;
  player.x += (fx * f - fz * s) * sp; player.z += (fz * f + fx * s) * sp;
  collide();
  let gr = groundAt(player.x, player.z, player.y);
  if (!gr.room || gr.room.kind === 'ledge' || gr.y < player.y - 3) { player.x = ox; player.z = oz; gr = groundAt(ox, oz, player.y); }
  player.y += (gr.y - player.y) * Math.min(1, dt * (gr.y > player.y ? 14 : 9));
  return gr;
}

/* ================= modes ================= */
const btnWalk = $('btnWalk'), btnOver = $('btnOver'), btnCut = $('btnCut');
let cut = false;
function setCeilings(v) { ceilings.forEach(c => c.visible = v); labels.forEach(l => l.visible = !v); shadowsDirty(); }
function applyCut() { if (wallGroup) wallGroup.scale.y = (cut && mode === 'over') ? .42 : 1; shadowsDirty(); }
function setMode(m) {
  mode = m; btnWalk.setAttribute('aria-pressed', m === 'walk'); btnOver.setAttribute('aria-pressed', m === 'over');
  btnCut.hidden = m !== 'over'; orbit.enabled = m === 'over'; setCeilings(m === 'walk'); applyCut();
  if (m === 'over' && bounds) { const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y); camera.position.set(S.center.x + span * .05, span * .75 + 10, S.center.z + span * .55 + 8); orbit.target.copy(S.center); orbit.update(); }
}
btnWalk.onclick = () => setMode('walk'); btnOver.onclick = () => setMode('over');
btnCut.onclick = () => { cut = !cut; btnCut.setAttribute('aria-pressed', cut); applyCut(); };

/* ================= minimap ================= */
const mm = $('minimap'), mg = mm.getContext('2d'); let mmT = null, mapBase = null, mapT;
const drawMapBaseSoon = () => { clearTimeout(mapT); mapT = setTimeout(drawMapBase, 150); };
function drawMapBase() {
  if (!bounds) return;
  const dpr = Math.min(devicePixelRatio, 2), cssW = stage.clientWidth < 600 ? 170 : 240, pad = 6, bw = Math.max(1, bounds.max.x - bounds.min.x), bh = Math.max(1, bounds.max.y - bounds.min.y);
  let s = (cssW - pad * 2) / bw; if (bh * s > 190) s = 190 / bh;
  const W = Math.round(bw * s + pad * 2), Hh = Math.round(bh * s + pad * 2);
  mm.style.width = W + 'px'; mm.style.height = Hh + 'px'; mm.width = W * dpr; mm.height = Hh * dpr;
  mmT = { s: s * dpr, ox: pad * dpr - bounds.min.x * s * dpr, oz: pad * dpr - bounds.min.y * s * dpr, dpr };
  const off = document.createElement('canvas'); off.width = mm.width; off.height = mm.height; const g = off.getContext('2d'), P = ([x, z]) => [x * mmT.s + mmT.ox, z * mmT.s + mmT.oz];
  for (const r of layout.rooms) { if (!r.polygon?.length) continue; g.beginPath(); r.polygon.forEach((p, i) => { const [a, b] = P(p); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); g.fillStyle = r.kind === 'room' ? 'rgba(236,222,200,.16)' : r.kind === 'outdoor' ? 'rgba(91,240,209,.14)' : 'rgba(236,222,200,.05)'; g.fill(); }
  g.fillStyle = 'rgba(91,240,209,.42)';
  for (const it of layout.furniture) {
    const f = withDefaults(it); if (WALLMOUNT.has(it.type) || ['rug', 'pendants', 'linear-light', 'hood', 'vase', 'lamp-table'].includes(it.type)) continue;
    g.save(); const [a, b] = P([it.x, it.z]); g.translate(a, b); g.rotate(-(it.rot || 0) * D2R);
    if (it.type === 'stair-curved') { g.beginPath(); g.arc(0, 0, f.rOut * mmT.s, f.a0 * D2R, f.a1 * D2R, f.a1 < f.a0); g.lineTo(0, 0); g.fill(); } else g.fillRect(-f.w / 2 * mmT.s, -f.d / 2 * mmT.s, f.w * mmT.s, f.d * mmT.s);
    g.restore();
  }
  g.strokeStyle = 'rgba(243,237,228,.9)';
  for (const w of layout.walls) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (L < .01) continue; const ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L, segs = []; let cur = 0;
    [...(w.openings || [])].sort((p, q) => p.start - q.start).forEach(o => { segs.push([cur, o.start, 1]); segs.push([o.start, o.end, o.type === 'window' ? .35 : 0]); cur = o.end; }); segs.push([cur, L, 1]);
    for (const [a, b, k] of segs) { if (!k || b <= a) continue; g.globalAlpha = k; g.lineWidth = Math.max(1.2 * mmT.dpr, w.thickness * mmT.s); g.beginPath(); g.moveTo(...P([w.a[0] + ux * a, w.a[1] + uz * a])); g.lineTo(...P([w.a[0] + ux * b, w.a[1] + uz * b])); g.stroke(); }
    g.globalAlpha = 1;
  }
  mapBase = off; mapKey = '';
}
let mapKey = '';
function drawMap() {
  if (!mapBase || !mmT) return;
  const key = Math.round(player.x * 12) + ',' + Math.round(player.z * 12) + ',' + Math.round(player.yaw * 50); if (key === mapKey) return; mapKey = key;   // only when the visitor has moved
  mg.clearRect(0, 0, mm.width, mm.height); mg.drawImage(mapBase, 0, 0);
  const x = player.x * mmT.s + mmT.ox, z = player.z * mmT.s + mmT.oz, d = mmT.dpr, a = Math.atan2(-Math.cos(player.yaw), -Math.sin(player.yaw));
  mg.fillStyle = 'rgba(91,240,209,.4)'; mg.beginPath(); mg.moveTo(x, z); mg.arc(x, z, 26 * d, a - .55, a + .55); mg.closePath(); mg.fill();
  mg.fillStyle = '#5BF0D1'; mg.beginPath(); mg.arc(x, z, 4 * d, 0, 7); mg.fill();
}
mm.addEventListener('click', e => {
  if (!mmT) return; const r = mm.getBoundingClientRect(), x = ((e.clientX - r.left) * mmT.dpr - mmT.ox) / mmT.s, z = ((e.clientY - r.top) * mmT.dpr - mmT.oz) / mmT.s, rm = roomAt(x, z);
  if (!rm || rm.kind === 'ledge') return; player.x = x; player.z = z; player.y = floorY(rm); if (mode !== 'walk') setMode('walk');
});

/* ================= selection & item editor ================= */
let selected = null, selBox = null;
const selEl = $('sel');
function updateSelBox() { if (selBox) { scene.remove(selBox); selBox.geometry.dispose(); selBox = null; } const g = selected && itemGroups.get(selected.id); if (g) { selBox = new THREE.BoxHelper(g, 0xe0b57a); selBox.material.depthTest = false; selBox.renderOrder = 20; scene.add(selBox); } }
function select(it) { selected = it; updateSelBox(); selEl.hidden = !it; if (it) renderSel(); }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function finishField(key, label, val) {
  const isHex = String(val || '').startsWith('#'), known = FINISHES.some(([v]) => v === val);
  return `<div class="fld full"><span>${label}</span><div class="inrow"><select id="sel-${key}" aria-label="${label}">${FINISHES.map(([v, l]) => `<option value="${v}"${v === val ? ' selected' : ''}>${l}</option>`).join('')}${!known && !isHex && val ? `<option value="${esc(val)}" selected>${esc(val)}</option>` : ''}<option value="#custom"${isHex ? ' selected' : ''}>Custom colour</option></select><input type="color" id="sel-${key}-c" value="${isHex ? val : '#b8a48a'}" aria-label="${label} colour"${isHex ? '' : ' hidden'}></div></div>`;
}
function renderSel() {
  const it = selected; if (!it) return; const def = CAT[it.type] || {}, f = withDefaults(it);
  const num = (k, l, step = .25) => `<div class="fld"><span>${l}</span><input type="number" id="sel-${k}" step="${step}" value="${+(+f[k] || 0).toFixed(2)}"></div>`;
  let h = `<div class="sel-head"><div><div class="k">${esc(def.label || it.type)}${it.room ? ' · ' + esc(it.room) : ''}</div><div class="n">${esc(it.name || def.label)}</div></div><button id="sel-close">Done</button></div><div class="grid2">`;
  h += num('x', 'Across (ft)') + num('z', 'Down the plan (ft)');
  h += `<div class="fld full"><span>Rotation (°)</span><div class="inrow"><button id="sel-rl" aria-label="Rotate left">⟲ 15</button><input type="number" id="sel-rot" step="5" value="${+(it.rot || 0).toFixed(1)}"><button id="sel-rr" aria-label="Rotate right">15 ⟳</button></div></div>`;
  if (!def.noSize) h += num('w', 'Width') + num('d', 'Depth') + num('h', 'Height') + num('y', 'Lift off floor');
  if ('finish' in f) h += finishField('finish', 'Main finish', f.finish);
  if ('accent' in f) h += finishField('accent', 'Accent', f.accent);
  for (const [k, l, t, lo, hi] of def.extras || []) h += t === 'bool' ? `<label class="chk full"><input type="checkbox" id="sel-${k}"${f[k] ? ' checked' : ''}> ${l}</label>` : `<div class="fld"><span>${l}</span><input type="number" id="sel-${k}" min="${lo}" max="${hi}" step="${k === 'rOut' ? .25 : 1}" value="${f[k]}"></div>`;
  h += `</div><div class="sel-actions"><button id="sel-dup">Duplicate</button><button id="sel-del" class="danger">Delete</button></div>`;
  selEl.innerHTML = h;
  const q = id => selEl.querySelector('#sel-' + id);
  q('close').onclick = () => select(null);
  ['x', 'z', 'rot', 'w', 'd', 'h', 'y'].forEach(k => { const el = q(k); if (el) el.addEventListener('change', () => { const v = parseFloat(el.value); if (!isFinite(v)) return; it[k] = v; rebuildItem(it); }); });
  q('rl').onclick = () => { it.rot = ((it.rot || 0) + 15) % 360; rebuildItem(it); q('rot').value = it.rot; };
  q('rr').onclick = () => { it.rot = ((it.rot || 0) - 15) % 360; rebuildItem(it); q('rot').value = it.rot; };
  for (const key of ['finish', 'accent']) {
    const s = q(key), c = q(key + '-c'); if (!s) continue;
    s.addEventListener('change', () => { if (s.value === '#custom') { c.hidden = false; it[key] = c.value; } else { c.hidden = true; it[key] = s.value; } rebuildItem(it); });
    c.addEventListener('input', () => { it[key] = c.value; rebuildItem(it); });
  }
  for (const [k, , t] of def.extras || []) { const el = q(k); el.addEventListener('change', () => { it[k] = t === 'bool' ? el.checked : parseFloat(el.value); rebuildItem(it); }); }
  q('dup').onclick = () => { const c = structuredClone(it); c.id = newId(); c.x += 1.5; c.z += 1.5; layout.furniture.push(c); rebuildItem(c); select(c); };
  q('del').onclick = deleteSelected;
}
function deleteSelected() { if (!selected) return; const it = selected; removeItemsWhere(x => x === it); select(null); saveSoon(); }
function addItem(type) {
  const def = CAT[type]; let x, z, y = 0;
  if (mode === 'walk') { x = player.x - Math.sin(player.yaw) * 4; z = player.z - Math.cos(player.yaw) * 4; y = player.y > 1 ? player.y : 0; } else { x = orbit.target.x; z = orbit.target.z; }
  const rm = roomAt(x, z);
  const it = { id: newId(), type, name: def.label, room: rm?.name || null, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, rot: 0, ...structuredClone(def.d) };
  if (y) it.y = (it.y || 0) + y;
  layout.furniture.push(it); rebuildItem(it); select(it); drawer.classList.remove('open');
}

/* ================= house drawer ================= */
const drawer = $('drawer'), msg = $('msg');
const bodies = { add: $('addBody'), quick: $('quickBody'), json: $('jsonBody') }, dtabs = { add: $('tabAdd'), quick: $('tabQuick'), json: $('tabJson') };
const jsonText = $('jsonText'), btnApply = $('btnApply');
function openTab(name) {
  for (const k in dtabs) { dtabs[k].setAttribute('aria-pressed', k === name); bodies[k].hidden = k !== name; }
  btnApply.hidden = name !== 'json'; $('drawerTitle').textContent = name === 'add' ? 'Add furniture' : 'Edit house';
  if (name === 'json') jsonText.value = JSON.stringify(layout, null, 1);
  if (name === 'quick') renderQuick(); if (name === 'add') renderAdd();
  drawer.classList.add('open');
}
$('btnEdit').onclick = () => openTab('quick'); $('btnAdd').onclick = () => openTab('add'); $('btnClose').onclick = () => drawer.classList.remove('open');
for (const k in dtabs) dtabs[k].onclick = () => openTab(k);
function say(t, err) { msg.textContent = t; msg.classList.toggle('err', !!err); }
function renderAdd() {
  let h = `<p style="font-size:13px;color:var(--muted);line-height:1.5;margin:6px 0 0">New pieces appear a few steps in front of you, or at the centre of the Overview. Drag them in Overview or type exact positions.</p>`;
  for (const c of CAT_ORDER) { const list = Object.entries(CAT).filter(([, d]) => d.cat === c); if (!list.length) continue; h += `<div class="sec">${c}</div><div class="cat">${list.map(([k, d]) => `<button data-type="${k}">${esc(d.label)}</button>`).join('')}</div>`; }
  bodies.add.innerHTML = h; bodies.add.querySelectorAll('[data-type]').forEach(b => b.onclick = () => addItem(b.dataset.type));
}
let shellT; const rebuildShellSoon = () => { clearTimeout(shellT); shellT = setTimeout(() => { buildAll(); saveSoon(); }, 150); };
function renderQuick() {
  const s = layout.settings, fins = ['stone-large', 'wood', 'tile-2ft', 'tile-1ft', 'terrazzo', 'stone', 'plain'];
  bodies.quick.innerHTML = `
    <div class="sec">Whole house</div>
    <div class="row"><label for="q-h">Ceiling height<small>feet, floor to ceiling</small></label><input id="q-h" type="number" step="0.25" min="7" max="20" value="${s.ceilingHeight}"></div>
    <div class="row"><label for="q-wall">Wall paint</label><input id="q-wall" type="color" value="${s.wallColor}"></div>
    <div class="row"><label for="q-ceil">Ceiling paint</label><input id="q-ceil" type="color" value="${s.ceilingColor}"></div>
    <div class="sec">How it feels to walk</div>
    <div class="row"><label for="q-fov">Field of view<small>degrees</small></label><input id="q-fov" type="number" step="1" min="50" max="100" value="${s.fieldOfView ?? 80}"></div>
    <div class="row"><label for="q-eye">Eye height<small>feet</small></label><input id="q-eye" type="number" step="0.1" min="3.5" max="6.5" value="${s.eyeHeight ?? 5.1}"></div>
    <div class="row"><label for="q-spd">Walking speed<small>feet per second</small></label><input id="q-spd" type="number" step="0.2" min="1.5" max="12" value="${s.walkSpeed ?? 4.2}"></div>
    <div class="sec">Floors by room</div>
    ${layout.rooms.map((r, i) => r.kind === 'ledge' ? '' : `<div class="row"><label for="q-f${i}">${esc(r.name)}<small>${esc(r.size || r.type || r.kind)}</small></label><span class="swatch"><select id="q-s${i}" aria-label="${esc(r.name)} floor">${fins.map(f => `<option${f === r.finish ? ' selected' : ''}>${f}</option>`).join('')}</select><input id="q-f${i}" type="color" value="${r.floor}"></span></div>`).join('')}`;
  const on = (id, fn) => bodies.quick.querySelector('#' + id).addEventListener('input', e => { fn(e.target.value); rebuildShellSoon(); say('Saved to this project.'); });
  const num = (k, lo, hi) => v => { const n = parseFloat(v); if (n >= lo && n <= hi) s[k] = n; };
  on('q-h', num('ceilingHeight', 7, 20)); on('q-wall', v => s.wallColor = v); on('q-ceil', v => s.ceilingColor = v);
  on('q-fov', num('fieldOfView', 50, 100)); on('q-eye', num('eyeHeight', 3.5, 6.5)); on('q-spd', num('walkSpeed', 1.5, 12));
  layout.rooms.forEach((r, i) => { if (r.kind === 'ledge') return; on('q-f' + i, v => r.floor = v); on('q-s' + i, v => r.finish = v); });
}
btnApply.onclick = () => {
  try {
    const next = JSON.parse(jsonText.value);
    if (!Array.isArray(next.walls) || !Array.isArray(next.rooms) || !next.settings) throw new Error('The layout needs "settings", "walls" and "rooms".');
    next.furniture ||= []; const prev = layout; project.layout = layout = next; select(null);
    try { buildAll(); } catch (e) { project.layout = layout = prev; buildAll(); throw e; }
    saveSoon(); say('Applied.');
  } catch (e) { say('Could not apply: ' + e.message, true); }
};
$('btnCopy').onclick = async () => { const txt = JSON.stringify(layout, null, 1); try { await navigator.clipboard.writeText(txt); say('Layout copied.'); } catch { openTab('json'); jsonText.focus(); jsonText.select(); say('Copy is blocked here. The layout is selected, press Ctrl/Cmd + C.'); } };


/* ================= photo mode (progressive path tracing) ================= */
let photo = false, ptReady = false, PT = null, ptMod = null, ptEnv = null, ptSaved = null;
const photoBar = $('photoBar'), photoCt = $('photoCt');
const nextFrames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
async function enterPhoto() {
  if (photo || !layout.walls.length || activeView !== '3d') return;
  select(null); drawer.classList.remove('open'); for (const k in keys) keys[k] = false; look = null;
  photo = true; document.body.classList.add('photo'); photoBar.hidden = false; photoCt.textContent = 'Preparing the scene…'; orbit.enabled = false;
  try {
    ptMod ||= await import('three-gpu-pathtracer');
    await nextFrames(); if (!photo) return;
    if (!PT) {
      PT = new ptMod.WebGLPathTracer(renderer);
      PT.tiles.set(2, 2); PT.renderDelay = 0; PT.minSamples = 1; PT.fadeDuration = 0; PT.bounces = 6; PT.transmissiveBounces = 4; PT.filterGlossyFactor = .5; PT.textureSize.set(512, 512);
      // edge-aware denoise that relaxes as samples accumulate, so early frames already read cleanly
      const dq = new FullScreenQuad(new ptMod.DenoiseMaterial({ map: null, blending: THREE.NoBlending, premultipliedAlpha: renderer.getContextAttributes().premultipliedAlpha }));
      PT.renderToCanvasCallback = (target, r, quad) => {
        const n = PT.samples, ac = r.autoClear; r.autoClear = false;
        if (n < 400) { const m = dq.material; m.map = target.texture; m.sigma = n < 8 ? 7 : n < 32 ? 5 : n < 128 ? 3.5 : 2; m.threshold = n < 8 ? .25 : n < 32 ? .15 : n < 128 ? .08 : .04; m.kSigma = 1; dq.render(r); }
        else quad.render(r);
        r.autoClear = ac;
      };
    }
    PT.renderScale = effQ() === 'high' ? 1 : effQ() === 'balanced' ? .75 : .5;
    const t = TIMES[layout.settings.timeOfDay] || TIMES.golden;
    const top = new THREE.Color(t.top), mid = new THREE.Color(t.mid), bot = new THREE.Color(t.bot), sc = new THREE.Color(t.sun), sd = V(...t.sunPos).normalize(), d = new THREE.Vector3();
    const k = t === TIMES.night ? .6 : 1;
    ptEnv?.dispose(); ptEnv = new ptMod.ProceduralEquirectTexture(512, 256);
    ptEnv.generationCallback = (polar, uv, coord, color) => {
      d.setFromSpherical(polar); const h = d.y;
      if (h > 0) color.lerpColors(mid, top, Math.pow(h, .5)); else color.lerpColors(mid, bot, Math.pow(Math.min(1, -h), .3));
      const s = Math.max(d.dot(sd), 0), g = Math.pow(s, 40) * .18 * (t === TIMES.night ? 0 : 1); color.r += sc.r * g; color.g += sc.g * g; color.b += sc.b * g; color.multiplyScalar(k);
    };
    ptEnv.update();
    ptSaved = { env: scene.environment, bg: scene.background, fog: scene.fog };
    scene.environment = ptEnv; scene.background = ptEnv; scene.fog = null; sky.visible = false;
    labels.forEach(l => l.visible = false); if (selBox) selBox.visible = false; dayLights.forEach(l => l.intensity = 0);
    photoCt.textContent = 'Building light paths…'; await nextFrames(); if (!photo) return;
    camera.updateMatrixWorld(); PT.setScene(scene, camera); ptReady = true;
  } catch (e) { console.error(e); flash('Photo mode could not start on this device: ' + (e?.message || e), true); exitPhoto(); }
}
function exitPhoto() {
  if (!photo) return; photo = false; ptReady = false; document.body.classList.remove('photo'); photoBar.hidden = true;
  if (ptSaved) { scene.environment = ptSaved.env; scene.background = ptSaved.bg ?? null; scene.fog = ptSaved.fog; ptSaved = null; }
  sky.visible = true; setCeilings(mode === 'walk'); if (selBox) selBox.visible = true; orbit.enabled = mode === 'over'; applyTime(); PT?.reset();
}
$('btnPhoto').onclick = () => photo ? exitPhoto() : enterPhoto();
$('photoExit').onclick = exitPhoto;
$('photoSave').onclick = async () => {
  if (photo && ptReady) PT.renderSample();   // draw, then read the canvas straight away
  const blob = await new Promise(r => renderer.domElement.toBlob(r, 'image/png'));
  if (!blob) return flash('The image could not be captured.', true);
  const room = roomName.textContent.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'view';
  saveFile(`${slug(project.name)}-${room}.png`, blob);
};

/* ================= loop ================= */
function resize() {
  const w = Math.max(2, stage.clientWidth), h = Math.max(2, stage.clientHeight);
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) { composer.setSize(w, h); gtao?.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()); }
  drawMapBase();
}
new ResizeObserver(() => resize()).observe(stage);
const clock = new THREE.Clock(); let lastKey = '';
const roomName = $('roomName'), roomSize = $('roomSize');
function updateMeta() {
  const area = layout.rooms.filter(r => r.kind === 'room' && r.polygon?.length > 2).reduce((a, r) => a + polyArea(r.polygon), 0);
  $('metaLine').textContent = `${layout.rooms.filter(r => r.kind === 'room').length} rooms · ${layout.furniture.length} pieces · ≈${Math.round(area).toLocaleString()} sq ft`;
  lastKey = '';
}
function tick() {
  requestAnimationFrame(tick);
  if (activeView !== '3d') { clock.getDelta(); return; }
  const dt = Math.min(clock.getDelta(), .05);
  if (photo) { if (ptReady) { PT.renderSample(); const n = Math.floor(PT.samples); photoCt.textContent = `${n} sample${n === 1 ? '' : 's'}${n < 48 ? ' · refining' : n < 200 ? ' · looking good' : ' · final quality'}`; } return; }
  if (grade) grade.uniforms.time.value = performance.now() / 1000;
  if (mode === 'walk') {
    const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - jv.y, s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + jv.x;
    if (keys.ArrowLeft) player.yaw += 1.8 * dt; if (keys.ArrowRight) player.yaw -= 1.8 * dt;
    const driven = guideStep(dt), gr = driven ? move(0, 0, dt, false) : move(f, s, dt, keys.ShiftLeft || keys.ShiftRight);
    const eye = Math.min(PRES.on ? 5.75 : +layout.settings.eyeHeight || 5.1, H - player.y - .45);
    camera.position.set(player.x, player.y + eye, player.z);
    camera.rotation.order = 'YXZ'; camera.rotation.set(-player.pitch, player.yaw, 0);
    const cur = gr.room, key = (cur?.name || '') + (player.y > 3 ? 'L' : '');
    if (key !== lastKey) { lastKey = key; roomName.textContent = cur ? cur.name + (player.y > 3 ? ' · loft' : '') : 'Outside'; roomSize.textContent = cur?.size || ''; }
  } else {
    orbit.update();
    if (lastKey !== 'over') { lastKey = 'over'; roomName.textContent = 'Whole house'; roomSize.textContent = $('metaLine').textContent.split(' · ').slice(-1)[0]; }
  }
  drawMap(); SITE?.frame?.();
  // shadows: on a change, a few times a second as a safety net, and every frame while Mira's figure is moving in the scene
  if (shadowTTL > 0 || ++shadowTick % 24 === 0 || PRES.fig?.visible) { renderer.shadowMap.needsUpdate = true; if (shadowTTL > 0) shadowTTL--; }
  if (composer) composer.render(); else renderer.render(scene, camera);
  govern();
}
// keeps the walkthrough smooth: when most frames over a few seconds are slow, auto quality steps down one level
let shadowTick = 0, gT = performance.now(), gN = 0, gSlow = 0, gHold = 240, gTold = false;
function govern() {
  const now = performance.now(), ms = now - gT; gT = now;
  if (quality !== 'auto' || autoStep >= 3 || document.hidden || running || editing) { gN = gSlow = 0; return; }
  if (ms > 400) { gHold = 45; return; }            // a rebuild or a tab switch, not the frame rate
  if (gHold > 0) { gHold--; return; }
  gN++; if (ms > 29) gSlow++;
  if (gN < 150) return;
  if (gSlow > 95) {
    const before = effQ(); autoStep++; try { localStorage.setItem('mirage-gfx-step', String(autoStep)); } catch { }
    setupPost(); if (effQ() !== before) buildAll(); resize(); gHold = 300;
    if (!gTold) { gTold = true; flash('Switched to smoother graphics for this device. You can choose High quality at the top if you prefer.'); }
  }
  gN = gSlow = 0;
}
