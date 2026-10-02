// Guests (no sign-in) are handled without the database: limits live in this server's memory and reset each day
// (or when the server restarts). Nothing about a guest is stored; their homes stay in their own browser.
import { randomUUID } from 'node:crypto';
import { PRICING, FREE, GUEST, MODELS } from './env.js';
import { HttpError } from './http.js';

const day = () => new Date().toISOString().slice(0, 10);
let today = day(), counts = new Map();          // `${uid}:${kind}` and `*:${kind}` → uses today
const gens = new Map(), edits = new Map();      // short-lived budgets for a design run / a change
function roll() { if (day() !== today) { today = day(); counts = new Map(); } if (counts.size > 200000) counts = new Map(); }
const used = k => counts.get(k) || 0;
const bump = k => counts.set(k, used(k) + 1);

const CAPS = () => ({
  plan_read: [PRICING.free.planReadsPerDay, GUEST.sitePlanReadsPerDay, 'plans read'],
  design: [FREE.designsPerDay, GUEST.siteDesignsPerDay, 'designs'],
  edit: [FREE.changesPerDay, GUEST.siteDesignsPerDay * 20, 'changes'],
  guide: [PRICING.guide.paidPerDay, 20000, 'messages to Mira'],
  voice: [PRICING.voice.paidPerDay, 20000, 'spoken lines'],
  render: [FREE.rendersPerDay, 300, 'photo-real renders'],
});
export function take(uid, kind) {
  roll(); const [mine, site, what] = CAPS()[kind];
  if (used(`${uid}:${kind}`) >= mine) throw new HttpError(429, 'rate_limited', `That is ${mine} ${what} today, the daily limit while Mirage is free. Come back tomorrow.`);
  if (used(`*:${kind}`) >= site) throw new HttpError(429, 'rate_limited', 'Mirage has been busy today and is resting. Try again tomorrow.');
  bump(`${uid}:${kind}`); bump(`*:${kind}`);
}
export function giveBack(uid, kind) { for (const k of [`${uid}:${kind}`, `*:${kind}`]) if (used(k) > 0) counts.set(k, used(k) - 1); }

function sweep(map) { if (map.size < 5000) return; const now = Date.now(); for (const [k, v] of map) if (v.until < now) map.delete(k); }
export function startGen(uid) {
  take(uid, 'design'); sweep(gens);
  const id = 'g_' + randomUUID(); gens.set(id, { uid, calls: PRICING.budgets.designCalls, items: 0, until: Date.now() + PRICING.budgets.generationMinutes * 60e3 });
  return { genId: id, source: 'free' };
}
export function finishGen(uid, genId) {
  const g = gens.get(genId); if (!g || g.uid !== uid) return { status: 'done', items: 0 };
  gens.delete(genId); if (!g.items) { giveBack(uid, 'design'); return { status: 'refunded', items: 0 }; }
  return { status: 'done', items: g.items };
}

// What a guest may ask Claude for, and on which model. Mirrors authorize() in api/ai.js.
export function authorizeGuest(user, b) {
  const uid = user.id, items = j => Array.isArray(j?.items) ? j.items.length : 0, homeId = b.homeId ? String(b.homeId).slice(0, 80) : null;
  switch (b.kind) {
    case 'plan_read':
      if (!b.images?.length) throw new HttpError(400, 'image_rejected', 'Add a floor plan image first.');
      take(uid, 'plan_read'); return { homeId, model: MODELS.complex(), maxTokens: 32000, think: true, onFail: () => giveBack(uid, 'plan_read') };
    case 'teaser': take(uid, 'edit'); return { homeId, model: MODELS.default() };
    case 'style': case 'design': {
      const g = gens.get(b.genId);
      if (!g || g.uid !== uid || g.until < Date.now()) throw new HttpError(409, 'generation_closed', 'This design run has finished. Start a new one.');
      if (g.calls-- <= 0) throw new HttpError(429, 'rate_limited', 'This design run used its full budget.');
      return { homeId, model: MODELS.default(), after: b.kind === 'design' ? j => { g.items += items(j); } : null };
    }
    case 'edit': {
      take(uid, 'edit'); sweep(edits);
      const id = 'e_' + randomUUID(); edits.set(id, { uid, left: PRICING.budgets.editFollowups, until: Date.now() + 30 * 60e3 });
      const back = () => { giveBack(uid, 'edit'); edits.delete(id); };
      return { homeId, model: MODELS.default(), meta: { editId: id }, after: j => { if (!(Array.isArray(j?.ops) && j.ops.length)) back(); }, onFail: back };
    }
    case 'edit_followup': {
      const e = edits.get(b.editId);
      if (!e || e.uid !== uid) throw new HttpError(404, 'not_found', 'Change not found.');
      if (e.left-- <= 0) throw new HttpError(429, 'rate_limited', 'That change has used its room redos.');
      return { homeId, model: MODELS.default() };
    }
    case 'refurnish': take(uid, 'edit'); return { homeId, model: MODELS.default(), after: j => { if (!items(j)) giveBack(uid, 'edit'); }, onFail: () => giveBack(uid, 'edit') };
    case 'guide': take(uid, 'guide'); return { homeId, model: MODELS.fast(), maxTokens: 3000 };
  }
}
export const guestSnapshot = user => ({ user, persona: 'own', free: true, guest: true, sub: null, upgradeEligible: false, homes: {}, shared: [] });
