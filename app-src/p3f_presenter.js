/* ================= Present mode: Mira walks the home with you, in person ================= */
// A procedural presenter (no downloaded assets): tailored figure, walk cycle, gestures, head tracking.
// She finds her way through doorways on a nav grid; the camera follows a few steps behind her like a
// client on a site visit, then settles in front of each room's focal piece while she presents it.
const PRES = { on: false, fig: null, J: null, x: 0, z: 0, y: 0, yaw: 0, path: null, pi: 0, speed: 3.3, phase: 0, walkW: 0, talking: false, gest: 0, gestSide: 1, gestTo: null, wave: 0,
  trail: [], follow: false, grid: null, gridSig: '', last: 0, headYaw: 0, headPitch: 0, turnTo: null, paused: false, room: '' };

/* ---------- the figure ---------- */
function buildPresenter() {
  const g = new THREE.Group(); g.name = 'presenter';
  const skin = std({ color: '#d4a07f', roughness: .6, envMapIntensity: .5 }), blazer = std({ color: '#ece3d4', roughness: .82, envMapIntensity: .45, side: THREE.DoubleSide }),
    top = std({ color: '#3a2f2a', roughness: .75, side: THREE.DoubleSide }), trousers = std({ color: '#26231f', roughness: .8, side: THREE.DoubleSide }), shoe = std({ color: '#141110', roughness: .3, metalness: .1 }),
    hair = std({ color: '#1f1612', roughness: .48, envMapIntensity: .7 }), gold = std({ color: '#cfa85e', metalness: 1, roughness: .25 }), dark = std({ color: '#2a1d18', roughness: .35 });
  const piv = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  const mesh = (parent, geo, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.scale.set(sx, sy, sz); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };
  const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(.001, r), y)), seg);
  // a limb hanging from its pivot: radii along its length, closed at both ends
  const limb = (parent, rs, len, m, sz = 1) => { const n = rs.length - 1, pts = [[.001, .02]]; rs.forEach((r, i) => pts.push([r, -len * i / n])); pts.push([.001, -len - .02]); return mesh(parent, lathe(pts, 20), m, 0, 0, 0, 1, 1, sz); };
  const J = {};
  J.hips = piv(g, 0, 2.95, 0);
  mesh(J.hips, lathe([[.001, -.36], [.3, -.33], [.41, -.2], [.43, -.05], [.4, .1], [.001, .14]]), trousers, 0, 0, 0, 1, 1, .6);
  J.spine = piv(J.hips, 0, .12, 0);
  // hip-length tailored blazer: flared hem, nipped waist, soft shoulder
  mesh(J.spine, lathe([[.53, -.5], [.5, -.3], [.44, -.02], [.4, .3], [.45, .62], [.5, .92], [.52, 1.14], [.5, 1.3], [.42, 1.42], [.27, 1.5], [.001, 1.53]]), blazer, 0, 0, 0, .98, 1, .64);
  // black top in the open V, chain, lapels, one button
  const vs = new THREE.Shape(); vs.moveTo(-.13, 0); vs.lineTo(.13, 0); vs.lineTo(0, -.5); vs.closePath();
  const v = mesh(J.spine, new THREE.ShapeGeometry(vs), top, 0, 1.43, .3); v.rotation.x = -.32;
  mesh(J.spine, new THREE.SphereGeometry(.12, 16, 10), skin, 0, 1.43, .12, 1.2, .5, .9);
  const chain = mesh(J.spine, new THREE.TorusGeometry(.14, .007, 5, 28, Math.PI), gold, 0, 1.38, .19, 1, 1.35, 1); chain.rotation.set(Math.PI / 2 + .35, 0, Math.PI);
  for (const sx of [-1, 1]) { const l = mesh(J.spine, new THREE.BoxGeometry(.05, .72, .025), blazer, sx * .13, 1.05, .318); l.rotation.z = -sx * .2; l.rotation.x = -.1; }
  mesh(J.spine, new THREE.SphereGeometry(.026, 8, 6), dark, 0, .5, .265);
  J.neck = piv(J.spine, 0, 1.44, .03);
  mesh(J.neck, new THREE.CylinderGeometry(.1, .115, .3, 16), skin, 0, .1, 0);
  J.head = piv(J.neck, 0, .22, .0);
  const head = new THREE.Group(); head.scale.setScalar(1.07); J.head.add(head);
  mesh(head, new THREE.SphereGeometry(.3, 36, 28), skin, 0, .3, .02, .8, 1, .9);
  mesh(head, new THREE.SphereGeometry(.19, 24, 16), skin, 0, .15, .07, .8, .85, .95);          // jaw & chin
  mesh(head, new THREE.SphereGeometry(.04, 12, 8), skin, 0, .24, .29, .75, 1.3, 1);           // nose
  for (const sx of [-1, 1]) {
    mesh(head, new THREE.SphereGeometry(.02, 10, 8), dark, sx * .09, .305, .262, 1.25, .8, .45);   // eyes
    const br = mesh(head, new THREE.CapsuleGeometry(.01, .085, 3, 6), hair, sx * .097, .372, .258); br.rotation.z = Math.PI / 2 - sx * .16;
    mesh(head, new THREE.SphereGeometry(.017, 8, 6), gold, sx * .243, .2, .02);                 // earrings
  }
  const lip = mesh(head, new THREE.TorusGeometry(.055, .013, 6, 16, Math.PI * .7), std({ color: '#a4615a', roughness: .45 }), 0, .185, .245, 1, .75, .6); lip.rotation.z = Math.PI + Math.PI * .15;   // a soft smile
  // hair: a shell set back from the face (the overlap makes a natural hairline), a side part and a low bun
  mesh(head, new THREE.SphereGeometry(.315, 36, 28), hair, 0, .355, -.055, .86, 1, .96);
  const part = mesh(head, new THREE.SphereGeometry(.2, 20, 14), hair, .07, .5, .1, 1.15, .42, .9); part.rotation.z = -.2;
  for (const sx of [-1, 1]) mesh(head, new THREE.SphereGeometry(.13, 16, 12), hair, sx * .2, .2, -.08, .55, 1.25, .95);
  mesh(head, new THREE.SphereGeometry(.14, 20, 16), hair, 0, .2, -.32, 1.1, .9, .85);
  for (const side of [-1, 1]) {
    const k = side < 0 ? 'R' : 'L';   // she faces +z, so her right is -x
    // wide-leg trousers
    J['thigh' + k] = piv(J.hips, side * .22, -.1, 0); limb(J['thigh' + k], [.2, .19, .17, .16], 1.4, trousers);
    J['shin' + k] = piv(J['thigh' + k], 0, -1.4, 0); limb(J['shin' + k], [.16, .165, .18, .2], 1.26, trousers);
    J['foot' + k] = piv(J['shin' + k], 0, -1.36, 0);
    mesh(J['foot' + k], new THREE.CapsuleGeometry(.07, .34, 4, 12), shoe, 0, -.02, .15, 1, .75, 1).rotation.x = Math.PI / 2;
    mesh(J['foot' + k], new THREE.CylinderGeometry(.028, .022, .12, 8), shoe, 0, -.05, -.06);
    // arms in blazer sleeves, a sliver of wrist, hands
    J['sh' + k] = piv(J.spine, side * .42, 1.27, 0);
    mesh(J['sh' + k], new THREE.SphereGeometry(.135, 16, 12), blazer, -side * .03, -.06, 0, 1, 1, 1);
    limb(J['sh' + k], [.14, .13, .12, .11], .98, blazer);
    J['el' + k] = piv(J['sh' + k], 0, -.98, 0); limb(J['el' + k], [.11, .1, .095, .092], .8, blazer);
    mesh(J['el' + k], new THREE.CylinderGeometry(.066, .058, .14, 14), skin, 0, -.84, 0);
    J['hand' + k] = piv(J['el' + k], 0, -.9, 0);
    mesh(J['hand' + k], new THREE.SphereGeometry(.075, 14, 10), skin, 0, -.05, 0, .7, 1, .45);
    mesh(J['hand' + k], new THREE.CapsuleGeometry(.045, .12, 4, 8), skin, 0, -.16, .005, 1.25, 1, .45);   // fingers together
    const th = mesh(J['hand' + k], new THREE.CapsuleGeometry(.02, .08, 3, 6), skin, -side * .05, -.07, .04); th.rotation.z = side * .45;
    if (side > 0) mesh(J['el' + k], new THREE.TorusGeometry(.075, .012, 6, 20), gold, 0, -.84, 0).rotation.x = Math.PI / 2;   // bangle
  }
  g.traverse(o => { if (o.isMesh) o.userData.keep = true; });
  return { g, J };
}

