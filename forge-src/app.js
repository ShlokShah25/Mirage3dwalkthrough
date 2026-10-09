/* ================= Forge: the page =================
   Left: the conversation. Middle: the model on a millimetre bed with its measured sizes drawn around it.
   Right: sizes, sliders and downloads. Models live in this browser (localStorage; sculpted shapes in IndexedDB). */
const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); } for (const c of kids) if (c != null) e.append(c); return e; };
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } } };
const newId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = (code, message, extra) => Object.assign(new Error(message || code), { code }, extra);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const HOOK = {};            // tests may replace the calls that leave the page

const ST = { cfg: {}, models: store.get('forge-models', []), cur: null, mesh: null, busy: false, unit: store.get('forge-unit', 'mm'), bed: store.get('forge-bed', [220, 220, 250]), dims: true, edges: true, pic: null, quality: 'normal', draft: [] };

/* ---------------- numbers on screen ---------------- */
// The mesh follows curves to about a hundredth of a millimetre, so sizes are shown to that and no finer.
function nice(mm) {
  const v = ST.unit === 'in' ? mm / 25.4 : mm, step = ST.unit === 'in' ? .005 : .05, tol = ST.unit === 'in' ? .0006 : .012, r = Math.round(v / step) * step;
  const out = Math.abs(v - r) <= tol ? r : v; return (+out.toFixed(ST.unit === 'in' ? 3 : 2)).toString();
}
const unitName = () => ST.unit;
const sizeText = s => `${nice(s[0])} × ${nice(s[1])} × ${nice(s[2])} ${unitName()}`;
// a promised size holds if the measured one is within 0.05 mm or 0.2 %, whichever is larger
const sizeOff = (want, got) => ['x', 'y', 'z'].filter((a, i) => want && Number.isFinite(+want[a]) && want[a] !== null && Math.abs(got[i] - want[a]) > Math.max(.05, Math.abs(want[a]) * .002));

/* ---------------- storage ---------------- */
const MEM = new Map();
const idb = (() => {
  let p; const open = () => p ||= new Promise((res, rej) => { const r = indexedDB.open('forge', 1); r.onupgradeneeded = () => r.result.createObjectStore('sources'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('sources', mode), q = fn(t.objectStore('sources')); t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  return {
    async get(k) { if (MEM.has(k)) return MEM.get(k); try { return await tx('readonly', s => s.get(k)); } catch { return undefined; } },
    async put(k, v) { MEM.set(k, v); if (MEM.size > 3) MEM.delete(MEM.keys().next().value); try { await tx('readwrite', s => s.put(v, k)); } catch { } },
    async del(k) { MEM.delete(k); try { await tx('readwrite', s => s.delete(k)); } catch { } },
  };
})();
function save() {
  ST.models.sort((a, b) => b.updated - a.updated);
  for (const dead of ST.models.splice(40)) idb.del(dead.id);
  if (!store.set('forge-models', ST.models)) { for (const m of ST.models.slice(8)) m.thumb = null; store.set('forge-models', ST.models); }   // out of room: older pictures go first
  store.set('forge-last', ST.cur?.id || null);
}

/* ---------------- the server ---------------- */
let supa = null;
function guestKey() {
  let k = null; try { k = localStorage.getItem('mirage-guest'); } catch { }
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(k || '')) { const b = crypto.getRandomValues(new Uint8Array(24)); k = Array.from(b, x => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[x & 63]).join(''); try { localStorage.setItem('mirage-guest', k); } catch { } }
  return k;
}
async function token() {
  const c = ST.cfg;
  if (c.authMode === 'test') { let t = null; try { t = localStorage.getItem('mirage-test-token'); } catch { } if (t) return t; }
  else if (c.supabaseUrl) {
    try {
      if (!supa) { const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'); supa = createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } }); }
      const { data } = await supa.auth.getSession(); if (data?.session?.access_token) return data.session.access_token;
    } catch { }
  }
  if (c.guest) return 'guest:' + guestKey();
  throw fail('signin', 'Sign in on Mirage first, then come back to Forge.');
}
async function api(path, data) {
  let r; try { r = await fetch(path, { method: data ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + await token() }, body: data ? JSON.stringify(data) : undefined }); }
  catch (e) { if (e.code) throw e; throw fail('network', 'Could not reach Forge. Check your connection.'); }
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw fail(j.error?.code || 'server_error', j.error?.message || 'Something went wrong. Try again.'); }
  return r;
}
// One request to Claude through /api/ai: the answer streams in and ends with the JSON it wrote.
async function askAI(kind, prompt, images = []) {
  if (HOOK.ai) return HOOK.ai(kind, prompt, images);
  const r = await api('/api/ai', { kind, prompt, images });
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', out = null;
  for (; ;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, i).split('\n').find(l => l.startsWith('data:')); buf = buf.slice(i + 2); if (!line) continue;
      const o = JSON.parse(line.slice(5)); if (o.error) throw fail(o.error.code, o.error.message); if (o.done) out = o.json;
    }
  }
  if (!out) throw fail('empty', 'No answer came back. Try again.');
  return out;
}
// one automatic second try when the answer was lost on the way, never when a limit was reached
async function askAIOnce(kind, prompt, images) {
  try { return await askAI(kind, prompt, images); }
  catch (e) { if (!['invalid_json', 'upstream_error', 'network', 'server_error', 'empty'].includes(e.code)) throw e; await sleep(800); return askAI(kind, prompt, images); }
}

