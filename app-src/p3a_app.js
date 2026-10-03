
/* ================= pricing (edit these) ================= */
const BILLING = {
  currency: '₹',
  perWalkthrough: 1,          // credits charged per designed home
  perChange: 0.2,             // credits charged per change asked for in words (or "redo this room")
  trialCredits: 0,            // credits a new account starts with (reading the plan + bare shell is always free)
  packs: [
    { id: 'single', credits: 1, price: 3499, name: 'One home', note: 'Design one home, start to finish' },
    { id: 'home', credits: 3, price: 8999, name: 'Home pack', note: 'Enough to design, redo and perfect your home', tag: 'Most popular', best: true },
    { id: 'pro', credits: 10, price: 24999, name: 'Pro', note: 'For designers, builders and big families', tag: 'Save 30%' },
  ],
  demoCheckout: true,         // no payment provider connected yet
};
const SITE = globalThis.__MIRAGE_SITE || null; // set only on the website build
const money = n => BILLING.currency + Number(n).toLocaleString('en-IN');
const cfmt = n => (Math.round(n * 10) / 10).toLocaleString('en-IN', { maximumFractionDigits: 1 });
const creditsWord = n => `${cfmt(n)} credit${Math.round(n * 10) === 10 ? '' : 's'}`;

/* ================= small utilities ================= */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const hexOk = (v, d) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d;
const slug = s => String(s || 'house').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'house';
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function ago(t) { const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; const d = Math.round(s / 86400); return d === 1 ? 'yesterday' : d < 30 ? d + ' days ago' : new Date(t).toLocaleDateString(); }
function flash(t, err) {
  const w = $('toasts'), d = document.createElement('div'); d.className = 'warnbox' + (err ? '' : ' good'); d.textContent = t; w.prepend(d);
  while (w.children.length > 4) w.lastChild.remove(); setTimeout(() => d.remove(), err ? 9000 : 5000);
}
let downloads = null; (window.claude?.use?.('downloads') || Promise.resolve(null)).then(d => downloads = d).catch(() => { });
async function saveFile(filename, data) {
  if (downloads) { try { const r = await downloads.save({ filename, data }); if (r.status === 'saved') flash('Saved ' + filename + '.'); return true; } catch (e) { if (['cancelled', 'declined', 'user_declined'].includes(e?.code)) return false; } }
  if (typeof data === 'string') { try { await navigator.clipboard.writeText(data); flash('Saving files is not available here, so it was copied to your clipboard instead.'); return true; } catch { } }
  flash('Saving files is not available in this view.', true); return false;
}

