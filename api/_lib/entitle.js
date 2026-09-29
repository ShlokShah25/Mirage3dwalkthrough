// Who may do what, and what it costs them. All checks run on the server.
import { db, cas } from './db.js';
import { PRICING } from './env.js';
import { HttpError } from './http.js';

const now = () => new Date();
const iso = d => d.toISOString();
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const startOfDay = () => { const d = now(); d.setUTCHours(0, 0, 0, 0); return d; };

export const paywall = (msg = 'Choose a plan to design your whole home.') => new HttpError(402, 'payment_required', msg);

export function subActive(sub) {
  if (!sub) return false;
  const end = sub.current_end ? new Date(sub.current_end) : null;
  const live = ['active', 'authenticated', 'pending'].includes(sub.status);
  if (live) return !end || addDays(end, PRICING.graceDays) > now();
  if (sub.status === 'cancelled' || sub.status === 'halted') return !!end && end > now();
  return false;
}
export const planOf = sub => PRICING.plans[sub?.plan] || null;

export async function getSub(uid) { return db.one('subscriptions', { user_id: uid }); }

export async function ownHome(uid, homeId, { create, name } = {}) {
  if (!homeId || typeof homeId !== 'string' || homeId.length > 80) throw new HttpError(400, 'bad_request', 'Missing home.');
  let h = await db.one('homes', { id: homeId });
  if (!h && create) h = await db.insert('homes', { id: homeId, user_id: uid, name: name || null, access: 'none', teaser_used: false });
  if (!h) throw new HttpError(404, 'not_found', 'Home not found.');
  if (h.user_id !== uid) throw new HttpError(403, 'forbidden', 'This home belongs to another account.');
  return h;
}

async function activePass(home) {
  if (home.access !== 'pass' || !home.pass_id) return null;
  return db.one('passes', { id: home.pass_id });
}

// Can this home still be changed (edits, redo room, restyle)?
export async function editAccess(uid, home) {
  if (home.access === 'pass') {
    const p = await activePass(home);
    if (!p) throw paywall();
    if (new Date(p.expires_at) < now()) throw new HttpError(402, 'pass_expired', 'Your Home Pass editing window has ended. You can still walk and share this home.');
    return { kind: 'pass', pass: p };
  }
  if (home.access === 'pro') {
    const sub = await getSub(uid);
    if (!subActive(sub)) throw new HttpError(402, 'sub_inactive', 'Your subscription has ended, so this home is view-only. Resubscribe to keep editing.');
    return { kind: 'pro', sub };
  }
  throw paywall();
}

async function dailyCount(uid, kind) { return db.count('usage', { user_id: uid, kind, created_at: { gte: iso(startOfDay()) } }); }

// ---- free actions ----
export async function allowPlanRead(uid, homeId, hash) {
  const home = await ownHome(uid, homeId, { create: true });
  if (home.locked_hash && hash !== home.locked_hash) throw new HttpError(409, 'plan_locked', 'This home is already designed for a different floor plan. Start a new home for a new plan.');
  if (await dailyCount(uid, 'plan_read') >= PRICING.free.planReadsPerDay) throw new HttpError(429, 'rate_limited', 'You have read a lot of plans today. Try again tomorrow.');
  await db.update('homes', { id: homeId }, { plan_hash: hash });
  return home;
}

export async function allowTeaser(uid, homeId) {
  const home = await ownHome(uid, homeId);
  if (!home.plan_hash) throw new HttpError(409, 'no_plan', 'Read the floor plan first.');
  if (await dailyCount(uid, 'teaser') >= PRICING.free.teasersPerDay) throw new HttpError(429, 'rate_limited', 'That is enough free previews for today. Try again tomorrow.');
  const won = await db.update('homes', { id: homeId, teaser_used: false }, { teaser_used: true });
  if (!won.length) throw new HttpError(402, 'teaser_used', 'You have already previewed a room in this home. Choose a plan to design the rest.');
  return home;
}
export async function refundTeaser(homeId) { await db.update('homes', { id: homeId }, { teaser_used: false }); }

