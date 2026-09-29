// POST /api/homes { id, name } — registers a home to the signed-in user (idempotent).
import { requireUser } from './_lib/auth.js';
import { route, body, json } from './_lib/http.js';
import { db } from './_lib/db.js';
import { ownHome } from './_lib/entitle.js';

export const POST = route(async req => {
  const user = await requireUser(req);
  const b = await body(req);
  const h = await ownHome(user.id, b.id, { create: true, name: String(b.name || '').slice(0, 120) });
  if (b.name && b.name !== h.name) await db.update('homes', { id: h.id }, { name: String(b.name).slice(0, 120) });
  return json({ ok: true });
});
