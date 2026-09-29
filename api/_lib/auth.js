// Who is calling? Verifies the Supabase access token from the Authorization header.
import { env } from './env.js';
import { HttpError } from './http.js';

const cache = new Map(); // token -> { user, until }

export async function requireUser(req) {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'session_expired', 'Sign in to continue.');
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  let user;
  if (env('MIRAGE_DB') === 'memory') {
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
