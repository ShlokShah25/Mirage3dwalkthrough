// The shared copy of a home's design, so collaborators see the same thing.
// GET /api/homedata?home=<id>[&since=<version>] — the latest copy (or just { version } if nothing changed since).
// PUT /api/homedata { homeId, version, data } — save; version must match the copy you started from, else 409.
import { requireAccount } from './_lib/auth.js';
import { route, body, json, HttpError } from './_lib/http.js';
import { db } from './_lib/db.js';
import { homeRole, needRole } from './_lib/entitle.js';

const MAX = 8_000_000;

export const GET = route(async req => {
  const user = await requireAccount(req, 'open or save a shared home');
  const q = new URL(req.url).searchParams, homeId = q.get('home');
  const { role } = await homeRole(user, homeId);
  const row = await db.one('home_data', { home_id: homeId });
  if (!row) return json({ role, version: 0, data: null });
  const since = Number(q.get('since'));
  if (Number.isFinite(since) && since === row.version) return json({ role, version: row.version, same: true });
  return json({ role, version: row.version, data: row.data, updated_by: row.updated_by, updated_at: row.updated_at });
});

export const PUT = route(async req => {
  const user = await requireAccount(req, 'open or save a shared home');
  const b = await body(req, MAX + 50_000);
  const { home } = await needRole(user, b.homeId, 'editor');
  if (!b.data || typeof b.data !== 'object' || !b.data.layout) throw new HttpError(400, 'bad_request', 'Nothing to save.');
  if (JSON.stringify(b.data).length > MAX) throw new HttpError(413, 'prompt_too_large', 'This home is too large to share. Remove some photos and try again.');
  const version = Number(b.version) || 0, row = await db.one('home_data', { home_id: home.id });
  const patch = { data: b.data, version: version + 1, updated_by: user.email || user.id, updated_at: new Date().toISOString(), name: String(b.data.name || '').slice(0, 120) || null };
  if (!row) {
    if (version !== 0) throw new HttpError(409, 'conflict', 'This home changed while you were working.', { version: 0 });
    try { await db.insert('home_data', { home_id: home.id, ...patch }); }
    catch { throw new HttpError(409, 'conflict', 'This home changed while you were working.', { version: (await db.one('home_data', { home_id: home.id }))?.version || 0 }); }
  } else {
    const won = await db.update('home_data', { home_id: home.id, version }, patch);
    if (!won.length) throw new HttpError(409, 'conflict', 'Someone else changed this home a moment ago.', { version: row.version, updated_by: row.updated_by });
  }
  return json({ ok: true, version: patch.version });
});