/* ---------- animation ---------- */
function animatePresenter(dt, moving) {
  const J = PRES.J; if (!J) return;
  PRES.walkW += ((moving ? 1 : 0) - PRES.walkW) * Math.min(1, dt * 5);
  const w = PRES.walkW, t = performance.now() / 1000;
  if (moving) PRES.phase += dt * Math.PI * 2 * PRES.speed / 3.9;
  const p = PRES.phase, s = Math.sin(p), c = Math.cos(p);
  const knee = ph => .08 + .9 * Math.pow(Math.max(0, Math.cos(ph)), 1.6);
  const idleSway = Math.sin(t * .9) * .025;
  // legs (forward swing is -x rotation)
  J.thighL.rotation.x = -.4 * s * w; J.thighR.rotation.x = .4 * s * w;
  J.shinL.rotation.x = knee(p) * w + .02; J.shinR.rotation.x = knee(p + Math.PI) * w + .02;
  J.footL.rotation.x = -(J.thighL.rotation.x + J.shinL.rotation.x) * .55; J.footR.rotation.x = -(J.thighR.rotation.x + J.shinR.rotation.x) * .55;
  J.thighL.rotation.z = -.02 - idleSway * (1 - w); J.thighR.rotation.z = .02 - idleSway * (1 - w);
  J.hips.position.y = 2.95 - .07 * s * s * w - .015 * (1 - w); J.hips.position.x = idleSway * .6 * (1 - w) + .03 * c * w;
  J.hips.rotation.y = .11 * s * w; J.hips.rotation.z = .035 * c * w + idleSway * (1 - w);
  J.spine.rotation.y = -.16 * s * w; J.spine.rotation.z = -J.hips.rotation.z * .8; J.spine.rotation.x = .04 * w + Math.sin(t * 1.6) * .012 * (1 - w);
  // arms: natural swing, then gestures layered on top
  const sw = .34 * s * w;
  let lx = sw, lz = .13, ex = -.2 - .12 * Math.max(0, -s) * w, rx = -sw, rz = -.13, erx = -.2 - .12 * Math.max(0, s) * w, rry = 0;
  const gw = PRES.gest;
  if (gw > 0) {   // open-palm presenting toward the piece, on the side it sits
    const a = PRES.gestSide;   // 1 = her right arm
    const lift = -.95 - .08 * Math.sin(t * 1.7), out = .62;
    if (a > 0) { rx = rx * (1 - gw) + lift * gw; rz = rz * (1 - gw) + -out * gw; erx = erx * (1 - gw) + -.35 * gw; rry = -.5 * gw; }
    else { lx = lx * (1 - gw) + lift * gw; lz = lz * (1 - gw) + out * gw; ex = ex * (1 - gw) + -.35 * gw; }
  }
let erz = 0;
  if (PRES.wave > 0) { const k = PRES.wave; rx = rx * (1 - k) + -.3 * k; rz = rz * (1 - k) + -1.12 * k; erx = erx * (1 - k) + -.25 * k; erz = (-1.55 + Math.sin(t * 8) * .32) * k; }
  if (PRES.talking && gw < .5 && PRES.wave < .1) { const b = Math.sin(t * 2.3) * .5 + .5; lx += -.5 * (1 - w) * b * .6; ex += -.9 * (1 - w) * (.6 + b * .4); }   // a relaxed talking hand
  J.shL.rotation.set(lx, 0, lz); J.elL.rotation.set(ex, 0, 0);
  J.shR.rotation.set(rx, rry, rz); J.elR.rotation.set(erx, 0, erz);
  J.handR.rotation.set(0, -.9 * gw * (PRES.gestSide > 0 ? 1 : 0), 0); J.handL.rotation.set(0, .9 * gw * (PRES.gestSide < 0 ? 1 : 0), 0);
  // head: look at the camera when close or talking, glance at the piece while presenting
  const cx = camera.position.x - PRES.x, cz = camera.position.z - PRES.z, cd = Math.hypot(cx, cz);
  let hy = 0, hp = .04 * w;
  if (cd < 16 && (PRES.talking || w < .5)) { hy = Math.max(-1.1, Math.min(1.1, angDiff(PRES.yaw, Math.atan2(cx, cz)))); hp = Math.max(-.25, Math.min(.2, Math.atan2((PRES.y + 5.2) - camera.position.y, cd)));}
  if (PRES.gestTo && gw > .3 && Math.sin(t * .8) > .55) hy = Math.max(-1.1, Math.min(1.1, angDiff(PRES.yaw, Math.atan2(PRES.gestTo.x - PRES.x, PRES.gestTo.z - PRES.z))));
  const hk = Math.min(1, dt * 4); PRES.headYaw += (hy - PRES.headYaw) * hk; PRES.headPitch += (hp - PRES.headPitch) * hk;
  J.neck.rotation.y = PRES.headYaw * .35; J.head.rotation.y = PRES.headYaw * .6 - J.spine.rotation.y;
  J.head.rotation.x = PRES.headPitch + (PRES.talking ? Math.sin(t * 5.1) * .025 + Math.sin(t * 2.2) * .02 : 0); J.head.rotation.z = PRES.talking ? Math.sin(t * 1.3) * .03 : 0;
}