/* ---------------- the worker that builds solids ---------------- */
const W = { w: null, jobs: new Map(), n: 0, has: new Set(), fonts: null };
async function loadFonts() { W.fonts ||= Promise.all(['sans', 'serif', 'mono', 'narrow'].map(async n => ({ name: n, buf: await (await fetch(`/fonts/forge-${n}.ttf`)).arrayBuffer() }))); return W.fonts; }
async function startWorker() {
  const fonts = await loadFonts();
  const w = new Worker('/forge-worker.js'); W.w = w; W.has = new Set();
  w.onmessage = ev => { const m = ev.data, j = W.jobs.get(m.job); if (!j) return; if (m.type === 'progress') return j.onStep?.(m.f); W.jobs.delete(m.job); clearTimeout(j.timer); m.type === 'error' ? j.rej(fail('build', m.message, { line: m.line, stage: m.stage })) : j.res(m); };
  w.onerror = () => { for (const j of W.jobs.values()) { clearTimeout(j.timer); j.rej(fail('build', 'The builder stopped unexpectedly. Try again.')); } W.jobs.clear(); W.w = null; };
  for (const f of fonts) w.postMessage({ type: 'font', name: f.name, buf: f.buf.slice(0) });
  w.postMessage({ type: 'lock' });
}
async function work(msg, { timeout = 90000, onStep } = {}) {
  if (!W.w) await startWorker();
  const job = ++W.n;
  return new Promise((res, rej) => {
    const timer = setTimeout(() => {       // a model that never finishes: stop the worker and start a clean one
      const lost = [...W.jobs.values()]; W.jobs.clear(); try { W.w?.terminate(); } catch { } W.w = null;
      for (const j of lost) { clearTimeout(j.timer); j.rej(fail('build', 'Building took too long and was stopped. The model is probably too detailed or far too large.', { stage: 'timeout' })); }
    }, timeout);
    W.jobs.set(job, { res, rej, timer, onStep }); W.w.postMessage({ ...msg, job });
  });
}
async function ensureSource(m) {
  if (!m.source) return null; if (!W.w) await startWorker(); if (W.has.has(m.id)) return m.id;
  const tri = await idb.get(m.id); if (!tri) throw fail('source_lost', 'The shape this model was made from is no longer stored in this browser. Make or open it again.');
  await work({ type: 'source', id: m.id, positions: tri.positions.slice(), indices: tri.indices.slice() }, { timeout: 180000 });
  W.has.add(m.id); return m.id;
}
const values = m => Object.fromEntries((m.params || []).map(p => [p.key, p.value]));
async function buildNow(m, quality = 'normal', extra = {}) {
  const sourceId = await ensureSource(m);
  return work({ type: 'build', code: m.code, params: values(m), quality, sourceId, ...extra }, { timeout: quality === 'fine' ? 240000 : 90000 });
}

