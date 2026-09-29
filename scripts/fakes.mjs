// Stand-ins for Claude and Razorpay, for local testing only.
// Claude on :4001 (streams canned answers), Razorpay on :4002 (orders, subscriptions, test payments).
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const here = new URL('./fixtures/', import.meta.url);
const TRACE = JSON.parse(readFileSync(new URL('mock_trace.json', here)));
const ITEMS = JSON.parse(readFileSync(new URL('mock_items.json', here)));
const SECRET = process.env.RAZORPAY_KEY_SECRET || 'test_secret';
const readJson = async req => { const c = []; for await (const x of req) c.push(x); try { return JSON.parse(Buffer.concat(c).toString() || '{}'); } catch { return {}; } };
export const calls = [];

function answer(prompt) {
  if (prompt.startsWith('You are an architectural draftsperson')) return TRACE;
  if (prompt.startsWith('You are an interior designer. The image')) return { summary: 'x', tokens: {}, floors: {} };
  if (/the guide inside Mirage/.test(prompt)) return /Write the script for a guided tour/.test(prompt) ? { intro: 'Welcome.', stops: [...prompt.matchAll(/^(.+?) \((\w+)/gm)].slice(0, 3).map(m => ({ room: m[1], say: `This is the ${m[1]}.`, look: '' })), outro: 'Ask me anything.' } : /lounge chair by the window/.test(prompt) ? { say: 'Adding a leather lounge chair by the window.', actions: [{ do: 'edit', request: 'Add a leather lounge chair by the window in the Master Bedroom' }] } : { say: 'Here is the kitchen.', actions: [{ do: 'go', room: 'Kitchen' }] };
  if (prompt.startsWith('You are editing')) return /NOOP/.test(prompt) ? { summary: 'Nothing to change.', ops: [] } : { summary: 'Switched to night.', ops: [{ op: 'time', value: 'night' }] };
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
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ images: [{ url: String(b.image_url), width: 1344, height: 768 }], has_nsfw_concepts: [false] }));
  }).listen(4003);
  return { close: () => { claude.close(); rzp.close(); fal.close(); }, subs };
}

if (import.meta.url === `file://${process.argv[1]}`) { startFakes(); console.log('fakes on :4001 (claude) and :4002 (razorpay)'); }
