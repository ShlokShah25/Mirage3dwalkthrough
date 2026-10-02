// GET /api/me — plan, usage and per-home access for the signed-in user.
// POST /api/me { persona: 'own' | 'pro' } — answer to "Whose home is this?"
import { requireUser } from './_lib/auth.js';
import { route, body, json, HttpError } from './_lib/http.js';
import { db } from './_lib/db.js';
import { snapshot, sharedHomes } from './_lib/entitle.js';
import { guestSnapshot } from './_lib/guest.js';

export const GET = route(async req => {
  const user = await requireUser(req);
  if (user.guest) return json(guestSnapshot(user));
  return json({ user, ...(await snapshot(user.id)), shared: await sharedHomes(user) });
});

export const POST = route(async req => {
  const user = await requireUser(req);
  const b = await body(req);
  if (user.guest) return json({ ok: true });
  if (!['own', 'pro'].includes(b.persona)) throw new HttpError(400, 'bad_request', 'Pick one.');
  await db.upsert('profiles', { id: user.id, persona: b.persona });
  return json({ ok: true });
});