/* ================= modal ================= */
function modal(html, opts = {}) {
  const root = $('modalRoot'); root.innerHTML = `<div class="scrim"><div class="modal${opts.wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const sc = root.firstChild, prev = document.activeElement;
  const close = () => { root.innerHTML = ''; removeEventListener('keydown', onk, true); prev?.focus?.(); };
  const onk = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  addEventListener('keydown', onk, true);
  sc.addEventListener('mousedown', e => { if (e.target === sc) close(); });
  sc.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  setTimeout(() => (sc.querySelector('[data-autofocus]') || sc.querySelector('.primary') || sc.querySelector('button'))?.focus(), 30);
  return { el: sc.querySelector('.modal'), close };
}

/* ================= wallet ================= */
const WALLET_KEY = 'ws-wallet-v1';
let wallet = (() => { try { const w = JSON.parse(localStorage.getItem(WALLET_KEY) || 'null'); if (w && typeof w.credits === 'number') return w; } catch { } return { credits: BILLING.trialCredits, ledger: BILLING.trialCredits ? [{ t: Date.now(), kind: 'trial', delta: BILLING.trialCredits, label: 'Welcome credits' }] : [] }; })();
function saveWallet() { try { localStorage.setItem(WALLET_KEY, JSON.stringify(wallet)); } catch { } renderCredits(); }
function renderCredits() { if (SITE) { SITE.renderMeter?.(); return; } $('creditCount').textContent = cfmt(wallet.credits); if ($('pgo') && !$('pinput').disabled) $('pgo').textContent = 'Apply · ' + cfmt(BILLING.perChange); $('genCost').textContent = creditsWord(BILLING.perWalkthrough); }
function charge(label, amt = BILLING.perWalkthrough) { wallet.credits = Math.round((wallet.credits - amt) * 10) / 10; wallet.ledger.unshift({ t: Date.now(), kind: 'charge', delta: -amt, label }); saveWallet(); }
function openWallet(reason) {
  const rows = wallet.ledger.slice(0, 40).map(l => `<tr><td class="d">${new Date(l.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</td><td>${esc(l.label)}${l.price ? ` <span style="color:var(--faint)">· ${money(l.price)}</span>` : ''}</td><td class="n" style="color:${l.delta > 0 ? 'var(--ok)' : 'var(--ink)'}">${l.delta > 0 ? "+" : ""}${cfmt(l.delta)}</td></tr>`).join('');
  const m = modal(`<button class="x ghost" data-close aria-label="Close">Close</button>
    <div class="eyebrow">[ Mirage credits ]</div>
    <h2>${reason === 'empty' ? (wallet.ledger.some(l => l.kind === 'purchase') ? 'You\'re out of credits' : 'Get credits to design your home') : `${creditsWord(wallet.credits)} left`}</h2><p class="lead" style="margin-bottom:6px">Your bare 3D shell is free. 1 credit designs and furnishes a whole home.</p>
    <p class="lead">Designing a home uses ${creditsWord(BILLING.perWalkthrough)}. Each change you ask for (“make the bedroom cosier”, “redo the kitchen”) uses ${cfmt(BILLING.perChange)}. Credits are only taken when it works. Moving things, swapping colours by hand, walking around and saving photos are always free.</p>
    <div class="packs">${BILLING.packs.map(p => `<div class="pack${p.best ? ' best' : ''}">${p.tag ? `<span class="tag">${p.tag}</span>` : ''}<h3>${p.name}</h3><div class="n">${creditsWord(p.credits)} · ${esc(p.note)}</div><div class="p">${money(p.price)}<small>${p.credits > 1 ? money(Math.round(p.price / p.credits)) + ' each' : ''}</small></div><button class="${p.best ? 'primary' : ''}" data-buy="${p.id}">Buy ${p.name}</button></div>`).join('')}</div>
    ${BILLING.demoCheckout ? '<div class="demo">Demo checkout: no payment provider is connected yet, so buying adds credits without taking payment. Connect Razorpay or Stripe on a server to charge for real.</div>' : ''}
    <div class="sec eyebrow" style="margin-top:20px">History</div>
    <div class="ledgerwrap"><table class="ledger">${rows || '<tr><td>No activity yet.</td></tr>'}</table></div>`, { wide: true });
  m.el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => { m.close(); checkout(BILLING.packs.find(p => p.id === b.dataset.buy)); });
}
function checkout(p) {
  const m = modal(`<div class="eyebrow">Checkout</div><h2>${p.name} pack</h2>
    <dl class="sumlist"><dt>Credits</dt><dd>${creditsWord(p.credits)}</dd><dt>Price</dt><dd>${money(p.price)} <span style="color:var(--faint)">incl. taxes</span></dd><dt>Balance after</dt><dd>${creditsWord(wallet.credits + p.credits)}</dd></dl>
    ${BILLING.demoCheckout ? '<div class="demo" style="margin-bottom:18px">Demo mode. No payment will be taken.</div>' : ''}
    <div class="mact"><button data-close>Cancel</button><button class="primary" id="payNow">${BILLING.demoCheckout ? 'Add credits' : 'Pay ' + money(p.price)}</button></div>`);
  m.el.querySelector('#payNow').onclick = () => { wallet.credits += p.credits; wallet.ledger.unshift({ t: Date.now(), kind: 'purchase', delta: p.credits, label: `${p.name} pack${BILLING.demoCheckout ? ' (demo)' : ''}`, price: p.price }); saveWallet(); m.close(); flash(`${creditsWord(p.credits)} added. Balance: ${cfmt(wallet.credits)}.`); };
}
$('btnWallet').onclick = () => SITE ? SITE.openAccount?.() : openWallet();

/* ================= project store (IndexedDB, falls back to memory) ================= */
const store = (() => {
  let dbp = null; const mem = new Map();
  const open = () => dbp ||= new Promise((res, rej) => { try { const r = indexedDB.open('walkthrough-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('projects', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('projects', mode), q = fn(t.objectStore('projects')); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  return {
    async all() { try { const a = await tx('readonly', s => s.getAll()); a.forEach(p => mem.set(p.id, p)); return [...mem.values()]; } catch { return [...mem.values()]; } },
    async put(p) { mem.set(p.id, p); try { await tx('readwrite', s => s.put(p)); } catch (e) { console.warn('store put failed', e); } },
    async del(id) { mem.delete(id); try { await tx('readwrite', s => s.delete(id)); } catch { } },
  };
})();

/* ================= project lifecycle ================= */
const SAMPLE = JSON.parse(document.getElementById('sample-data').textContent);
function baseSettings(ceil, view, st) { return { ceilingHeight: ceil, slabThickness: .5, eyeHeight: 5.1, fieldOfView: 80, walkSpeed: 4.2, wallColor: st.walls, ceilingColor: st.ceiling, timeOfDay: st.time || 'golden', view }; }
function emptyProject() { const st = normalizeStyle(structuredClone(PRESETS[0].style)); return { id: uid(), version: 2, presetId: PRESETS[0].id, name: 'My new home', created: Date.now(), updated: Date.now(), status: 'draft', brief: '', plan: null, inspo: [], style: st, edits: [], layout: { settings: baseSettings(10, st.view || 'sea', st), walls: [], rooms: [], railings: [], furniture: [] } }; }
let saveT, undoStack = [];
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(persistNow, 700); }
async function persistNow() { clearTimeout(saveT); if (!project) return; project.updated = Date.now(); await store.put(project); SITE?.afterSave?.(project); }
function captureCover() {
  if (!project || !layout.walls.length || activeView !== '3d' || photo) return;
  try { if (composer) composer.render(); else renderer.render(scene, camera); const src = renderer.domElement, c = document.createElement('canvas'); c.width = 640; c.height = 400; const g = c.getContext('2d'); const k = Math.max(640 / src.width, 400 / src.height), w = src.width * k, h = src.height * k; g.drawImage(src, (640 - w) / 2, (400 - h) / 2, w, h); project.cover = c.toDataURL('image/jpeg', .8); } catch { }
}
function loadProject(p) {
  project = p; project.style = normalizeStyle(project.style); project.inspo ||= []; project.edits ||= []; project.roomInspo ||= {}; project.roomStyles ||= {};
  project.layout ||= { settings: {}, walls: [], rooms: [], railings: [], furniture: [] };
  layout = project.layout; layout.furniture ||= []; layout.railings ||= [];
  layout.settings = { ...baseSettings(10, 'sea', project.style), ...layout.settings };
  $('projName').value = project.name || 'Untitled house';
  $('brief').value = project.brief || ''; $('ceilH').value = layout.settings.ceilingHeight; $('seaSide').value = layout.settings.view || 'sea';
  $('progress').innerHTML = ''; undoStack = [];
  renderUploads(); select(null); drawer.classList.remove('open');
  for (const k in MC) delete MC[k];
  buildAll(); placeSpawn(); setMode('walk');
  $('empty3d').hidden = !!layout.walls.length; $('pbar').hidden = !layout.walls.length;
  pv.fitted = false; renderPhist(); renderSugg(); renderPresets(); renderIdeas(); renderProfileSum(); $('coach').hidden = true;
  SITE?.onProjectLoaded?.(project);
}
function showHome() {
  if (photo) exitPhoto();
  if (project) { captureCover(); persistNow(); }
  activeView = 'home'; $('home').hidden = false; $('workspace').hidden = true; $('crumbs').hidden = true;
  document.querySelectorAll('.ws-only').forEach(e => e.hidden = true);
  renderHome(); renderHomePresets(); hero.start();
}
function openProject(p) {
  $('home').hidden = true; $('workspace').hidden = false; $('crumbs').hidden = false; document.querySelectorAll('.ws-only').forEach(e => e.hidden = false);
  if (innerWidth < 860 && p.layout?.walls?.length) document.body.classList.add('side-hidden'); else document.body.classList.remove('side-hidden');
  hero.stop(); activeView = '3d'; loadProject(p); showView('3d'); resize(); setTimeout(maybeCoach, 600);
}
async function renderHome() {
  const list = (await store.all()).sort((a, b) => (b.updated || 0) - (a.updated || 0)), grid = $('projGrid');
  const stat = p => { const rooms = (p.layout?.rooms || []).filter(r => r.kind === 'room' && r.polygon?.length > 2); const area = rooms.reduce((a, r) => a + polyArea(r.polygon), 0); return rooms.length ? `${rooms.length} rooms · ${Math.round(area).toLocaleString()} sq ft · ${ago(p.updated || Date.now())}` : `Draft · ${ago(p.updated || Date.now())}`; };
  grid.innerHTML = `<button class="card new" id="cardNew"><div class="inner"><div class="plus">+</div><h3>New home</h3><p>Floor plan in,<br>furnished 3D home out.</p></div></button>` +
    list.map(p => { const cover = p.cover || p.plan?.image || ''; return `<div class="card" role="button" tabindex="0" data-id="${esc(p.id)}" aria-label="Open ${esc(p.name)}"><span class="cover" style="${cover ? `background-image:url('${cover}')` : ''}"></span><span class="chip${p.status === 'generated' ? ' gen' : ''}">${p.shared ? 'Shared · ' + esc(p.shared.role) : p.status === 'generated' ? 'Ready to walk' : p.status === 'traced' ? 'Plan read' : 'Draft'}</span><button class="kill" data-kill="${esc(p.id)}">Delete</button><div class="meta"><h3>${esc(p.name || 'My new home')}</h3><p>${esc(stat(p))}</p></div></div>`; }).join('');
  $('cardNew').onclick = newProject;
  grid.querySelectorAll('.card[data-id]').forEach(c => {
    const go = () => { const p = list.find(x => x.id === c.dataset.id); if (p) openProject(p); };
    c.addEventListener('click', e => { if (!e.target.closest('[data-kill]')) go(); });
    c.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); go(); } });
  });
  grid.querySelectorAll('[data-kill]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    if (b.dataset.armed) { store.del(b.dataset.kill).then(renderHome); return; }
    b.dataset.armed = '1'; b.textContent = list.find(p => p.id === b.dataset.kill)?.shared ? 'Tap again to remove' : 'Tap again to delete'; b.style.opacity = 1; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; b.style.opacity = ''; } }, 3000);
  });
  SITE?.decorateHome?.(grid, list);
}
function newProject() { const p = emptyProject(); store.put(p); openProject(p); document.body.classList.remove('side-hidden'); }
$('btnNewProj').onclick = newProject;
$('btnHome').onclick = showHome;
$('projName').addEventListener('input', e => { project.name = e.target.value; saveSoon(); });
$('brief').addEventListener('input', e => { project.brief = e.target.value; saveSoon(); });
$('ceilH').addEventListener('change', e => { const v = parseFloat(e.target.value); if (v >= 7 && v <= 20) { layout.settings.ceilingHeight = v; buildAll(); saveSoon(); } });
$('seaSide').addEventListener('change', e => { layout.settings.view = e.target.value; applyTime(); saveSoon(); });
$('quality').value = quality; $('quality').addEventListener('change', e => { quality = e.target.value; if (quality === 'auto') { autoStep = 0; try { localStorage.removeItem('mirage-gfx-step'); } catch { } } setupPost(); buildAll(); resize(); });
$('btnSide').onclick = () => { document.body.classList.toggle('side-hidden'); setTimeout(() => { resize(); if (activeView === 'plan') planResize(); }, 60); };
$('btnSave').onclick = () => saveFile(slug(project.name) + '.mirage.json', JSON.stringify(project));
$('openFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const p = JSON.parse(await f.text()); if (!p.layout?.walls) throw new Error('it is not a Mirage home file'); p.id = uid(); p.updated = Date.now(); p.status ||= p.layout.walls.length ? 'generated' : 'draft'; delete p.sample; await store.put(p); openProject(p); flash('Opened ' + (p.name || f.name) + '.'); }
  catch (err) { flash('Could not open that file: ' + err.message, true); }
});

/* ================= uploads ================= */
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That image could not be read.')); i.src = src; }); }
async function prepImage(file, maxPx, q = .9, maxEdge = 1e9) {
  const url = URL.createObjectURL(file); try {
    const im = await loadImg(url); const k = Math.min(1, Math.sqrt(maxPx / (im.naturalWidth * im.naturalHeight)), maxEdge / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k), c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
    return { image: c.toDataURL('image/jpeg', q), w, h };
  } finally { URL.revokeObjectURL(url); }
}
function dataURLtoBlob(d) { const [h, b] = d.split(','), mime = h.match(/:(.*?);/)[1], bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime }); }
async function collages(list, maxCount = 4) {
  if (!list.length) return [];
  if (list.length <= maxCount) return list.map(dataURLtoBlob);
  const per = Math.ceil(list.length / maxCount), cols = Math.ceil(Math.sqrt(per)), rows = Math.ceil(per / cols), cw = Math.round(1600 / cols), ch = Math.round(cw * .75), out = [];
  for (let s0 = 0; s0 < list.length; s0 += per) {
    const ims = await Promise.all(list.slice(s0, s0 + per).map(loadImg));
    const c = document.createElement('canvas'); c.width = cw * cols; c.height = ch * rows; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    ims.forEach((im, i) => { const k = Math.max(cw / im.width, ch / im.height), w = im.width * k, h = im.height * k, x = (i % cols) * cw, y = (i / cols | 0) * ch; g.save(); g.beginPath(); g.rect(x + 2, y + 2, cw - 4, ch - 4); g.clip(); g.drawImage(im, x + (cw - w) / 2, y + (ch - h) / 2, w, h); g.restore(); });
    out.push(await new Promise(r => c.toBlob(r, 'image/jpeg', .86)));
  }
  return out;
}
const inspRooms = () => layout.rooms.filter(r => r.kind !== 'ledge' && r.polygon?.length > 2 && polyArea(r.polygon) > 20).sort((a, b) => (a.kind === 'outdoor') - (b.kind === 'outdoor') || polyArea(b.polygon) - polyArea(a.polygon));
const thumbsHtml = (list, key) => list.map((s, i) => `<span class="th"><img src="${s}" alt="Inspiration ${i + 1}"><button type="button" data-rm="${esc(key)}" data-i="${i}" aria-label="Remove image ${i + 1}">✕</button></span>`).join('');
function roomRows(prefix) {
  return inspRooms().map((r, k) => { const imgs = project.roomInspo?.[r.name] || [], st = project.roomStyles?.[r.name];
    return `<div class="rrow"><div><b>${esc(r.name)}</b><small>${esc(typeLabel(r.type))}${imgs.length ? ` · ${imgs.length} photo${imgs.length > 1 ? 's' : ''}` : ' · follows the home style'}</small></div><label class="btnlike">Add photos<input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" data-room="${esc(r.name)}" id="${prefix}-rf${k}"></label><div class="thumbs">${thumbsHtml(imgs, 'room:' + r.name)}</div>${st?.summary && imgs.length ? `<div class="styl">${esc(st.summary)}</div>` : ''}</div>`; }).join('');
}
function bindThumbs(root) {
  root.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
    const key = b.dataset.rm, i = +b.dataset.i;
    if (key === 'home') project.inspo.splice(i, 1);
    else { const nm = key.slice(5), arr = project.roomInspo?.[nm]; if (arr) { arr.splice(i, 1); if (!arr.length) delete project.roomInspo[nm]; } if (project.roomStyles) delete project.roomStyles[nm]; }
    renderUploads(); renderStyle(); saveSoon();
  });
  root.querySelectorAll('input[data-room]').forEach(inp => inp.addEventListener('change', e => { takeRoomInspo(inp.dataset.room, e.target.files); e.target.value = ''; }));
}
function renderUploads() {
  const p = project.plan; $('planThumb').hidden = !p?.image; if (p?.image) $('planThumb').src = p.image;
  $('planMeta').textContent = p?.image ? `${p.w}×${p.h}px` : '';
  $('inspThumbs').innerHTML = thumbsHtml(project.inspo || [], 'home');
  const nRoom = Object.values(project.roomInspo || {}).reduce((a, x) => a + x.length, 0), nAll = (project.inspo?.length || 0) + nRoom;
  $('inspMeta').textContent = nAll ? nAll + ' image' + (nAll > 1 ? 's' : '') : '';
  const ri = $('roomInspo');
  ri.innerHTML = layout.rooms.length ? `<div class="eyebrow" style="margin:16px 0 2px">Give a room its own look</div><p class="note" style="margin:2px 0 4px">Optional. Add photos to any room; the rest follow the style above.</p><div class="rooms-insp">${roomRows('side')}</div>` : '';
  bindThumbs($('side'));
  if ($('modalRooms')) { $('modalRooms').innerHTML = roomRows('modal'); bindThumbs($('modalRooms')); }
  renderGenState();
}
function renderGenState() {
  const lbl = $('genLabel'), cost = $('genCost'), note = $('genNote');
  $('btnReread').hidden = running || !project.plan?.image || !layout.walls.length || project.id === 'sample-home';
  if (running) { lbl.textContent = 'Stop'; cost.textContent = ''; return; }
  if (!project.plan?.image) { lbl.textContent = 'Add your floor plan to start'; cost.textContent = ''; note.textContent = 'Reading your plan is free. You only use a credit when your furnished home is ready.'; }
  else if (!layout.walls.length) { lbl.textContent = 'Read my floor plan'; cost.textContent = 'free'; note.textContent = 'We find every room first, so you can give any room its own look before designing.'; }
  else { lbl.textContent = project.status === 'generated' ? 'Redesign my home' : 'Design my home'; cost.textContent = creditsWord(BILLING.perWalkthrough); note.textContent = `Designs and furnishes all ${inspRooms().length} rooms in ${project.customStyle ? 'the style of your photos' : project.inspo?.length ? 'the style of your photos' : (presetById(project.presetId)?.name || 'your chosen') + ' style'}. The credit is only used when it's ready. Afterwards, each change you ask for uses ${cfmt(BILLING.perChange)}.`; }
  if (SITE) { SITE.decorateGen?.(lbl, cost, note); return; }
  if (imagesOK === false) note.innerHTML = '<b style="color:var(--warn)">This Claude app can\'t send images yet</b>, so it can\'t read a floor plan or photos. Open this page at claude.ai in Chrome, Safari or Edge on a computer to generate. Prompt edits still work here.';
}
async function takePlan(file) {
  if (!file || !file.type.startsWith('image/')) { flash('Please choose an image file (PNG, JPG or WebP).', true); return; }
  try { const r = await prepImage(file, 3.6e6, .92, 2560); project.plan = { ...r, s: null, ox: 0, oy: 0 }; project.trace = null; if (!project.cover || !layout.walls.length) project.cover = r.image; renderUploads(); pv.fitted = false; saveSoon(); }
  catch (e) { flash(e.message, true); }
}
async function takeInspo(files) {
  const list = [...files].filter(f => f.type.startsWith('image/')); if (!list.length) return;
  try { const imgs = await Promise.all(list.map(f => prepImage(f, 3.2e5, .8).then(r => r.image))); project.inspo = [...(project.inspo || []), ...imgs]; renderUploads(); renderStyle(); saveSoon(); flash(`${imgs.length} photo${imgs.length > 1 ? 's' : ''} added. They'll guide the style when you design.`); renderPresets(); }
  catch (e) { flash(e.message, true); }
}
async function takeRoomInspo(name, files) {
  const list = [...files].filter(f => f.type.startsWith('image/')); if (!list.length) return;
  try { const imgs = await Promise.all(list.map(f => prepImage(f, 3.2e5, .8).then(r => r.image))); project.roomInspo ||= {}; project.roomInspo[name] = [...(project.roomInspo[name] || []), ...imgs]; if (project.roomStyles) delete project.roomStyles[name]; renderUploads(); saveSoon(); flash(`${imgs.length} photo${imgs.length > 1 ? 's' : ''} added for ${name}.`); }
  catch (e) { flash(e.message, true); }
}
$('planFile').addEventListener('change', e => { takePlan(e.target.files[0]); e.target.value = ''; });
$('inspFile').addEventListener('change', e => { takeInspo(e.target.files); e.target.value = ''; });
for (const [id, fn] of [['planDrop', fs => takePlan(fs[0])], ['inspDrop', fs => takeInspo(fs)]]) {
  const el = $(id);
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); fn(e.dataTransfer.files); });
}