/* ---------------- the 3D view ---------------- */
const V = { labels: [] };
function initView() {
  const canvas = $('view');
  V.r = new THREE.WebGLRenderer({ canvas, antialias: true }); V.r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); V.r.setClearColor(0xEEF1F3, 1);
  V.scene = new THREE.Scene();
  V.cam = new THREE.PerspectiveCamera(30, 1, 1, 30000); V.cam.up.set(0, 0, 1); V.cam.position.set(260, -330, 230);
  V.ctl = new OrbitControls(V.cam, canvas); V.ctl.enableDamping = false; V.ctl.addEventListener('change', draw);
  V.scene.add(new THREE.HemisphereLight(0xffffff, 0xAEB9C2, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(.6, -1, 1.5); V.scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, .7); fill.position.set(-1, .8, .6); V.scene.add(fill);
  V.bed = new THREE.Group(); V.dim = new THREE.Group(); V.scene.add(V.bed, V.dim);
  V.mat = new THREE.MeshStandardMaterial({ color: 0xF26A1B, roughness: .6, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  V.edgeMat = new THREE.LineBasicMaterial({ color: 0x12202B, transparent: true, opacity: .5 });
  V.dimMat = new THREE.LineBasicMaterial({ color: 0x1F5FBF });
  new ResizeObserver(resize).observe($('stage')); drawBed(); resize(); frame('iso');
}
function resize() { const s = $('stage'), w = Math.max(50, s.clientWidth), h = Math.max(50, s.clientHeight); V.r.setSize(w, h, false); V.cam.aspect = w / h; V.cam.updateProjectionMatrix(); draw(); }
function lines(pts, mat) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return new THREE.LineSegments(g, mat); }
function drawBed() {
  for (const c of [...V.bed.children]) { c.geometry.dispose(); V.bed.remove(c); }
  const [bx, by] = ST.bed, hx = bx / 2, hy = by / 2, minor = [], major = [];
  for (let x = -Math.floor(hx / 10) * 10; x <= hx; x += 10) (x % 50 === 0 ? major : minor).push(x, -hy, 0, x, hy, 0);
  for (let y = -Math.floor(hy / 10) * 10; y <= hy; y += 10) (y % 50 === 0 ? major : minor).push(-hx, y, 0, hx, y, 0);
  V.bed.add(lines(minor, new THREE.LineBasicMaterial({ color: 0xD3DADF })), lines(major, new THREE.LineBasicMaterial({ color: 0xB3BEC7 })),
    lines([-hx, -hy, 0, hx, -hy, 0, hx, -hy, 0, hx, hy, 0, hx, hy, 0, -hx, hy, 0, -hx, hy, 0, -hx, -hy, 0], new THREE.LineBasicMaterial({ color: 0x6B7A86 })));
  draw();
}
function setMesh(r) {
  if (V.mesh) { V.scene.remove(V.mesh, V.lines); V.mesh.geometry.dispose(); V.lines.geometry.dispose(); V.mesh = V.lines = null; }
  if (r) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(r.nrm, 3));
    V.mesh = new THREE.Mesh(g, V.mat); const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(r.edges, 3)); V.lines = new THREE.LineSegments(eg, V.edgeMat); V.lines.visible = ST.edges;
    V.scene.add(V.mesh, V.lines);
  }
  drawDims();
}
// The measured size, drawn the way a workshop drawing shows it: a line beside the part, a tick at each end, the number in the middle.
function drawDims() {
  for (const c of [...V.dim.children]) { c.geometry.dispose(); V.dim.remove(c); } $('dims').textContent = ''; V.labels = [];
  const s = ST.mesh?.stats; if (!s || !ST.dims) return draw();
  const [x0, y0, z0] = s.min, [x1, y1, z1] = s.max, big = Math.max(...s.size), off = clamp(big * .1, 3, 45), t = off * .22, seg = [], L = (a, b) => seg.push(...a, ...b);
  const want = ST.cur?.size, bad = want ? sizeOff(want, s.size) : [];
  const label = (axis, p, v) => { const e = el('div', { class: 'dim' + (bad.includes(axis) ? ' off' : '') }, nice(v), el('small', { text: unitName() })); $('dims').append(e); V.labels.push({ el: e, p: new THREE.Vector3(...p) }); };
  const ya = y0 - off, xa = x1 + off;
  L([x0, ya, z0], [x1, ya, z0]); L([x0, y0 - t, z0], [x0, ya - t, z0]); L([x1, y0 - t, z0], [x1, ya - t, z0]); L([x0 - t, ya - t, z0], [x0 + t, ya + t, z0]); L([x1 - t, ya - t, z0], [x1 + t, ya + t, z0]); label('x', [(x0 + x1) / 2, ya, z0], s.size[0]);
  L([xa, y0, z0], [xa, y1, z0]); L([x1 + t, y0, z0], [xa + t, y0, z0]); L([x1 + t, y1, z0], [xa + t, y1, z0]); L([xa - t, y0 - t, z0], [xa + t, y0 + t, z0]); L([xa - t, y1 - t, z0], [xa + t, y1 + t, z0]); label('y', [xa, (y0 + y1) / 2, z0], s.size[1]);
  L([xa, y1, z0], [xa, y1, z1]); L([x1 + t, y1, z1], [xa + t, y1, z1]); L([xa - t, y1, z0 - t], [xa + t, y1, z0 + t]); L([xa - t, y1, z1 - t], [xa + t, y1, z1 + t]); label('z', [xa, y1, (z0 + z1) / 2], s.size[2]);
  V.dim.add(lines(seg, V.dimMat)); draw();
}
const _v = new THREE.Vector3();
function draw() {
  if (!V.r) return; V.r.render(V.scene, V.cam);
  const w = $('stage').clientWidth, h = $('stage').clientHeight;
  for (const l of V.labels) { _v.copy(l.p).project(V.cam); l.el.style.transform = `translate(${((_v.x * .5 + .5) * w).toFixed(1)}px,${((-_v.y * .5 + .5) * h).toFixed(1)}px) translate(-50%,-50%)`; l.el.style.visibility = _v.z > 1 ? 'hidden' : 'visible'; }
}
function frame(view = 'iso') {
  const s = ST.mesh?.stats, c = s ? [(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2] : [0, 0, 20], rad = s ? Math.hypot(...s.size) / 2 * 1.35 + 4 : 150;
  const dir = { iso: [.62, -.82, .56], front: [0, -1, .0001], top: [0, -.0001, 1], right: [1, 0, .0001] }[view] || [.62, -.82, .56], l = Math.hypot(...dir);
  const fit = Math.min(1, V.cam.aspect), d = rad / Math.sin(V.cam.fov * Math.PI / 360) / fit;
  V.ctl.target.set(...c); V.cam.position.set(c[0] + dir[0] / l * d, c[1] + dir[1] / l * d, c[2] + dir[2] / l * d); V.cam.near = Math.max(.1, d / 200); V.cam.far = d * 20 + 2000; V.cam.updateProjectionMatrix(); V.ctl.update(); draw();
}
function thumb() {
  try { draw(); const c = document.createElement('canvas'), src = $('view'); c.width = 192; c.height = 144; const k = Math.max(192 / src.width, 144 / src.height), w = src.width * k, h = src.height * k; c.getContext('2d').drawImage(src, (192 - w) / 2, (144 - h) / 2, w, h); return c.toDataURL('image/jpeg', .72); } catch { return null; }
}

/* ---------------- reading meshes people bring (STL, OBJ, GLB) ---------------- */
// Each returns { positions: Float32Array, indices: Uint32Array } with Z up.
function readSTL(buf) {
  const dv = new DataView(buf), n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  if (buf.byteLength === 84 + n * 50 && n > 0) { const p = new Float32Array(n * 9); for (let t = 0, o = 96; t < n; t++, o += 50) for (let k = 0; k < 9; k++) p[t * 9 + k] = dv.getFloat32(o + k * 4, true); return soup(p); }
  const txt = new TextDecoder().decode(buf), p = []; for (const m of txt.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) p.push(+m[1], +m[2], +m[3]);
  if (p.length < 9) throw fail('import', 'That STL file has no triangles in it.'); return soup(new Float32Array(p));
}
const soup = p => { const idx = new Uint32Array(p.length / 3); for (let i = 0; i < idx.length; i++) idx[i] = i; return { positions: p, indices: idx }; };
function readOBJ(buf) {
  const txt = new TextDecoder().decode(buf), v = [], idx = [];
  for (const line of txt.split('\n')) {
    const a = line.trim().split(/\s+/);
    if (a[0] === 'v') v.push(+a[1], +a[2], +a[3]);
    else if (a[0] === 'f') { const f = a.slice(1).map(s => { const i = parseInt(s, 10); return i < 0 ? v.length / 3 + i : i - 1; }); for (let k = 1; k + 1 < f.length; k++) idx.push(f[0], f[k], f[k + 1]); }
  }
  if (idx.length < 3) throw fail('import', 'That OBJ file has no faces in it.'); return { positions: new Float32Array(v), indices: new Uint32Array(idx) };
}
// GLB: a small reader for plain meshes; anything it does not understand goes to three.js's full loader. GLB is metres with Y up.
function readGLBPlain(buf) {
  const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('not glb');
  let o = 12, json = null, bin = null; while (o < buf.byteLength) { const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true); if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, o + 8, len))); else if (type === 0x004E4942) bin = new Uint8Array(buf, o + 8, len); o += 8 + len; }
  if (!json || !bin || (json.extensionsRequired || []).length) throw new Error('unsupported');
  const acc = i => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView]; if (a.sparse || !bv || bv.buffer) throw new Error('unsupported'); const n = { SCALAR: 1, VEC3: 3 }[a.type], T = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType]; if (!n || !T) throw new Error('unsupported');
    const start = bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || T.BYTES_PER_ELEMENT * n, out = new T(a.count * n), view = new DataView(bin.buffer, start), get = { 5121: 'getUint8', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = view[get](k * stride + c * T.BYTES_PER_ELEMENT, true); return out; };
  const P = [], I = [], M = new THREE.Matrix4(), v = new THREE.Vector3();
  const walk = (ni, parent) => {
    const nd = json.nodes[ni], m = new THREE.Matrix4(); if (nd.matrix) m.fromArray(nd.matrix); else m.compose(new THREE.Vector3(...(nd.translation || [0, 0, 0])), new THREE.Quaternion(...(nd.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(nd.scale || [1, 1, 1])));
    const world = parent.clone().multiply(m);
    if (nd.mesh !== undefined) for (const pr of json.meshes[nd.mesh].primitives) { if ((pr.mode ?? 4) !== 4) continue; const pos = acc(pr.attributes.POSITION); if (!(pos instanceof Float32Array)) throw new Error('unsupported'); const base = P.length / 3;
      for (let k = 0; k < pos.length; k += 3) { v.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(world); P.push(v.x * 1000, -v.z * 1000, v.y * 1000); }
      if (pr.indices !== undefined) { const ix = acc(pr.indices); for (let k = 0; k < ix.length; k++) I.push(base + ix[k]); } else for (let k = 0; k < pos.length / 3; k++) I.push(base + k); }
    for (const c of nd.children || []) walk(c, world);
  };
  for (const r of (json.scenes?.[json.scene ?? 0]?.nodes || [])) walk(r, M);
  if (I.length < 3) throw new Error('unsupported'); return { positions: new Float32Array(P), indices: new Uint32Array(I) };
}
async function readGLB(buf) {
  try { return readGLBPlain(buf); } catch { }
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'), gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej)), P = [], I = [], v = new THREE.Vector3();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => { if (!o.isMesh) return; const g = o.geometry, pa = g.attributes.position, base = P.length / 3; for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); P.push(v.x * 1000, -v.z * 1000, v.y * 1000); } if (g.index) for (let i = 0; i < g.index.count; i++) I.push(base + g.index.getX(i)); else for (let i = 0; i < pa.count; i++) I.push(base + i); });
  if (I.length < 3) throw fail('import', 'That file has no mesh in it.'); return { positions: new Float32Array(P), indices: new Uint32Array(I) };
}
async function readMeshFile(file) {
  if (file.size > 80e6) throw fail('import', 'That file is larger than 80 MB. Reduce it first.');
  const buf = await file.arrayBuffer(), ext = (file.name.split('.').pop() || '').toLowerCase();
  const tri = ext === 'obj' ? readOBJ(buf) : ext === 'glb' ? await readGLB(buf) : ext === 'stl' ? readSTL(buf) : null;
  if (!tri) throw fail('import', 'Forge opens STL, OBJ and GLB files.');
  for (let i = 0; i < tri.positions.length; i++) if (!Number.isFinite(tri.positions[i])) throw fail('import', 'That file has broken coordinates in it.');
  return tri;
}