// ---- designs ----
export async function startGeneration(uid, homeId) {
  const home = await ownHome(uid, homeId);
  if (!home.plan_hash) throw new HttpError(409, 'no_plan', 'Read the floor plan first.');
  if (home.locked_hash && home.plan_hash !== home.locked_hash) throw new HttpError(409, 'plan_locked', 'This home is locked to the floor plan it was designed with. Start a new home for a different plan.');
  let source;
  if (home.access === 'pass') {
    const acc = await editAccess(uid, home);
    const ok = await cas('passes', { id: acc.pass.id }, 'designs_left', v => v - 1, v => v > 0);
    if (!ok) throw new HttpError(402, 'no_designs_left', 'You have used all the redesigns on this Home Pass. Go Pro for unlimited restyles.');
    source = 'pass';
  } else if (home.access === 'pro') {
    await editAccess(uid, home); source = 'pro_restyle';
  } else {
    const sub = await getSub(uid);
    if (!subActive(sub)) throw paywall();
    const lim = planOf(sub).homes;
    const ok = await cas('subscriptions', { user_id: uid }, 'homes_used', v => v + 1, v => v < lim);
    if (!ok) throw new HttpError(402, 'homes_limit', `You have designed all ${lim} homes in this month's plan. Upgrade or wait for your next cycle.`);
    await db.update('homes', { id: homeId }, { access: 'pro' });
    source = 'pro_new';
  }
  const first = !home.locked_hash;
  await db.update('homes', { id: homeId }, { locked_hash: home.plan_hash, designed_at: iso(now()) });
  return db.insert('generations', {
    user_id: uid, home_id: homeId, source, first, calls_left: PRICING.budgets.designCalls, items: 0, status: 'running',
    expires_at: iso(new Date(Date.now() + PRICING.budgets.generationMinutes * 60e3)),
  });
}

export async function useGenerationCall(uid, genId) {
  const g = await db.one('generations', { id: genId });
  if (!g || g.user_id !== uid) throw new HttpError(404, 'not_found', 'Design run not found.');
  if (g.status !== 'running' || new Date(g.expires_at) < now()) throw new HttpError(409, 'generation_closed', 'This design run has finished. Start a new one.');
  const ok = await cas('generations', { id: genId }, 'calls_left', v => v - 1, v => v > 0);
  if (!ok) throw new HttpError(429, 'rate_limited', 'This design run used its full budget.');
  return g;
}
export async function addGenerationItems(genId, n) { if (n > 0) await cas('generations', { id: genId }, 'items', v => v + n); }

async function refundGeneration(g) {
  const won = await db.update('generations', { id: g.id, status: 'running' }, { status: 'refunded' });
  if (!won.length) return false;
  if (g.source === 'pass') {
    const home = await db.one('homes', { id: g.home_id });
    if (home?.pass_id) await cas('passes', { id: home.pass_id }, 'designs_left', v => v + 1);
  } else if (g.source === 'pro_new') {
    await cas('subscriptions', { user_id: g.user_id }, 'homes_used', v => Math.max(0, v - 1));
    await db.update('homes', { id: g.home_id }, { access: 'none' });
  }
  if (g.first) await db.update('homes', { id: g.home_id }, { locked_hash: null, designed_at: null });
  return true;
}

export async function finishGeneration(uid, genId) {
  const g = await db.one('generations', { id: genId });
  if (!g || g.user_id !== uid) throw new HttpError(404, 'not_found', 'Design run not found.');
  if (g.status !== 'running') return { status: g.status, items: g.items };
  if (g.items > 0) { await db.update('generations', { id: genId, status: 'running' }, { status: 'done' }); return { status: 'done', items: g.items }; }
  await refundGeneration(g); return { status: 'refunded', items: 0 };
}

// Runs that were abandoned (tab closed) with nothing placed are refunded lazily.
export async function sweepGenerations(uid) {
  const stale = await db.select('generations', { user_id: uid, status: 'running', expires_at: { lt: iso(now()) } });
  for (const g of stale) { if (g.items > 0) await db.update('generations', { id: g.id, status: 'running' }, { status: 'done' }); else await refundGeneration(g); }
}