/* ================= Claude access ================= */
let samplePromise = null;
const getSample = () => (samplePromise ||= (SITE ? Promise.resolve(SITE.sample) : window.claude?.use ? claude.use('sample') : Promise.resolve(null)));
let imagesOK = null;
getSample().then(async s => { if (s) { const caps = await s.limits().catch(() => null); imagesOK = !!caps?.images; if (project) renderGenState(); } if (!s) { $('btnGen').disabled = true; $('genNote').textContent = 'Generating needs Claude, which is not available in this view. You can still open and edit projects.'; $('pgo').disabled = true; $('pinput').placeholder = 'Prompt edits need Claude, which is not available in this view.'; } });
const ERR = {
  not_granted: 'Claude access was not allowed for this page.', sampling_disabled: 'Claude is not available for this account.',
  rate_limited: 'Claude is busy or the usage limit was reached. Try again in a little while.', session_expired: 'Your session expired. Sign in again, then retry.',
  image_rejected: 'Claude could not read that image. Try a clearer PNG or JPG.', images_unavailable: 'This view cannot send images to Claude.',
  refused: 'Claude declined this request. Try rephrasing it.', invalid_json: 'Claude\'s answer could not be read. Try again.',
  empty_completion: 'Claude returned nothing. Try again.', prompt_too_large: 'The request was too large. Try a smaller change.', tools_unavailable: 'This view cannot run that request.',
};
const errText = e => (SITE && e?.message && e.code !== 'cancelled' ? e.message : null) || ERR[e?.code] || (e?.code === 'cancelled' ? 'Stopped.' : 'Something went wrong talking to Claude. Try again.');
let ctl = null, running = false;
function stepUI(list) { $('progress').innerHTML = list.map(s => `<li id="st-${s.id}" class="${s.state || ''}"><span class="dot"></span><div>${esc(s.label)}<small></small></div></li>`).join(''); }
function stepSet(id, state, note) { const li = $('st-' + id); if (!li) return; if (state) li.className = state; if (note != null) li.querySelector('small').textContent = note; }
function ticker(id, verb) { const t0 = performance.now(); let chars = 0; const iv = setInterval(() => stepSet(id, null, `${verb}… ${Math.round((performance.now() - t0) / 1000)}s${chars ? ' · ' + (chars / 1000).toFixed(1) + 'k characters' : ''}`), 1000); return { onText: ({ text }) => { chars = text.length; }, stop: () => clearInterval(iv) }; }
