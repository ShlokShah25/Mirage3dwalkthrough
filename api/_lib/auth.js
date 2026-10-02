// Who is calling? Verifies the Supabase access token from the Authorization header.
import { env, guestMode } from './env.js';
import { createHash } from 'node:crypto';
import { HttpError } from './http.js';

const cache = new Map(); // token -> { user, until }

export async function requireUser(req) {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'session_expired', 'Sign in to continue.');
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  let user;
  if (token.startsWith('guest:')) user = await guestUser(token.slice(6));
  else if (env('MIRAGE_DB') === 'memory') {
    // Test mode only: tokens look like "test:<uuid>:<email>".
    const [p, id, email] = token.split(':');
    if (p !== 'test' || !id) throw new HttpError(401, 'session_expired', 'Sign in to continue.');
    user = { id, email: email || `${id.slice(0, 6)}@test.local` };
  } else {
    const r = await fetch(env('SUPABASE_URL').replace(/\/$/, '') + '/auth/v1/user', { headers: { apikey: env('SUPABASE_ANON_KEY'), authorization: 'Bearer ' + token } });
    if (!r.ok) throw new HttpError(401, 'session_expired', 'Your session expired. Sign in again.');
    const u = await r.json(); user = { id: u.id, email: u.email || u.phone || '' };
  }
  cache.set(token, { user, until: Date.now() + 60_000 });
  if (cache.size > 5000) cache.clear();
  return user;
}

// A guest's id is derived from the secret their browser holds, so a guest key can never land on a real account.
// Guests never touch the database (see guest.js), so this needs no network call.
async function guestUser(secret) {
  if (!guestMode() || !/^[A-Za-z0-9_-]{24,80}$/.test(secret)) throw new HttpError(401, 'session_expired', 'Sign in to continue.');
  const h = createHash('sha256').update('mirage-guest:' + secret).digest('hex');
  return { id: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`, email: '', guest: true };
}
// For things that need a real account (sharing, payments).
export async function requireAccount(req, what = 'do that') {
  const user = await requireUser(req);
  if (user.guest) throw new HttpError(403, 'signin_required', `Sign in to ${what}.`);
  return user;
}