/* ---------- where she can walk ---------- */
function navGrid() {
  const sig = layout.walls.length + ':' + layout.furniture.length + ':' + layout.rooms.length + ':' + allCols.length;
  if (PRES.grid && PRES.gridSig === sig) return PRES.grid;
  const rooms = layout.rooms.filter(r => r.polygon?.length > 2 && r.kind !== 'ledge');
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; rooms.forEach(r => r.polygon.forEach(([x, z]) => { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }));
  const cs = .5, nx = Math.ceil((x1 - x0) / cs) + 1, nz = Math.ceil((z1 - z0) / cs) + 1, ok = new Uint8Array(nx * nz), R = .5;
  const cols = allCols.filter(c => c.y1 > STEP && c.y0 < BODY);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * cs, z = z0 + j * cs; if (!rooms.some(r => pip([x, z], r.polygon))) continue;
    let free = true;
    for (const c of cols) { const dx = x - c.cx, dz = z - c.cz; if (Math.abs(dx) > c.hx + c.hz + R && Math.abs(dz) > c.hx + c.hz + R) continue;
      const lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c, qx = lx - Math.max(-c.hx, Math.min(c.hx, lx)), qz = lz - Math.max(-c.hz, Math.min(c.hz, lz)); if (qx * qx + qz * qz < R * R) { free = false; break; } }
    ok[j * nx + i] = free ? 1 : 0;
  }
  // keep only the floor that's connected to the biggest open area (drops pockets sealed in by furniture)
  const lab = new Int32Array(nx * nz), sizes = [0]; let id = 0;
  for (let s0 = 0; s0 < nx * nz; s0++) { if (!ok[s0] || lab[s0]) continue; id++; let n = 0; const st = [s0]; lab[s0] = id;
    while (st.length) { const k = st.pop(); n++; const i = k % nx, j = (k / nx) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const q = b * nx + a; if (ok[q] && !lab[q]) { lab[q] = id; st.push(q); } } }
    sizes.push(n); }
  const main = sizes.indexOf(Math.max(...sizes)); for (let k = 0; k < ok.length; k++) if (ok[k] && lab[k] !== main) ok[k] = 0;
  PRES.gridSig = sig; return (PRES.grid = { x0, z0, cs, nx, nz, ok });
}
const gCell = (G, x, z) => [Math.round((x - G.x0) / G.cs), Math.round((z - G.z0) / G.cs)];
const gOk = (G, i, j) => i >= 0 && j >= 0 && i < G.nx && j < G.nz && G.ok[j * G.nx + i] === 1;
function walkableAt(x, z) { const G = navGrid(), [i, j] = gCell(G, x, z); return gOk(G, i, j); }
function nearestOk(G, i, j, max = 14) {
  if (gOk(G, i, j)) return [i, j];
  for (let r = 1; r <= max; r++) { let best = null, bd = 1e9; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !gOk(G, i + di, j + dj)) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i + di, j + dj]; } } if (best) return best; }
  return null;
}
// can the eye see from a to b? only walls and tall joinery block a view; sofas and tables don't
function sightOk(ax, az, bx, bz, skipEnd = 0) {
  const tall = allCols.filter(c => c.y1 > 4.8 && c.y0 < 4.5), L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / .35), kEnd = n - Math.ceil(skipEnd / .35);
  for (let k = 1; k < Math.min(n, kEnd + 1); k++) { const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (const c of tall) { const dx = x - c.cx, dz = z - c.cz, lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c; if (Math.abs(lx) < c.hx && Math.abs(lz) < c.hz) return false; } }
  return true;
}
function clearOfTall(x, z, pad) { for (const c of allCols) { if (c.y1 < 4.8) continue; const dx = x - c.cx, dz = z - c.cz, lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c, qx = lx - Math.max(-c.hx, Math.min(c.hx, lx)), qz = lz - Math.max(-c.hz, Math.min(c.hz, lz)); if (qx * qx + qz * qz < pad * pad) return false; } return true; }
function losOk(G, ax, az, bx, bz, skipEnd = 0) { const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / (G.cs * .5)), kEnd = n - Math.ceil(skipEnd / (G.cs * .5)); for (let k = 1; k < Math.min(n, kEnd + 1); k++) { const t = k / n, [i, j] = gCell(G, ax + (bx - ax) * t, az + (bz - az) * t); if (!gOk(G, i, j)) return false; } return true; }
function findPath(ax, az, bx, bz) {
  const G = navGrid(), s = nearestOk(G, ...gCell(G, ax, az)), e = nearestOk(G, ...gCell(G, bx, bz)); if (!s || !e) return null;
  const N = G.nx * G.nz, gs = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N), si = s[1] * G.nx + s[0], ei = e[1] * G.nx + e[0];
  const open = [si]; gs[si] = 0; const h = k => Math.hypot(k % G.nx - e[0], ((k / G.nx) | 0) - e[1]); const f = new Float32Array(N).fill(1e9); f[si] = h(si);
  let guard = 0;
  while (open.length && guard++ < 60000) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (f[open[q]] < f[open[bi]]) bi = q;
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop(); if (cur === ei) break; if (closed[cur]) continue; closed[cur] = 1;
    const ci = cur % G.nx, cj = (cur / G.nx) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ni = ci + di, nj = cj + dj; if (!gOk(G, ni, nj)) continue; if (di && dj && (!gOk(G, ci + di, cj) || !gOk(G, ci, cj + dj))) continue;
      const k = nj * G.nx + ni; if (closed[k]) continue; const ng = gs[cur] + (di && dj ? 1.414 : 1);
      if (ng < gs[k]) { gs[k] = ng; from[k] = cur; f[k] = ng + h(k); open.push(k); }
    }
  }
  if (from[ei] < 0 && ei !== si) return null;
  const cells = []; for (let k = ei; k >= 0; k = from[k]) { cells.push([G.x0 + (k % G.nx) * G.cs, G.z0 + ((k / G.nx) | 0) * G.cs]); if (k === si) break; }
  cells.reverse(); cells.push([bx, bz]);
  // string-pull: keep only the corners she actually has to turn at
  const out = [cells[0]]; let a = 0;
  while (a < cells.length - 1) { let b = cells.length - 1; while (b > a + 1 && !losOk(G, cells[a][0], cells[a][1], cells[b][0], cells[b][1])) b--; out.push(cells[b]); a = b; }
  return out;
}

