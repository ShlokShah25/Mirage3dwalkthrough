
/* ================= step 1: read the plan (free) ================= */
async function ensureImages() {
  const sample = await getSample(); if (!sample) { flash('Claude is not available in this view.', true); return null; }
  const caps = await sample.limits().catch(() => null);
  if (!caps?.images) { modal(`<div class="eyebrow">Can't read images here</div><h2>Open in a browser to continue</h2><p class="lead">This Claude app doesn't let pages send images to Claude yet, so the plan and photos can't be read. Nothing was charged.</p><p class="lead">Open this page at claude.ai in Chrome, Safari or Edge on a computer. Projects are saved per browser, so on another device add the plan and photos again.</p><div class="mact"><button class="primary" data-close>Got it</button></div>`); return null; }
  return { sample, max: Math.max(1, caps.images.maxCount || 1) };
}
$('btnGen').onclick = () => {
  if (running) { ctl?.abort(); return; }
  if (!project.plan?.image) { flash('Add a floor plan image first.', true); $('planDrop').focus?.(); return; }
  if (!layout.walls.length) readPlan(); else requestGenerate();
};
$('btnReread').onclick = () => {
  const m = modal(`<div class="eyebrow">Read the plan again</div><h2>Start the layout over?</h2><p class="lead">Claude traces the plan again. The current walls, rooms and furniture are replaced. Your photos stay. It's free.</p><div class="mact"><button data-close>Cancel</button><button class="primary" id="goRe">Read it again</button></div>`);
  m.el.querySelector('#goRe').onclick = () => { m.close(); readPlan(); };
};
async function readPlan() {
  if (running) return; const ok = await ensureImages(); if (!ok) return;
  running = true; ctl = new AbortController(); const signal = ctl.signal; renderGenState();
  project.brief = $('brief').value; const ceiling = clamp(parseFloat($('ceilH').value) || 10, 7, 20), view = $('seaSide').value;
  const PW = project.plan.w, PH = project.plan.h, planBlob = () => dataURLtoBlob(project.plan.image);
  stepUI([{ id: 'plan', label: 'Reading the floor plan', state: 'active' }, { id: 'check', label: 'Checking every wall against the drawing' }, { id: 'shell', label: 'Fitting walls to the printed sizes' }]);
  let done = false;
  try {
    const tp = ticker('plan', 'Tracing walls and rooms');
    if (SITE) SITE.ctx = { kind: 'plan_read', homeId: project.id };
    const [first, P] = await Promise.all([ok.sample.json(PLAN_PROMPT(PW, PH, project.brief), { images: planBlob(), modelTier: 'complex', signal, onText: tp.onText }).finally(tp.stop), planInk(project.plan.image)]);
    let tr = first; const r1 = refineTrace(tr, P);
    const fixed1 = [r1.stats.dropped ? `${r1.stats.dropped} traced wall${r1.stats.dropped > 1 ? 's' : ''} not on the drawing removed` : '', r1.stats.added ? `${r1.stats.added} undrawn gap${r1.stats.added > 1 ? 's' : ''} opened` : ''].filter(Boolean).join(', ');
    stepSet('plan', 'done', `${(tr.walls || []).length} walls, ${(tr.openings || []).length} openings, ${(tr.rooms || []).length} rooms; ${r1.stats.snapped} walls matched to the drawing${fixed1 ? '; ' + fixed1 : ''}`);
    stepSet('check', 'active');
    // The deep read: Claude goes over its tracing against the drawing in passes, with close-ups, measured lines and the
    // printed room sizes, until every check passes. It takes a few minutes and is what makes the walls trustworthy.
    const deepRounds = SITE ? (SITE.cfg?.deepRounds ?? 5) : 5, deepOK = deepRounds > 0 && ok.max >= 5; let deep = null, tk = null;
    if (deepOK) try {
      deep = await deepRead({ tr, P, src: project.plan.image, sample: ok.sample, signal, maxRounds: deepRounds, maxImages: Math.min(10, ok.max),
        ctx: () => { if (SITE) SITE.ctx = { kind: 'plan_deep', homeId: project.id }; },
        onRound: ({ round, maxRounds, audit }) => { tk?.stop(); tk = ticker('check', `Pass ${round} of up to ${maxRounds}: ${round === 1 ? 'going over every wall, door and window' : `${audit.open.length} thing${audit.open.length === 1 ? '' : 's'} left to settle`}`); } });
      tk?.stop(); tr = deep.tr;
      if (deep.asks.length) { stepSet('check', null, 'A quick question for you'); for (const [q, a] of deep.asks.entries()) { const ans = await askAboutPlan(a, q, deep.asks.length); if (signal.aborted) throw Object.assign(new Error('Stopped.'), { code: 'cancelled' }); if (ans) applyAnswer(tr, a[ans], deep.SEGS, P); } }
      const left = deep.audit.open, fixedN = deep.log.filter(l => /moved|added|changed|removed|re-outlined/.test(l) && !/were undone/.test(l)).length;
      stepSet('check', 'done', `${deep.rounds} pass${deep.rounds === 1 ? '' : 'es'}${fixedN ? ', corrections made' : ''}: ${left.length ? `${left.length} thing${left.length === 1 ? '' : 's'} still to look at` : 'every check passes'}${deep.audit.parts.sized ? `; ${deep.audit.parts.sizedOk} of ${deep.audit.parts.sized} sized rooms measure what the plan prints` : ''}`);
    } catch (e) { tk?.stop(); if (e?.code === 'cancelled') throw e; deep = null; stepSet('check', 'error', errText(e) + ' Kept the first reading.'); }
    // without it (turned off, or this view cannot send enough images): one second look at the whole plan
    else try {
      const tc = ticker('check', 'Comparing the tracing with the plan');
      if (SITE) SITE.ctx = { kind: 'plan_check', homeId: project.id };
      const overlay = await traceOverlay(project.plan.image, tr);
      const fixed = await ok.sample.json(PLAN_CHECK_PROMPT(PW, PH, tr, r1.hints), { images: [planBlob(), dataURLtoBlob(overlay)], modelTier: 'complex', signal, onText: tc.onText }).finally(tc.stop);
      const nw = (fixed?.walls || []).filter(w => numOk(w?.a) && numOk(w?.b)).length;
      if (nw >= Math.max(3, (tr.walls || []).length * .6) && (fixed.rooms || []).length) {
        const ch = (Array.isArray(fixed.changes) ? fixed.changes : []).map(String); delete fixed.changes;
        tr = fixed; const r2_ = refineTrace(tr, P); if (r2_.stats.dropped || r2_.stats.added) ch.push(`${r2_.stats.dropped} walls not on the drawing removed and ${r2_.stats.added} gaps opened after the check`);
        stepSet('check', 'done', ch.length ? `${ch.length} fix${ch.length > 1 ? 'es' : ''}: ${ch.slice(0, 3).join('; ')}` : 'The tracing matches the drawing');
      } else stepSet('check', 'done', 'Kept the first reading');
    } catch (e) { if (e?.code === 'cancelled') throw e; stepSet('check', 'error', errText(e) + ' Kept the first reading.'); }
    project.trace = structuredClone(tr);
    stepSet('shell', 'active');
    // the printed sizes set the scale and then pull each wall to where the sizes say it is
    const fit = fitToDims(tr); let scale = null;
    if (fit) { warpTrace(tr, fit.wx, fit.wy); scale = { s: fit.s, method: `Scale and room sizes set from ${fit.used} printed measurements.`, sure: true }; }
    const res = traceToLayout(tr, PW, PH, { ceiling, view, style: project.style, name: project.name, scale });
    if (!res.layout.walls.length) { stepSet('shell', 'error', 'No walls could be traced.'); res.warns.forEach(w => flash(w, true)); flash('The plan could not be traced. Try a cleaner image with walls, doors and windows only.', true); return; }
    const off = (fit?.report || []).filter(r => r.after.some((v, i) => v != null && Math.abs(v - r.printed[i]) > .17));
    if (off.length) res.warns.push(`${off.map(r => r.room).join(', ')}: the drawing and its printed size disagree; check ${off.length > 1 ? 'them' : 'it'} in Fix the layout.`);
    if (deep?.audit.open.length) res.warns.push(`Worth a look in Fix the layout: ${[...new Set(deep.audit.open.map(plainIssue))].slice(0, 3).join('; ')}.`);
    project.plan.review = deep ? { score: deep.audit.score, first: deep.first, rounds: deep.rounds, open: deep.audit.open.map(i => ({ kind: i.kind, text: plainIssue(i), box: i.box })) } : null;
    project.plan.s = res.s; project.plan.ox = 0; project.plan.oy = 0; project.plan.fit = fit ? { conv: fit.conv, used: fit.used, total: fit.total } : null;
    const keep = new Set(res.layout.rooms.map(r => r.name));
    for (const k of Object.keys(project.roomInspo || {})) if (!keep.has(k)) { delete project.roomInspo[k]; delete project.roomStyles?.[k]; }
    project.layout = layout = res.layout; project.status = 'traced'; for (const k in MC) delete MC[k];
    $('empty3d').hidden = true; $('pbar').hidden = false; buildAll(); placeSpawn(); setMode('walk'); showView('3d'); pv.fitted = false;
    const exact = fit ? fit.report.filter(r => r.after.every((v, i) => v == null || Math.abs(v - r.printed[i]) <= .17)).length : 0;
    stepSet('shell', 'done', `${res.method} ${layout.walls.length} walls, ${layout.rooms.length} rooms${fit ? `, ${exact} of ${fit.report.length} sized rooms within 2 inches of the plan` : ''}.`);
    res.warns.forEach(w => flash(w, true)); done = true; saveSoon();
  } catch (e) { if (e?.code === 'cancelled') flash('Stopped.', true); else flash(errText(e), true); }
  finally { running = false; renderUploads(); if (done) (SITE ? SITE.afterPlanRead?.() : askRoomInspo()); }
}
// one tap settles what the drawing alone could not: the plan is shown close up where the question is
function askAboutPlan(a, n, total) {
  return new Promise(async resolve => {
    let pic = '';
    try {
      const im = await loadImg(project.plan.image), W = im.naturalWidth, H = im.naturalHeight, b = a.box && a.box.every(Number.isFinite) ? a.box : [0, 0, W, H];
      const pad = Math.max(40, (b[2] - b[0]) * .7, (b[3] - b[1]) * .7), x0 = clamp(b[0] - pad, 0, W - 2), y0 = clamp(b[1] - pad, 0, H - 2), x1 = clamp(b[2] + pad, x0 + 2, W), y1 = clamp(b[3] + pad, y0 + 2, H);
      const z = Math.min(5, 900 / (x1 - x0), 620 / (y1 - y0)), c = document.createElement('canvas'); c.width = Math.round((x1 - x0) * z); c.height = Math.round((y1 - y0) * z);
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
      if (a.box) { g.strokeStyle = '#1FB8A6'; g.lineWidth = 3; g.setLineDash([10, 6]); g.strokeRect((b[0] - x0) * z, (b[1] - y0) * z, (b[2] - b[0]) * z, (b[3] - b[1]) * z); }
      pic = c.toDataURL('image/jpeg', .88);
    } catch { }
    let settled = false;
    const m = modal(`<div class="eyebrow">One quick question${total > 1 ? ` · ${n + 1} of ${total}` : ''}</div><h2>${esc(a.q)}</h2>
      <p class="lead">This could not be told from the drawing alone. Your answer goes straight into the walls.</p>
      ${pic ? `<img src="${pic}" alt="The part of your plan the question is about" style="display:block;max-width:100%;max-height:46vh;border-radius:10px;margin:4px auto 16px">` : ''}
      <div class="mact"><button data-a="">Not sure</button><button data-a="no">No</button><button class="primary" data-a="yes">Yes</button></div>`, { wide: true });
    const end = v => { if (settled) return; settled = true; mo.disconnect(); resolve(v); m.close(); };
    const mo = new MutationObserver(() => { if (!m.el.isConnected) end(null); }); mo.observe($('modalRoot'), { childList: true });
    m.el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => end(b.dataset.a || null));
  });
}
function askRoomInspo() {
  const n = inspRooms().length;
  const m = modal(`<div class="eyebrow">Plan read · ${n} rooms found</div><h2>Want any room to look different?</h2>
    <p class="lead">Add photos for rooms that should have their own look, such as a cosy master bedroom, a kids' room or a kitchen with a particular stone. Everything else follows the style you picked. You can change this later on the left.</p>
    <div class="rooms-insp" id="modalRooms"></div>
    <div class="mact" style="margin-top:16px"><button data-close>Skip for now</button><button class="primary" data-close>Done</button></div>`, { wide: true });
  $('modalRooms').innerHTML = roomRows('modal'); bindThumbs($('modalRooms'));
  flash('Your plan is ready in 3D. If a wall looks wrong, fix it in Fix the layout, then press Design my home.');
}

