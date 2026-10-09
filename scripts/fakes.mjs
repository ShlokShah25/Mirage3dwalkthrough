// Stand-ins for Claude and Razorpay, for local testing only.
// Claude on :4001 (streams canned answers), Razorpay on :4002 (orders, subscriptions, test payments).
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const here = new URL('./fixtures/', import.meta.url);
const TRACE = JSON.parse(readFileSync(process.env.MOCK_TRACE || new URL('mock_trace.json', here)));   // MOCK_TRACE=path tests plan reading on another plan
const ITEMS = JSON.parse(readFileSync(new URL('mock_items.json', here)));
const SECRET = process.env.RAZORPAY_KEY_SECRET || 'test_secret';
const readJson = async req => { const c = []; for await (const x of req) c.push(x); try { return JSON.parse(Buffer.concat(c).toString() || '{}'); } catch { return {}; } };
export const calls = [];
const meshJobs = new Map();
// A small GLB for the sculpting stand-in: a "figure" of two round blobs (a body and a head), in metres with Y up, as real services send.
export function testGLB() {
  const P = [], I = [];
  const ball = (cx, cy, cz, r, n = 20) => { const base = P.length / 3; for (let a = 0; a <= n; a++) for (let b = 0; b < n * 2; b++) { const th = Math.PI * a / n, ph = Math.PI * b / n; P.push(cx + r * Math.sin(th) * Math.cos(ph), cy + r * Math.cos(th), cz + r * Math.sin(th) * Math.sin(ph)); }
    for (let a = 0; a < n; a++) for (let b = 0; b < n * 2; b++) { const p = base + a * n * 2 + b, q = base + a * n * 2 + (b + 1) % (n * 2), r2 = p + n * 2, s = q + n * 2; I.push(p, q, r2, q, s, r2); } };
  ball(0, .3, 0, .3); ball(0, .72, 0, .2);
  const pos = new Float32Array(P), idx = new Uint32Array(I), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], pos[i]); hi[i % 3] = Math.max(hi[i % 3], pos[i]); }
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }], buffers: [{ byteLength: pos.byteLength + idx.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength }, { buffer: 0, byteOffset: pos.byteLength, byteLength: idx.byteLength }], accessors: [{ bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: lo, max: hi }, { bufferView: 1, componentType: 5125, count: idx.length, type: 'SCALAR' }] };
  let jb = Buffer.from(JSON.stringify(json)); jb = Buffer.concat([jb, Buffer.alloc((4 - jb.length % 4) % 4, 0x20)]);
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(idx.buffer)]), head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jb.length + 8 + bin.length, 8); jh.writeUInt32LE(jb.length, 0); jh.writeUInt32LE(0x4E4F534A, 4); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004E4942, 4);
  return Buffer.concat([head, jh, jb, bh, bin]);
}