/* ---------- moving her, and the camera with her ---------- */
function ensurePresenter() {
  if (!PRES.fig) { const { g, J } = buildPresenter(); PRES.fig = g; PRES.J = J; loadMiraModel(); }
  if (!PRES.fig.parent) scene.add(PRES.fig);
  PRES.fig.visible = true;
}

/* ---------- the real Mira: a rigged, photographed-texture model (Microsoft Rocketbox, MIT licence) ----------
   The drawn figure above stays as the animation source (and as the stand-in while the model loads):
   every frame its joint rotations are retargeted onto the model's skeleton, and her face is driven
   by visemes timed to the words she's speaking. */
const MIRA_URL = (window.MIRAGE_ASSETS || '') + 'mira.glb';
const _mq1 = new THREE.Quaternion(), _mq2 = new THREE.Quaternion(), _mv1 = new THREE.Vector3(), _mv2 = new THREE.Vector3();
async function loadMiraModel() {
  if (PRES.model || PRES.modelLoading) return; PRES.modelLoading = true;
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gl = await new GLTFLoader().loadAsync(MIRA_URL);
    const holder = new THREE.Group(), root = gl.scene; holder.scale.setScalar(1 / 30.48); holder.add(root);   // centimetres → feet
    let sk = null;
    root.traverse(o => { if (o.isSkinnedMesh && !sk) sk = o; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.userData.keep = true;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        m.envMapIntensity = .55; if (m.map) m.map.anisotropy = 8;
        if (/opacity/i.test(m.name)) { m.transparent = false; m.alphaTest = .42; m.depthWrite = true; m.side = THREE.DoubleSide; }   // lashes, brows, flyaway hair
        else if (/head/i.test(m.name)) { m.roughness = .46; m.envMapIntensity = .7; if (m.normalMap) m.normalScale.set(.55, .55); } else m.roughness = .8;
      } } });
    if (!sk) throw new Error('no skinned mesh');
    root.updateMatrixWorld(true);
    const byName = n => sk.skeleton.bones.find(b => b.name.replace(/[^a-z0-9]/gi, '').toLowerCase() === n.replace(/[^a-z0-9]/gi, '').toLowerCase());
    // her left is +x when she faces +z; make sure the rig agrees
    const lUp = byName('Bip01_L_UpperArm'), flip = lUp && lUp.getWorldPosition(_mv1).x < 0;
    const side = s => flip ? (s === 'L' ? 'R' : 'L') : s;
    const map = { hips: 'Bip01_Pelvis', spine: 'Bip01_Spine1', head: 'Bip01_Head' };
    for (const s of ['L', 'R']) Object.assign(map, { ['thigh' + s]: `Bip01_${side(s)}_Thigh`, ['shin' + s]: `Bip01_${side(s)}_Calf`, ['foot' + s]: `Bip01_${side(s)}_Foot`,
      ['sh' + s]: `Bip01_${side(s)}_UpperArm`, ['el' + s]: `Bip01_${side(s)}_Forearm`, ['hand' + s]: `Bip01_${side(s)}_Hand` });
    const rig = {};
    for (const [k, n] of Object.entries(map)) { const b = byName(n); if (!b) continue;
      const pQ = b.parent.getWorldQuaternion(new THREE.Quaternion()); rig[k] = { b, rest: b.quaternion.clone(), pQ, pInv: pQ.clone().invert(), corr: null, conj: null }; }
    // arms come in a T/A pose and legs slightly apart: work out the turn that brings each limb to hanging straight down
    const hang = (upper, lower, sx) => { const a = rig[upper]?.b.getWorldPosition(new THREE.Vector3()), c = rig[lower]?.b.getWorldPosition(new THREE.Vector3()); if (!a || !c) return null;
      return new THREE.Quaternion().setFromUnitVectors(c.sub(a).normalize(), new THREE.Vector3(sx, -1, 0).normalize()); };
    for (const s of ['L', 'R']) { const sx = s === 'L' ? 1 : -1;
      const ca = hang('sh' + s, 'el' + s, sx * -.07), cl = hang('thigh' + s, 'shin' + s, sx * .025);
      if (ca) { rig['sh' + s].corr = ca; for (const k of ['el' + s, 'hand' + s]) if (rig[k]) rig[k].conj = ca; }
      if (cl) { rig['thigh' + s].corr = cl; for (const k of ['shin' + s, 'foot' + s]) if (rig[k]) rig[k].conj = cl; } }
    // relax the hands: fingers come splayed flat from the rig
    PRES.fingers = sk.skeleton.bones.filter(b => /Finger[1-4]\d?$/i.test(b.name)).map(b => ({ b, rest: b.quaternion.clone(), thumb: false }))
      .concat(sk.skeleton.bones.filter(b => /Finger0\d?$/i.test(b.name)).map(b => ({ b, rest: b.quaternion.clone(), thumb: true })));
    PRES.rig = rig; PRES.sk = sk; PRES.model = holder; PRES.hipsRest = rig.hips?.b.position.clone();
    PRES.morph = sk.morphTargetInfluences ? sk : null;
    PRES.fig.traverse(o => { if (o.isMesh) o.visible = false; });   // hide the drawn stand-in
    // a soft, warm key light that travels with her so her face never goes flat or dark
    const key = new THREE.SpotLight('#ffe7d2', 2.2, 11, .42, .8, 1.6); key.position.set(.6, 6.6, 3.4); key.castShadow = false;
    const aim = new THREE.Object3D(); aim.position.set(0, 5.1, 0); key.target = aim; PRES.fig.add(key, aim); PRES.keyLight = key;
    PRES.fig.add(holder);
  } catch (e) { console.warn('Mira model unavailable; using the drawn presenter.', e); }
  finally { PRES.modelLoading = false; }
}