/* ================= step 2: generate (charged on success) ================= */
async function requestGenerate() {
  if (running) { ctl?.abort(); return; }
  const needImg = project.inspo.length || Object.values(project.roomInspo || {}).some(x => x.length);
  const ok = needImg ? await ensureImages() : await getSample().then(sm => sm ? { sample: sm, max: 4 } : (flash('Claude is not available in this view.', true), null)); if (!ok) return;
  if (SITE) { if (!(await SITE.canDesign?.(project))) return; }
  else if (wallet.credits < BILLING.perWalkthrough) { openWallet('empty'); return; }
  if (!profile().done && !(await askProfile())) return;
  const regen = project.status === 'generated', roomsWith = Object.entries(project.roomInspo || {}).filter(([k, v]) => v.length);
  const m = modal(`<div class="eyebrow">${regen ? 'Redesign' : 'Design'} my home</div><h2>${esc(project.name || 'My new home')}</h2>
    <p class="lead">Every one of the ${inspRooms().length} rooms gets designed and furnished. It usually takes 2 to 5 minutes, and you can watch it happen.${regen ? ' This replaces the current furniture and your changes.' : ''}</p>
    <dl class="sumlist"><dt>Rooms</dt><dd>${inspRooms().length}</dd><dt>Style</dt><dd>${project.inspo.length ? project.inspo.length + ' photo' + (project.inspo.length > 1 ? 's' : '') + ' of yours' : esc(presetById(project.presetId)?.name || 'Warm Minimal')}</dd><dt>Rooms with their own look</dt><dd>${roomsWith.length ? roomsWith.map(([k, v]) => `${esc(k)} (${v.length})`).join(', ') : 'None'}</dd><dt>Brief</dt><dd>${esc(profileLine())} <button type="button" class="linkish" id="editBrief">Change</button></dd><dt>Special requests</dt><dd>${project.brief ? esc(project.brief.slice(0, 140)) + (project.brief.length > 140 ? '…' : '') : 'None'}</dd></dl>
    <div class="costline"><div><div class="eyebrow">Cost</div><div style="margin-top:4px;color:var(--muted);font-size:12.5px">${SITE ? 'Only counted when it finishes. Stop or fail and nothing is used.' : 'Charged only when it finishes. Stop or fail and you pay nothing.'}</div></div><b>${SITE ? esc(SITE.costLabel?.(project) || '') : creditsWord(BILLING.perWalkthrough)}</b></div>
    <div class="mact"><span style="flex:1;align-self:center;color:var(--faint);font-size:12.5px">${SITE ? esc(SITE.balanceText?.(project) || '') : 'Balance after: ' + creditsWord(wallet.credits - BILLING.perWalkthrough)}</span><button data-close>Cancel</button><button class="primary" id="goGen">${regen ? 'Redesign' : 'Design my home'}</button></div>`);
  m.el.querySelector('#goGen').onclick = () => { m.close(); runGenerate(ok); };
  m.el.querySelector('#editBrief').onclick = async () => { m.close(); if (await askProfile()) requestGenerate(); };
}
async function runGenerate(ok) {
  const { sample } = ok, max = Math.min(ok.max, 4);
  let genId = null;
  if (SITE) { try { genId = await SITE.startGen(project); } catch (e) { flash(errText(e), true); SITE.onError?.(e); return; } SITE.ctx = { kind: 'design', genId }; }
  running = true; ctl = new AbortController(); const signal = ctl.signal; renderGenState();
  project.brief = $('brief').value;
  const roomsWith = inspRooms().filter(r => project.roomInspo?.[r.name]?.length);
  const preset = presetById(project.presetId) || PRESETS[0];
  const P = profile(), prog = P.done && (P.use === 'office' || vastuOn() || P.household.kids || P.household.elders || P.household.wfh);
  const steps = prog ? [{ id: 'prog', label: P.use === 'office' ? 'Planning the office' : vastuOn() ? 'Planning rooms by Vastu' : 'Planning rooms for your family', state: 'active' }] : [];
  steps.push({ id: 'style', label: project.inspo.length ? `Reading your ${project.inspo.length} photo${project.inspo.length > 1 ? 's' : ''}` : `Using the ${preset.name} style`, state: 'active' });
  if (roomsWith.length) steps.push({ id: 'rstyle', label: `Reading photos for ${roomsWith.length} room${roomsWith.length > 1 ? 's' : ''}`, state: 'active' });
  steps.push({ id: 'furn', label: 'Designing and furnishing rooms' }); stepUI(steps);
  let placed = 0;
  try {
    if (prog) {
      try { const ch = await planRooms(sample, signal); buildAll(); stepSet('prog', 'done', ch?.length ? ch.slice(0, 4).join(' · ') : 'Rooms kept as they are'); renderUploads(); }
      catch (e) { if (e?.code === 'cancelled') throw e; stepSet('prog', 'error', errText(e) + ' Keeping the rooms as they are.'); }
    }
    const roomsWith = inspRooms().filter(r => project.roomInspo?.[r.name]?.length);
    const ts = ticker('style', 'Reading materials and colours');
    // the photos are read as recipes to copy (every piece, its shape, colours, materials and place), not only as a palette
    const homeP = project.inspo.length ? collages(project.inspo, max).then(imgs => sample.json(REF_PROMPT(project.brief), { images: imgs, modelTier: 'complex', signal, onText: ts.onText })) : Promise.resolve(null);
    const roomJobs = roomsWith.map(r => async () => {
      const imgs = await collages(project.roomInspo[r.name], max);
      const raw = await sample.json(REF_PROMPT(project.brief, r), { images: imgs, modelTier: 'complex', signal });
      const st = normalizeStyle(raw), fam = refFamily(r), recipe = st.recipes.find(x => x.shows === fam) || st.recipes[0] || null;
      project.roomStyles[r.name] = { summary: st.summary, features: st.features, tokens: st.tokens, floor: st.floors[roomCat(r.type)], recipe, walls: recipe?.wall?.color || st.walls, ceiling: st.ceiling };
    });
    let rdone = 0, rfail = 0; const pool = async () => { while (roomJobs.length) { const j = roomJobs.shift(); try { await j(); } catch (e) { if (e?.code === 'cancelled') throw e; rfail++; } rdone++; stepSet('rstyle', null, `${rdone} of ${roomsWith.length} rooms`); } };
    const [hr, rr] = await Promise.allSettled([homeP.finally(ts.stop), Promise.all([pool(), pool()])]);
    const base = structuredClone(preset.style);
    if (hr.status === 'rejected') { if (hr.reason?.code === 'cancelled') throw hr.reason; stepSet('style', 'error', errText(hr.reason) + ` Using the ${preset.name} style instead.`); project.style = normalizeStyle(base); project.customStyle = false; }
    else if (hr.value) { const v = hr.value || {}; project.style = normalizeStyle({ ...base, ...v, tokens: { ...base.tokens, ...(v.tokens || {}) }, floors: { ...base.floors, ...(v.floors || {}) } }); project.customStyle = true; stepSet('style', 'done', project.style.summary); }
    else { project.style = normalizeStyle(base); project.customStyle = false; stepSet('style', 'done', preset.style.summary); }
    layout.settings.timeOfDay = project.style.time;
    if (rr.status === 'rejected' && rr.reason?.code === 'cancelled') throw rr.reason;
    if (roomsWith.length) stepSet('rstyle', rfail === roomsWith.length ? 'error' : 'done', `${roomsWith.length - rfail} of ${roomsWith.length} rooms have their own style${rfail ? `; ${rfail} could not be read and use the home style` : ''}`);
    for (const k in MC) delete MC[k];
    applyStyleToRooms(layout, project.style); removeItemsWhere(() => true); select(null); project.edits = []; undoStack = [];
    buildAll(); renderStyle(); saveSoon();
    const r = await furnishRooms(inspRooms().filter(r => r.type !== 'other'), signal); placed = r.placed;
  } catch (e) {
    if (e?.code === 'cancelled') flash('Stopped. Nothing was charged; what was already built is kept.', true);
    else if (e?.code) flash(errText(e) + ' Nothing was charged.', true);
    else { console.error(e); flash('Something went wrong while building: ' + (e?.message || e) + '. Nothing was charged.', true); }
  } finally {
    running = false;
    if (placed > 0) { if (!SITE) charge(`Home design · ${project.name || 'My new home'}`); project.status = 'generated'; project.generatedAt = Date.now(); captureCover(); flash(SITE ? 'Your home is ready. Walk in and look around.' : `Your home is ready. ${creditsWord(BILLING.perWalkthrough)} used, ${creditsWord(wallet.credits)} left.`); renderSugg(); setTimeout(maybeCoach, 400); const A = vastuOn() && vastuAudit(); if (A) setTimeout(() => flash(`Vastu score ${A.score}/100. Ask Mira “is my home Vastu compliant?” for the details.`), 2600); }
    if (SITE && genId) SITE.finishGen?.(genId);
    renderPresets();
    renderUploads(); renderPhist(); saveSoon();
  }
}
async function furnishRooms(rooms, signal, stepId = 'furn', extra = '') {
  const sample = await getSample(); if (!sample) return { placed: 0 };
  // one room per call: Claude gets the whole room to reason about, and a second pass to fix what didn't fit
  const queue = [...rooms].sort((a, b) => polyArea(b.polygon) - polyArea(a.polygon)).map(r => [r]);
  const repairOK = !SITE || ['design', 'edit_followup'].includes(SITE.ctx?.kind);
  let done = 0, placed = 0, failed = 0, open = 0; stepSet(stepId, 'active', `0 of ${rooms.length} rooms`);
  const t0 = performance.now(), iv = setInterval(() => stepSet(stepId, null, `${done} of ${rooms.length} rooms · ${placed} pieces · ${Math.round((performance.now() - t0) / 1000)}s`), 1000);
  const worker = async () => {
    while (queue.length) {
      const ch = queue.shift(); if (signal?.aborted) return;
      try {
        const { items, issues } = await furnishOne(sample, ch, extra, signal, repairOK);
        if (issues.length) { open += issues.length; console.info(`[furnish] ${ch.map(r => r.name).join(', ')}: ${issues.length} open issue(s)`, issues); }
        layout.furniture.push(...items); addItemsLive(items); placed += items.length; updateMeta(); saveSoon();
      } catch (e) { if (e?.code === 'cancelled') throw e; failed += ch.length; flash(`${ch.map(r => r.name).join(', ')}: ${errText(e)}`, true); }
      done += ch.length;
    }
  };
  try { await Promise.all([worker(), worker(), worker(), worker()]); }
  finally { clearInterval(iv); stepSet(stepId, failed === rooms.length ? 'error' : 'done', `${placed} pieces in ${rooms.length - failed} of ${rooms.length} rooms · ${Math.round((performance.now() - t0) / 1000)}s`); }
  return { placed, failed, open };
}
async function refurnishRoom(r, extra = '', bill = true) {
  if (running) return;
  if (!SITE && bill && wallet.credits < BILLING.perChange - 1e-9) { openWallet('empty'); return; }
  if (SITE) { if (bill && !(await SITE.canEdit?.(project))) return; SITE.ctx = bill ? { kind: 'refurnish', homeId: project.id } : { kind: 'edit_followup', editId: SITE.lastEditId }; }
  running = true; ctl = new AbortController();
  stepUI([{ id: 'refurn', label: 'Refurnishing ' + r.name, state: 'active' }]);
  try { removeItemsWhere(it => it.room === r.name); select(null); const { placed } = await furnishRooms([r], ctl.signal, 'refurn', extra); if (bill && placed > 0 && SITE) flash(`${r.name} redone.`); if (bill && placed > 0 && !SITE) { charge(`Redo ${r.name}`, BILLING.perChange); flash(`${r.name} redone. ${cfmt(BILLING.perChange)} credits used, ${creditsWord(wallet.credits)} left.`); } }
  catch (e) { if (e?.code !== 'cancelled') flash(errText(e), true); }
  finally { running = false; saveSoon(); }
}

