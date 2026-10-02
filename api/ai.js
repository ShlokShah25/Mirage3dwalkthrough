// POST /api/ai — the only way the app reaches Claude. Checks the plan, meters usage, streams the answer.
// Body: { kind, homeId?, genId?, editId?, prompt, images?: [dataURL] }
// Response: text/event-stream of {"t":"..."} chunks, then {"done":true,"json":{...},"meta":{...}} or {"error":{code,message}}.
import { createHash } from 'node:crypto';
import { requireUser } from './_lib/auth.js';
import { route, body, HttpError } from './_lib/http.js';
import { MODELS, LIMITS } from './_lib/env.js';
import { db } from './_lib/db.js';
import { streamClaude, extractJSON } from './_lib/claude.js';
import * as E from './_lib/entitle.js';
import { authorizeGuest } from './_lib/guest.js';

const KINDS = ['plan_read', 'teaser', 'style', 'design', 'edit', 'edit_followup', 'refurnish', 'guide'];

async function authorize(user, b) {
  const { kind } = b, uid = user.id;
  const items = j => Array.isArray(j?.items) ? j.items.length : 0;
  switch (kind) {
    case 'plan_read': {
      if (!b.images?.length) throw new HttpError(400, 'image_rejected', 'Add a floor plan image first.');
      const hash = createHash('sha256').update(b.images[0]).digest('hex');
      await E.allowPlanRead(uid, b.homeId, hash);
      return { homeId: b.homeId, model: MODELS.complex(), maxTokens: 32000, think: true };
    }
    case 'teaser': {
      await E.allowTeaser(uid, b.homeId);
      const undo = () => E.refundTeaser(b.homeId);
      return { homeId: b.homeId, model: MODELS.default(), after: async j => { if (!items(j)) await undo(); }, onFail: undo };
    }
    case 'style': case 'design': {
      const g = await E.useGenerationCall(uid, b.genId);
      return { homeId: g.home_id, model: MODELS.default(), after: kind === 'design' ? j => E.addGenerationItems(g.id, items(j)) : null };
    }
    case 'edit': {
      const payer = await E.payerFor(user, b.homeId);
      const e = await E.startEdit(payer, b.homeId);
      return {
        homeId: b.homeId, model: MODELS.default(), meta: { editId: e.id },
        after: async j => { if (!(Array.isArray(j?.ops) && j.ops.length)) await E.refundEdit(payer, e); },
        onFail: () => E.refundEdit(payer, e),
      };
    }
    case 'edit_followup': {
      const e = await E.useEditFollowup(user, b.editId);
      return { homeId: e.home_id, model: MODELS.default() };
    }
    case 'guide': {
      await E.allowGuide(uid);
      return { homeId: b.homeId ? String(b.homeId).slice(0, 80) : null, model: MODELS.fast(), maxTokens: 3000 };
    }
    case 'refurnish': {
      const payer = await E.payerFor(user, b.homeId);
      const r = await E.startRefurnish(payer, b.homeId);
      const back = () => E.giveChangeBack(payer, b.homeId, r.source);
      return { homeId: b.homeId, model: MODELS.default(), after: async j => { if (!items(j)) await back(); }, onFail: back };
    }
  }
}

export const POST = route(async req => {
  const user = await requireUser(req);
  const b = await body(req);
  if (!KINDS.includes(b.kind)) throw new HttpError(400, 'bad_request', 'Unknown request type.');
  if (typeof b.prompt !== 'string' || !b.prompt.trim()) throw new HttpError(400, 'bad_request', 'Empty request.');
  if (b.prompt.length > LIMITS.promptChars) throw new HttpError(413, 'prompt_too_large', 'The request was too large. Try a smaller change.');
  const images = Array.isArray(b.images) ? b.images : [];
  if (images.length > LIMITS.images || images.some(s => typeof s !== 'string' || s.length > LIMITS.imageChars)) throw new HttpError(413, 'prompt_too_large', 'Too many or too large images.');

  const plan = user.guest ? authorizeGuest(user, { ...b, images }) : await authorize(user, { ...b, images });
  const enc = new TextEncoder();
  const ac = new AbortController();
  req.signal?.addEventListener?.('abort', () => ac.abort());

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = o => { try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { } };
      const ping = setInterval(() => { try { ctrl.enqueue(enc.encode(': ping\n\n')); } catch { } }, 15000);
      try {
        const out = await streamClaude({ model: plan.model, prompt: b.prompt, images, maxTokens: plan.maxTokens || 12000, think: !!plan.think, signal: ac.signal, onDelta: t => send({ t }) });
        if (!user.guest) db.insert('usage', { user_id: user.id, home_id: plan.homeId || null, kind: b.kind, model: plan.model, in_tokens: out.usage.in, out_tokens: out.usage.out }).catch(e => console.error('usage log', e));
        const j = extractJSON(out.text);
        if (!j) { await plan.onFail?.(); send({ error: { code: out.stop === 'max_tokens' ? 'prompt_too_large' : 'invalid_json', message: 'The answer could not be read. Try again.' } }); }
        else { await plan.after?.(j); send({ done: true, json: j, meta: plan.meta || {} }); }
      } catch (e) {
        try { await plan.onFail?.(); } catch { }
        if (!(e instanceof HttpError) && e?.name !== 'AbortError') console.error('ai stream', e);
        send({ error: { code: e?.name === 'AbortError' ? 'cancelled' : (e.code || 'upstream_error'), message: e instanceof HttpError ? e.message : 'The design engine had a problem. Try again.' + (process.env.MIRAGE_DB === 'memory' ? ` (${e?.cause?.code || e?.message || e})` : '') } });
      } finally { clearInterval(ping); try { ctrl.close(); } catch { } }
    },
    cancel() { ac.abort(); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
});
