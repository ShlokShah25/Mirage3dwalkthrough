// Razorpay REST calls and signature checks (no SDK needed).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';
import { HttpError } from './http.js';

const base = () => env('RAZORPAY_BASE_URL', 'https://api.razorpay.com').replace(/\/$/, '');
const auth = () => 'Basic ' + Buffer.from(`${env('RAZORPAY_KEY_ID', '')}:${env('RAZORPAY_KEY_SECRET', '')}`).toString('base64');

export async function rzp(method, path, data) {
  const r = await fetch(base() + path, { method, headers: { authorization: auth(), 'content-type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('razorpay', method, path, r.status, JSON.stringify(j).slice(0, 400)); throw new HttpError(502, 'payment_error', j?.error?.description || 'The payment provider had a problem. Try again.'); }
  return j;
}

const hmac = (secret, msg) => createHmac('sha256', secret).update(msg).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && timingSafeEqual(x, y); };

export const verifyOrderSig = (orderId, paymentId, sig) => same(hmac(env('RAZORPAY_KEY_SECRET', ''), `${orderId}|${paymentId}`), sig);
export const verifySubSig = (paymentId, subId, sig) => same(hmac(env('RAZORPAY_KEY_SECRET', ''), `${paymentId}|${subId}`), sig);
export const verifyWebhookSig = (raw, sig) => same(hmac(env('RAZORPAY_WEBHOOK_SECRET', ''), raw), sig);
