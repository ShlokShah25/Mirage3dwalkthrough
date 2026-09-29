// Configuration and pricing. Prices are in paise (₹1 = 100 paise).
export const env = (k, d) => (process.env[k] ?? d);

export const PRICING = {
  currency: 'INR',
  pass: { amount: 399900, designs: 4, changes: 30, days: 90 },        // ₹3,999: 1 design + 3 restyles, 30 changes, 90 days
  topup: { amount: 49900, changes: 15 },                              // ₹499: +15 changes on a Home Pass
  plans: {
    pro: { amount: 699900, homes: 6, changes: 200, planEnv: 'RAZORPAY_PLAN_PRO', name: 'Mirage Pro' },
    max: { amount: 1499900, homes: 20, changes: 600, planEnv: 'RAZORPAY_PLAN_MAX', name: 'Mirage Pro Max' },
  },
  upgradeWindowDays: 7,       // Home Pass buyers who go Pro within this window get RAZORPAY_OFFER_UPGRADE applied
  free: { planReadsPerDay: 10, teasersPerDay: 3 },
  budgets: { designCalls: 32, editFollowups: 4, generationMinutes: 45 },
  // Photo-real renders (fal.ai, about ₹3–4 each). Free: a few a day to feel the wow. Paid: per home or per rolling 30 days.
  guide: { freePerDay: 40, paidPerDay: 400 },
  voice: { freePerDay: 60, paidPerDay: 600, maxChars: 420 },   // Mira's premium voice: one line of speech per call
  renders: { freePerDay: 2, pass: 25, pro: 150, max: 500, perDayCap: 80 },
  graceDays: 3,               // keep Pro working this long after a failed renewal
  // Launch offer on the Home Pass: price steps up as homes are sold. Set LAUNCH_OFFER=off to end it.
  launch: [
    { upto: 5, amount: 199900, label: 'First 5 homes' },
    { upto: 50, amount: 249900, label: 'Next 45 homes' },
  ],
};

export const MODELS = {
  complex: () => env('MODEL_COMPLEX', 'claude-opus-5-5'),
  default: () => env('MODEL_DEFAULT', 'claude-sonnet-5'),
  fast: () => env('MODEL_FAST', 'claude-haiku-4-5-20251001'),
};

export const LIMITS = { promptChars: 160000, images: 8, imageChars: 3_000_000 };

export function publicConfig(launch) {
  return {
    launch,
    supabaseUrl: env('SUPABASE_URL', ''),
    supabaseAnonKey: env('SUPABASE_ANON_KEY', ''),
    razorpayKeyId: env('RAZORPAY_KEY_ID', ''),
    authMode: env('MIRAGE_DB') === 'memory' ? 'test' : 'supabase',
    prices: {
      pass: PRICING.pass, topup: PRICING.topup,
      pro: { amount: PRICING.plans.pro.amount, homes: PRICING.plans.pro.homes, changes: PRICING.plans.pro.changes },
      max: { amount: PRICING.plans.max.amount, homes: PRICING.plans.max.homes, changes: PRICING.plans.max.changes },
      renders: PRICING.renders, rendersOn: !!env('FAL_KEY'),
      upgradeWindowDays: PRICING.upgradeWindowDays, upgradeOffer: !!env('RAZORPAY_OFFER_UPGRADE'),
    },
  };
}
