
/* ================= plan check (2D editor) ================= */
const pc = $('planCanvas'), pg = pc.getContext('2d'), pin = $('pinspect');
const pv = { k: 10, tx: 40, ty: 40 };
let ptool = 'select', psel = null, pdrag = null, pdraft = null, pdirty = false, planImg = null, planImgSrc = '';
const toS = (x, z) => [x * pv.k + pv.tx, z * pv.k + pv.ty], toW = (sx, sy) => [(sx - pv.tx) / pv.k, (sy - pv.ty) / pv.k];
function planResize() { const r = pc.getBoundingClientRect(), d = Math.min(devicePixelRatio, 2); pc.width = Math.max(2, r.width * d); pc.height = Math.max(2, r.height * d); pg.setTransform(d, 0, 0, d, 0, 0); drawPlan(); }
new ResizeObserver(() => { if (activeView === 'plan') planResize(); }).observe(pc);
function imgRectFt() { const p = project?.plan; if (!p?.image || !p.s) return null; return { x: (0 - p.ox) * p.s, z: (0 - p.oy) * p.s, w: p.w * p.s, h: p.h * p.s }; }
function planFit() {
  const r = pc.getBoundingClientRect(); if (!r.width) return;
  const b = new THREE.Box2(); layout.walls.forEach(w => { b.expandByPoint(new THREE.Vector2(...w.a)); b.expandByPoint(new THREE.Vector2(...w.b)); });
  layout.rooms.forEach(rm => rm.polygon?.forEach(p => b.expandByPoint(new THREE.Vector2(...p))));
  const ir = imgRectFt(); if (ir) { b.expandByPoint(new THREE.Vector2(ir.x, ir.z)); b.expandByPoint(new THREE.Vector2(ir.x + ir.w, ir.z + ir.h)); }
  if (b.isEmpty()) { if (project?.plan?.image) { const p = project.plan; pv.k = Math.min((r.width - 80) / p.w, (r.height - 80) / p.h); pv.tx = (r.width - p.w * pv.k) / 2; pv.ty = (r.height - p.h * pv.k) / 2; } drawPlan(); return; }
  const w = b.max.x - b.min.x || 1, h = b.max.y - b.min.y || 1, padL = 20, padR = r.width > 860 ? 320 : 20, padT = 70, padB = 50;
  pv.k = Math.min((r.width - padL - padR) / w, (r.height - padT - padB) / h);
  pv.tx = padL + (r.width - padL - padR - w * pv.k) / 2 - b.min.x * pv.k; pv.ty = padT + (r.height - padT - padB - h * pv.k) / 2 - b.min.y * pv.k;
  drawPlan();
}
$('btnFit').onclick = planFit; $('showImg').onchange = drawPlan;
function drawPlan() {
  if (activeView !== 'plan') return;
  const r = pc.getBoundingClientRect(); pg.clearRect(0, 0, r.width, r.height);
  const p = project?.plan;
  if (p?.image && $('showImg').checked) {
    if (planImgSrc !== p.image) { planImgSrc = p.image; planImg = new Image(); planImg.onload = drawPlan; planImg.src = p.image; }
    if (planImg?.complete && planImg.naturalWidth) {
      pg.globalAlpha = .5;
      if (p.s) { const ir = imgRectFt(), [sx, sy] = toS(ir.x, ir.z); pg.drawImage(planImg, sx, sy, ir.w * pv.k, ir.h * pv.k); }
      else pg.drawImage(planImg, pv.tx, pv.ty, p.w * pv.k, p.h * pv.k);
      pg.globalAlpha = 1;
    }
  }
  // grid (1 ft / 5 ft) when there is no image
  if (!p?.image || !$('showImg').checked) { pg.strokeStyle = 'rgba(237,235,228,.05)'; pg.lineWidth = 1; const step = pv.k * 5; for (let x = pv.tx % step; x < r.width; x += step) { pg.beginPath(); pg.moveTo(x, 0); pg.lineTo(x, r.height); pg.stroke(); } for (let y = pv.ty % step; y < r.height; y += step) { pg.beginPath(); pg.moveTo(0, y); pg.lineTo(r.width, y); pg.stroke(); } }
  for (const rm of layout.rooms) {
    if (!rm.polygon?.length) continue; pg.beginPath(); rm.polygon.forEach((q, i) => { const [x, y] = toS(...q); i ? pg.lineTo(x, y) : pg.moveTo(x, y); }); pg.closePath();
    const on = psel?.room === rm; pg.fillStyle = on ? 'rgba(91,240,209,.28)' : rm.kind === 'outdoor' ? 'rgba(127,182,230,.10)' : 'rgba(91,240,209,.10)'; pg.fill();
    pg.strokeStyle = on ? '#5BF0D1' : 'rgba(91,240,209,.35)'; pg.lineWidth = on ? 2 : 1; pg.stroke();
    const [cx, cz] = centroid(rm.polygon), [x, y] = toS(cx, cz); pg.fillStyle = '#f3ede4'; pg.font = '600 12px Geist, Arial'; pg.textAlign = 'center'; pg.fillText(rm.name, x, y); if (rm.size) { pg.fillStyle = '#5BF0D1'; pg.font = '11px "Geist Mono", monospace'; pg.fillText(rm.size, x, y + 14); }
  }
  const OC = { door: '#9cc59a', window: '#7fb6e6', slider: '#d69be0', opening: '#e6d38a' };
  for (const w of layout.walls) {
    const [ax, ay] = toS(...w.a), [bx_, by] = toS(...w.b), on = psel?.wall === w && !psel.op;
    pg.strokeStyle = on ? '#8FF6E2' : 'rgba(236,138,120,.9)'; pg.lineWidth = Math.max(2, w.thickness * pv.k); pg.lineCap = 'butt';
    pg.beginPath(); pg.moveTo(ax, ay); pg.lineTo(bx_, by); pg.stroke();
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L;
    for (const o of w.openings || []) {
      const [sx, sy] = toS(w.a[0] + ux * o.start, w.a[1] + uz * o.start), [ex, ey] = toS(w.a[0] + ux * o.end, w.a[1] + uz * o.end);
      pg.strokeStyle = psel?.op === o ? '#ffffff' : OC[o.type] || '#fff'; pg.lineWidth = Math.max(3, w.thickness * pv.k * .75); pg.beginPath(); pg.moveTo(sx, sy); pg.lineTo(ex, ey); pg.stroke();
    }
    if (on) for (const [x, y] of [[ax, ay], [bx_, by]]) { pg.fillStyle = '#0A0B0C'; pg.strokeStyle = '#8FF6E2'; pg.lineWidth = 2; pg.beginPath(); pg.arc(x, y, 6, 0, 7); pg.fill(); pg.stroke(); }
  }
  if (pdraft) {
    pg.strokeStyle = '#8FF6E2'; pg.lineWidth = 2; pg.setLineDash([6, 4]); pg.beginPath();
    pdraft.pts.forEach((q, i) => { const [x, y] = toS(...q); i ? pg.lineTo(x, y) : pg.moveTo(x, y); }); if (pdraft.hover) pg.lineTo(...toS(...pdraft.hover)); pg.stroke(); pg.setLineDash([]);
    pdraft.pts.forEach(q => { const [x, y] = toS(...q); pg.fillStyle = '#8FF6E2'; pg.beginPath(); pg.arc(x, y, 4, 0, 7); pg.fill(); });
    if (pdraft.kind === 'scale' && pdraft.pts.length === 2) { const [a, b] = pdraft.pts, [mx, my] = toS((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pg.fillStyle = '#8FF6E2'; pg.font = '12px "Geist Mono", monospace'; pg.fillText(fmtFtIn(Math.hypot(b[0] - a[0], b[1] - a[1])), mx, my - 8); }
  }
}
function allEnds() { const e = []; layout.walls.forEach(w => { e.push(w.a, w.b); }); layout.rooms.forEach(r => r.polygon?.forEach(p => e.push(p))); return e; }
function snapPt(p, exclude, axisFrom) {
  const tol = 10 / pv.k; let best = null, bd = tol;
  for (const q of allEnds()) { if (q === exclude) continue; const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } }
  if (best) return [best[0], best[1]];
  if (axisFrom) { const dx = Math.abs(p[0] - axisFrom[0]), dz = Math.abs(p[1] - axisFrom[1]); if (dz < dx * .12) return [r2(p[0]), axisFrom[1]]; if (dx < dz * .12) return [axisFrom[0], r2(p[1])]; }
  return [r2(p[0]), r2(p[1])];
}
function hitWall(p) { let best = null, bd = 8 / pv.k; for (const w of layout.walls) { const d = segDist(p[0], p[1], w.a, w.b) - w.thickness / 2; if (d < bd) { bd = d; best = w; } } return best; }
function hitOpening(p) {
  for (const w of layout.walls) { if (segDist(p[0], p[1], w.a, w.b) > w.thickness / 2 + 6 / pv.k) continue; const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), s = ((p[0] - w.a[0]) * (w.b[0] - w.a[0]) + (p[1] - w.a[1]) * (w.b[1] - w.a[1])) / L; const o = (w.openings || []).find(o => s >= o.start - .2 && s <= o.end + .2); if (o) return { wall: w, op: o }; }
  return null;
}
function planChanged() { pdirty = true; drawPlan(); saveSoon(); }
function wallParam(w, p) { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); return { L, s: ((p[0] - w.a[0]) * (w.b[0] - w.a[0]) + (p[1] - w.a[1]) * (w.b[1] - w.a[1])) / L }; }
document.querySelectorAll('.ptools [data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
function setTool(t) { ptool = t; pdraft = null; document.querySelectorAll('.ptools [data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t)); pc.style.cursor = t === 'select' ? 'default' : 'crosshair'; renderInspector(); drawPlan(); }
pc.addEventListener('wheel', e => { e.preventDefault(); const r = pc.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = Math.exp(-e.deltaY * .0015), [wx, wz] = toW(mx, my); pv.k = clamp(pv.k * f, .5, 200); pv.tx = mx - wx * pv.k; pv.ty = my - wz * pv.k; drawPlan(); }, { passive: false });
pc.addEventListener('pointerdown', e => {
  const r = pc.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, p = toW(mx, my);
  pc.setPointerCapture(e.pointerId);
  if (e.button === 1 || e.button === 2 || e.altKey) { pdrag = { pan: true, x: mx, y: my }; return; }
  if (ptool === 'select') {
    if (psel?.wall && !psel.op) for (const end of [psel.wall.a, psel.wall.b]) { const [sx, sy] = toS(...end); if (Math.hypot(sx - mx, sy - my) < 10) { pdrag = { end, x: mx, y: my }; return; } }
    const ho = hitOpening(p); if (ho) { psel = ho; renderInspector(); drawPlan(); return; }
    const hw = hitWall(p); if (hw) { psel = { wall: hw }; renderInspector(); drawPlan(); return; }
    const rm = roomAtIn(layout.rooms.filter(r => r.polygon?.length > 2), p[0], p[1]); if (rm) { psel = { room: rm }; renderInspector(); drawPlan(); pdrag = { pan: true, x: mx, y: my, soft: true }; return; }
    psel = null; renderInspector(); pdrag = { pan: true, x: mx, y: my }; drawPlan(); return;
  }
  if (ptool === 'wall') { const q = snapPt(p, null, pdraft?.pts[0]); if (!pdraft) pdraft = { kind: 'wall', pts: [q] }; else { if (Math.hypot(q[0] - pdraft.pts[0][0], q[1] - pdraft.pts[0][1]) > .4) { const w = { a: pdraft.pts[0], b: q, thickness: .5, kind: 'int', openings: [] }; layout.walls.push(w); psel = { wall: w }; planChanged(); } pdraft = { kind: 'wall', pts: [q] }; } drawPlan(); renderInspector(); return; }
  if (['door', 'window', 'slider'].includes(ptool)) {
    const w = hitWall(p); if (!w) { flash('Click on a wall to place the ' + ptool + '.', true); return; }
    const { L, s } = wallParam(w, p), width = { door: 3, window: 4, slider: 6 }[ptool], st = clamp(s - width / 2, .1, L - width - .1);
    const o = { ...PRESET[ptool], start: r2(st), end: r2(Math.min(L - .1, st + width)) }; if (ptool === 'door') { o.name = 'Door'; o.swing = { hinge: 'start', side: 1, open: 90 }; }
    w.openings.push(o); w.openings.sort((a, b) => a.start - b.start); psel = { wall: w, op: o }; planChanged(); renderInspector(); return;
  }
  if (ptool === 'room') {
    const q = snapPt(p, null, pdraft?.pts[pdraft.pts.length - 1]);
    if (pdraft && pdraft.pts.length >= 3) { const [fx, fy] = toS(...pdraft.pts[0]); if (Math.hypot(fx - mx, fy - my) < 12) { finishRoom(); return; } }
    if (!pdraft) pdraft = { kind: 'room', pts: [] }; pdraft.pts.push(q); drawPlan(); renderInspector(); return;
  }
  if (ptool === 'scale') { const q = [p[0], p[1]]; if (!pdraft || pdraft.pts.length >= 2) pdraft = { kind: 'scale', pts: [q] }; else pdraft.pts.push(q); drawPlan(); renderInspector(); }
});
pc.addEventListener('pointermove', e => {
  const r = pc.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  if (pdrag?.pan) { pv.tx += mx - pdrag.x; pv.ty += my - pdrag.y; pdrag.x = mx; pdrag.y = my; pdrag.moved = true; drawPlan(); return; }
  if (pdrag?.end) { const q = snapPt(toW(mx, my), pdrag.end, e.shiftKey ? null : (psel.wall.a === pdrag.end ? psel.wall.b : psel.wall.a)); pdrag.end[0] = q[0]; pdrag.end[1] = q[1]; pdrag.moved = true; drawPlan(); return; }
  if (pdraft && ptool !== 'scale') { pdraft.hover = snapPt(toW(mx, my), null, pdraft.pts[pdraft.pts.length - 1]); drawPlan(); }
});
pc.addEventListener('pointerup', () => { if (pdrag?.end && pdrag.moved) { planChanged(); renderInspector(); } pdrag = null; });
pc.addEventListener('dblclick', () => { if (ptool === 'room' && pdraft?.pts.length >= 3) finishRoom(); });
pc.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  if (activeView !== 'plan' || typing(e)) return;
  if (e.code === 'Escape') { pdraft = null; drawPlan(); renderInspector(); }
  if (e.code === 'Enter' && ptool === 'room' && pdraft?.pts.length >= 3) finishRoom();
  if ((e.code === 'Delete' || e.code === 'Backspace') && psel) { e.preventDefault(); deletePsel(); }
});
function finishRoom() {
  const poly = pdraft.pts.map(q => [r2(q[0]), r2(q[1])]); pdraft = null;
  const rm = { name: 'Room ' + (layout.rooms.length + 1), type: 'other', kind: 'room', polygon: poly };
  const fl = project.style.floors.living; rm.finish = fl.finish; rm.floor = fl.color;
  layout.rooms.push(rm); psel = { room: rm }; setTool('select'); planChanged(); renderInspector();
}
function deletePsel() {
  if (psel.op) psel.wall.openings = psel.wall.openings.filter(o => o !== psel.op);
  else if (psel.wall) layout.walls = layout.walls.filter(w => w !== psel.wall);
  else if (psel.room) { layout.rooms = layout.rooms.filter(r => r !== psel.room); delete project.roomInspo?.[psel.room.name]; delete project.roomStyles?.[psel.room.name]; renderUploads(); }
  psel = null; planChanged(); renderInspector();
}
function rescaleAll(k) {
  const sp = p => { p[0] = r2(p[0] * k); p[1] = r2(p[1] * k); };
  for (const w of layout.walls) { sp(w.a); sp(w.b); w.thickness = r2(clamp(w.thickness * k, .25, 2.5)); for (const o of w.openings || []) { o.start = r2(o.start * k); o.end = r2(o.end * k); } }
  for (const r of layout.rooms) r.polygon.forEach(sp);
  for (const rl of layout.railings || []) rl.points.forEach(sp);
  for (const it of layout.furniture) { it.x = r2(it.x * k); it.z = r2(it.z * k); }
  if (layout.spawn) { sp(layout.spawn.position); if (layout.spawn.lookAt) sp(layout.spawn.lookAt); }
  if (project.plan?.s) project.plan.s *= k;
}
function renderInspector() {
  const opt = (list, v) => list.map(t => `<option value="${t}"${t === v ? ' selected' : ''}>${t}</option>`).join('');
  let h = '';
  if (ptool === 'scale') {
    const d = pdraft?.pts.length === 2 ? Math.hypot(pdraft.pts[1][0] - pdraft.pts[0][0], pdraft.pts[1][1] - pdraft.pts[0][1]) : null;
    h = `<h4>Set scale</h4><p>Click two points on the plan whose real distance you know, such as the ends of a dimension line. Then type the real length.</p>` + (d ? `<div class="fld"><span>Measured now: ${fmtFtIn(d)}. Real length (ft)</span><input type="number" id="pi-real" step="0.1" min="0.5" value="${r1(d)}"></div><button class="primary" id="pi-apply">Apply scale</button>` : '');
  } else if (ptool === 'wall') h = `<h4>Draw walls</h4><p>Click to start a wall and click again to end it. Walls chain from the last point; press Esc to stop. Points snap to existing corners and straighten to horizontal or vertical.</p>`;
  else if (ptool === 'room') h = `<h4>Draw a room</h4><p>Click each corner along the wall centrelines. Click the first corner again, double-click, or press Enter to close it.</p>`;
  else if (['door', 'window', 'slider'].includes(ptool)) h = `<h4>Add a ${ptool}</h4><p>Click on a wall where the ${ptool} goes. You can adjust its width afterwards.</p>`;
  else if (psel?.op) {
    const o = psel.op, w = psel.wall, L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    h = `<h4>${esc(o.name || o.type)}</h4><div class="grid2"><div class="fld full"><span>Type</span><select id="pi-type">${opt(['door', 'window', 'slider', 'opening'], o.type)}</select></div>
      <div class="fld"><span>Width (ft)</span><input type="number" id="pi-width" step="0.25" min="1" max="${r1(L)}" value="${r2(o.end - o.start)}"></div><div class="fld"><span>Offset along wall</span><input type="number" id="pi-start" step="0.25" min="0" max="${r1(L)}" value="${r2(o.start)}"></div>
      <div class="fld"><span>Sill (ft)</span><input type="number" id="pi-sill" step="0.25" min="0" max="8" value="${o.sill || 0}"></div><div class="fld"><span>Head (ft)</span><input type="number" id="pi-head" step="0.25" min="3" max="${layout.settings.ceilingHeight}" value="${o.head || 7}"></div>
      ${o.type === 'door' ? `<label class="chk full"><input type="checkbox" id="pi-flip"> Swing to the other side</label>` : ''}</div><div class="sel-actions"><button class="danger" id="pi-del">Delete</button></div>`;
  } else if (psel?.wall) {
    const w = psel.wall, L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    h = `<h4>Wall · ${fmtFtIn(L)}</h4><p>Drag the round handles to move its ends. Hold Shift to move freely.</p><div class="grid2"><div class="fld"><span>Thickness (in)</span><input type="number" id="pi-t" step="1" min="3" max="30" value="${Math.round(w.thickness * 12)}"></div><label class="chk" style="align-self:end"><input type="checkbox" id="pi-ext"${w.kind === 'ext' ? ' checked' : ''}> Exterior</label></div><p style="margin-top:8px">${(w.openings || []).length} opening${(w.openings || []).length === 1 ? '' : 's'}</p><div class="sel-actions"><button class="danger" id="pi-del">Delete wall</button></div>`;
  } else if (psel?.room) {
    const r = psel.room, n = layout.furniture.filter(it => it.room === r.name).length;
    h = `<h4>${esc(r.name)}</h4><div class="grid2"><div class="fld full"><span>Name</span><input type="text" id="pi-name" value="${esc(r.name)}"></div><div class="fld full"><span>Type</span><select id="pi-rtype">${opt(TYPES, r.type)}</select></div></div>
      <p style="margin-top:8px">${Math.round(polyArea(r.polygon))} sq ft · ${n} piece${n === 1 ? '' : 's'} of furniture</p>
      <div class="sel-actions"><button class="primary" id="pi-refurn"${running ? ' disabled' : ''}>Redo this room · ${cfmt(BILLING.perChange)}</button><button id="pi-clear">Clear furniture</button><button class="danger" id="pi-del">Delete room</button></div>`;
  } else {
    const p = project?.plan;
    h = `<h4>Check the trace</h4><p>Claude's tracing sits over your drawing. Fix anything that is off before refining furniture: drag wall ends, add missing doors or windows, and redraw rooms. Scroll to zoom and drag empty space to pan.</p>
      <p>${p?.s ? `Scale: 1 px = ${(p.s * 12).toFixed(2)} in.` : 'No scale yet.'} Use <b>Set scale</b> if a known dimension measures wrong.</p>
      <p>${layout.walls.length} walls · ${layout.rooms.length} rooms · ${layout.walls.reduce((a, w) => a + (w.openings || []).length, 0)} openings</p>
      <div class="sel-actions"><button id="pi-refurn-all"${running || !layout.rooms.length ? ' disabled' : ''}>Refurnish every room</button></div>`;
  }
  pin.innerHTML = h;
  const q = id => pin.querySelector('#pi-' + id), on = (id, ev, fn) => { const el = q(id); if (el) el.addEventListener(ev, fn); };
  on('apply', 'click', () => { const real = parseFloat(q('real').value), d = Math.hypot(pdraft.pts[1][0] - pdraft.pts[0][0], pdraft.pts[1][1] - pdraft.pts[0][1]); if (!(real > 0) || !(d > 0)) return; rescaleAll(real / d); pdraft = null; planChanged(); planFit(); renderInspector(); flash('Scale updated. Furniture kept its size, so use Refurnish if rooms changed a lot.'); });
  on('type', 'change', e => { const o = psel.op; const t = e.target.value; Object.assign(o, { ...PRESET[t], start: o.start, end: o.end, name: o.name }); if (t === 'door') o.swing ||= { hinge: 'start', side: 1, open: 90 }; planChanged(); renderInspector(); });
  on('width', 'change', e => { const o = psel.op, v = parseFloat(e.target.value); if (v > .5) { o.end = r2(o.start + v); planChanged(); } });
  on('start', 'change', e => { const o = psel.op, v = parseFloat(e.target.value), wd = o.end - o.start; if (v >= 0) { o.start = r2(v); o.end = r2(v + wd); planChanged(); } });
  on('sill', 'change', e => { psel.op.sill = parseFloat(e.target.value) || 0; planChanged(); });
  on('head', 'change', e => { psel.op.head = parseFloat(e.target.value) || 7; planChanged(); });
  on('flip', 'change', () => { const o = psel.op; o.swing = { ...(o.swing || { hinge: 'start', open: 90 }), side: -((o.swing?.side) || 1) }; planChanged(); });
  on('t', 'change', e => { const v = parseFloat(e.target.value); if (v >= 3) { psel.wall.thickness = r2(v / 12); planChanged(); } });
  on('ext', 'change', e => { psel.wall.kind = e.target.checked ? 'ext' : 'int'; planChanged(); });
  on('name', 'change', e => { const r = psel.room, old = r.name, nv = e.target.value.trim() || old; r.name = nv; layout.furniture.forEach(it => { if (it.room === old) it.room = nv; }); for (const bag of [project.roomInspo, project.roomStyles]) if (bag?.[old] && old !== nv) { bag[nv] = bag[old]; delete bag[old]; } planChanged(); renderUploads(); });
  on('rtype', 'change', e => { const r = psel.room; r.type = e.target.value; r.kind = isOutdoorType(r.type) ? 'outdoor' : 'room'; const fl = project.style.floors[roomCat(r.type)]; r.finish = fl.finish; r.floor = fl.color; planChanged(); });
  on('del', 'click', deletePsel);
  on('clear', 'click', () => { removeItemsWhere(it => it.room === psel.room.name); renderInspector(); saveSoon(); });
  on('refurn', 'click', async () => { const r = psel.room; if (pdirty) { buildAll(); pdirty = false; } refurnishRoom(r).then(renderInspector); renderInspector(); });
  on('refurn-all', 'click', async () => { if (running) return; if (pdirty) { buildAll(); pdirty = false; } running = true; ctl = new AbortController(); stepUI([{ id: 'furn', label: 'Refurnishing every room', state: 'active' }]); removeItemsWhere(() => true); try { await furnishRooms(layout.rooms.filter(r => r.kind !== 'ledge' && polyArea(r.polygon) > 20 && r.type !== 'other'), ctl.signal); } catch (e) { if (e?.code !== 'cancelled') flash(errText(e), true); } finally { running = false; renderInspector(); saveSoon(); } });
}

/* ================= style view ================= */
const TOKEN_UI = [['wood-light', 'Light wood', 'Floors, doors, joinery'], ['wood-dark', 'Dark wood', 'Accent joinery, consoles'], ['stone', 'Feature stone', 'Wall panels, tables'], ['marble', 'Worktop stone', 'Kitchen and vanity tops'], ['stone-dark', 'Statement stone', 'Powder room, accents'], ['fabric-main', 'Main fabric', 'Sofas, headboards'], ['fabric-second', 'Second fabric', 'Chairs, stools'], ['fabric-accent', 'Accent fabric', 'Throws, cushions'], ['metal', 'Metal', 'Handles, frames, fixtures']];
function tokenHex(k) { const v = project.style.tokens[k]; return typeof v === 'string' ? (v.startsWith('#') ? v : { brass: '#c09a5f', black: '#1f1c1a', chrome: '#d6d9dc' }[v]) : v?.color; }
let styleT; const restyle = () => { clearTimeout(styleT); styleT = setTimeout(() => { for (const k in MC) delete MC[k]; applyStyleToRooms(layout, project.style); buildAll(); saveSoon(); renderStyle(); }, 250); };
function renderStyle() {
  const st = project?.style; if (!st) return; const el = $('viewStyle');
  const insp = (project.inspo || []).map((s, i) => `<img src="${s}" alt="Inspiration image ${i + 1}">`).join('') || '<p class="lead">No inspiration images yet. Add them on the left; Claude reads the palette from them when you generate.</p>';
  const opt = (list, v) => list.map(t => `<option value="${t}"${t === v ? ' selected' : ''}>${t}</option>`).join('');
  el.innerHTML = `<div class="stylewrap"><div class="insp"><h2>${esc(project.name || 'Style')}</h2><p class="lead">${esc(st.summary)}</p><div class="chips" style="margin-bottom:12px">${st.keywords.map(k => `<span>${esc(k)}</span>`).join('')}</div>${insp}${st.features.length ? `<div class="sec">Signature elements</div><div class="chips">${st.features.map(k => `<span>${esc(k)}</span>`).join('')}</div>` : ''}${Object.keys(project.roomStyles || {}).length ? `<div class="sec eyebrow" style="margin-top:22px">Rooms with their own style</div>${Object.entries(project.roomStyles).map(([k, v]) => `<div class="tok"><span class="sw" style="background:linear-gradient(135deg,${esc(v.tokens?.['wood-light'] || '#c49a6c')} 0 33%,${esc(v.tokens?.['fabric-main'] || '#ece4d6')} 33% 66%,${esc(v.floor?.color || '#d9d2c5')} 66%)"></span><div><b>${esc(k)}</b><small style="font-family:var(--sans)">${esc(v.summary)}</small></div><div class="ctl"><button data-unstyle="${esc(k)}">Use home style</button></div></div>`).join('')}` : ''}</div>
  <div><div class="sec" style="margin-top:0">Materials</div>
  ${TOKEN_UI.map(([k, l, sub]) => { const v = st.tokens[k]; const isStone = typeof v === 'object'; return `<div class="tok"><span class="sw" style="background:${tokenHex(k)}"></span><div><b>${l}</b><small>${sub}</small></div><div class="ctl">${k === 'metal' ? `<select id="tk-${k}" aria-label="${l}">${opt(['brass', 'black', 'chrome'], v)}</select>` : `${isStone ? `<select id="tk-${k}-look" aria-label="${l} look">${opt(['travertine', 'marble', 'limestone', 'concrete', 'terrazzo'], v.look)}</select>` : ''}<input type="color" id="tk-${k}" value="${tokenHex(k)}" aria-label="${l} colour">`}</div></div>`; }).join('')}
  <div class="sec">Paint</div>
  <div class="tok"><span class="sw" style="background:${st.walls}"></span><div><b>Walls</b></div><div class="ctl"><input type="color" id="st-walls" value="${st.walls}" aria-label="Wall paint"></div></div>
  <div class="tok"><span class="sw" style="background:${st.ceiling}"></span><div><b>Ceilings</b></div><div class="ctl"><input type="color" id="st-ceiling" value="${st.ceiling}" aria-label="Ceiling paint"></div></div>
  <div class="sec">Floors</div>
  ${[['living', 'Living areas', ['stone-large', 'wood', 'tile-2ft', 'terrazzo']], ['bedroom', 'Bedrooms', ['wood', 'stone-large', 'tile-2ft']], ['wet', 'Bathrooms', ['stone-large', 'tile-1ft', 'tile-2ft', 'terrazzo']], ['outdoor', 'Outdoor', ['stone', 'wood', 'tile-2ft']]].map(([k, l, list]) => `<div class="tok"><span class="sw" style="background:${st.floors[k].color}"></span><div><b>${l}</b></div><div class="ctl"><select id="fl-${k}-f" aria-label="${l} finish">${opt(list, st.floors[k].finish)}</select><input type="color" id="fl-${k}" value="${st.floors[k].color}" aria-label="${l} colour"></div></div>`).join('')}
  <div class="sec">Lighting</div>
  <div class="tok"><span></span><div><b>Cove lighting</b><small>Warm LED strips at the ceiling edges</small></div><div class="ctl"><input type="checkbox" id="st-cove"${st.cove ? ' checked' : ''} aria-label="Cove lighting"></div></div>
  <p class="note">Changes apply to every piece that uses these materials, across the whole house.</p></div></div>`;
  const q = id => el.querySelector('#' + id);
  for (const [k] of TOKEN_UI) {
    const c = q('tk-' + k), lk = q('tk-' + k + '-look');
    c?.addEventListener(k === 'metal' ? 'change' : 'input', e => { const v = st.tokens[k]; if (k === 'metal') st.tokens[k] = e.target.value; else if (typeof v === 'object') v.color = e.target.value; else st.tokens[k] = e.target.value; restyle(); });
    lk?.addEventListener('change', e => { st.tokens[k].look = e.target.value; restyle(); });
  }
  q('st-walls').addEventListener('input', e => { st.walls = e.target.value; restyle(); });
  q('st-ceiling').addEventListener('input', e => { st.ceiling = e.target.value; restyle(); });
  for (const k of ['living', 'bedroom', 'wet', 'outdoor']) { q('fl-' + k).addEventListener('input', e => { st.floors[k].color = e.target.value; restyle(); }); q('fl-' + k + '-f').addEventListener('change', e => { st.floors[k].finish = e.target.value; restyle(); }); }
  q('st-cove').addEventListener('change', e => { st.cove = e.target.checked; restyle(); });
  el.querySelectorAll('[data-unstyle]').forEach(b => b.onclick = () => { delete project.roomStyles[b.dataset.unstyle]; restyle(); flash(b.dataset.unstyle + ' now follows the whole-home style. Refurnish it to update the furniture choices.'); });
}