/* ================= prompt editing ================= */
const pbar = $('pbar'), pinput = $('pinput'), pstatus = $('pstatus'), phist = $('phist');
const SUGG_BASE = ['Make the master bedroom moodier with dark walnut', 'Add a reading chair and floor lamp by the living room window', 'Change all bedroom floors to light oak', 'Swap the sofa fabric to a deep olive', 'Switch to night and add more warm lamps', 'Turn one bedroom into a home office'];
function renderSugg() {
  const rooms = layout.rooms.filter(r => r.kind === 'room').map(r => r.name);
  const list = rooms.length ? SUGG_BASE.map(s => s.replace('one bedroom', rooms.find(n => /bed/i.test(n) && !/master/i.test(n)) || 'one bedroom')) : SUGG_BASE;
  $('sugg').innerHTML = list.map(s => `<button type="button">${esc(s)}</button>`).join('');
  $('sugg').querySelectorAll('button').forEach(b => b.onclick = () => { pinput.value = b.textContent; pinput.focus(); });
}
function renderPhist() {
  const e = (project?.edits || []).slice(0, 8);
  phist.innerHTML = e.map((x, i) => `<div><span>${esc(x.text)}<small>${esc(x.summary || '')} · ${x.by && x.by !== SITE?.me?.user?.email ? esc(x.by.split('@')[0]) + ' · ' : ''}${ago(x.t)}</small></span>${i === 0 && undoStack.length ? '<button type="button" id="undoLast">Undo</button>' : ''}</div>`).join('');
  $('undoLast')?.addEventListener('click', undoEdit);
}
pinput.addEventListener('focus', () => pbar.classList.add('open'));
document.addEventListener('pointerdown', e => { if (!pbar.contains(e.target)) pbar.classList.remove('open'); });
pinput.addEventListener('keydown', e => { if (e.key === 'Escape') { pbar.classList.remove('open'); pinput.blur(); } e.stopPropagation(); });
function dirName(yaw) { const fx = -Math.sin(yaw), fz = -Math.cos(yaw); return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 'right (+x)' : 'left (-x)') : (fz > 0 ? 'down the plan (+z)' : 'up the plan (-z, north)'); }
function editPrompt(text, context = '') {
  const low = text.toLowerCase(), here = roomAt(player.x, player.z), selRoom = selected && layout.rooms.find(r => r.name === selected.room);
  let focus = layout.rooms.filter(r => r.kind !== 'ledge' && low.includes(r.name.toLowerCase()));
  if (!focus.length) { const types = [['bedroom', /bedroom|bed room/], ['bath', /bath|toilet|washroom/], ['kitchen', /kitchen/], ['living', /living|lounge/], ['terrace', /terrace|balcon/]]; for (const [t, re] of types) if (re.test(low)) focus.push(...layout.rooms.filter(r => r.type === t || (t === 'bedroom' && r.type === 'master') || (t === 'terrace' && r.kind === 'outdoor'))); }
  if (!focus.length) focus = [selRoom || here].filter(Boolean);
  const vReq = /vastu/i.test(text);
  if (vReq) for (const m of text.matchAll(/"([^"]+)"/g)) { const r = layout.rooms.find(x => x.name === m[1]); if (r) focus.push(r); }
  focus = [...new Set(focus)].slice(0, vReq ? 8 : 4);
  const extrasOf = it => Object.entries(it).filter(([k]) => !['id', 'type', 'name', 'room', 'x', 'z', 'rot', 'w', 'd', 'h', 'y', 'finish', 'accent'].includes(k)).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
  let furn = layout.furniture.map(it => { const f = withDefaults(it); return `${it.id} | ${it.type} | ${it.name || ''} | ${it.room || ''} | ${f1(it.x)},${f1(it.z)} rot ${Math.round(it.rot || 0)} | ${f1(f.w)}×${f1(f.d)}×${f1(f.h)}${f.y ? ' y' + f1(f.y) : ''} | ${f.finish || ''} | ${f.accent || ''}${extrasOf(it) ? ' | ' + extrasOf(it) : ''}`; });
  if (furn.join('\n').length > 26000) { const keep = new Set(focus.map(r => r.name)); furn = layout.furniture.filter(it => keep.has(it.room)).map(it => furn[layout.furniture.indexOf(it)]); }
  const rooms = layout.rooms.filter(r => r.kind !== 'ledge').map(r => { const xs = r.polygon.map(p => p[0]), zs = r.polygon.map(p => p[1]); return `${r.name} | ${r.type} | ${Math.round(polyArea(r.polygon))} sq ft | x ${f1(Math.min(...xs))}–${f1(Math.max(...xs))}, z ${f1(Math.min(...zs))}–${f1(Math.max(...zs))} | floor ${r.finish} ${r.floor}${r.wall ? ' | own wall paint ' + r.wall : ''}${r.ceil ? ' | own ceiling ' + r.ceil : ''}${hasNorth() ? ' | ' + DIRNAME[roomZone(r)] : ''}`; }).join('\n');
  const detail = focus.map(r => { const F = roomFrame(r); return `${describeRoom(F, false)}\nThis room's coordinates start at whole-home (${f1(F.ox)},${f1(F.oz)}).`; }).join('\n\n');
  // what the architect drew on the plan: the rooms in question, or every room when they ask about the plan itself
  const asksPlan = /\b(plan|drawn|drawing|architect|blueprint|layout shown|as shown)\b/i.test(text), fwd_ = { 0: 'down (+z)', 90: 'right (+x)', 180: 'up (-z)', '-90': 'left (-x)' }, focusNames = new Set(focus.map(r => r.name));
  const drawnList = (layout.planFurniture || []).filter(p => asksPlan || focusNames.has(p.room)).sort((a, b) => focusNames.has(b.room) - focusNames.has(a.room)).slice(0, 90);
  const drawn = (layout.planFurniture || []).length
    ? `FURNITURE DRAWN ON THE FLOOR PLAN (room | piece | x range, z range in whole-home ft | size | front facing). This is what the architect drew, whether or not it stands in the home now:\n${drawnList.map(p => `${p.room} | ${p.kind} | x ${f1(p.x0)}–${f1(p.x1)}, z ${f1(p.z0)}–${f1(p.z1)} | ${f1(p.x1 - p.x0)}×${f1(p.z1 - p.z0)}${p.rot != null ? ' | ' + fwd_[p.rot] : ''}`).join('\n') || '(nothing is drawn in the room they mean)'}`
    : 'FURNITURE DRAWN ON THE FLOOR PLAN: none was read from this plan.';
  const cat = Object.entries(CAT).map(([k, d]) => `${k}: ${d.d.w}×${d.d.d}×${d.d.h}${d.d.y ? ' y' + d.d.y : ''} — ${NOTES[k] || d.label}${typeOptions(k).size ? ` [options: ${optionList(k)}]` : ''}`).join('\n');
  return `You are editing a furnished 3D model of a home for a homeowner. Units are feet. x increases to the right on the plan, z increases downward. rot is degrees: an item's front faces +z at 0, +x at 90, -z at 180, -x at -90. x,z is an item's centre; w is its width across the front, d its depth, h its height, y its lift off the floor.

HOMEOWNER'S REQUEST: "${text.slice(0, vReq ? 2400 : 1800)}"${context ? `\nEARLIER IN THE CONVERSATION (only to understand what they mean; do not act on it): ${String(context).slice(0, 700)}` : ''}
WHERE THEY ARE: standing in ${here ? here.name : 'no room'} at (${f1(player.x)},${f1(player.z)}), looking ${dirName(player.yaw)}. Selected item: ${selected ? `${selected.id} (${selected.name || selected.type})` : 'none'}. ${lookingAt() ? 'Straight ahead, ' + lookingAt() : ''} Words like "this", "here", "that wall" or "this window" refer to these.
STYLE: ${project.style.summary} Tokens now: ${JSON.stringify(project.style.tokens)}. Walls ${layout.settings.wallColor}, ceiling ${layout.settings.ceilingColor}. Time of day: ${layout.settings.timeOfDay}.${Object.keys(project.roomStyles || {}).length ? ' Rooms with their own style (their items resolve style tokens to these): ' + Object.entries(project.roomStyles).map(([k, v]) => `${k}: ${v.summary}`).join(' | ') : ''}
CEILING HEIGHT: ${layout.settings.ceilingHeight} ft.${profile().done ? '\n' + spaceText() : ''}
${hasNorth() ? `COMPASS: ${compassVecsText()}` : ''}${(vReq || vastuOn()) && hasNorth() ? '\n' + VASTU_RULES : ''}

ROOMS (name | type | area | bounds | floor${hasNorth() ? ' | position in the home' : ''}):
${rooms}

${detail}

${drawn}

WALLS (id | from→to in whole-home ft | size | LIGHT or STRUCTURE | the rooms on each side | its doors and windows):
${wallsText()}

FURNITURE (id | type | name | room | x,z rot | w×d×h y | finish | accent | extras):
${furn.join('\n')}

CATALOG for new items (type: default w×d×h — notes [options: the only extra fields that type has]):
${cat}

${CUSTOM_GUIDE}
A custom piece is added with {"op":"add","item":{"type":"custom","name":...,"parts":[...], ...placement}}; an existing custom piece is reshaped with update "set":{"parts":[...]}. Use one when they ask for a piece the catalog has nothing like ("a cane chair like this", "a scalloped headboard"), rather than a stand-in that does not look like it.${refsFor(focus)}

Reply with only JSON: {"summary":"one short sentence, as the designer speaking to the homeowner, saying what you changed","left":"anything they asked for that these operations do not do, and why, in a few plain words; empty when everything asked for is done","ops":[ ... ]}. Operations:
{"op":"update","id":"<id>","set":{ any of x, z, rot, w, d, h, y, finish, accent, name, "type" (to turn the piece into another catalog type where it stands), or one of that type's options }}
{"op":"add","item":{"room":"<room>","type":"<catalog type>","name":"<label>", ...placement..., "w":0,"d":0,"h":0,"y":0,"finish":"<token or #hex>","accent":"<token or #hex>"}} — placement is either whole-home "x","z","rot", or, for a room described in detail above, its room terms: "wall":"W2","along":ft,"off":ft (against that wall, facing into the room) or "at":[X,Z] with "rot" (room coordinates). Prefer the wall form for anything that stands against or hangs on a wall.
{"op":"remove","id":"<id>"}
{"op":"style","token":"wood-light|wood-dark|stone|marble|stone-dark|fabric-main|fabric-second|fabric-accent|metal","value":"#hex"} (for stone, marble, stone-dark the value may be {"look":"travertine|marble|limestone|concrete|terrazzo","color":"#hex"}; for metal "brass|black|chrome"). This changes the material everywhere it is used.
{"op":"floor","rooms":["<room>"],"finish":"stone-large|wood|tile-2ft|tile-1ft|terrazzo|stone","color":"#hex"}
{"op":"paint","walls":"#hex","ceiling":"#hex","rooms":["<room>"]} — with "rooms", paints only those rooms' walls and ceilings; without it, the whole home.
{"op":"time","value":"golden|day|night"}
{"op":"refurnish","rooms":["<room>"],"brief":"what the room should become"} — only when the request asks to redo or repurpose a whole room.
${STRUCT_HELP}
{"op":"swap","a":"<room>","b":"<room>"} swap what two rooms are used for (their names and types trade places; walls stay). Always follow it with a refurnish op for both rooms, using the names after the swap.
Finish tokens: wood-light, wood-dark, stone, marble, stone-dark, fabric-main, fabric-second, fabric-accent, metal; also linen, linen-white, white-ceramic, black-metal, brass, chrome, felt, terracotta, concrete, plaster, teak, or "#rrggbb".
RULES: make the smallest set of changes that fully does what was asked. To recolour one piece, set that item's finish or accent; change a style token only when the request is about a material across the home. Keep items inside their room, clear of walls, doors and other furniture; wall-backed items (beds, sofas on walls, wardrobes, consoles, desks, vanities, TVs, art, mirrors, wall panels, curtains) keep their back on a wall face. A wall marked STRUCTURE is never opened or removed as a design change: say so in the summary and do the nearest thing that is possible (open a LIGHT wall, widen a window, re-plan the furniture). If the home already is the way they ask, or the request cannot be done, return an empty ops list and say so in summary. To paint or recolour the walls of one room, use "paint" with "rooms"; panels and feature walls are for when they ask for cladding.
DO IT ALL, IN THIS ONE REPLY. There is no second turn: nobody can answer a question, and anything left out stays undone. Before you answer:
1. List to yourself every separate thing the request asks for. Each needs operations that make it visibly true in the home, or a line in "left". The summary may only claim what the operations do.
2. An option not listed for a type does not exist: setting it changes nothing. If the catalog has no piece or option for what they want, use the nearest real one and say so in "left".
3. Replacing a piece means removing or re-typing the old one; never leave the old piece under the new one. Moving a piece means moving what belongs with it (its rug, side tables, chairs, lamps, the art above it).
4. For every piece you add or move, check its footprint (x ± w/2 and z ± d/2, swapped when rot is ±90) against the room's bounds, the door clear zones and every piece that stays. Leave a walkway of 2.5 ft. If it does not fit where asked, put it in the nearest place it does fit and say so.
5. Use ids exactly as listed, and room names exactly as listed (after a room_set rename, the new name).
6. Furniture "from the plan", "as drawn" or "as per the architect" means the list FURNITURE DRAWN ON THE FLOOR PLAN. To furnish a whole room that way, use one refurnish op for it with the brief "exactly as drawn on the floor plan: same pieces, places, sizes and orientations" (the furnishing engine sees the same drawing); at most six rooms in one change, the rooms they are in or named first, and say in "left" which rooms remain. To add only a piece or two, add them yourself at the drawn place, size and orientation, using the nearest catalog type. If nothing was drawn where they mean, say so in "left".
7. Work in the room they mean. "This room", "here", or a kind of room that fits the room they are standing in ("the living room" while standing in a living room) means that room. Touch another room only when the request names it or plainly needs it; if the room they mean has no space for what they want, say so in "left" rather than putting it somewhere else.`;
}
/* ---------- applying a change, and checking it as built ---------- */
// What the model meant when a name is slightly off: a catalog type, a room, or a piece.
function nearType(t) {
  t = String(t || '').toLowerCase().trim().replace(/[\s_]+/g, '-'); if (CAT[t]) return t; if (!t) return null;
  const keys = Object.keys(CAT), flat = x => x.replace(/-/g, '');
  const hit = keys.find(k => flat(k) === flat(t)) || keys.find(k => k.startsWith(t + '-') || t.startsWith(k + '-')); if (hit) return hit;
  const tok = new Set(t.split('-')); let best = null, bs = 0;
  for (const k of keys) { const kt = k.split('-'), sc = kt.filter(x => tok.has(x)).length / Math.max(kt.length, tok.size); if (sc > bs) { bs = sc; best = k; } }
  return bs >= .5 ? best : null;
}
function nearRoom(nm) {
  const q = String(nm || '').toLowerCase().trim(); if (!q) return null;
  return layout.rooms.find(r => r.name.toLowerCase() === q) || layout.rooms.find(r => r.kind !== 'ledge' && (r.name.toLowerCase().includes(q) || q.includes(r.name.toLowerCase()))) || null;
}
function nearItem(op) {
  const id = String(op.id ?? ''); let it = layout.furniture.find(x => x.id === id) || layout.furniture.find(x => x.id.toLowerCase() === id.toLowerCase().trim()); if (it) return it;
  const q = id.toLowerCase().trim(); if (q.length < 3) return null;
  const pool = layout.furniture.filter(x => (x.name || '').toLowerCase() === q || x.type === q); return pool.length === 1 ? pool[0] : null;   // only when it can mean one piece
}
// The options a catalog type really has: its defaults, its declared extras and every field its builder reads.
const CORE_FIELDS = new Set(['id', 'type', 'name', 'room', 'x', 'z', 'rot', 'w', 'd', 'h', 'y', 'finish', 'accent']);
const TYPE_OPTS = {};
function typeOptions(type) {
  if (TYPE_OPTS[type]) return TYPE_OPTS[type]; const def = CAT[type], set = new Set(); if (!def) return set;
  for (const k of Object.keys(def.d || {})) set.add(k); for (const e of def.extras || []) set.add(e[0]);
  for (const m of String(def.build || '').matchAll(/\bit\.([A-Za-z_]\w*)/g)) set.add(m[1]);
  for (const k of CORE_FIELDS) set.delete(k); for (const k of ['_anchor', '_group', '_ref', '_float']) set.delete(k);
  return TYPE_OPTS[type] = set;
}
const optionList = type => [...typeOptions(type)].join(', ');
const ADD_TERMS = new Set(['wall', 'along', 'off', 'at', 'rel', 'side', 'gap', 'shift', 'on', 'over', 'face', 'turn', 'chairs', 'chair', 'nightstands', 'lamps', 'stools', 'item', 'op']);
const TUCKS = /table|desk|counter|island|vanity|bar/;
const standsOnFloor = it => isSolid(it) && (+withDefaults(it).y || 0) < .9;
const tucked = (A, B) => (SEATING.test(A.type) && TUCKS.test(B.type)) || (SEATING.test(B.type) && TUCKS.test(A.type));
// Pieces a change moved are nudged clear of doorways, walls and their neighbours, the way newly added pieces are.
function settleTouched(ids) {
  const its = layout.furniture.filter(it => ids.has(it.id) && CAT[it.type] && standsOnFloor(it)); if (!its.length) return;
  const wallBoxes = wallCols.filter(c => c.wall && c.y0 < 1).map(c => ({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, c: c.c, s: c.s })), doors = doorZones();
  for (let pass = 0; pass < 3; pass++) {
    for (const it of its) { for (const dz of doors) doorFix(it, dz); for (const wb of wallBoxes) { const m = sat(itemOBB(it), wb); if (m && m.ov < 2.5) { it.x = r2(it.x - m.ax * m.sg * (m.ov + .02)); it.z = r2(it.z - m.az * m.sg * (m.ov + .02)); } } }
    for (const A of its) for (const B of layout.furniture) {
      if (B === A || B.room !== A.room || !CAT[B.type] || !standsOnFloor(B) || (ids.has(B.id) && B.id < A.id)) continue;
      const m = sat(itemOBB(A), itemOBB(B)); if (!m || m.ov > 3 || m.ov <= (tucked(A, B) ? 1.1 : .05)) continue;
      const fa = withDefaults(A), fb = withDefaults(B), mv = ids.has(B.id) && fb.w * fb.d < fa.w * fa.d ? B : A, sg = mv === A ? -1 : 1;
      mv.x = r2(mv.x + sg * m.ax * m.sg * (m.ov + .02)); mv.z = r2(mv.z + sg * m.az * m.sg * (m.ov + .02));
    }
  }
}
// The nearest spot where a piece fits: inside its room, off the doors and clear of its neighbours. Wall-backed pieces
// only slide along their wall. Returns true if it was moved there; a piece with no such spot within reach is left alone.
function rehome(it) {
  const r = layout.rooms.find(x => x.name === it.room); if (!r || !CAT[it.type] || WALLMOUNT.has(it.type) || !standsOnFloor(it)) return false;
  let F; try { F = roomFrame(r); } catch { return false; }
  const ok = () => insideRoom(it, F, .25) && !F.clear.some(z => { const m = sat(itemOBB(it), z); return m && m.ov > .3; }) &&
    !layout.furniture.some(o => { if (o === it || o.room !== it.room || !CAT[o.type] || !standsOnFloor(o)) return false; const m = sat(itemOBB(it), itemOBB(o)); return m && m.ov > (tucked(it, o) ? 1.1 : .3); });
  if (ok()) return false;
  const x0 = it.x, z0 = it.z, th = (it.rot || 0) * D2R, ax = Math.cos(th), az = -Math.sin(th), backed = BACKED.has(it.type) && !it._float, reach = backed ? 6 : 5;
  for (let d = .5; d <= reach; d += .5) {
    const ring = backed ? [[ax * d, az * d], [-ax * d, -az * d]] : Array.from({ length: 12 }, (_, k) => [Math.cos(k * Math.PI / 6) * d, Math.sin(k * Math.PI / 6) * d]);
    for (const [dx, dz] of ring) { it.x = r2(x0 + dx); it.z = r2(z0 + dz); if (roomAt(it.x, it.z) === r && ok()) return true; }
  }
  it.x = x0; it.z = z0; return false;
}
// What is still wrong with the pieces a change added or moved. Each entry has the words for the model and for the homeowner.
function fitIssues(ids) {
  const out = [], frames = new Map(), F = nm => { if (!frames.has(nm)) { const r = layout.rooms.find(x => x.name === nm); let f = null; try { f = r && r.polygon?.length > 2 ? roomFrame(r) : null; } catch { } frames.set(nm, f); } return frames.get(nm); };
  const lab = it => `${it.id} (${it.name || it.type})`, nm = it => (it.name || CAT[it.type]?.label || it.type).toLowerCase(), seen = new Set();
  const push = (key, text, say, ...ids) => { if (!seen.has(key)) { seen.add(key); out.push({ key, text, say, ids }); } };
  for (const it of layout.furniture) {
    if (!ids.has(it.id) || !CAT[it.type]) continue;
    const f = F(it.room), df = withDefaults(it); if (!f) { push('room:' + it.id, `${lab(it)} is not inside any room`, `the ${nm(it)} has no room to stand in`, it.id); continue; }
    if (!WALLMOUNT.has(it.type) && !CAT[it.type].nc && (+df.y || 0) <= 6 && !insideRoom(it, f, /^rug/.test(it.type) ? .6 : .25)) {
      const xs = f.r.polygon.map(q => q[0]), zs = f.r.polygon.map(q => q[1]);
      push('out:' + it.id, `${lab(it)}, ${f1(df.w)}×${f1(df.d)} ft at ${f1(it.x)},${f1(it.z)} rot ${Math.round(it.rot || 0)}, sticks out of ${it.room} (x ${f1(Math.min(...xs))}–${f1(Math.max(...xs))}, z ${f1(Math.min(...zs))}–${f1(Math.max(...zs))}) or into a wall`, `the ${nm(it)} does not quite fit in ${it.room}`, it.id);
    }
    if (!standsOnFloor(it)) continue;
    for (const z of f.clear) { const m = sat(itemOBB(it), z); if (m && m.ov > .3) push('door:' + it.id + ':' + z.face, `${lab(it)} stands in the clear zone of the ${z.o.main ? 'main entrance' : z.o.type}${z.o.to ? ' to ' + z.o.to : ''} of ${it.room} (wall ${z.face})`, `the ${nm(it)} is in the way of a door`, it.id); }
    for (const o of layout.furniture) {
      if (o === it || o.room !== it.room || !CAT[o.type] || !standsOnFloor(o)) continue;
      const m = sat(itemOBB(it), itemOBB(o)); if (!m || m.ov <= (tucked(it, o) ? 1.1 : .3)) continue;
      const fo = withDefaults(o);
      push('hit:' + [it.id, o.id].sort().join('+'), `${lab(it)} at ${f1(it.x)},${f1(it.z)} (${f1(df.w)}×${f1(df.d)}) overlaps ${lab(o)} at ${f1(o.x)},${f1(o.z)} (${f1(fo.w)}×${f1(fo.d)}) by ${f1(m.ov)} ft`, `the ${nm(it)} runs into the ${nm(o)}`, it.id, o.id);
    }
  }
  return out;
}
// Applies a change. Returns what was done, the operations that could not be applied (failed) and what does not fit (issues).
function applyOps(res) {
  const ops = Array.isArray(res?.ops) ? res.ops.slice(0, 120) : [];
  let n = 0, shell = false, mats = false, struct = false; const added = [], refurn = [], notes = [], failed = [], touched = new Set();
  const fail = (text, say) => failed.push({ text, say });
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    if (op.op === 'update') {
      const it = nearItem(op); if (!it) { fail(`update: there is no piece with id "${op.id}"`, 'one piece I meant to change was not found'); continue; } const set = op.set && typeof op.set === 'object' ? op.set : {};
      let geo = false;
      if (set.type && set.type !== it.type) { const t = nearType(set.type); if (t) { it.type = t; for (const k of ['w', 'd', 'h', 'y']) if (!(k in set)) delete it[k]; if (!set.name) it.name = CAT[t].label; geo = true; } else fail(`update ${it.id}: "${set.type}" is not a catalog type`, `there is no ${String(set.type).replace(/-/g, ' ')} in the catalogue`); }
      const opts = typeOptions(it.type), bad = [];
      for (const [k, v] of Object.entries(set)) {
        if (['id', 'type', 'room'].includes(k)) continue;
        if (['x', 'z', 'rot', 'w', 'd', 'h', 'y'].includes(k)) { const x = +v; if (isFinite(x) && (!['w', 'd', 'h'].includes(k) || x > 0)) { if (it[k] !== x && k !== 'h' && k !== 'y') geo = true; it[k] = x; } }
        else if (k === 'parts' && it.type === 'custom' && Array.isArray(v) && v.length) { it.parts = v; for (const q of ['w', 'd', 'h']) if (!(q in set)) delete it[q]; prepCustom(it); geo = true; }
        else if (CORE_FIELDS.has(k) || opts.has(k) || k in it) it[k] = v;
        else bad.push(k);
      }
      // an invented option changes nothing; it only counts as a failure when the whole operation came to nothing
      if (bad.length && bad.length === Object.keys(set).filter(k => !['id', 'room', 'name'].includes(k)).length) { fail(`update ${it.id}: a ${it.type} has no option called ${bad.map(k => '"' + k + '"').join(', ')}, so this did nothing${opts.size ? ` (its options: ${optionList(it.type)})` : ' (it has no options beyond size, finish and accent)'}`, `the ${(it.name || it.type).toLowerCase()} cannot be changed that way`); continue; }
      if (geo && BACKED.has(it.type)) snapBack(it);
      const r = roomAt(it.x, it.z); if (r) it.room = r.name; if (geo) touched.add(it.id); rebuildItem(it); n++;
    } else if (op.op === 'remove') { const it = nearItem(op); if (!it) { fail(`remove: there is no piece with id "${op.id}"`, 'one piece I meant to remove was not found'); continue; } removeItemsWhere(x => x === it); n++; }
    else if (op.op === 'add') {
      const src = op.item && typeof op.item === 'object' ? op.item : op, t = nearType(src.type);
      if (!t) { fail(`add: "${src.type}" is not a catalog type`, `there is no ${String(src.type || 'such piece').replace(/-/g, ' ')} in the catalogue`); continue; }
      const opts = typeOptions(t), bad = Object.keys(src).filter(k => !CORE_FIELDS.has(k) && !opts.has(k) && !ADD_TERMS.has(k)), item = { ...src, type: t }; for (const k of bad) delete item[k];
      if (t === 'custom') { if (!Array.isArray(item.parts) || !item.parts.length) { fail('add: a custom piece needs "parts"', `the ${String(src.name || 'custom piece').toLowerCase()} could not be built`); continue; } prepCustom(item); }
      added.push({ item, room: nearRoom(src.room), named: src.room });   // the room itself, not its name: a later op may rename it
    }
    else if (op.op === 'style') {
      if (!TOKEN_NAMES.includes(op.token)) { fail(`style: "${op.token}" is not a style token`, 'one material change did not apply'); continue; }
      const cur = project.style.tokens[op.token], v = op.value;
      if (op.token === 'metal') { if (['brass', 'black', 'chrome'].includes(v)) project.style.tokens.metal = v; else { fail(`style metal: "${v}" is not brass, black or chrome`, 'the metal finish was not one I can use'); continue; } }
      else if (typeof cur === 'object') { if (v && typeof v === 'object') { if (['travertine', 'marble', 'limestone', 'concrete', 'terrazzo'].includes(v.look)) cur.look = v.look; cur.color = hexOk(v.color, cur.color); } else cur.color = hexOk(v, cur.color); }
      else project.style.tokens[op.token] = hexOk(v, cur);
      mats = true; n++;
    } else if (op.op === 'floor') {
      const names = Array.isArray(op.rooms) ? op.rooms : [op.room];
      for (const nm of names) { const r = nearRoom(nm); if (!r) { fail(`floor: there is no room called "${nm}"`, `I could not find the room "${nm}"`); continue; } if (['stone-large', 'wood', 'tile-2ft', 'tile-1ft', 'terrazzo', 'stone', 'plain'].includes(op.finish)) r.finish = op.finish; r.floor = hexOk(op.color, r.floor); shell = true; n++; }
    } else if (op.op === 'paint') {
      const names = Array.isArray(op.rooms) ? op.rooms : op.room ? [op.room] : null;
      if (names) { for (const nm of names) { const r = nearRoom(nm); if (!r) { fail(`paint: there is no room called "${nm}"`, `I could not find the room "${nm}"`); continue; } if (op.walls) r.wall = hexOk(op.walls, r.wall || layout.settings.wallColor); if (op.ceiling) r.ceil = hexOk(op.ceiling, r.ceil || layout.settings.ceilingColor); shell = true; n++; } }
      else { if (op.walls) { layout.settings.wallColor = hexOk(op.walls, layout.settings.wallColor); project.style.walls = layout.settings.wallColor; for (const r of layout.rooms) delete r.wall; } if (op.ceiling) { layout.settings.ceilingColor = hexOk(op.ceiling, layout.settings.ceilingColor); project.style.ceiling = layout.settings.ceilingColor; for (const r of layout.rooms) delete r.ceil; } shell = true; n++; }
    }
    else if (op.op === 'time') { if (TIMES[op.value]) { layout.settings.timeOfDay = op.value; n++; } else fail(`time: "${op.value}" is not golden, day or night`, 'the time of day was not one I can set'); }
    else if (op.op === 'swap') { const a = nearRoom(op.a), b = nearRoom(op.b); if (a && b && a !== b && !FIXED_TYPES.has(a.type) && !FIXED_TYPES.has(b.type)) { const na = a.name, nb = b.name, ta = a.type; renameRoom(a, '\u0000swap'); renameRoom(b, na); renameRoom(a, nb); a.type = b.type; b.type = ta; shell = true; n++; } else fail(`swap: "${op.a}" and "${op.b}" cannot trade places${a && b ? ' (kitchens, baths and outdoor rooms stay where their plumbing is)' : ''}`, 'those two rooms cannot trade places'); }
    else if (STRUCT_OPS.has(op.op)) { const r = applyStructOp(op); if (r.ok) { shell = true; n++; struct = true; } else fail(`${op.op}${op.wall ? ' ' + op.wall : ''}: ${r.note || 'could not be done'}`, ''); if (r.note) notes.push(r.note); }
    else if (op.op === 'refurnish') { for (const nm of (Array.isArray(op.rooms) ? op.rooms : [op.room])) { const r = nearRoom(nm); if (r) refurn.push({ r, brief: op.brief || '' }); else fail(`refurnish: there is no room called "${nm}"`, `I could not find the room "${nm}"`); } }
    else fail(`"${op.op}" is not an operation`, '');
  }
  if (added.length) {
    const list = added.map(a => { const r = a.room && layout.rooms.includes(a.room) ? a.room : nearRoom(a.named); return { ...a.item, ...(r ? { room: r.name } : {}) }; });
    const byName = Object.fromEntries(layout.rooms.map(r => [r.name, r])), frames = [...new Set(list.map(a => byName[a.room]).filter(Boolean))].map(roomFrame);
    const { items: placedNew, notes: rn } = resolveItems(list, frames, byName); placedNew.forEach(it => { if (it._anchor && !it._anchor.global && !(it._anchor.face && (it._anchor.off || 0) <= .3)) it._float = true; delete it._anchor; delete it._group; delete it._ref; });
    for (const t of rn || []) fail('add: ' + t, 'one new piece had nowhere to go');
    const items = settleItems(placedNew, layout.rooms); layout.furniture.push(...items); addItemsLive(items); n += items.length; items.forEach(it => touched.add(it.id));
    if (items.length < placedNew.length) { const kept = items.map(it => it.name), lost = placedNew.filter(it => { const i = kept.indexOf(String(it.name || CAT[it.type].label).slice(0, 40)); if (i >= 0) { kept.splice(i, 1); return false; } return true; });
      fail(`add: ${lost.map(it => `${it.type} "${it.name || ''}" at ${f1(+it.x)},${f1(+it.z)}`).join('; ') || 'a new piece'} lies outside every room (check the room's bounds) and was dropped`, `the ${String(lost[0]?.name || 'new piece').toLowerCase()} landed outside the room`); }
  }
  if (touched.size) { const was = new Map(layout.furniture.filter(it => touched.has(it.id)).map(it => [it.id, [it.x, it.z, it.w]])); settleTouched(touched); for (const it of layout.furniture) { const w = was.get(it.id); if (w && (w[0] !== it.x || w[1] !== it.z || w[2] !== it.w)) { const r = roomAt(it.x, it.z); if (r) it.room = r.name; rebuildItem(it); } } }
  if (mats) for (const k in MC) delete MC[k];
  if (struct) afterStructChange();
  if (shell || mats) buildAll(); else { applyTime(); updateMeta(); }
  saveSoon();
  let issues = touched.size ? fitIssues(touched) : [];
  if (issues.length) { let moved = false; for (const id of new Set(issues.flatMap(i => i.ids))) { const it = layout.furniture.find(x => x.id === id); if (it && touched.has(id) && rehome(it)) { rebuildItem(it); moved = true; } } if (moved) issues = fitIssues(touched); }
  return { n, refurn, notes: [...new Set(notes)].slice(0, 4), failed, issues };
}
function undoEdit() {
  const snap = undoStack.pop(); if (!snap) return;
  project.layout = layout = snap.layout; project.style = snap.style; project.edits.shift();
  for (const k in MC) delete MC[k]; select(null); buildAll(); saveSoon(); renderPhist(); pstatus.textContent = ''; flash('Undone.');
}
let editing = false, editCtl = null, editNow = null, editTail = Promise.resolve();
// One change at a time. A second request waits its turn; it never cancels the first. Only the Stop button cancels.
function requestEdit(text, opts = {}) { const job = editTail.then(() => runEdit(text, opts)); editTail = job.catch(() => { }); return job; }
function restoreSnap(snap) { project.layout = layout = structuredClone(snap.layout); project.style = structuredClone(snap.style); for (const k in MC) delete MC[k]; select(null); buildAll(); }
const changeScore = rep => rep.failed.length * 3 + rep.issues.length;
function fixPrompt(prompt, first, rep) {
  return `${prompt}

YOUR FIRST ANSWER:
${JSON.stringify(first)}

IT WAS APPLIED TO THE HOME AND CHECKED. THESE PARTS DID NOT WORK:
- ${[...rep.failed.map(f => f.text), ...rep.issues.map(i => i.text)].slice(0, 30).join('\n- ')}

The home has been put back exactly as it is listed above. Answer again with the complete, corrected JSON: every operation, not only the changed ones. Keep what worked. Fix each problem: use ids, room names, catalog types and options exactly as listed; move, turn or resize pieces so they fit; if a part cannot be done, leave it out and say so in "left". The same checks will be run on this answer.`;
}
// Makes one change, checks it as built, and repairs it once if something did not work.
// Returns { ok, n, summary, notes, left, open, fixed, cancelled, paywall, reason } and never throws.
async function runEdit(text, { signal, context = '' } = {}) {
  text = String(text || '').trim(); if (!text) return { ok: false, reason: 'Nothing to change.' };
  if (running) return { ok: false, reason: 'A design is still being made. This can be done as soon as it finishes.' };
  if (signal?.aborted) return { ok: false, cancelled: true, reason: 'Stopped. Nothing was changed.' };
  if (SITE) { const t0 = Date.now(); if (!(await SITE.canEdit?.(project))) return { ok: false, paywall: (SITE.lastPaywall && SITE.lastPaywall.t >= t0 && SITE.lastPaywall.reason) || 'blocked', reason: 'This home has no changes left.' }; }
  else if (wallet.credits < BILLING.perChange - 1e-9) { openWallet('empty'); return { ok: false, paywall: 'credits', reason: 'Not enough credits for a change.' }; }
  const sample = await getSample(); if (!sample) return { ok: false, reason: 'Changes need Claude, which is not available in this view.' };
  editing = true; editNow = text; editCtl = new AbortController(); signal?.addEventListener('abort', () => editCtl.abort());
  $('pgo').textContent = 'Stop'; pinput.disabled = true; pbar.classList.remove('open');
  let phase = 'Working on it';
  const t0 = performance.now(), iv = setInterval(() => { pstatus.textContent = `${phase}… ${Math.round((performance.now() - t0) / 1000)}s`; }, 500);
  const snap = { layout: structuredClone(layout), style: structuredClone(project.style) };
  let applied = false;
  try {
    const prompt = editPrompt(text, context);
    const ask = (p, fix) => sample.json(p, { modelTier: 'default', signal: editCtl.signal, ctx: SITE ? (fix ? { kind: 'edit_fix', editId: SITE.lastEditId } : { kind: 'edit', homeId: project.id }) : undefined });
    let res;
    try { res = await ask(prompt); }
    catch (e) { if (!['invalid_json', 'upstream_error', 'network', 'server_error'].includes(e?.code)) throw e; console.info('[change] the answer could not be read; asking once more', e?.code); res = await ask(prompt); }   // an unreadable answer is asked for again, once, without troubling the homeowner
    let rep = applyOps(res), fixed = false; applied = true;
    if (rep.failed.length || rep.issues.length) {
      console.info('[change] did not fully work, repairing once', { failed: rep.failed.map(f => f.text), issues: rep.issues.map(i => i.text) });
      phase = 'Checking it fits';
      try {
        const res2 = await ask(fixPrompt(prompt, res, rep), true);
        restoreSnap(snap); const rep2 = applyOps(res2);
        if (changeScore(rep2) <= changeScore(rep) && (rep2.n || rep2.refurn.length)) { res = res2; rep = rep2; fixed = true; }
        else { restoreSnap(snap); rep = applyOps(res); }
        if (rep.failed.length || rep.issues.length) console.info('[change] still open after the repair', { failed: rep.failed.map(f => f.text), issues: rep.issues.map(i => i.text) });
      } catch (e) { if (e?.code === 'cancelled') throw e; console.info('[change] repair not available, keeping the first answer', e?.code || e); }
    }
    clearInterval(iv);
    const { n, refurn, notes } = rep, ok = !!(n || refurn.length);
    const left = String(res?.left || '').trim().slice(0, 260), open = [...new Set([...rep.failed.map(f => f.say), ...rep.issues.map(i => i.say)].filter(Boolean))].slice(0, 2);
    // never claim a change that did not happen: when nothing could be applied, say what went wrong instead of the model's summary
    const summary = !ok && rep.failed.length ? [`I could not make that change${open.length ? ': ' + open.join('; ') : ''}. Nothing was changed.`, ...notes].join(' ')
      : [String(res?.summary || '').slice(0, 260) || (n ? 'Done.' : 'No changes were made.'), left, ok && open.length ? `One thing to look at: ${open.join('; ')}.` : '', ...notes].filter(Boolean).join(' ');
    if (ok) { if (!SITE) charge(`Change · ${text.slice(0, 60)}`, BILLING.perChange); undoStack.push(snap); if (undoStack.length > 10) undoStack.shift(); project.edits.unshift({ t: Date.now(), text: /^Vastu fix\./.test(text) ? 'Make it Vastu compliant' : text, summary, by: SITE?.me?.user?.email || undefined }); project.edits = project.edits.slice(0, 50); }
    const done = () => { pstatus.innerHTML = `<span>${esc(summary)}</span>${ok ? '<button type="button" id="undoNow">Undo</button>' : ''}`; $('undoNow')?.addEventListener('click', undoEdit); };
    done(); if (pinput.value.trim() === text) pinput.value = ''; renderPhist(); saveSoon();
    for (const { r, brief } of refurn) { pstatus.innerHTML = `<span>Refurnishing ${esc(r.name)}…</span>`; await refurnishRoom(r, brief || text, false); done(); }
    return { ok, n, summary, notes, left, open, fixed };
  } catch (err) {
    clearInterval(iv); const cancelled = err?.code === 'cancelled';
    if (applied && cancelled) restoreSnap(snap);          // stopped part-way through a repair: the home goes back as it was
    const reason = cancelled ? 'Stopped. Nothing was changed.' : errText(err);
    pstatus.textContent = reason; return { ok: false, cancelled, reason, paywall: SITE?.lastPaywall && Date.now() - SITE.lastPaywall.t < 4000 ? SITE.lastPaywall.reason : '' };
  } finally { clearInterval(iv); editing = false; editNow = null; pinput.disabled = false; $('pgo').textContent = 'Apply'; renderCredits(); }
}
$('pform').addEventListener('submit', e => {
  e.preventDefault();
  if (editing) { editCtl?.abort(); return; }          // the button reads Stop while a change is being made
  const text = pinput.value.trim(); if (!text) return;
  if (running) { flash('Wait for the current generation to finish, or stop it first.', true); return; }
  requestEdit(text).then(r => { if (!r.ok && !r.cancelled && !r.paywall && r.reason) pstatus.textContent = r.reason; });
});

