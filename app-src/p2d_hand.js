
/* ================= the hand: look at something and act on it ================= */
// In the walkthrough, whatever sits in the middle of the view can be acted on, as in a game. E opens or shuts a door.
// X picks a piece up and carries it: it follows where you look, X (or a click) puts it down, R turns it, Esc puts it back.
// The same actions are buttons under the aim dot, for touch screens and for anyone who would rather click.
const HAND = { target: null, carry: null, t: 0, key: null, hi: null, ray: new THREE.Raycaster(), mid: new THREE.Vector2(0, 0) };
const handEl = $('hand'), handGo = $('handGo'), handTurn = $('handTurn'), handBack = $('handBack'), aimEl = $('aim');
const HAND_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>';
const FIXED_PIECES = new Set(['ceiling-cove', 'loft-platform', 'stair-curved', 'ceiling-slats']);   // part of the room, not something to carry
const canCarry = it => !!CAT[it.type] && !FIXED_PIECES.has(it.type);
function handActive() { return mode === 'walk' && !photo && activeView === '3d' && !PRES.on && !GUIDE.touring && !GUIDE.flight && !running && !document.body.classList.contains('setup'); }

// What the middle of the view rests on: a door within reach, a piece within reach, or nothing (a wall, the floor).
function handLook() {
  const R = HAND.ray; R.setFromCamera(HAND.mid, camera); R.far = 16;
  for (const h of R.intersectObjects([house, itemsGroup], true)) {
    const o = h.object; if (o.isSprite || o.isLine || !visibleDeep(o)) continue;
    const m = o.material; if (m && !Array.isArray(m) && (m.blending === THREE.AdditiveBlending || (m.transparent && m.depthWrite === false))) continue;   // glows and washes of light are not things
    if (o.userData.door) return h.distance <= 9 ? { kind: 'door', D: o.userData.door } : null;
    let g = o; while (g && !g.userData.item) g = g.parent;
    if (g) { const it = g.userData.item; return h.distance <= 13 && canCarry(it) && layout.furniture.includes(it) ? { kind: 'item', it } : null; }
    return null;
  }
  return null;
}
const handName = it => String(it.name || CAT[it.type]?.label || 'this').replace(/[<>&]/g, '').slice(0, 26).toLowerCase();
function handOutline(g, color) { if (HAND.hi) { scene.remove(HAND.hi); HAND.hi.geometry.dispose(); HAND.hi = null; } if (g) { HAND.hi = new THREE.BoxHelper(g, color); HAND.hi.material.depthTest = false; HAND.hi.material.transparent = true; HAND.hi.material.opacity = .75; scene.add(HAND.hi); } }
function handShow() {
  const T = HAND.target, C = HAND.carry, on = !!(T || C), key = C ? 'c' + C.it.id : !T ? '' : T.kind === 'door' ? 'd' + doors.indexOf(T.D) + (T.D.to > .15) : 'i' + T.it.id;
  if (key === HAND.key) { HAND.hi?.update(); return; } HAND.key = key;
  handEl.hidden = !on; aimEl.hidden = !on; handTurn.hidden = handBack.hidden = !C;
  const cap = k => `<span class="hic">${HAND_ICON}</span><kbd>${k}</kbd>`;
  if (C) { handGo.innerHTML = cap('X') + 'Place here'; handTurn.innerHTML = '<kbd>R</kbd>Turn'; handBack.innerHTML = '<kbd>Esc</kbd>Put back'; handTurn.hidden = !!C.mount; handOutline(itemGroups.get(C.it.id), 0x5bf0d1); }
  else if (T?.kind === 'door') { handGo.innerHTML = cap('E') + (T.D.to > .15 ? 'Close ' : 'Open ') + (T.D.main ? 'front door' : 'door'); handOutline(null); }
  else if (T) { handGo.innerHTML = cap('X') + 'Move ' + handName(T.it); handOutline(itemGroups.get(T.it.id), 0xffffff); }
  else handOutline(null);
}