/* ---------------- models ---------------- */
function tidyParams(list) {
  const out = [], seen = new Set();
  for (const p of Array.isArray(list) ? list : []) {
    const key = String(p?.key || '').replace(/[^A-Za-z0-9_]/g, ''); if (!key || seen.has(key) || /^\d/.test(key)) continue; seen.add(key);
    if (p.type === 'text' || typeof p.value === 'string') { out.push({ key, label: String(p.label || key).slice(0, 40), value: String(p.value ?? '').slice(0, 80), type: 'text' }); continue; }
    const value = +p.value; if (!Number.isFinite(value)) continue;
    let min = Number.isFinite(+p.min) ? +p.min : Math.min(value, value / 4), max = Number.isFinite(+p.max) ? +p.max : Math.max(value * 4, value + 10); if (min > value) min = value; if (max < value) max = value; if (max === min) max = min + 1;
    const step = +p.step > 0 ? +p.step : (max - min > 40 ? 1 : .5);
    out.push({ key, label: String(p.label || key).slice(0, 40), value, min, max, step, unit: ['mm', 'deg', ''].includes(p.unit) ? p.unit : (p.unit === '°' ? 'deg' : 'mm') });
  }
  return out.slice(0, 12);
}
const tidySize = s => { const o = {}; for (const a of ['x', 'y', 'z']) { const v = s?.[a]; o[a] = v !== null && v !== undefined && Number.isFinite(+v) && +v > 0 ? +v : null; } return o; };
// Claude's answer becomes the model (the conversation and the stored shape stay as they are)
function applyAnswer(m, a) {
  m.kind = a.kind === 'sculpt' ? 'sculpt' : (m.source && /\bsource\b/.test(a.code) ? m.kind || 'part' : 'part');
  m.name = String(a.name || m.name || 'Model').slice(0, 60); m.code = String(a.code); m.params = tidyParams(a.params); m.size = tidySize(a.size);
  if (a.say) m.say = String(a.say).slice(0, 900); if (a.print) m.print = String(a.print).slice(0, 400); m.updated = Date.now();
}
const snapshot = m => JSON.parse(JSON.stringify({ kind: m.kind, name: m.name, code: m.code, params: m.params, size: m.size, say: m.say, print: m.print }));
const restore = (m, s) => Object.assign(m, JSON.parse(JSON.stringify(s)));
function remember(m, snap) { if (!snap?.code) return; (m.history ||= []).push(snap); if (m.history.length > 8) m.history.shift(); }

