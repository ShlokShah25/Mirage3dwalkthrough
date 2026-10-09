/* ================= Forge worker =================
   Runs beside the page so the screen never freezes: it keeps the fonts and any imported shape, runs a model's code,
   turns the result into triangles and measures it. The page sends messages; this answers each one.
   A model's code is written by the AI, so before any of it runs this worker gives up everything it does not need:
   it cannot reach the network or the browser's storage from here on. */
const IN_WORKER = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
const LOCKED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker', 'WebTransport', 'RTCPeerConnection', 'navigator', 'location', 'Function', 'eval'];
const HIDDEN = ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB', 'caches', 'navigator', 'location', 'Function', 'self', 'globalThis', 'postMessage'];   // names the code sees as undefined
const BANNED = /\b(?:constructor|prototype|__proto__|eval|Function|globalThis|import\s*\()/;
const SOURCES = new Map();          // id → the imported shape as a solid, 100 mm along its longest side, centred, sitting on the bed
const API_NAMES = Object.keys(API);
const MakeFn = Function;            // kept before the lock below hides it

function lockDown() {
  if (!IN_WORKER) return;
  for (const k of LOCKED) { try { Object.defineProperty(self, k, { value: undefined, writable: false, configurable: false }); } catch { try { self[k] = undefined; } catch { } } }
}

// The budget is how many surface cubes the mesher may use: more means finer curves and a bigger file.
// tol is how far (mm) a corner may sit from the true surface when flat-looking patches are merged into bigger triangles.
const QUALITY = { draft: { budget: 40000, tol: .012 }, normal: { budget: 260000, tol: .004 }, fine: { budget: 800000, tol: .0015 } };

function lineOf(e) { const m = /(?:<anonymous>|Function|eval[^:]*):(\d+):(\d+)/.exec(String(e?.stack || '')); return m ? Math.max(1, +m[1] - 3) : null; }

function runCode(code, params, source) {
  code = String(code || '');
  if (!code.trim()) throw new Error('The model has no code');
  if (code.length > 60000) throw new Error('The model code is too long');
  const bad = BANNED.exec(code); if (bad) throw new Error(`The model code uses "${bad[0].trim()}", which is not allowed. Use only the modelling vocabulary and plain maths.`);
  let fn;
  // the code runs inside its own function, so it may reuse a vocabulary word as a variable name without a clash
  try { fn = new MakeFn(...API_NAMES, 'p', 'source', ...HIDDEN, '"use strict"; return (() => {\n' + code + '\n})();'); }
  catch (e) { throw Object.assign(new Error('The code does not parse: ' + e.message), { stage: 'parse' }); }
  const p = new Proxy({ ...params }, { get(t, k) { if (typeof k === 'string' && !(k in t)) throw new Error(`The code reads p.${k}, but there is no parameter with that key`); return t[k]; } });
  const src = source || new Proxy({}, { get() { throw new Error('The code uses "source", but this model has no imported or sculpted shape'); } });
  let out;
  try { out = fn(...API_NAMES.map(k => API[k]), p, src); }
  catch (e) { throw Object.assign(new Error(e?.message || String(e)), { stage: 'run', line: lineOf(e) }); }
  if (out instanceof Shape) throw new Error('The code returns a flat shape. Extrude or revolve it into a solid.');
  if (!(out instanceof Solid)) throw new Error('The code must end with: return <a solid>');
  const b = out.bb; if (!b.every(Number.isFinite)) throw new Error('The solid has no end in some direction (a halfspace or clip was returned on its own). Intersect it with a real solid.');
  if (!(b[3] > b[0] && b[4] > b[1] && b[5] > b[2])) throw new Error('The solid is empty: everything was cut away or the parts do not overlap.');
  if (Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]) > 5000) throw new Error('The solid is larger than 5 metres. Sizes are in millimetres.');
  return out;
}

