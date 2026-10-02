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

// A guest's account comes from the secret their browser holds, so a guest key can never land on a real account.
const guestIds = new Map(); // secret hash -> account id
async function guestUser(secret) {
  if (!guestMode() || !/^[A-Za-z0-9_-]{24,80}$/.test(secret)) throw new HttpError(401, 'session_expired', 'Sign in to continue.');
  const h = createHash('sha256').update('mirage-guest:' + secret).digest('hex');
  const derived = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  let id = guestIds.get(h);
  if (!id && env('MIRAGE_DB') === 'memory') id = derived;
  if (!id) {
    // The database ties every row to an auth user, so the guest gets one. Works whether or not the auth server honours our id.
    const base = env('SUPABASE_URL').replace(/\/$/, ''), key = env('SUPABASE_SERVICE_ROLE_KEY');
    const hdr = { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' };
    // No mail is ever sent to these addresses (they are created already confirmed). The second form is only tried if the
    // auth server refuses the first for not being a deliverable domain.
    const emails = [`guest-${h.slice(0, 24)}@guest.mirage.invalid`, `mirage.guest.${h.slice(0, 24)}@gmail.com`];
    try {
      if ((await fetch(`${base}/auth/v1/admin/users/${derived}`, { headers: hdr })).ok) id = derived;
      for (const email of emails) {
        if (id) break;
        const r = await fetch(base + '/auth/v1/admin/users', { method: 'POST', headers: hdr, body: JSON.stringify({ id: derived, email, email_confirm: true, user_metadata: { guest: true } }) });
        const j = await r.json().catch(() => null);
        if (r.ok && j?.id) { id = j.id; break; }
        const q = await fetch(`${base}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=5`, { headers: hdr });
        const list = await q.json().catch(() => null);
        id = (list?.users || []).find(u => u.email === email)?.id || null;
        if (!id) console.error('guest account', email.split('@')[1], r.status, JSON.stringify(j || {}).slice(0, 300));
      }
    } catch (e) { console.error('guest account', e); }
    if (!id) throw new HttpError(401, 'guest_unavailable', 'Guest access is not available right now. Sign in to continue.');
  }
  guestIds.set(h, id); if (guestIds.size > 20000) guestIds.clear();
  return { id, email: '', guest: true };
}