/* ---------------- the conversation ---------------- */
function showMsg(c) {
  const d = el('div', { class: 'msg ' + c.who }, c.text);
  if (c.tip) d.append(el('span', { class: 'tip', text: c.tip })); if (c.img) d.append(el('img', { src: c.img, alt: 'Picture you added' }));
  $('log').append(d); $('log').scrollTop = 1e9; return d;
}
function addMsg(who, text, extra = {}) { const c = { who, text, ...extra }; (ST.cur ? (ST.cur.chat ||= []) : ST.draft).push(c); if (ST.cur?.chat.length > 60) ST.cur.chat.splice(0, ST.cur.chat.length - 60); return showMsg(c); }
function renderChat() { $('log').textContent = ''; for (const c of ST.cur?.chat || ST.draft) showMsg(c); }
function waiting(text) { const span = el('span', { text }), d = el('div', { class: 'msg wait' }, el('i'), span); $('log').append(d); $('log').scrollTop = 1e9; return { say(t) { span.textContent = t; status(t); }, done() { d.remove(); status(null); } }; }
function status(text) { $('status').hidden = !text; if (text) $('statusText').textContent = text; }
const friendly = e => e?.code === 'cancelled' ? 'Stopped.' : (e?.message && e.code ? e.message : 'Something went wrong. Try again.');

/* ---------------- make, change, repair ---------------- */
// Build the model and hold it to its promised size. A failed or wrong build goes back to Claude with the facts, at most twice;
// the best version seen is the one that stays.
async function buildChecked(m, wait, request) {
  let best = null, last = null;
  for (let round = 0; ; round++) {
    let r = null, problem = null;
    wait.say(round ? 'Building the corrected model' : 'Building the solid');
    try { r = await buildNow(m, ST.quality); } catch (e) { if (e.code !== 'build') throw e; problem = { type: 'error', message: e.message, line: e.line }; }
    if (r) { const off = sizeOff(m.size, r.stats.size); if (off.length) problem = { type: 'size', off, got: r.stats.size }; else if (!r.stats.watertight) problem = { type: 'open', edges: r.stats.openEdges }; }
    const score = !r ? 0 : !problem ? 3 : problem.type === 'size' ? 2 : 1;
    if (r && (!best || score > best.score)) best = { score, r, snap: snapshot(m), problem };
    last = problem;
    if (!problem || round >= 2) break;
    wait.say(problem.type === 'error' ? 'Fixing a problem in the geometry' : problem.type === 'size' ? 'Correcting a size that came out wrong' : 'Closing a gap in the surface');
    let fix = null; try { fix = await askAIOnce('model_fix', fixPrompt(m, problem, { request }), []); } catch (e) { if (!best) throw e; break; }
    if (!fix?.code) break; applyAnswer(m, { ...fix, kind: m.kind });
  }
  if (!best) return { ok: false, built: false, problem: last };
  restore(m, best.snap); showBuilt(best.r);
  return { ok: best.score === 3, built: true, problem: best.problem };
}
// An organic shape: the server has it sculpted (about a minute), then it is stored here and handed to the builder.
async function sculpt(m, spec, pic, wait) {
  wait.say('Sculpting the shape. This takes about a minute');
  const usePic = spec.from === 'picture' && pic, started = HOOK.mesh ? await HOOK.mesh(spec, pic) : await (await api('/api/mesh', usePic ? { image: pic.data } : { prompt: String(spec.prompt || m.name) })).json();
  let buf = started.bytes || null;
  for (let t0 = Date.now(); !buf;) {
    if (Date.now() - t0 > 9 * 60e3) throw fail('mesh_failed', 'Sculpting took too long. Try again in a moment.');
    await sleep(3000); const s = await (await api('/api/mesh?job=' + encodeURIComponent(started.job))).json();
    if (s.state === 'failed') throw fail('mesh_failed', 'The shape could not be sculpted. Try describing it differently.');
    if (s.state === 'done') buf = await (await api('/api/mesh?job=' + encodeURIComponent(started.job) + '&file=1')).arrayBuffer();
  }
  wait.say('Turning the sculpture into a solid');
  await setSource(m, await readGLB(buf), { type: 'sculpt', what: String(spec.prompt || '').slice(0, 200) });
}
async function setSource(m, tri, info) {
  await idb.put(m.id, tri); W.has.delete(m.id); m.source = { ...info, triangles: tri.indices.length / 3 };
  const r = await work({ type: 'source', id: m.id, positions: tri.positions.slice(), indices: tri.indices.slice() }, { timeout: 180000 });
  W.has.add(m.id); m.source.original = r.original; return r;
}
function blankModel() { return { id: newId(), name: 'Model', kind: 'part', code: '', params: [], size: { x: null, y: null, z: null }, chat: [], history: [], source: null, thumb: null, created: Date.now(), updated: Date.now() }; }

async function send(text, pic) {
  text = String(text || '').trim(); if (ST.busy || (!text && !pic)) return; if (!text) text = 'Make this.';
  setBusy(true);
  const first = !ST.cur?.code, had = ST.cur; let m = ST.cur, before = m ? snapshot(m) : null;
  addMsg('you', text, pic ? { img: pic.small } : {});
  const wait = waiting(first ? 'Working out the geometry' : 'Working out the change');
  try {
    const opts = { meshOn: !!ST.cfg.forge?.meshOn || !!HOOK.mesh, picture: !!pic, stats: ST.mesh?.stats };
    const ans = await askAIOnce(first ? 'model_make' : 'model_edit', first ? makePrompt(text, opts) : editPrompt(m, text, opts), pic ? [pic.data] : []);
    if (!ans?.code) { addMsg('forge', String(ans?.say || 'I could not work that out. Say it another way, with the sizes you need.').slice(0, 900)); return; }
    if (!m) { m = blankModel(); m.chat = ST.draft; ST.draft = []; ST.cur = m; }
    applyAnswer(m, ans);
    if (ans.kind === 'sculpt' && ans.mesh && (first || ans.mesh.prompt)) await sculpt(m, ans.mesh, pic, wait);
    const res = await buildChecked(m, wait, text);
    if (!res.built) {
      if (before?.code) { restore(m, before); addMsg('note', `That change could not be built (${res.problem?.message || 'the geometry failed'}), so your model is as it was. Try asking in a different way.`); }
      else { ST.draft = m.chat; ST.cur = had || null; addMsg('note', `That could not be built (${res.problem?.message || 'the geometry failed'}). Try again with a simpler description.`); }
      return;
    }
    if (!first) remember(m, before);
    addMsg('forge', m.say || 'Done.', m.print ? { tip: m.print } : {});
    if (!res.ok && res.problem?.type === 'size') addMsg('note', `Check the size: ${res.problem.off.map(a => `${a.toUpperCase()} measures ${nice(res.problem.got['xyz'.indexOf(a)])} ${unitName()} where ${nice(m.size[a])} was expected`).join(', ')}. Tell me which sizes matter most and I will correct it.`);
    if (!res.ok && res.problem?.type === 'open') addMsg('note', 'Part of the surface is too thin to close properly. Ask me to thicken it before you print.');
    if (!ST.models.includes(m)) ST.models.unshift(m);
    openSheet(); if (first) frame('iso'); m.thumb = thumb(); save();
  } catch (e) {
    if (m && before?.code) { restore(m, before); refreshBuild(); } else if (m && !ST.models.includes(m)) { ST.draft = m.chat; ST.cur = had || null; }
    addMsg('note', friendly(e));
  } finally { wait.done(); setBusy(false); }
}

