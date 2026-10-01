// Calls the Claude Messages API with streaming, forwarding text as it arrives.
import { env } from './env.js';
import { HttpError } from './http.js';

const SYSTEM = 'You are the design engine inside Mirage, a consumer app that turns floor plans into furnished 3D homes. ' +
  'Answer with exactly one JSON object and nothing else: no prose before or after it, no markdown code fences.';

export function imageBlock(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw new HttpError(400, 'image_rejected', 'That image could not be read. Try a PNG or JPG.');
  return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
}

// Pull the first complete JSON object out of the model's text.
export function extractJSON(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { }
  const s = t.indexOf('{'); if (s < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = s; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) { try { return JSON.parse(t.slice(s, i + 1)); } catch { return null; } }
  }
  return null;
}

// onDelta(text) is called for each chunk. Resolves { text, usage, stop }.
export async function streamClaude({ model, prompt, images = [], maxTokens = 12000, onDelta, signal, think = false }) {
  const base = env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com').replace(/\/$/, '');
  const r = await fetch(base + '/v1/messages', {
    method: 'POST', signal,
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY', ''), 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(env('ANTHROPIC_WORKSPACE_ID') ? { 'anthropic-workspace-id': env('ANTHROPIC_WORKSPACE_ID') } : {}) },
    body: JSON.stringify({
      model, max_tokens: maxTokens, stream: true, system: SYSTEM,
      // Newer models think by default and can spend the whole budget before writing any JSON; design calls turn it off.
      ...(think ? {} : { thinking: { type: 'disabled' } }),
      messages: [{ role: 'user', content: [...images.map(imageBlock), { type: 'text', text: prompt }] }],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error('claude error', r.status, t.slice(0, 500));
    if (r.status === 429 || r.status === 529) throw new HttpError(503, 'rate_limited', 'Mirage is busy right now. Try again in a minute.');
    if (r.status === 400 && /image/i.test(t)) throw new HttpError(400, 'image_rejected', 'That image could not be read. Try a clearer PNG or JPG.');
    if (r.status === 401 || r.status === 403) throw new HttpError(502, 'upstream_error', 'The design engine could not sign in to Claude: the ANTHROPIC_API_KEY was rejected. Check the key and restart.');
    if (/credit balance|billing/i.test(t)) throw new HttpError(502, 'upstream_error', 'The Anthropic account behind ANTHROPIC_API_KEY is out of credit. Add credit in the Anthropic Console, then try again.');
    if (r.status === 404 || /model/i.test(t) && r.status === 400) throw new HttpError(502, 'upstream_error', `This API key can't use the model "${model}". Set MODEL_COMPLEX / MODEL_DEFAULT / MODEL_FAST to models your key can use.`);
    if (r.status === 400 && /too long|too large|max/i.test(t)) throw new HttpError(413, 'prompt_too_large', 'The request was too large. Try a smaller change.');
    // On the local test server, show the real reason so it can be fixed.
    const detail = env('MIRAGE_DB') === 'memory' ? ` (Claude API ${r.status}: ${(() => { try { return JSON.parse(t).error.message; } catch { return t.slice(0, 200); } })()})` : '';
    throw new HttpError(502, 'upstream_error', 'The design engine had a problem. Try again.' + detail);
  }
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', text = '', stop = null; const usage = { in: 0, out: 0 };
  for (; ;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = chunk.split('\n').find(l => l.startsWith('data:')); if (!line) continue;
      let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (ev.type === 'message_start') usage.in = ev.message?.usage?.input_tokens || 0;
      else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') { text += ev.delta.text; onDelta?.(ev.delta.text); }
      else if (ev.type === 'message_delta') { usage.out = ev.usage?.output_tokens || usage.out; stop = ev.delta?.stop_reason || stop; }
      else if (ev.type === 'error') { console.error('claude stream error', ev.error); throw new HttpError(502, ev.error?.type === 'overloaded_error' ? 'rate_limited' : 'upstream_error', ev.error?.type === 'overloaded_error' ? 'Claude is overloaded right now. Try again in a minute.' : 'The design engine had a problem. Try again.' + (env('MIRAGE_DB') === 'memory' ? ` (${ev.error?.message || ev.error?.type || 'stream error'})` : '')); }
    }
  }
  if (stop === 'refusal') throw new HttpError(422, 'refused', 'That request was declined. Try rephrasing it.');
  return { text, usage, stop };
}
