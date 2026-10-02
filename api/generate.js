// POST /api/generate { action: 'start', homeId } → { genId, source }
// POST /api/generate { action: 'finish', genId } → { status: 'done' | 'refunded', items }
import { requireUser } from './_lib/auth.js';
import { route, body, json, HttpError } from './_lib/http.js';
import { startGeneration, finishGeneration } from './_lib/entitle.js';
import * as G from './_lib/guest.js';

export const POST = route(async req => {
  const user = await requireUser(req);
  const b = await body(req);
  if (user.guest) { if (b.action === 'start') return json(G.startGen(user.id)); if (b.action === 'finish') return json(G.finishGen(user.id, b.genId)); }
  if (b.action === 'start') { const g = await startGeneration(user.id, b.homeId); return json({ genId: g.id, source: g.source }); }
  if (b.action === 'finish') return json(await finishGeneration(user.id, b.genId));
  throw new HttpError(400, 'bad_request', 'Unknown action.');
});