/* ---- carrying a piece ---- */
const inFootprint = (it, f, x, z) => { const th = (it.rot || 0) * D2R, dx = x - it.x, dz = z - it.z, lx = dx * Math.cos(th) - dz * Math.sin(th), lz = dx * Math.sin(th) + dz * Math.cos(th); return Math.abs(lx) <= f.w / 2 + .1 && Math.abs(lz) <= f.d / 2 + .1; };
function handPick(it) {
  const g = itemGroups.get(it.id); if (!g || HAND.carry) return; select(null);
  const f = withDefaults(it), top = (+f.y || 0) + (+f.h || 0);
  // what stands on it comes along: the lamp on a side table, the vase on a console
  const riders = layout.furniture.filter(o => { if (o === it || o.room !== it.room || WALLMOUNT.has(o.type) || !CAT[o.type]) return false; const y = +withDefaults(o).y || 0; return y >= .9 && Math.abs(y - top) <= .7 && inFootprint(it, f, o.x, o.z); })
    .map(o => ({ o, dx: o.x - it.x, dz: o.z - it.z, rot: o.rot || 0 }));
  HAND.carry = { it, riders, was: { x: it.x, z: it.z, rot: it.rot || 0, room: it.room }, rot: it.rot || 0, mount: WALLMOUNT.has(it.type), backed: BACKED.has(it.type) && !WALLMOUNT.has(it.type), free: false, walls: wallCols.filter(c => c.wall && c.y0 < 1).map(c => ({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, c: c.c, s: c.s })) };
  for (const x of [it, ...riders.map(r => r.o)]) { const q = itemGroups.get(x.id); if (q) { q.userData.cols = []; q.userData.surf = []; } }   // nothing to bump into while it is in your hands
  refreshItemPhysics(); HAND.target = null; HAND.key = null; handShow(); shadowsDirty();
}
// the wall a piece would back onto, if one is close behind where it is being held
function wallBehind(x, z, f) {
  let best = null;
  for (const w of layout.walls) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (L < 1) continue;
    const ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L, s = (x - w.a[0]) * ux + (z - w.a[1]) * uz, off = (x - w.a[0]) * -uz + (z - w.a[1]) * ux, side = Math.sign(off) || 1, t = (+w.thickness || .5) / 2;
    const gap = Math.abs(off) - t - f.d / 2; if (gap > 1.3 || gap < -f.d || s < f.w / 2 - .6 || s > L - f.w / 2 + .6) continue;
    if ((w.openings || []).some(o => o.type !== 'window' && s + f.w / 2 > o.start + .2 && s - f.w / 2 < o.end - .2)) continue;   // never across a doorway
    const sc = clamp(s, f.w / 2, Math.max(f.w / 2, L - f.w / 2));
    if (!best || gap < best.gap) best = { gap, rot: rotOf([-uz * side, ux * side]), x: r2(w.a[0] + ux * sc - uz * side * (t + f.d / 2 + .01)), z: r2(w.a[1] + uz * sc + ux * side * (t + f.d / 2 + .01)) };
  }
  return best;
}
// how far a straight line from (px,pz) runs before it meets a wall; doorways are gaps between the wall boxes
function clearAhead(px, pz, fx, fz, walls) {
  let best = 40;
  for (const b of walls) {
    const ox = (px - b.cx) * b.c + (pz - b.cz) * b.s, oz = -(px - b.cx) * b.s + (pz - b.cz) * b.c, dx = fx * b.c + fz * b.s, dz = -fx * b.s + fz * b.c; let t0 = -1e9, t1 = 1e9, miss = false;
    for (const [o, d, h] of [[ox, dx, b.hx], [oz, dz, b.hz]]) { if (Math.abs(d) < 1e-6) { if (Math.abs(o) > h) miss = true; continue; } const a = (-h - o) / d, c = (h - o) / d; t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c)); }
    if (!miss && t1 >= Math.max(t0, 0)) best = Math.min(best, Math.max(0, t0));
  }
  return best;
}
function carryStep() {
  const C = HAND.carry, it = C.it, f = withDefaults(it), g = itemGroups.get(it.id); if (!g || !layout.furniture.includes(it)) { HAND.carry = null; HAND.key = null; return; }
  const px = it.x, pz = it.z;
  if (C.mount) {          // art, mirrors, screens and curtains go where you look on a wall
    const R = HAND.ray; R.setFromCamera(HAND.mid, camera); R.far = 40;
    const h = R.intersectObject(wallGroup, true).find(h => h.face && Math.abs(h.face.normal.y) < .3 && (h.object.material === M.wall || h.object.material?.userData?.paint));
    if (h) { let nx = h.face.normal.x, nz = h.face.normal.z; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; if (R.ray.direction.x * nx + R.ray.direction.z * nz > 0) { nx = -nx; nz = -nz; }
      it.rot = rotOf([nx, nz]); it.x = r2(h.point.x + nx * (f.d / 2 + .01)); it.z = r2(h.point.z + nz * (f.d / 2 + .01)); }
  } else {                // everything else stands on the floor, where your eyes meet it
    const eye = camera.position.y - player.y, reach = player.pitch > .06 ? eye / Math.tan(player.pitch) : 12, near = player.r + Math.max(f.w, f.d) / 2 + .6;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), d = Math.max(.6, Math.min(Math.max(near, Math.min(12, reach)), clearAhead(player.x, player.z, fx, fz, C.walls) - .3));   // never through a wall into the next room
    const x = player.x + fx * d, z = player.z + fz * d;
    it.x = r2(x); it.z = r2(z); it.rot = C.rot;
    if (C.backed && !C.free) { const wb = wallBehind(it.x, it.z, f); if (wb) { it.rot = wb.rot; it.x = wb.x; it.z = wb.z; } }   // beds, sofas and wardrobes turn their back to a wall as they come near one
    for (let k = 0; k < 2; k++) for (const wb of C.walls) { const m = sat(itemOBB(it), wb); if (m && m.ov < 3) { it.x = r2(it.x - m.ax * m.sg * (m.ov + .02)); it.z = r2(it.z - m.az * m.sg * (m.ov + .02)); } }
    const rm = roomAt(it.x, it.z); if (!rm || rm.kind === 'ledge') { it.x = px; it.z = pz; }       // never out of the home
  }
  g.position.set(it.x, g.position.y, it.z); g.rotation.y = (it.rot || 0) * D2R;
  const da = ((it.rot || 0) - C.was.rot) * D2R, c = Math.cos(da), s = Math.sin(da);
  for (const q of C.riders) { q.o.x = r2(it.x + q.dx * c + q.dz * s); q.o.z = r2(it.z - q.dx * s + q.dz * c); q.o.rot = q.rot + (it.rot || 0) - C.was.rot; const qg = itemGroups.get(q.o.id); if (qg) { qg.position.set(q.o.x, qg.position.y, q.o.z); qg.rotation.y = q.o.rot * D2R; } }
  if (it.x !== px || it.z !== pz) shadowsDirty(1);
}
function handEnd(C) { HAND.carry = null; HAND.key = null; HAND.target = null; const r = roomAt(C.it.x, C.it.z); if (r) C.it.room = r.name; for (const q of C.riders) { q.o.room = C.it.room; rebuildItem(q.o); } rebuildItem(C.it); handShow(); }
function handDrop() { const C = HAND.carry; if (C) handEnd(C); }
function handCancel() { const C = HAND.carry; if (!C) return; C.it.x = C.was.x; C.it.z = C.was.z; C.it.rot = C.was.rot; for (const q of C.riders) { q.o.x = C.was.x + q.dx; q.o.z = C.was.z + q.dz; q.o.rot = q.rot; } handEnd(C); C.it.room = C.was.room; }
function handTurnBy(deg) { const C = HAND.carry; if (!C || C.mount) return; C.rot = ((C.rot + deg) % 360 + 540) % 360 - 180; C.free = true; }   // once turned by hand it stops turning itself to the walls
function handAct() {
  if (HAND.carry) return handDrop();
  const T = HAND.target; if (!T || !handActive()) return;
  if (T.kind === 'door') { toggleDoor(T.D); HAND.key = null; handShow(); } else handPick(T.it);
}
function handStep(dt) {
  if (HAND.carry) { if (handActive()) carryStep(); else handDrop(); handShow(); return; }
  if (!handActive()) { if (HAND.target || HAND.key) { HAND.target = null; handShow(); } return; }
  if ((HAND.t += dt) < .12) return; HAND.t = 0;
  HAND.target = handLook(); handShow();
}
handGo.onclick = handAct; handTurn.onclick = () => handTurnBy(BACKED.has(HAND.carry?.it.type) ? 90 : 45); handBack.onclick = handCancel;
addEventListener('keydown', e => {
  if (typing(e) || activeView !== '3d' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (HAND.carry) {
    if (e.code === 'KeyX' || e.code === 'Enter') { e.preventDefault(); handDrop(); }
    else if (e.code === 'KeyR') handTurnBy((e.shiftKey ? -1 : 1) * (BACKED.has(HAND.carry.it.type) ? 90 : 15));
    else if (e.code === 'Escape') { e.stopPropagation(); handCancel(); }
    return;
  }
  if (!handActive() || e.repeat) return;
  if (e.code === 'KeyE' && HAND.target?.kind === 'door') handAct();
  else if (e.code === 'KeyX' && HAND.target?.kind === 'item') handAct();
}, true);
