
/* ================= views & boot ================= */
function showView(v) {
  if (v !== '3d' && photo) exitPhoto();
  activeView = v;
  for (const [k, id, tab] of [['3d', 'view3d', 'tab3d'], ['plan', 'viewPlan', 'tabPlan'], ['style', 'viewStyle', 'tabStyle']]) { $(id).hidden = k !== v; $(tab).setAttribute('aria-pressed', k === v); }
  if (v === '3d') { if (pdirty) { pdirty = false; buildAll(); } resize(); }
  if (v === 'plan') { planResize(); if (!pv.fitted) { pv.fitted = true; planFit(); } renderInspector(); }
  if (v === 'style') renderStyle();
}
$('tab3d').onclick = () => showView('3d'); $('tabPlan').onclick = () => showView('plan'); $('tabStyle').onclick = () => showView('style');
addEventListener('beforeunload', () => { if (project) { captureCover(); persistNow(); } });
activeView = 'home';
setupPost(); renderCredits();
(async () => {
  const list = await store.all();
  let seeded = false; try { seeded = localStorage.getItem('ws-seeded-v2') === '1'; } catch { }
  if (!seeded && !list.some(p => p.id === 'sample-home')) {
    const v = structuredClone(SAMPLE); v.id = 'sample-home'; v.version = 2; v.status = 'generated'; v.created = v.updated = Date.now() - 36e5; v.edits = []; delete v.sample;
    await store.put(v); try { localStorage.setItem('ws-seeded-v2', '1'); } catch { }
  }
  try {
    const old = JSON.parse(localStorage.getItem('walkthrough-studio-project-v1') || 'null');
    if (old?.layout?.walls?.length && !old.sample) { old.id = uid(); old.version = 2; old.status = 'generated'; old.updated = Date.now(); delete old.sample; await store.put(old); }
    localStorage.removeItem('walkthrough-studio-project-v1');
  } catch { }
  showHome();
})();
tick();
window.__studio = { gSpeak, voiceParts, pickVoice, GUIDE, startDesigner, DES, designerPrompt, chatPrompt, editPrompt, goToRoom, applyOps, wallsText, wallClass, lookingAt, requestEdit, guideEdit, get gfx() { return { quality, autoStep, eff: effQ() }; }, clearDoorways, move, player, setMode, select, get layout() { return layout; }, get project() { return project; }, get wallet() { return wallet; }, traceToLayout, settleItems, furnishPrompt, roomFrame, describeRoom, resolveItems, auditRoom, refineTrace, fitToDims, editPrompt, applyOps, loadProject, openProject, showHome, showView, buildAll, placeSpawn, cycleTime, enterPhoto, exitPhoto, store, get PT() { return PT; }, presetById, normalizeStyle, applyStyleToRooms, captureCover, persistNow, get camera() { return camera; }, get orbit() { return orbit; }, get S() { return S; }, applyTime, get labels() { return labels; }, get renderer() { return renderer; }, get scene() { return scene; }, get composer() { return composer; }, THREE, choosePreset, setQuality: q => { quality = q; setupPost(); buildAll(); resize(); } };
