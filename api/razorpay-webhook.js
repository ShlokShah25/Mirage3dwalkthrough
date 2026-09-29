// POST /api/razorpay-webhook — Razorpay tells us about payments and subscription changes.
// Set this URL in Razorpay Dashboard → Webhooks with the events listed in README.md.
import { json } from './_lib/http.js';
import { db } from './_lib/db.js';
import { verifyWebhookSig } from './_lib/razorpay.js';
import { grantPass } from './_lib/entitle.js';
import { syncSubscription } from './_lib/subs.js';

export async function POST(req) {
  const raw = await req.text();
  if (!verifyWebhookSig(raw, req.headers.get('x-razorpay-signature'))) return json({ error: 'bad signature' }, 400);
  let ev; try { ev = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }
  try {
    const type = ev.event || '';
    if (type === 'payment.captured' || type === 'order.paid') {
      const pay = ev.payload?.payment?.entity;
      const orderId = pay?.order_id || ev.payload?.order?.entity?.id;
      const order = orderId ? await db.one('orders', { id: orderId }) : null;
      if (order) await grantPass(order, pay?.id || null);
    } else if (type.startsWith('subscription.')) {
      const ent = ev.payload?.subscription?.entity;
      if (ent) await syncSubscription(ent);
    }
  } catch (e) {
    console.error('webhook', e);
    return json({ error: 'retry' }, 500); // Razorpay retries on non-2xx
  }
  return json({ ok: true });
}