function driveModel(dt) {
  const J = PRES.J, rig = PRES.rig; if (!rig) return;
  for (const [k, r] of Object.entries(rig)) {
    const j = k === 'head' ? null : J[k];
    if (k === 'head') { _mq1.setFromEuler(J.neck.rotation); _mq2.setFromEuler(J.head.rotation); _mq1.multiply(_mq2); }   // neck + head go on the head bone: her arms hang off the neck in this rig
    else _mq1.setFromEuler(j.rotation);
    if (r.corr) _mq1.multiply(r.corr);
    else if (r.conj) { _mq2.copy(r.conj).invert(); _mq1.premultiply(_mq2).multiply(r.conj); }
    r.b.quaternion.copy(r.pInv).multiply(_mq1).multiply(r.pQ).multiply(r.rest);
  }
  const curl = PRES.fingerCurl ?? .32, open = PRES.gest > .3 ? .12 : curl;
  for (const f of PRES.fingers || []) { _mq2.setFromAxisAngle(PRES.fingerAxis || _zAxis, (f.thumb ? .12 : open)); f.b.quaternion.copy(f.rest).multiply(_mq2); }
  // walking bob and sway ride on the whole model
  PRES.model.position.set(J.hips.position.x, J.hips.position.y - 2.95, 0);
  driveFace(dt);
}
/* ---------- her face: lip-sync from the words, blinks, a warm resting smile ---------- */
const _zAxis = new THREE.Vector3(0, 0, 1);
const VIS = { sil: 0, PP: 1, FF: 2, TH: 3, DD: 4, KK: 5, CH: 6, SS: 7, nn: 8, RR: 9, aa: 10, E: 11, I: 12, O: 13, U: 14 }, BLINK_L = 15, BLINK_R = 16, SMILE_L = 17, SMILE_R = 18, BROW_UP = 19;
function visemeAt(txt, i) {
  const c = (txt[i] || ' ').toLowerCase(), n = (txt[i + 1] || '').toLowerCase();
  if (c === 't' && n === 'h') return ['TH', .7]; if ((c === 'c' || c === 's') && n === 'h') return ['CH', .75];
  if ('a'.includes(c)) return ['aa', .85]; if (c === 'e') return ['E', .65]; if ('iy'.includes(c)) return ['I', .6]; if (c === 'o') return ['O', .8]; if ('uw'.includes(c)) return ['U', .7];
  if ('mbp'.includes(c)) return ['PP', 1]; if ('fv'.includes(c)) return ['FF', .9]; if ('tdl'.includes(c)) return ['DD', .6]; if (c === 'n') return ['nn', .6];
  if ('szcx'.includes(c)) return ['SS', .6]; if ('kgq'.includes(c)) return ['KK', .55]; if (c === 'r') return ['RR', .6]; if (c === 'j') return ['CH', .6]; if (c === 'h') return ['aa', .3];
  return ['sil', 0];
}
function driveFace(dt) {
  const inf = PRES.morph?.morphTargetInfluences; if (!inf) return;
  const now = performance.now(), want = new Array(inf.length).fill(0), S = PRES.say;
  if (S) { const ci = Math.floor(S.ci + (now - S.t0) / 1000 * S.cps); if (ci < S.text.length) { const [v, w] = visemeAt(S.text, ci); if (VIS[v]) want[VIS[v]] = w; } }
  // blinks every few seconds
  PRES.nextBlink ||= now + 2000; if (now > PRES.nextBlink) { PRES.blinkT = now; PRES.nextBlink = now + 2200 + Math.random() * 3500; }
  const bt = (now - (PRES.blinkT || 0)) / 1000, blink = bt < .16 ? Math.sin(bt / .16 * Math.PI) : 0;
  want[BLINK_L] = want[BLINK_R] = .13 + blink * .87;   // lids rest slightly lowered: a softer, less startled look
  const smile = S ? .3 : .45; want[SMILE_L] = want[SMILE_R] = smile; want[BROW_UP] = S ? .15 + Math.max(0, Math.sin(now / 900)) * .2 : 0;
  const k = Math.min(1, dt * 22);
  for (let i = 0; i < inf.length; i++) inf[i] += (want[i] - inf[i]) * (i === BLINK_L || i === BLINK_R ? 1 : k);
}
function placePresenter(x, z, yaw) { PRES.x = x; PRES.z = z; PRES.yaw = yaw; const r = roomAt(x, z); PRES.y = r ? floorY(r) : 0; PRES.trail = [[camera.position.x, camera.position.z], [x, z]]; }
function presWalk(x, z) {
  return new Promise(res => {
    const p = findPath(PRES.x, PRES.z, x, z);
    if (!p || p.length < 2) { res(false); return; }
    PRES.path = p; PRES.pi = 1; PRES.done = res; PRES.follow = true;
  });
}
function presTurn(yaw) { return new Promise(res => { PRES.turnTo = { yaw, res }; setTimeout(() => { if (PRES.turnTo?.res === res) { PRES.yaw = yaw; PRES.turnTo = null; res(); } }, 2500); }); }
function trailPoint(back) {   // a point `back` feet behind her along the way she came
  const T = PRES.trail; let need = back, px = PRES.x, pz = PRES.z;
  for (let k = T.length - 1; k >= 0; k--) { const [qx, qz] = T[k], d = Math.hypot(px - qx, pz - qz); if (d >= need) { const t = need / (d || 1); return [px + (qx - px) * t, pz + (qz - pz) * t]; } need -= d; px = qx; pz = qz; }
  return [px, pz];
}
function presentStep(dt) {
  if (!PRES.fig || !PRES.fig.visible) return false;
  const now = performance.now(); dt = Math.min(PRES.dtCap || .25, (now - (PRES.last || now)) / 1000) || dt; PRES.last = now;
  let moving = false;
  if (PRES.path && !PRES.paused) {
    const [tx, tz] = PRES.path[PRES.pi], dx = tx - PRES.x, dz = tz - PRES.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz), turn = angDiff(PRES.yaw, want), maxTurn = 4 * dt;
    PRES.yaw += Math.max(-maxTurn, Math.min(maxTurn, turn));
    const slow = Math.abs(turn) > 1.1 ? .25 : Math.abs(turn) > .5 ? .7 : 1, rest = PRES.path.length - 1 - PRES.pi, ease = rest ? 1 : Math.min(1, .35 + d / 3);
    const step = Math.min(d, PRES.speed * slow * ease * dt);
    if (Math.abs(turn) < 1.4) {   // otherwise she turns on the spot first
      PRES.x += Math.sin(PRES.yaw) * step; PRES.z += Math.cos(PRES.yaw) * step;
      if (d - step < .12 || (d < .5 && rest)) { if (!rest) { PRES.x = tx; PRES.z = tz; } PRES.pi++; }
    }
    moving = true;
    if (PRES.pi >= PRES.path.length) { PRES.path = null; const r = PRES.done; PRES.done = null; r?.(true); }
    const L = PRES.trail[PRES.trail.length - 1]; if (!L || Math.hypot(L[0] - PRES.x, L[1] - PRES.z) > .3) { PRES.trail.push([PRES.x, PRES.z]); if (PRES.trail.length > 400) PRES.trail.shift(); }
    const r = roomAt(PRES.x, PRES.z); if (r) { PRES.y += (floorY(r) - PRES.y) * Math.min(1, dt * 8); if (r.name !== PRES.room) { PRES.room = r.name; const el = $('presentRoom'); if (el) el.textContent = r.name; } }
  } else if (PRES.turnTo) {
    const d = angDiff(PRES.yaw, PRES.turnTo.yaw), m = 3 * dt; PRES.yaw += Math.max(-m, Math.min(m, d)); moving = Math.abs(d) > .05;
    if (Math.abs(d) <= m) { PRES.yaw = PRES.turnTo.yaw; const r = PRES.turnTo.res; PRES.turnTo = null; r(); }
    PRES.phase += dt * 3; // little steps while turning
  }
  const gt = PRES.gestTo && PRES.gestOn ? 1 : 0; PRES.gest += (gt - PRES.gest) * Math.min(1, dt * 3.2);
  PRES.wave += ((PRES.waving ? 1 : 0) - PRES.wave) * Math.min(1, dt * 4);
  PRES.fig.position.set(PRES.x, PRES.y, PRES.z); PRES.fig.rotation.y = PRES.yaw;
  PRES.talking = PRES.talking || !!PRES.say;
  animatePresenter(dt, moving || !!PRES.forceWalk);
  if (PRES.model) driveModel(dt);
  // camera: a few steps behind her, slightly over her shoulder, looking where she's heading
  if (PRES.follow && !GUIDE.flight && PRES.path) {
    const [bx, bz] = trailPoint(7), fx = Math.sin(PRES.yaw), fz = Math.cos(PRES.yaw);
    const k = 1 - Math.exp(-dt * 2.6); player.x += (bx - player.x) * k; player.z += (bz - player.z) * k;
    const lx = PRES.x + fx * 4, lz = PRES.z + fz * 4, want = yawTo(player.x, player.z, lx, lz);
    player.yaw += angDiff(player.yaw, want) * Math.min(1, dt * 3); player.pitch += (.1 - player.pitch) * Math.min(1, dt * 2);
    return true;
  }
  return PRES.on;
}

