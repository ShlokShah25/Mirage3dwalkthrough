// GET  /api/share?home=<id>                         — who has access to this home (any member may look).
// POST /api/share { homeId, action: 'invite', email, role }   — owner invites someone (viewer | commenter | editor).
// POST /api/share { homeId, action: 'role', email, role }     — owner changes someone's role.
// POST /api/share { homeId, action: 'remove', email }         — owner removes someone; a member may remove themselves.
import { requireAccount } from './_lib/auth.js';
import { route, body, json, HttpError } from './_lib/http.js';
import { db } from './_lib/db.js';
import { ROLES, normEmail, needRole, homeRole } from './_lib/entitle.js';

const MAX_MEMBERS = 25;
const list = async homeId => (await db.select('home_members', { home_id: homeId }, { order: 'created_at.asc' })).map(m => ({ email: m.email, role: m.role, joined: !!m.user_id, invited_at: m.created_at }));

export const GET = route(async req => {
  const user = await requireAccount(req, 'share a home');
  const homeId = new URL(req.url).searchParams.get('home');
  const { home, role } = await homeRole(user, homeId);
  return json({ role, owner: home.owner_email || (role === 'owner' ? user.email : null), members: await list(homeId) });
});

export const POST = route(async req => {
  const user = await requireAccount(req, 'share a home');
  const b = await body(req, 20_000);
  const email = normEmail(b.email);
  if (b.action === 'remove' && email && email === normEmail(user.email)) {     // leaving a home someone shared with you
    await homeRole(user, b.homeId);
    await purge(b.homeId, email);
    return json({ ok: true });
  }
  const { home } = await needRole(user, b.homeId, 'owner').catch(e => { if (e.status === 403) throw new HttpError(403, 'forbidden', 'Only the owner of this home can change who has access.'); throw e; });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new HttpError(400, 'bad_request', 'Enter a valid email address.');
  if (email === normEmail(user.email)) throw new HttpError(400, 'bad_request', 'That is you. You already own this home.');
  const ex = await db.one('home_members', { home_id: home.id, email });
  if (b.action === 'remove') { if (ex) await purge(home.id, email); return json({ ok: true, members: await list(home.id) }); }
  if (!ROLES.includes(b.role)) throw new HttpError(400, 'bad_request', 'Pick a role: viewer, commenter or editor.');
  if (b.action === 'role') { if (!ex) throw new HttpError(404, 'not_found', 'That person has not been invited.'); await db.update('home_members', { id: ex.id }, { role: b.role }); }
  else if (b.action === 'invite') {
    if (ex) await db.update('home_members', { id: ex.id }, { role: b.role });
    else {
      if (await db.count('home_members', { home_id: home.id }) >= MAX_MEMBERS) throw new HttpError(429, 'rate_limited', `A home can be shared with up to ${MAX_MEMBERS} people.`);
      await db.insert('home_members', { home_id: home.id, owner_id: user.id, email, role: b.role, invited_by: user.id });
    }
    if (home.owner_email !== user.email) await db.update('homes', { id: home.id }, { owner_email: user.email });
  } else throw new HttpError(400, 'bad_request', 'Unknown action.');
  return json({ ok: true, members: await list(home.id) });
});

async function purge(homeId, email) {
  const rows = await db.select('home_members', { home_id: homeId, email });
  for (const r of rows) await db.del('home_members', { id: r.id });
}