/* ================= website: free one-room preview ================= */
async function teaserRoom() {
  if (running || !SITE) return;
  const rooms = inspRooms().filter(r => r.type !== 'other');
  const room = rooms.find(r => /living/i.test(r.type + ' ' + r.name)) || [...rooms].sort((a, b) => polyArea(b.polygon) - polyArea(a.polygon))[0];
  if (!room) { flash('No rooms were found to preview.', true); return; }
  running = true; ctl = new AbortController(); renderGenState();
  stepUI([{ id: 'teaser', label: `Designing ${room.name} as your free preview`, state: 'active' }]);
  let placed = 0;
  try {
    const preset = presetById(project.presetId) || PRESETS[0];
    if (!project.customStyle) project.style = normalizeStyle(structuredClone(preset.style));
    layout.settings.timeOfDay = project.style.time;
    applyStyleToRooms(layout, project.style); removeItemsWhere(() => true); select(null); for (const k in MC) delete MC[k]; buildAll(); renderStyle();
    SITE.ctx = { kind: 'teaser', homeId: project.id };
    placed = (await furnishRooms([room], ctl.signal, 'teaser')).placed;
    if (placed) { project.teaserRoom = room.name; const [x, z] = centroid(room.polygon); player.x = x; player.z = z; player.y = floorY(room); setMode('walk'); showView('3d'); }
  } catch (e) { if (e?.code !== 'cancelled') flash(errText(e), true); }
  finally { running = false; renderGenState(); saveSoon(); if (placed) setTimeout(() => SITE.afterTeaser?.(room), 900); }
}