/* ---------- choreography ---------- */
function presentSpot(r, it) {
  // she stands beside the focal piece, a little in front of it; the camera takes the room's best view
  const vp = viewpoint(r, it);
  const [cx, cz] = centroid(r.polygon);
  if (!it) { for (const [x, z] of [[cx, cz], ...insetPoly(r.polygon, 3).pts]) if (pip([x, z], r.polygon) && walkableAt(x, z) && Math.hypot(x - vp.x, z - vp.z) > 4) return { x, z, vp }; return { x: cx, z: cz, vp }; }
  const f = withDefaults(it), th = (it.rot || 0) * D2R, nx = Math.sin(th), nz = Math.cos(th), px = Math.cos(th), pz = -Math.sin(th);
  const tries = []; for (const fwd of [1.6, 2.6, 3.6]) for (const o of [f.w / 2 + 1.1, -(f.w / 2 + 1.1), f.w / 2 + .3, -(f.w / 2 + .3), f.w / 2 + 2]) tries.push([it.x + nx * (f.d / 2 + fwd) + px * o, it.z + nz * (f.d / 2 + fwd) + pz * o]);
  // prefer spots the camera can see, off the camera-to-piece line
  const ok = tries.filter(([x, z]) => pip([x, z], r.polygon) && walkableAt(x, z) && Math.hypot(x - vp.x, z - vp.z) > 4.5);
  ok.sort((a, b) => lateral(b) - lateral(a)); function lateral([x, z]) { const ax = it.x - vp.x, az = it.z - vp.z, L = Math.hypot(ax, az) || 1, l = Math.abs(((x - vp.x) * az - (z - vp.z) * ax) / L); return Math.min(l, 4) - Math.max(0, l - 6); }
  let s = ok[0];
  if (!s) { const G = navGrid(), [ci, cj] = gCell(G, it.x + nx * (f.d / 2 + 2), it.z + nz * (f.d / 2 + 2)), c = nearestOk(G, ci, cj, 10); s = c ? [G.x0 + c[0] * G.cs, G.z0 + c[1] * G.cs] : [cx, cz]; }
  return { x: s[0], z: s[1], vp };
}
// frame her and the piece together: stand back on the piece's open side so both sit inside the shot
function presentCam(r, sx, sz, it) {
  const G = navGrid(), tx = it ? it.x : sx, tz = it ? it.z : sz, mx = (sx + tx) / 2, mz = (sz + tz) / 2, sep = Math.hypot(tx - sx, tz - sz);
  const half = Math.tan((camera.fov * .5) * D2R) * Math.min(1, camera.aspect), [rw, rd] = roomDims(r);
  const ideal = Math.min(Math.max(7.5, sep / 2 / (half * .75) + 3), Math.max(5, Math.hypot(rw, rd) * .62));
  const th = it ? (it.rot || 0) * D2R : 0, inx = Math.sin(th), inz = Math.cos(th);
  let best = null;
  for (const relaxed of [false, true]) { if (best) break;
  const minD = relaxed ? 2.4 : Math.min(4.2, Math.max(2.8, Math.hypot(rw, rd) * .32));
  for (let j = 0; j < G.nz; j += relaxed ? 1 : 2) for (let i = 0; i < G.nx; i += relaxed ? 1 : 2) {
    if (!gOk(G, i, j)) continue;
    const x = G.x0 + i * G.cs, z = G.z0 + j * G.cs, ds = Math.hypot(sx - x, sz - z);
    if (ds < minD || ds > 24 || !clearOfTall(x, z, relaxed ? .8 : 1.1)) continue;
    const inRoom = pip([x, z], r.polygon); if (!inRoom && ds > 14) continue;
    const toS = Math.atan2(sx - x, sz - z), toT = Math.atan2(tx - x, tz - z), spread = Math.abs(angDiff(toS, toT));
    const front = it ? ((x - tx) * inx + (z - tz) * inz) / (Math.hypot(x - tx, z - tz) || 1) : 1;
    let score = -Math.abs(Math.hypot(mx - x, mz - z) - ideal) - Math.max(0, spread - half * 1.5) * 14 - (front < .1 ? 6 : 0) + front * 1.5 - (inRoom ? 0 : 4);
    if (best && score < best.s) continue;
    if (!sightOk(x, z, sx, sz, .6) || (it && !relaxed && !sightOk(x, z, tx + inx * withDefaults(it).d / 2, tz + inz * withDefaults(it).d / 2, .3))) continue;
    best = { x, z, s: score, relaxed };
  } }
  if (!best) return null;
  // a tiny room seen through its door: aim past her into the room rather than at a hidden piece
  const [cx, cz] = centroid(r.polygon), lx = best.relaxed ? sx * .5 + cx * .5 : mx * .55 + sx * .45, lz = best.relaxed ? sz * .5 + cz * .5 : mz * .55 + sz * .45;
  return { x: best.x, z: best.z, yaw: yawTo(best.x, best.z, lx, lz) };
}
async function presentRoom(r, it, say) {
  if (!PRES.on) return;
  ensurePresenter();
  const spot = presentSpot(r, it); PRES.gestOn = false; PRES.gestTo = null; GUIDE.flight = null;
  if (Math.hypot(PRES.x - spot.x, PRES.z - spot.z) > .6) {
    const ok = await presWalk(spot.x, spot.z);
    if (!ok) { PRES.teleports = (PRES.teleports || 0) + 1; await gFade(1, 260); placePresenter(spot.x, spot.z, PRES.yaw); player.x = spot.vp.x; player.z = spot.vp.z; await gFade(0, 300); }
  }
  if (!PRES.on) return;
  PRES.follow = false;
  // the camera settles on the room's best view while she turns to you
  const v = presentCam(r, PRES.x, PRES.z, it) || { ...spot.vp, yaw: yawTo(spot.vp.x, spot.vp.z, PRES.x, PRES.z) };
  const camMove = flyTo(v.x, v.z, v.yaw, .1, 2.2);
  await new Promise(r => setTimeout(r, 450));
  const toCam = Math.atan2(v.x - PRES.x, v.z - PRES.z), toIt = it ? Math.atan2(it.x - PRES.x, it.z - PRES.z) : toCam;
  const face = toCam + angDiff(toCam, toIt) * .3;
  await Promise.all([camMove, presTurn(face)]);
  if (!PRES.on) return;
  if (it) { PRES.gestTo = it; PRES.gestSide = angDiff(PRES.yaw, toIt) < 0 ? 1 : -1; PRES.gestOn = true; setTimeout(() => { PRES.gestOn = false; }, 3600); }
  flyTo(player.x, player.z, player.yaw, player.pitch, .01, .02);   // a slow drift while she talks
  if (say) { gSay(say); PRES.talking = true; await gSpeak(say); PRES.talking = false; }
  GUIDE.flight = null; PRES.gestOn = false;
}
async function startPresent() {
  if (PRES.on) return; if (!layout.walls.length) return gNote('Open a designed home first.');
  if (GUIDE.touring) stopTour();
  if (mode !== 'walk') setMode('walk'); if (activeView !== '3d') showView('3d');
  PRES.on = true; GUIDE.touring = true; GUIDE.paused = false; document.body.classList.add('presenting'); $('presentBar').hidden = false; openGuide(false); dispatchEvent(new Event('resize'));
  const script = await tourScript(); if (!PRES.on) return;
  ensurePresenter(); for (let i = 0; i < 40 && PRES.modelLoading; i++) await new Promise(r => setTimeout(r, 100));   // give her a moment to arrive
  navGrid();
  try {
    // a walkthrough starts at the front door: cut to the first stop, where she's waiting to greet you
    const first = layout.rooms.find(x => x.name === script.stops[0]?.room);
    if (first && roomAt(player.x, player.z) !== first) { await gFade(1, 300); const v = viewpoint(first, null), [cx, cz] = centroid(first.polygon); player.x = v.x; player.z = v.z; player.y = floorY(first); player.yaw = yawTo(v.x, v.z, cx, cz); player.pitch = .08; }
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw); let sp = null;
    for (const d of [5, 6.5, 4, 8]) for (const o of [1.2, -1.2, 0]) { const x = player.x + fx * d - fz * o, z = player.z + fz * d + fx * o; if (!sp && walkableAt(x, z) && losOk(navGrid(), player.x, player.z, x, z)) sp = [x, z]; }
    if (!sp && first) { const s = presentSpot(first, null); await gFade(1, 250); player.x = s.vp.x; player.z = s.vp.z; player.yaw = s.vp.yaw; sp = [s.x, s.z]; }
    ensurePresenter(); placePresenter(sp[0], sp[1], Math.atan2(player.x - sp[0], player.z - sp[1])); await gFade(0, 350);
    flyTo(player.x, player.z, yawTo(player.x, player.z, sp[0], sp[1]), .08, 1.2);
    PRES.waving = true; setTimeout(() => PRES.waving = false, 1800); PRES.talking = true;
    if (script.intro) { gSay(script.intro); await gSpeak(script.intro); }
    PRES.talking = false;
    for (const s of script.stops) {
      if (!PRES.on) break;
      while (PRES.paused && PRES.on) await new Promise(r => setTimeout(r, 250));
      const r = layout.rooms.find(x => x.name === s.room); if (!r) continue;
      const it = (s.look && layout.furniture.find(x => x.id === s.look)) || focalItem(r);
      $('presentRoom').textContent = r.name; $('guideStep').textContent = r.name;
      await presentRoom(r, it, s.say);
      while (PRES.paused && PRES.on) await new Promise(r => setTimeout(r, 250));
    }
    if (PRES.on) { PRES.talking = true; if (script.outro) { gSay(script.outro); await gSpeak(script.outro); } PRES.talking = false; }
  } finally { if (PRES.on) endPresent(true); }
}
function endPresent(keepHer = false) {
  PRES.on = false; PRES.path = null; PRES.done?.(false); PRES.done = null; PRES.turnTo?.res?.(); PRES.turnTo = null; PRES.follow = false; PRES.talking = false; PRES.gestOn = false; PRES.paused = false;
  GUIDE.touring = false; GUIDE.flight = null; hush(); document.body.classList.remove('presenting', 'present-ask'); $('presentBar').hidden = true; $('guideCap').hidden = true; dispatchEvent(new Event('resize'));
  if (!keepHer && PRES.fig) PRES.fig.visible = false;
}
// a chat "go" while presenting: she walks you there instead of cutting
async function presentGo(r) { const it = focalItem(r); await presentRoom(r, it, ''); }

