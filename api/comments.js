// Pinned comments in a shared home.
// GET   /api/comments?home=<id>
// POST  /api/comments { homeId, text, room?, x?, y?, z? }   — commenters, editors and the owner.
// PATCH /api/comments { id, resolved }                      — the author, editors and the owner.
import { requireAccount } from './_lib/auth.js';
import { route, body, json, HttpError } from './_lib/http.js';
import { db } from './_lib/db.js';
import { homeRole, needRole, atLeast } from './_lib/entitle.js';

const shape = c => ({ id: c.id, author: c.author_email, room: c.room, x: c.x, y: c.y, z: c.z, text: c.text, resolved: !!c.resolved, created_at: c.created_at });
const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(+v)) ? null : Math.round(+v * 100) / 100;

export const GET = route(async req => {
  const user = await requireAccount(req, 'comment on a shared home');
  const homeId = new URL(req.url).searchParams.get('home');
  await homeRole(user, homeId);
  return json({ comments: (await db.select('home_comments', { home_id: homeId }, { order: 'created_at.asc' })).map(shape) });
});

export const POST = route(async req => {
  const user = await requireAccount(req, 'comment on a shared home');
  const b = await body(req, 20_000);
  const { home } = await needRole(user, b.homeId, 'commenter');
  const text = String(b.text || '').trim().slice(0, 1000);
  if (!text) throw new HttpError(400, 'bad_request', 'Write a comment first.');
  if (await db.count('home_comments', { home_id: home.id }) >= 500) throw new HttpError(429, 'rate_limited', 'This home has too many comments. Resolve some first.');
  const c = await db.insert('home_comments', { home_id: home.id, user_id: user.id, author_email: user.email || null, room: b.room ? String(b.room).slice(0, 60) : null, x: num(b.x), y: num(b.y), z: num(b.z), text, resolved: false });
  return json({ comment: shape(c) });
});

export const PATCH = route(async req => {
  const user = await requireAccount(req, 'comment on a shared home');
  const b = await body(req, 5_000);
  const c = b.id ? await db.one('home_comments', { id: String(b.id) }) : null;
  if (!c) throw new HttpError(404, 'not_found', 'Comment not found.');
  const { role } = await homeRole(user, c.home_id);
  if (c.user_id !== user.id && !atLeast(role, 'editor')) throw new HttpError(403, 'forbidden', 'Only the author, editors or the owner can resolve this.');
  await db.update('home_comments', { id: c.id }, { resolved: !!b.resolved });
  return json({ ok: true });
});
