// Keeps our subscriptions table in step with Razorpay.
import { db } from './db.js';
import { rzp } from './razorpay.js';
import { env, PRICING } from './env.js';

const planFromId = id => Object.keys(PRICING.plans).find(k => env(PRICING.plans[k].planEnv) === id) || null;

const ts = s => (s ? new Date(s * 1000).toISOString() : null);

// Apply a Razorpay subscription entity to our row. A new billing period resets the month's usage.
export async function syncSubscription(entity) {
  const userId = entity?.notes?.user_id;
  const row = userId ? await db.one('subscriptions', { user_id: userId }) : await db.one('subscriptions', { razorpay_subscription_id: entity.id });
  if (!row) return null;
  if (row.razorpay_subscription_id && row.razorpay_subscription_id !== entity.id) return row; // an older subscription; ignore
  const start = ts(entity.current_start), end = ts(entity.current_end);
  const patch = {
    status: entity.status, current_start: start || row.current_start, current_end: end || row.current_end,
    cancel_at_period_end: entity.status === 'active' || entity.status === 'authenticated' ? !!row.cancel_at_period_end : false,
    updated_at: new Date().toISOString(),
  };
  const plan = planFromId(entity.plan_id); if (plan) patch.plan = plan;
  if (start && row.current_start && start !== row.current_start) { patch.homes_used = 0; patch.changes_used = 0; }
  await db.update('subscriptions', { user_id: row.user_id }, patch);
  return { ...row, ...patch };
}

export async function refreshSubscription(subId) { return syncSubscription(await rzp('GET', `/v1/subscriptions/${subId}`)); }