// For the screen: every triangle gets its own corners, smooth across gentle bends and crisp at real edges, plus the list of crisp edges to draw as lines.
function forScreen(positions, indices, creaseDeg = 32) {
  const nT = indices.length / 3, nV = positions.length / 3, fn = new Float32Array(nT * 3), fa = new Float32Array(nT), cosC = Math.cos(creaseDeg * Math.PI / 180);
  for (let t = 0; t < nT; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3, ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2], vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1; fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l; fa[t] = l;
  }
  const start = new Uint32Array(nV + 1); for (let i = 0; i < indices.length; i++) start[indices[i] + 1]++; for (let i = 0; i < nV; i++) start[i + 1] += start[i];
  const fill = start.slice(0, nV), of = new Uint32Array(indices.length); for (let i = 0; i < indices.length; i++) of[fill[indices[i]]++] = (i / 3) | 0;
  const pos = new Float32Array(nT * 9), nrm = new Float32Array(nT * 9);
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const v = indices[t * 3 + k], o = t * 9 + k * 3; pos[o] = positions[v * 3]; pos[o + 1] = positions[v * 3 + 1]; pos[o + 2] = positions[v * 3 + 2];
    const ax = fn[t * 3], ay = fn[t * 3 + 1], az = fn[t * 3 + 2]; let sx = 0, sy = 0, sz = 0;
    for (let q = start[v]; q < start[v + 1]; q++) { const f = of[q], bx = fn[f * 3], by = fn[f * 3 + 1], bz = fn[f * 3 + 2]; if (ax * bx + ay * by + az * bz >= cosC) { sx += bx * fa[f]; sy += by * fa[f]; sz += bz * fa[f]; } }
    const l = Math.hypot(sx, sy, sz) || 1; nrm[o] = sx / l; nrm[o + 1] = sy / l; nrm[o + 2] = sz / l;
  }
  const seen = new Map(), edges = [];
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const a = indices[t * 3 + k], b = indices[t * 3 + (k + 1) % 3], key = a < b ? a * nV + b : b * nV + a, o = seen.get(key);
    if (o === undefined) { seen.set(key, t); continue; }
    if (fn[t * 3] * fn[o * 3] + fn[t * 3 + 1] * fn[o * 3 + 1] + fn[t * 3 + 2] * fn[o * 3 + 2] >= cosC) continue;
    const l2 = (positions[a * 3] - positions[b * 3]) ** 2 + (positions[a * 3 + 1] - positions[b * 3 + 1]) ** 2 + (positions[a * 3 + 2] - positions[b * 3 + 2]) ** 2;
    if (Math.min(fa[t], fa[o]) < .04 * l2) continue;       // a needle-thin triangle has no trustworthy direction: no line for it
    edges.push(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2], positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]);
  }
  return { pos, nrm, edges: new Float32Array(edges) };
}

function build(msg) {
  const t0 = Date.now(), src = msg.sourceId ? SOURCES.get(msg.sourceId) : null;
  const solid = runCode(msg.code, msg.params || {}, src);
  const q = { ...(QUALITY[msg.quality] || QUALITY.normal), ...(msg.budget > 0 ? { budget: msg.budget } : {}), ...(msg.tol > 0 ? { tol: msg.tol } : {}) };
  const mesh = meshSolid(solid, q);
  if (!mesh.stats.triangles) throw new Error('The model came out empty: everything was cut away, or it is thinner than the mesher can see.');
  const view = forScreen(mesh.positions, mesh.indices);
  return { positions: mesh.positions, indices: mesh.indices, stats: { ...mesh.stats, ms: Date.now() - t0, quality: msg.quality || 'normal' }, ...view };
}

// An imported or sculpted mesh (millimetres or not, Z up) becomes a solid: 100 mm along its longest side, centred, on the bed.
function addSource(msg, say) {
  const g = voxelize(msg.positions, msg.indices, msg.res || 176, f => say({ type: 'progress', job: msg.job, f }));
  const b = g.bb, ext = Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]), s = 100 / ext;
  const solid = g.scale(s).center('xy').onBed();
  if (SOURCES.size >= 3) SOURCES.delete(SOURCES.keys().next().value);
  SOURCES.set(msg.id, solid);
  return { size: [(b[3] - b[0]) * s, (b[4] - b[1]) * s, (b[5] - b[2]) * s], original: [b[3] - b[0], b[4] - b[1], b[5] - b[2]] };
}

function handle(msg, say) {
  try {
    if (msg.type === 'font') { addFont(msg.name, msg.buf); say({ type: 'ready', what: 'font', name: msg.name }); }
    else if (msg.type === 'lock') { lockDown(); say({ type: 'ready', what: 'lock' }); }
    else if (msg.type === 'source') { const r = addSource(msg, say); say({ type: 'sourced', id: msg.id, job: msg.job, ...r }); }
    else if (msg.type === 'forget') { SOURCES.delete(msg.id); }
    else if (msg.type === 'build') { const r = build(msg); say({ type: 'built', job: msg.job, ...r }, [r.positions.buffer, r.indices.buffer, r.pos.buffer, r.nrm.buffer, r.edges.buffer]); }
  } catch (e) { say({ type: 'error', job: msg.job, id: msg.id, message: e?.message || String(e), line: e?.line ?? null, stage: e?.stage || msg.type }); }
}
if (IN_WORKER) self.onmessage = ev => handle(ev.data, (m, tr) => self.postMessage(m, tr || []));