function answer(prompt) {
  if (prompt.startsWith('You are an architectural draftsperson')) return TRACE;
  if (prompt.startsWith('You are checking a tracing')) return { ...TRACE, changes: [] };
  if (prompt.startsWith('You are correcting a tracing') && process.env.MOCK_DEEP) { try { return JSON.parse(readFileSync(`${process.env.MOCK_DEEP}/answer-round-${prompt.match(/round (\d+) of/)[1]}.json`)); } catch { return { edits: [], dismiss: [], done: true }; } }   // MOCK_DEEP=dir replays saved deep-read answers
  if (prompt.startsWith('You are correcting a tracing')) return /round 1 of/.test(prompt) ? { edits: [], dismiss: [...prompt.matchAll(/^- \[([^\]]+)\]/gm)].map(m => ({ id: m[1], why: 'test' })), zoom: [], ask: [], notes: 'looked at everything', done: false } : { edits: [], dismiss: [], zoom: [], ask: [], notes: 'nothing to change', done: true };
  if (prompt.startsWith('You are an interior designer. The image')) return { summary: 'x', tokens: {}, floors: {} };
  if (/guide inside Mirage/.test(prompt)) {
    if (/Write the script for a guided tour/.test(prompt)) return { intro: 'Welcome.', stops: [...prompt.matchAll(/^(.+?) \((\w+)/gm)].slice(0, 3).map(m => ({ room: m[1], say: `This is the ${m[1]}.`, look: '' })), outro: 'Ask me anything.' };
    if (/The room in front of you is empty/.test(prompt)) return { say: 'This room gets lovely light; here are a few directions.', options: [{ label: 'Quiet evening luxe', why: 'Walnut, travertine and a soft glow after dark.', request: 'Walnut panelling behind the main piece, a travertine side table, cove light and one brass lamp.' }, { label: 'Gallery calm', why: 'Pale stone, one great artwork and room to breathe.', request: 'Limestone tones, a large artwork on the long wall, linen upholstery and a wall washer.' }, { label: 'Midnight lounge', why: 'Dark, glowing and a little dramatic.', request: 'Charcoal walls, an RGB LED strip at the skirting, a deep sofa and a neon sign.' }] };
    const said = (prompt.match(/VISITOR SAYS: "([^]*?)"\n/) || [])[1] || '';
    if (/lounge chair by the window/.test(said)) return { say: 'Adding a leather lounge chair by the window.', actions: [{ do: 'edit', request: 'Add a leather lounge chair by the window in the Master Bedroom' }] };
    if (/ideas/i.test(said)) return { say: 'Three directions for this room.', actions: [], options: [{ label: 'Midnight studio', why: 'Dark, glowing and made for late nights.', request: 'SLOWTEST Make it night in a dark moody studio with RGB accent lighting' }, { label: 'Gallery calm', why: 'Pale stone and one great piece.', request: 'Make it day' }] };
    if (/go for it/i.test(said)) return /CHANGES IN PROGRESS/.test(prompt) ? { say: 'It is already under way.', actions: [] } : { say: 'On it.', actions: [{ do: 'edit', request: 'SLOWTEST Make it night in a dark moody studio with RGB accent lighting' }] };
    if (/^TESTEDIT /.test(said)) return { say: 'On it.', actions: [{ do: 'edit', request: said.slice(9) }] };
    return { say: 'Here is the kitchen.', actions: [{ do: 'go', room: 'Kitchen' }] };
  }
  // a repair call: "TESTFIX [good ops] TESTOPS [first ops]" answers the first call with TESTOPS and the repair with TESTFIX
  if (prompt.startsWith('You are editing') && /THESE PARTS DID NOT WORK/.test(prompt) && /TESTFIX /.test(prompt)) { try { return { summary: 'Repaired.', left: '', ops: JSON.parse(prompt.match(/TESTFIX (\[[^]*?\]) TESTOPS/)[1]) }; } catch (e) { return { summary: 'bad test fix ' + e.message, ops: [] }; } }
  if (prompt.startsWith('You are editing') && /TESTOPS /.test(prompt)) { try { return { summary: 'Test operations applied.', ops: JSON.parse(prompt.match(/TESTOPS (\[[^]*?\])"\n(?:EARLIER|WHERE)/)[1]) }; } catch (e) { return { summary: 'bad test ops ' + e.message, ops: [] }; } }
  if (prompt.startsWith('You are editing')) return /NOOP/.test(prompt) ? { summary: 'Nothing to change.', ops: [] } : { summary: 'Switched to night.', ops: [{ op: 'time', value: 'night' }] };
  // Forge (3D models). Words in the customer's text steer the canned answer: TESTBREAK (code that fails, then a repair),
  // TESTSIZE (a wrong size promise, then a repair), TESTSCULPT (an organic shape), TESTQUESTION (an answer with no model).
  if (prompt.startsWith('You are Forge')) {
    const plate = (thick, extra = {}) => ({ kind: 'part', name: 'Test plate', say: `A 60 x 40 x ${thick} mm plate with a 6 mm hole.`, params: [{ key: 'width', label: 'Width', value: 60, min: 20, max: 200, step: 1, unit: 'mm' }, { key: 'depth', label: 'Depth', value: 40, min: 20, max: 200, step: 1, unit: 'mm' }, { key: 'thick', label: 'Thickness', value: thick, min: 1.2, max: 20, step: 0.2, unit: 'mm' }, { key: 'label', label: 'Wording', value: 'OK', type: 'text' }], code: "const plate = extrude(rect(p.width, p.depth, { r: 4 }), p.thick);\nconst hole = cylinder(3, p.thick + 2).move(-p.width / 2 + 9, 0, -1);\nconst word = extrude(text(p.label, 9), 1).move(6, 0, p.thick - 0.6);\nreturn cut(plate, hole, word);", size: { x: 60, y: 40, z: thick }, print: 'Print flat, no supports.', ...extra });
    if (/A model you wrote has a problem/.test(prompt)) return plate(5, { say: 'A 60 x 40 x 5 mm plate with a 6 mm hole (corrected).' });
    const asked = (prompt.match(/THE CUSTOMER (?:NOW )?ASKS\n([^]*)$/) || [])[1] || '';
    if (/TESTQUESTION/.test(asked)) return { say: 'Yes, it prints flat without supports.' };
    if (/TESTBREAK/.test(asked)) return plate(5, { code: 'const plate = box(p.width, p.depth, p.thick);\nreturn plate.nothing(3);' });
    if (/TESTSIZE/.test(asked)) return plate(5, { size: { x: 60, y: 40, z: 9 } });
    if (/TESTSCULPT/.test(asked)) return { kind: 'sculpt', name: 'Test figure', say: 'A sculpted figure 80 mm tall on a round base.', params: [{ key: 'height', label: 'Height', value: 80, min: 30, max: 200, step: 1, unit: 'mm' }], code: "const figure = source.fit({ z: p.height - 2 }).moveZ(2);\nconst base = cylinder(p.height * 0.3, 3);\nreturn union(figure, base).clip({ zmax: p.height });", size: { x: null, y: null, z: 80 }, print: 'Print upright.', mesh: { prompt: 'a small round figure', from: 'words' } };
    if (/THE MODEL NOW/.test(prompt)) return plate(8, { say: 'Made it 8 mm thick.' });
    return plate(5);
  }
  if (prompt.includes('placing furniture')) {
    if (/EMPTYROOM/.test(prompt)) return { items: [] };
    const names = [...prompt.matchAll(/ROOM "([^"]+)"/g)].map(m => m[1]);
    return { items: ITEMS.filter(i => names.includes(i.room)) };
  }
  return { ok: true };
}

export function startFakes() {
  const claude = http.createServer(async (req, res) => {
    const b = await readJson(req);
    const text = b.messages?.[0]?.content?.find(c => c.type === 'text')?.text || '';
    calls.push({ model: b.model, head: text.slice(0, 40), images: b.messages?.[0]?.content?.filter(c => c.type === 'image').length });
    if (/HOMEOWNER'S REQUEST: "SLOWTEST/.test(text)) await new Promise(r => setTimeout(r, 3500));   // lets tests ask for a second change while the first is being made
    const out = JSON.stringify(answer(text));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = o => res.write(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`);
    send({ type: 'message_start', message: { usage: { input_tokens: Math.ceil(text.length / 4) } } });
    for (let i = 0; i < out.length; i += 400) send({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: out.slice(i, i + 400) } });
    send({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: Math.ceil(out.length / 4) } });
    send({ type: 'message_stop' }); res.end();
  }).listen(4001);

  const subs = {}; let n = 0;
  const period = () => { const s = Math.floor(Date.now() / 1000); return { current_start: s, current_end: s + 30 * 86400 }; };
  const rzp = http.createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', '*');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    const b = await readJson(req); const url = new URL(req.url, 'http://x'); const send = (o, s = 200) => res.writeHead(s, { 'content-type': 'application/json' }).end(JSON.stringify(o));
    if (req.method === 'POST' && url.pathname === '/v1/orders') return send({ id: `order_${++n}`, entity: 'order', amount: b.amount, currency: b.currency, status: 'created', notes: b.notes });
    if (req.method === 'POST' && url.pathname === '/v1/subscriptions') { const id = `sub_${++n}`; subs[id] = { id, entity: 'subscription', plan_id: b.plan_id, status: 'created', notes: b.notes, offer_id: b.offer_id || null }; return send(subs[id]); }
    let m = /^\/v1\/subscriptions\/([^/]+)(\/cancel)?$/.exec(url.pathname);
    if (m && req.method === 'GET') return subs[m[1]] ? send(subs[m[1]]) : send({ error: { description: 'no such sub' } }, 404);
    if (m && req.method === 'PATCH') { Object.assign(subs[m[1]], { plan_id: b.plan_id }); return send(subs[m[1]]); }
    if (m && m[2]) return send(subs[m[1]]);
    if (url.pathname === '/test/pay') {
      const paymentId = `pay_${++n}`;
      if (b.orderId) return send({ paymentId, signature: createHmac('sha256', SECRET).update(`${b.orderId}|${paymentId}`).digest('hex') });
      Object.assign(subs[b.subscriptionId], { status: 'active', ...period() });
      return send({ paymentId, signature: createHmac('sha256', SECRET).update(`${paymentId}|${b.subscriptionId}`).digest('hex') });
    }
    if (url.pathname === '/test/sub') return send(subs[b.id]);
    send({ error: { description: 'not found' } }, 404);
  }).listen(4002);
  // fal.ai stand-in on :4003: echoes a tiny JPEG, or fails when the prompt mentions FAILME.
  const fal = http.createServer(async (req, res) => {
    const b = await readJson(req); calls.push({ fal: req.url, auth: req.headers.authorization, prompt: b.prompt, ratio: b.aspect_ratio, hasImage: String(b.image_url || '').startsWith('data:image/') });
    if (/FAILME/.test(b.prompt || '')) return res.writeHead(500, { 'content-type': 'application/json' }).end('{"detail":"boom"}');
    // Forge's sculpting service: a queued job that is "in progress" once, then done, and hands back a small GLB
    const sendJ = (o, s = 200) => res.writeHead(s, { 'content-type': 'application/json' }).end(JSON.stringify(o)), self = 'http://localhost:4003';
    let q = /^\/queue\/(.+)\/requests\/([^/]+)(\/status)?$/.exec(req.url);
    if (q && q[3]) { const j = meshJobs.get(q[2]); if (!j) return sendJ({ detail: 'no such request' }, 404); return sendJ({ status: j.polls++ ? 'COMPLETED' : 'IN_PROGRESS', request_id: q[2] }); }
    if (q) return meshJobs.has(q[2]) ? sendJ({ model_mesh: { url: `${self}/files/${q[2]}.glb`, content_type: 'model/gltf-binary' } }) : sendJ({ detail: 'no such request' }, 404);
    if (req.url.startsWith('/queue/')) { if (/MESHFAIL/.test(String(b.input_image_url || b.image_url))) return sendJ({ detail: 'Exhausted balance' }, 403); const id = 'req' + (meshJobs.size + 1), base = `${self}${req.url.replace(/\/v[\d.]+.*$/, '')}/requests/${id}`; meshJobs.set(id, { polls: 0 }); return sendJ({ request_id: id, status_url: base + '/status', response_url: base }); }
    if (req.url.startsWith('/files/')) return res.writeHead(200, { 'content-type': 'model/gltf-binary' }).end(testGLB());
    if (/flux\/schnell/.test(req.url)) return sendJ({ images: [{ url: /MESHFAIL/.test(b.prompt || '') ? 'https://fal.test/MESHFAIL.png' : 'https://fal.test/picture.png', width: 1024, height: 1024 }] });
    if (/elevenlabs/.test(req.url)) return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ audio: { url: 'https://fal.test/mira.mp3' } }));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ images: [{ url: String(b.image_url), width: 1344, height: 768 }], has_nsfw_concepts: [false] }));
  }).listen(4003);
  return { close: () => { claude.close(); rzp.close(); fal.close(); }, subs };
}

if (import.meta.url === `file://${process.argv[1]}`) { startFakes(); console.log('fakes on :4001 (claude) and :4002 (razorpay)'); }