// ---- changes ----
async function takeChange(uid, home) {
  const acc = await editAccess(uid, home);
  if (acc.kind === 'pass') {
    const ok = await cas('passes', { id: acc.pass.id }, 'changes_left', v => v - 1, v => v > 0);
    if (!ok) throw new HttpError(402, 'no_changes_left', 'You have used all the changes on this Home Pass. Add 15 more, or go Pro.');
    return 'pass';
  }
  const lim = planOf(acc.sub).changes;
  const ok = await cas('subscriptions', { user_id: uid }, 'changes_used', v => v + 1, v => v < lim);
  if (!ok) throw new HttpError(402, 'no_changes_left', `You have used all ${lim} changes this month. Upgrade or wait for your next cycle.`);
  return 'pro';
}
export async function giveChangeBack(uid, homeId, source) {
  if (source === 'pass') { const h = await db.one('homes', { id: homeId }); if (h?.pass_id) await cas('passes', { id: h.pass_id }, 'changes_left', v => v + 1); }
  else await cas('subscriptions', { user_id: uid }, 'changes_used', v => Math.max(0, v - 1));
}

export async function startEdit(uid, homeId) {
  const home = await ownHome(uid, homeId);
  const source = await takeChange(uid, home);
  return db.insert('edits', { user_id: uid, home_id: homeId, source, followups_left: PRICING.budgets.editFollowups, refunded: false });
}
export async function refundEdit(uid, edit) {
  const won = await db.update('edits', { id: edit.id, refunded: false }, { refunded: true, followups_left: 0 });
  if (won.length) await giveChangeBack(uid, edit.home_id, edit.source);
}
export async function useEditFollowup(uid, editId) {
  const e = await db.one('edits', { id: editId });
  if (!e || e.user_id !== uid) throw new HttpError(404, 'not_found', 'Change not found.');
  const ok = await cas('edits', { id: editId }, 'followups_left', v => v - 1, v => v > 0);
  if (!ok) throw new HttpError(429, 'rate_limited', 'That change has used its room redos.');
  return e;
}
export async function startRefurnish(uid, homeId) {
  const home = await ownHome(uid, homeId);
  return { source: await takeChange(uid, home), homeId };
}

// ---- the guide: cheap, fast chat; changes it asks for go through the normal (metered) edit path ----
export async function allowGuide(uid) {
  const sub = await getSub(uid), paid = subActive(sub) || (await db.count('passes', { user_id: uid })) > 0;
  const cap = paid ? PRICING.guide.paidPerDay : PRICING.guide.freePerDay;
  if (await dailyCount(uid, 'guide') >= cap) throw new HttpError(429, 'rate_limited', paid ? 'Your guide has talked a lot today. She will be back tomorrow.' : `Free accounts get ${cap} guide messages a day. Get a Home Pass to keep talking.`);
}

// ---- photo-real renders ----
// Every render is a usage row (kind 'render'); a failed one is marked model='failed' and no longer counts.
const RENDER_OK = { neq: 'failed' };
export async function allowRender(uid, homeId) {
  const R = PRICING.renders, since30 = iso(addDays(now(), -30));
  if (await db.count('usage', { user_id: uid, kind: 'render', model: RENDER_OK, created_at: { gte: iso(startOfDay()) } }) >= R.perDayCap) throw new HttpError(429, 'rate_limited', 'That is a lot of renders for one day. Try again tomorrow.');
  let tier = 'free', home = null;
  if (homeId && homeId !== 'sample-home') {
    home = await db.one('homes', { id: homeId });
    if (home && home.user_id !== uid) throw new HttpError(403, 'forbidden', 'This home belongs to another account.');
  }
  if (home?.access === 'pass') {
    const p = await activePass(home);
    if (p && new Date(p.expires_at) > now()) {
      const used = await db.count('usage', { user_id: uid, home_id: homeId, kind: 'render', model: RENDER_OK });
      if (used >= R.pass) throw new HttpError(402, 'no_renders_left', `You have used all ${R.pass} photo-real renders on this Home Pass. Go Pro for ${R.pro} a month.`);
      tier = 'pass';
    }
  }
  if (tier === 'free') {
    const sub = await getSub(uid);
    if (subActive(sub)) {
      const lim = R[sub.plan] || R.pro;
      if (await db.count('usage', { user_id: uid, kind: 'render', model: RENDER_OK, created_at: { gte: since30 } }) >= lim) throw new HttpError(402, 'no_renders_left', `You have used all ${lim} photo-real renders for the last 30 days.`);
      tier = sub.plan;
    }
  }
  if (tier === 'free' && await db.count('usage', { user_id: uid, kind: 'render', model: RENDER_OK, created_at: { gte: iso(startOfDay()) } }) >= R.freePerDay)
    throw new HttpError(402, 'render_limit', `Free accounts get ${R.freePerDay} photo-real renders a day. Get a Home Pass for ${R.pass} per home.`);
  const row = await db.insert('usage', { user_id: uid, home_id: homeId || null, kind: 'render', model: 'pending' });
  return { tier, usageId: row.id };
}
export async function settleRender(usageId, ok) { await db.update('usage', { id: usageId }, { model: ok ? 'fal' : 'failed' }); }