/* ---------------- the sheet (right side) ---------------- */
function showBuilt(r) { ST.mesh = r; setMesh(r); $('start').hidden = true; $('tools').hidden = false; fillFacts(); }
function fillFacts() {
  const s = ST.mesh?.stats, m = ST.cur; if (!s || !m) return;
  const cell = (id, v) => { $(id).textContent = nice(v); $(id).append(el('small', { text: unitName() })); }; cell('sx', s.size[0]); cell('sy', s.size[1]); cell('sz', s.size[2]);
  const f = $('facts'); f.textContent = '';
  const row = (k, v, cls) => f.append(el('dt', { text: k }), el('dd', { class: cls || '', text: v }));
  const want = m.size, asked = ['x', 'y', 'z'].filter(a => want?.[a] != null);
  if (asked.length) { const off = sizeOff(want, s.size); row('Sizes you set', off.length ? `${off.map(a => a.toUpperCase()).join(', ')} differs` : `${asked.map(a => nice(want[a])).join(' × ')} ${unitName()} matches`, off.length ? 'bad' : 'ok'); }
  row('Volume', `${(s.volume / 1000).toFixed(s.volume < 10000 ? 2 : 1)} cm³`);
  row('Weight in PLA', `about ${Math.max(1, Math.round(s.volume / 1000 * 1.24))} g if solid`);
  row('Surface', s.watertight && !s.oddEdges ? 'Closed, ready to slice' : `${s.openEdges + s.oddEdges} open edges`, s.watertight && !s.oddEdges ? 'ok' : 'bad');
  const fits = s.size[0] <= ST.bed[0] && s.size[1] <= ST.bed[1] && s.size[2] <= ST.bed[2]; row('Printer bed', fits ? 'Fits' : 'Too big for this bed', fits ? 'ok' : 'bad');
  row('Triangles', s.triangles.toLocaleString('en-IN') + (s.quality === 'draft' ? ' (preview)' : ''));
}
let building = false, queued = null;
// Sliders and the code box rebuild the model without asking Claude: a quick preview while dragging, the full build on release.
async function refreshBuild(quality) {
  queued = quality || ST.quality; if (building || !ST.cur?.code) return; building = true;
  while (queued) {
    const q = queued, m = ST.cur; queued = null;
    try { if (q !== 'draft') status('Building'); const r = await buildNow(m, q); if (ST.cur === m) { showBuilt(r); $('codeErr').hidden = true; } }
    catch (e) { if (ST.cur === m) { $('codeErr').hidden = false; $('codeErr').textContent = (e.line ? `Line ${e.line}: ` : '') + e.message; if (e.code !== 'build') addMsg('note', friendly(e)); } }
  }
  building = false; status(null);
}
function fillParams() {
  const m = ST.cur, box = $('params'); box.textContent = ''; $('paramBlock').hidden = !m?.params?.length; if (!m) return;
  for (const p of m.params) {
    const id = 'p_' + p.key;
    if (p.type === 'text') { const t = el('input', { type: 'text', id, value: p.value, maxlength: 80 }); t.addEventListener('change', () => { p.value = t.value; m.updated = Date.now(); refreshBuild(); save(); }); box.append(el('div', { class: 'param' }, el('label', { for: id }, p.label), t)); continue; }
    const num = el('input', { type: 'number', id, value: p.value, step: p.step, 'aria-label': p.label }), rng = el('input', { type: 'range', min: p.min, max: p.max, step: p.step, value: p.value, 'aria-label': p.label + ' slider' });
    const set = (v, final) => { v = +v; if (!Number.isFinite(v)) return; p.value = v; if (v < p.min) { p.min = v; rng.min = v; } if (v > p.max) { p.max = v; rng.max = v; } m.updated = Date.now(); refreshBuild(final ? ST.quality : 'draft'); if (final) save(); };
    rng.addEventListener('input', () => { num.value = rng.value; set(rng.value, false); }); rng.addEventListener('change', () => set(rng.value, true));
    num.addEventListener('change', () => { if (p.unit !== 'deg' && !(+num.value > 0) && p.min > 0) { num.value = p.value; return; } rng.value = num.value; set(num.value, true); });
    box.append(el('div', { class: 'param' }, el('label', { for: id }, el('span', { text: p.label }), el('span', { class: 'v' }, num, el('small', { text: p.unit === 'deg' ? '°' : p.unit }))), rng));
  }
}
function openSheet() {
  const m = ST.cur; $('sheet').hidden = !m?.code; if (!m?.code) return;
  $('mName').value = m.name; $('code').value = m.code; $('codeErr').hidden = true; $('btnUndo').disabled = !m.history?.length; fillParams(); fillFacts(); $('btnGo').textContent = 'Change it';
  $('say').placeholder = 'Say what to change. For example: make it 10 mm taller, add a second hole, round the corners.';
}
function setBusy(b) { ST.busy = b; $('btnGo').disabled = b; for (const e of document.querySelectorAll('#params input, #codeRun, #btnUndo, #mName, #dlMain, #formats button')) e.disabled = b; if (!b && ST.cur) $('btnUndo').disabled = !ST.cur.history?.length; }

