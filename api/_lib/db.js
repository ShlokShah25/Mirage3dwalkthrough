// Tiny data layer. Production: Supabase PostgREST over fetch (service-role key, bypasses RLS).
// Tests: MIRAGE_DB=memory keeps everything in process memory.
// Filters: { col: value } means equality, { col: null } means IS NULL, { col: { gte|lte|gt|lt|neq: value } }.
import { env } from './env.js';
import { randomUUID } from 'node:crypto';

const OPS = ['gte', 'lte', 'gt', 'lt', 'neq'];

function supabaseDb() {
  const base = () => env('SUPABASE_URL').replace(/\/$/, '') + '/rest/v1/';
  const key = () => env('SUPABASE_SERVICE_ROLE_KEY');
  const hdr = extra => ({ apikey: key(), authorization: 'Bearer ' + key(), 'content-type': 'application/json', ...extra });
  const qs = filters => Object.entries(filters || {}).map(([k, v]) => {
    if (v === null) return `${k}=is.null`;
    if (typeof v === 'object' && !(v instanceof Date)) { const [op, val] = Object.entries(v)[0]; return `${k}=${op}.${encodeURIComponent(String(val))}`; }
    return `${k}=eq.${encodeURIComponent(String(v))}`;
  }).join('&');
  async function call(method, path, { headers, data } = {}) {
    const r = await fetch(base() + path, { method, headers: hdr(headers), body: data === undefined ? undefined : JSON.stringify(data) });
    if (!r.ok) { const t = await r.text(); throw new Error(`supabase ${method} ${path.split('?')[0]} ${r.status}: ${t.slice(0, 300)}`); }
    return r;
  }
  return {
    async select(table, filters, { order, limit } = {}) {
      let q = `${table}?select=*${filters && Object.keys(filters).length ? '&' + qs(filters) : ''}`;
      if (order) q += `&order=${order}`;
      if (limit) q += `&limit=${limit}`;
      return (await call('GET', q)).json();
    },
    async one(table, filters) { return (await this.select(table, filters, { limit: 1 }))[0] || null; },
    async insert(table, row) { return (await (await call('POST', table, { headers: { prefer: 'return=representation' }, data: row })).json())[0]; },
    async upsert(table, row, onConflict) {
      return (await (await call('POST', `${table}${onConflict ? '?on_conflict=' + onConflict : ''}`, { headers: { prefer: 'resolution=merge-duplicates,return=representation' }, data: row })).json())[0];
    },
    async update(table, filters, patch) { return (await call('PATCH', `${table}?${qs(filters)}`, { headers: { prefer: 'return=representation' }, data: patch })).json(); },
    async count(table, filters) {
      const r = await call('GET', `${table}?select=id&${qs(filters)}`, { headers: { prefer: 'count=exact', range: '0-0' } });
      const cr = r.headers.get('content-range') || '*/0'; return Number(cr.split('/')[1]) || 0;
    },
  };
}

function memoryDb() {
  const T = globalThis.__mirageMem ||= {};
  const tab = t => (T[t] ||= []);
  const match = (row, filters) => Object.entries(filters || {}).every(([k, v]) => {
    if (v === null) return row[k] == null;
    if (typeof v === 'object') {
      const [op, val] = Object.entries(v)[0]; const a = row[k], b = val;
      const cmp = (typeof a === 'string' && typeof b === 'string') ? (a < b ? -1 : a > b ? 1 : 0) : (a - b);
      return op === 'gte' ? cmp >= 0 : op === 'lte' ? cmp <= 0 : op === 'gt' ? cmp > 0 : op === 'lt' ? cmp < 0 : a !== b;
    }
    return row[k] === v;
  });
  const clone = x => x && JSON.parse(JSON.stringify(x));
  const PK = { profiles: 'id', homes: 'id', subscriptions: 'user_id', orders: 'id' };
  return {
    async select(table, filters, { order, limit } = {}) {
      let rows = tab(table).filter(r => match(r, filters));
      if (order) { const [col, dir] = order.split('.'); rows = rows.slice().sort((a, b) => (a[col] > b[col] ? 1 : -1) * (dir === 'desc' ? -1 : 1)); }
      return clone(limit ? rows.slice(0, limit) : rows);
    },
    async one(table, filters) { return (await this.select(table, filters, { limit: 1 }))[0] || null; },
    async insert(table, row) {
      const r = { created_at: new Date().toISOString(), ...row }; const pk = PK[table] || 'id';
      if (r[pk] == null) r[pk] = table === 'usage' ? tab(table).length + 1 : randomUUID();
      if (tab(table).some(x => x[pk] === r[pk])) throw new Error(`duplicate key ${table}.${pk}`);
      tab(table).push(r); return clone(r);
    },
    async upsert(table, row, onConflict) {
      const pk = onConflict || PK[table] || 'id'; const ex = tab(table).find(x => x[pk] === row[pk]);
      if (ex) { Object.assign(ex, row); return clone(ex); } return this.insert(table, row);
    },
    async update(table, filters, patch) { const rows = tab(table).filter(r => match(r, filters)); rows.forEach(r => Object.assign(r, patch)); return clone(rows); },
    async count(table, filters) { return tab(table).filter(r => match(r, filters)).length; },
  };
}

if (env('MIRAGE_DB') === 'memory' && (env('VERCEL_ENV') === 'production' || env('RAILWAY_ENVIRONMENT_NAME') === 'production' || env('NODE_ENV') === 'production')) throw new Error('MIRAGE_DB=memory is for local testing only. Remove it from your Vercel environment variables.');
export const db = env('MIRAGE_DB') === 'memory' ? memoryDb() : supabaseDb();

// Compare-and-swap on one numeric column: applies next(current) only if the value hasn't changed underneath us.
export async function cas(table, idFilter, col, next, guard = () => true, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const row = await db.one(table, idFilter); if (!row) return null;
    const cur = row[col]; if (!guard(cur, row)) return null;
    const upd = await db.update(table, { ...idFilter, [col]: cur }, { [col]: next(cur) });
    if (upd.length) return upd[0];
  }
  throw new Error(`cas contention on ${table}.${col}`);
}