// ---- launch offer ----
// Price of the next Home Pass, from how many have been sold so far.
export async function launchState() {
  const regular = PRICING.pass.amount;
  if (String(process.env.LAUNCH_OFFER || '').toLowerCase() === 'off') return { active: false, amount: regular, regular };
  const sold = await db.count('passes', {});
  const tiers = PRICING.launch.map((t, i) => ({ ...t, from: i ? PRICING.launch[i - 1].upto : 0 }));
  const cur = tiers.find(t => sold < t.upto);
  if (!cur) return { active: false, amount: regular, regular, sold };
  return { active: true, amount: cur.amount, regular, sold, spotsLeft: cur.upto - sold, label: cur.label, tiers: tiers.map(t => ({ label: t.label, amount: t.amount, upto: t.upto, from: t.from })) };
}

// ---- purchases ----
export async function grantPass(order, paymentId) {
  const won = await db.update('orders', { id: order.id, status: 'created' }, { status: 'paid', payment_id: paymentId });
  if (!won.length) return false; // already fulfilled
  if (order.kind === 'pass') {
    const p = PRICING.pass;
    const pass = await db.insert('passes', {
      user_id: order.user_id, home_id: order.home_id, razorpay_order_id: order.id, razorpay_payment_id: paymentId, amount: order.amount,
      designs_left: p.designs, changes_left: p.changes, expires_at: iso(addDays(now(), p.days)),
    });
    await db.update('homes', { id: order.home_id }, { access: 'pass', pass_id: pass.id });
  } else if (order.kind === 'topup') {
    const home = await db.one('homes', { id: order.home_id });
    if (home?.pass_id) await cas('passes', { id: home.pass_id }, 'changes_left', v => v + PRICING.topup.changes);
  }
  return true;
}

// Everything the app needs to draw the meter and the paywall.
export async function snapshot(uid) {
  await sweepGenerations(uid);
  const [profile, sub, homes, passes] = await Promise.all([
    db.one('profiles', { id: uid }), getSub(uid), db.select('homes', { user_id: uid }), db.select('passes', { user_id: uid }),
  ]);
  const byId = Object.fromEntries(passes.map(p => [p.id, p]));
  const active = subActive(sub), plan = planOf(sub);
  const recentPass = passes.some(p => new Date(p.created_at) > addDays(now(), -PRICING.upgradeWindowDays));
  const out = {};
  for (const h of homes) {
    const p = h.pass_id ? byId[h.pass_id] : null;
    const editable = h.access === 'pass' ? !!p && new Date(p.expires_at) > now() : h.access === 'pro' ? active : false;
    out[h.id] = {
      access: h.access, editable, locked: !!h.locked_hash, teaser_used: !!h.teaser_used, designed: !!h.designed_at, has_plan: !!h.plan_hash,
      designs_left: p?.designs_left ?? null, changes_left: p?.changes_left ?? null, expires_at: p?.expires_at ?? null,
    };
  }
  return {
    persona: profile?.persona || null,
    sub: sub ? {
      plan: sub.plan, status: sub.status, active, homes_used: sub.homes_used, homes_limit: plan?.homes ?? 0,
      changes_used: sub.changes_used, changes_limit: plan?.changes ?? 0, current_end: sub.current_end, cancel_at_period_end: !!sub.cancel_at_period_end,
    } : null,
    upgradeEligible: recentPass && !active,
    homes: out,
  };
}