/* ---------------- downloads ---------------- */
async function download(id) {
  const f = FORMATS.find(x => x.id === id), m = ST.cur; if (!f || !m || ST.busy) return;
  try {
    if (!ST.mesh || ST.mesh.stats.quality === 'draft' || building) { await refreshBuild(ST.quality); while (building) await sleep(60); }
    let mesh = ST.mesh;
    if (f.max && mesh.stats.triangles > f.max) {       // a format with a ceiling on facets: build a lighter copy just for this file
      status(`Making a lighter copy for ${f.label}`);
      for (const [budget, tol] of [[70000, .03], [26000, .08], [9000, .2]]) { mesh = await buildNow(m, 'normal', { budget, tol }); if (mesh.stats.triangles <= f.max) break; }
      status(null);
      if (mesh.stats.triangles > f.max) { $('fmtHint').textContent = `This model has too much fine detail for ${f.label} (it holds ${f.max.toLocaleString('en-IN')} flat faces at most). Use 3MF or STL instead.`; return; }
    }
    const bytes = await f.write({ positions: mesh.positions, indices: mesh.indices }, m.name), name = `${safeName(m.name).replace(/\s+/g, '-').toLowerCase()}.${f.ext}`;
    HOOK.saved = { name, bytes, triangles: mesh.stats.triangles };
    const url = URL.createObjectURL(new Blob([bytes], { type: f.mime })), a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    $('fmtHint').textContent = `Saved ${name} (${bytes.length > 1e6 ? (bytes.length / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes.length / 1000)) + ' KB'}). ${f.note}`;
  } catch (e) { status(null); $('fmtHint').textContent = 'That file could not be written: ' + (e.message || 'unknown problem') + '.'; }
}

/* ---------------- opening, switching, listing ---------------- */
async function openModel(m) {
  ST.cur = m; ST.mesh = null; setMesh(null); renderChat(); $('drawer').hidden = true; $('btnModels').setAttribute('aria-expanded', 'false');
  if (!m) { $('sheet').hidden = true; $('start').hidden = false; $('tools').hidden = true; $('btnGo').textContent = 'Make it'; $('say').placeholder = 'Describe the object and give any sizes you know. For example: a bracket 60 mm wide with two 5 mm holes.'; store.set('forge-last', null); return; }
  openSheet(); $('start').hidden = true; status('Building');
  try { showBuilt(await buildNow(m, ST.quality)); frame('iso'); if (!m.thumb) { m.thumb = thumb(); } save(); }
  catch (e) { addMsg('note', e.code === 'build' ? `This model no longer builds: ${e.message}` : friendly(e)); }
  status(null);
}
function listModels() {
  const ul = $('mlist'); ul.textContent = ''; $('mEmpty').hidden = ST.models.length > 0;
  for (const m of ST.models) {
    const open = el('button', { class: 'open', type: 'button', onclick: () => openModel(m) }, el('b', { text: m.name }), el('small', { text: new Date(m.updated).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + (m.kind === 'sculpt' ? ' · sculpted' : m.source ? ' · opened file' : '') }));
    const del = el('button', { class: 'del', type: 'button', 'aria-label': 'Delete ' + m.name, text: 'Delete', onclick: () => { if (del.dataset.sure) { ST.models = ST.models.filter(x => x !== m); idb.del(m.id); if (ST.cur === m) openModel(null); save(); listModels(); } else { del.dataset.sure = 1; del.textContent = 'Sure?'; } } });
    ul.append(el('li', { class: m === ST.cur ? 'on' : '' }, m.thumb ? el('img', { src: m.thumb, alt: '' }) : el('span', { class: 'ph' }), open, del));
  }
}
async function importFile(file) {
  if (ST.busy) return; setBusy(true); const had = ST.cur; ST.cur = null; ST.draft = []; renderChat();
  const wait = waiting('Reading the file');
  try {
    const tri = await readMeshFile(file), m = blankModel(); m.name = file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Opened mesh'; m.kind = 'part';
    wait.say('Rebuilding it as a solid');
    const r = await setSource(m, tri, { type: 'file', what: file.name.slice(0, 80) }), big = Math.max(...r.original);
    m.params = tidyParams([{ key: 'longest', label: 'Longest side', value: +big.toFixed(2), min: +(big / 10).toFixed(2), max: +(big * 5).toFixed(2), step: big > 60 ? 1 : .5, unit: 'mm' }]);
    m.code = '// The file you opened, rebuilt as a closed solid. "source" is 100 mm along its longest side.\nreturn source.scale(p.longest / 100).onBed();';
    ST.cur = m; m.chat = [];
    wait.say('Building the solid'); showBuilt(await buildNow(m, ST.quality));
    addMsg('forge', `I opened ${file.name} and rebuilt it as a closed solid, ${sizeText(ST.mesh.stats.size)}. Tell me what to change (resize it, add a base, cut a hole, add lettering), or download it in another format.`, { tip: 'Very fine surface detail is smoothed slightly when a mesh is rebuilt.' });
    ST.models.unshift(m); openSheet(); frame('iso'); m.thumb = thumb(); save();
  } catch (e) { ST.cur = had || null; renderChat(); addMsg('note', e.code ? e.message : 'That file could not be read.'); if (had) openSheet(); }
  finally { wait.done(); setBusy(false); }
}
async function takePicture(file) {
  if (!file) return; if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { addMsg('note', 'Add a JPG, PNG or WebP picture.'); return; }
  const img = await createImageBitmap(file).catch(() => null); if (!img) { addMsg('note', 'That picture could not be read.'); return; }
  const draw2 = side => { const k = Math.min(1, side / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); return c; };
  ST.pic = { data: draw2(1568).toDataURL('image/jpeg', .88), small: draw2(220).toDataURL('image/jpeg', .7) };
  $('picThumb').src = ST.pic.small; $('picThumb').hidden = false; $('picClear').hidden = false; $('btnPic').textContent = 'Change picture';
}
function clearPicture() { ST.pic = null; $('picThumb').hidden = true; $('picClear').hidden = true; $('btnPic').textContent = 'Add a picture'; $('picFile').value = ''; }

