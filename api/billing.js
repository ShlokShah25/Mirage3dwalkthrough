// POST /api/billing — create checkouts, confirm payments, manage the subscription.
//   { action: 'pass', homeId }                       → Razorpay order for a Home Pass
//   { action: 'topup', homeId }                      → Razorpay order for +15 changes
//   { action: 'subscribe', plan: 'pro'|'max' }       → Razorpay subscription
//   { action: 'verify', orderId|subscriptionId, paymentId, signature }
//   { action: 'change', plan }                       → switch Pro ↔ Pro Max
//   { action: 'cancel' }                             → cancel at the end of the paid period
import { requireAccount } from './_lib/auth.js';
import { route, body, json, HttpError } from './_lib/http.js';
import { env, PRICING } from './_lib/env.js';
import { db } from './_lib/db.js';
import { rzp, verifyOrderSig, verifySubSig } from './_lib/razorpay.js';
import { ownHome, grantPass, getSub, subActive, snapshot, launchState } from './_lib/entitle.js';
import { refreshSubscription } from './_lib/subs.js';

async function createOrder(user, kind, homeId, amount) {
  const o = await rzp('POST', '/v1/orders', {
    amount, currency: PRICING.currency, receipt: `${kind}_${Date.now().toString(36)}`.slice(0, 40),
    notes: { user_id: user.id, home_id: homeId, kind },
  });
  await db.insert('orders', { id: o.id, user_id: user.id, kind, home_id: homeId, amount, status: 'created' });
  return json({ orderId: o.id, amount, currency: PRICING.currency, keyId: env('RAZORPAY_KEY_ID'), email: user.email });
}

export const POST = route(async req => {
  const user = await requireAccount(req, 'buy a plan');
  const b = await body(req);
  switch (b.action) {
    case 'pass': {
      const home = await ownHome(user.id, b.homeId);
      if (home.access !== 'none') throw new HttpError(409, 'already_paid', 'This home already has a plan.');
      if (!home.plan_hash) throw new HttpError(409, 'no_plan', 'Read the floor plan first.');
      if (subActive(await getSub(user.id))) throw new HttpError(409, 'has_sub', 'Your subscription already covers new homes.');
      const offer = await launchState();
      return createOrder(user, 'pass', home.id, offer.amount);
    }
    case 'topup': {
      const home = await ownHome(user.id, b.homeId);
      if (home.access !== 'pass') throw new HttpError(409, 'bad_request', 'Top-ups are for Home Pass homes.');
      return createOrder(user, 'topup', home.id, PRICING.topup.amount);
    }
    case 'subscribe': {
      const plan = PRICING.plans[b.plan]; if (!plan) throw new HttpError(400, 'bad_request', 'Unknown plan.');
      const cur = await getSub(user.id);
      if (subActive(cur) && cur.status !== 'cancelled') throw new HttpError(409, 'has_sub', 'You already have a subscription. Switch plans instead.');
      const snap = await snapshot(user.id);
      const offer = snap.upgradeEligible ? env('RAZORPAY_OFFER_UPGRADE') : null;
      const s = await rzp('POST', '/v1/subscriptions', {
        plan_id: env(plan.planEnv), total_count: 120, quantity: 1, customer_notify: 1,
        notes: { user_id: user.id, plan: b.plan }, ...(offer ? { offer_id: offer } : {}),
      });
      await db.upsert('subscriptions', {
        user_id: user.id, plan: b.plan, status: s.status || 'created', razorpay_subscription_id: s.id,
        current_start: null, current_end: null, homes_used: 0, changes_used: 0, cancel_at_period_end: false, updated_at: new Date().toISOString(),
      });
      return json({ subscriptionId: s.id, keyId: env('RAZORPAY_KEY_ID'), email: user.email, offerApplied: !!offer });
    }
    case 'verify': {
      if (b.orderId) {
        if (!verifyOrderSig(b.orderId, b.paymentId, b.signature)) throw new HttpError(400, 'bad_signature', 'Payment could not be verified.');
        const order = await db.one('orders', { id: b.orderId });
        if (!order || order.user_id !== user.id) throw new HttpError(404, 'not_found', 'Order not found.');
        await grantPass(order, b.paymentId);
      } else if (b.subscriptionId) {
        if (!verifySubSig(b.paymentId, b.subscriptionId, b.signature)) throw new HttpError(400, 'bad_signature', 'Payment could not be verified.');
        const row = await getSub(user.id);
        if (!row || row.razorpay_subscription_id !== b.subscriptionId) throw new HttpError(404, 'not_found', 'Subscription not found.');
        await refreshSubscription(b.subscriptionId);
      } else throw new HttpError(400, 'bad_request', 'Nothing to verify.');
      return json({ ok: true, me: await snapshot(user.id) });
    }
    case 'change': {
      const plan = PRICING.plans[b.plan]; if (!plan) throw new HttpError(400, 'bad_request', 'Unknown plan.');
      const cur = await getSub(user.id);
      if (!subActive(cur) || !cur.razorpay_subscription_id) throw new HttpError(409, 'sub_inactive', 'No active subscription to change.');
      if (cur.plan === b.plan) return json({ ok: true });
      await rzp('PATCH', `/v1/subscriptions/${cur.razorpay_subscription_id}`, { plan_id: env(plan.planEnv), schedule_change_at: 'now', customer_notify: 1 });
      await db.update('subscriptions', { user_id: user.id }, { plan: b.plan, updated_at: new Date().toISOString() });
      return json({ ok: true, me: await snapshot(user.id) });
    }
    case 'cancel': {
      const cur = await getSub(user.id);
      if (!cur?.razorpay_subscription_id) throw new HttpError(409, 'sub_inactive', 'No subscription to cancel.');
      await rzp('POST', `/v1/subscriptions/${cur.razorpay_subscription_id}/cancel`, { cancel_at_cycle_end: 1 });
      await db.update('subscriptions', { user_id: user.id }, { cancel_at_period_end: true, updated_at: new Date().toISOString() });
      return json({ ok: true, me: await snapshot(user.id) });
    }
  }
  throw new HttpError(400, 'bad_request', 'Unknown action.');
});