$('btnPresent').onclick = () => PRES.on ? endPresent() : startPresent();
$('presentEnd').onclick = () => endPresent();
$('presentPause').onclick = () => { PRES.paused = GUIDE.paused = !PRES.paused; $('presentPause').textContent = PRES.paused ? 'Resume' : 'Pause'; if (PRES.paused) window.speechSynthesis?.pause(); else window.speechSynthesis?.resume(); };
$('presentAsk').onclick = () => { document.body.classList.toggle('present-ask'); openGuide(document.body.classList.contains('present-ask')); };
addEventListener('keydown', e => {   // Esc closes the Ask panel first, then ends the presentation
  if (!PRES.on || e.code !== 'Escape') return;
  if (document.body.classList.contains('present-ask')) { document.body.classList.remove('present-ask'); openGuide(false); $('guideIn').blur(); } else endPresent();
}, true);
// fetch her quietly once the home is up, so she's ready the moment someone presses Present
setTimeout(() => { try { (window.requestIdleCallback || (f => setTimeout(f, 0)))(() => fetch(MIRA_URL).catch(() => { })); } catch { } }, 6000);

window.__present = { cols: () => ({ wallCols, itemCols, groups: [...itemGroups.entries()].map(([k, g]) => [k, g.userData.cols]) }), sightOk, gOk, gCell, walkableAt, losOk, roomDimsP: r => roomDims(r), PRES, presentRoom, focalItem, presentCam, startPresent, endPresent, findPath, navGrid, presentSpot, ensure: ensurePresenter, place: placePresenter };