/* ---------------- start ---------------- */
const STARTERS = [
  ['A name tag 70 mm wide, 22 mm tall and 3 mm thick that says SHLOK in raised letters, with a 5 mm hole on the left for a keyring.', 'Name tag with raised letters', '70 × 22 × 3'],
  ['A wall hook for a bag. The back plate is 30 mm wide, 70 mm tall and 4 mm thick, with two holes for M4 screws. The hook sticks out 35 mm.', 'Wall hook with two screw holes', '30 × 70, M4'],
  ['A stand for a phone that is 78 mm wide and 9 mm thick, leaning back 20 degrees, with a gap at the bottom for the charging cable.', 'Phone stand, leaning back 20°', '78 mm phone'],
  ['An M10 bolt 30 mm long with a hex head, and a matching nut beside it.', 'Bolt and nut with real threads', 'M10 × 30'],
  ['A small sitting cat, 80 mm tall, with a flat base so it stands.', 'Sitting cat figurine', '80 tall', 'sculpt'],
];
async function boot() {
  try { ST.cfg = await (await fetch('/api/config')).json(); } catch { ST.cfg = {}; }
  initView();
  for (const [full, short, dims, need] of STARTERS) { if (need === 'sculpt' && !ST.cfg.forge?.meshOn) continue; $('starters').append(el('li', {}, el('button', { type: 'button', onclick: () => { $('say').value = full; $('say').focus(); } }, short, el('span', { text: dims })))); }
  for (const f of FORMATS.filter(x => x.id !== 'stl')) $('formats').append(el('button', { type: 'button', text: f.label, title: f.note, onclick: () => download(f.id), onmouseenter: () => { $('fmtHint').textContent = f.note; }, onfocus: () => { $('fmtHint').textContent = f.note; } }));
  $('dlMain').addEventListener('click', () => download('stl'));
  $('ask').addEventListener('submit', e => { e.preventDefault(); const t = $('say').value, p = ST.pic; if (ST.busy || (!t.trim() && !p)) return; $('say').value = ''; clearPicture(); send(t, p); });
  $('say').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('ask').requestSubmit(); });
  $('btnPic').addEventListener('click', () => $('picFile').click()); $('picFile').addEventListener('change', e => takePicture(e.target.files[0])); $('picClear').addEventListener('click', clearPicture);
  $('btnImport').addEventListener('click', () => $('meshFile').click()); $('meshFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); });
  const stage = $('stage'); stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('drop'); }); stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
  stage.addEventListener('drop', e => { e.preventDefault(); stage.classList.remove('drop'); const f = e.dataTransfer?.files?.[0]; if (!f) return; if (/\.(stl|obj|glb)$/i.test(f.name)) importFile(f); else takePicture(f); });
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => frame(b.dataset.view));
  $('tgDims').addEventListener('click', () => { ST.dims = !ST.dims; $('tgDims').setAttribute('aria-pressed', ST.dims); drawDims(); });
  $('tgEdges').addEventListener('click', () => { ST.edges = !ST.edges; $('tgEdges').setAttribute('aria-pressed', ST.edges); if (V.lines) V.lines.visible = ST.edges; draw(); });
  $('tgUnit').textContent = ST.unit === 'in' ? 'inches' : 'mm';
  $('tgUnit').addEventListener('click', () => { ST.unit = ST.unit === 'mm' ? 'in' : 'mm'; store.set('forge-unit', ST.unit); $('tgUnit').textContent = ST.unit === 'in' ? 'inches' : 'mm'; drawDims(); fillFacts(); });
  $('quality').addEventListener('change', e => { ST.quality = e.target.value; refreshBuild(); });
  $('bed').value = ST.bed.join(','); if (!$('bed').value) $('bed').value = '220,220,250';
  $('bed').addEventListener('change', e => { ST.bed = e.target.value.split(',').map(Number); store.set('forge-bed', ST.bed); drawBed(); fillFacts(); });
  $('mName').addEventListener('change', e => { if (!ST.cur) return; ST.cur.name = e.target.value.trim().slice(0, 60) || 'Model'; e.target.value = ST.cur.name; save(); });
  $('codeRun').addEventListener('click', () => { const m = ST.cur; if (!m || ST.busy) return; const t = $('code').value; if (t === m.code) return refreshBuild(); remember(m, snapshot(m)); m.code = t; m.size = { x: null, y: null, z: null }; m.updated = Date.now(); $('btnUndo').disabled = false; refreshBuild().then(() => { m.thumb = thumb(); save(); }); });
  $('btnUndo').addEventListener('click', () => { const m = ST.cur, s = m?.history?.pop(); if (!s || ST.busy) return; restore(m, s); m.updated = Date.now(); openSheet(); addMsg('note', 'Went back to the version before the last change.'); refreshBuild().then(() => { m.thumb = thumb(); save(); }); });
  $('btnNew').addEventListener('click', () => { if (ST.busy) return; ST.draft = []; openModel(null); $('say').focus(); });
  $('btnModels').addEventListener('click', () => { const d = $('drawer'); d.hidden = !d.hidden; $('btnModels').setAttribute('aria-expanded', !d.hidden); if (!d.hidden) listModels(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('drawer').hidden) { $('drawer').hidden = true; $('btnModels').setAttribute('aria-expanded', 'false'); $('btnModels').focus(); } });
  startWorker().catch(() => { });
  const last = ST.models.find(m => m.id === store.get('forge-last', null)); if (last) openModel(last);
}
globalThis.__forge = { ST, V, W, HOOK, send, buildNow, refreshBuild, download, frame, openModel, importFile, makePrompt, editPrompt, fixPrompt, FORMATS, nice, sizeOff, readSTL, readOBJ, readGLB, draw };
boot();
