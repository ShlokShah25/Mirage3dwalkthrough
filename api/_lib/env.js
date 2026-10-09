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
  budgets: { designCalls: 80, editFollowups: 10, generationMinutes: 60 },
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

// Free mode: everything is unlocked for every signed-in account, with daily caps to keep costs sane.
// On by default for now; set FREE_MODE=off to bring back the Home Pass and Pro paywall.
export const freeMode = () => String(env('FREE_MODE', 'on')).toLowerCase() !== 'off';
export const FREE = { designsPerDay: 5, changesPerDay: 60, rendersPerDay: 10 };
// Guest mode: no sign-in needed; the browser keeps a random guest key and the server gives it an account of its own.
// On by default for now; set GUEST_MODE=off to require sign-in again. Site-wide daily caps stop a stranger running up the bill.
export const guestMode = () => freeMode() && String(env('GUEST_MODE', 'on')).toLowerCase() !== 'off';   // guests exist only while everything is free
export const GUEST = { siteDesignsPerDay: Number(env('SITE_DESIGNS_PER_DAY', 60)), sitePlanReadsPerDay: Number(env('SITE_PLAN_READS_PER_DAY', 120)) };

export const MODELS = {
  complex: () => env('MODEL_COMPLEX', 'claude-opus-5-5'),
  default: () => env('MODEL_DEFAULT', 'claude-sonnet-5'),
  // placing furniture is spatial reasoning over a whole room; it gets the strongest model unless MODEL_DESIGN says otherwise
  design: () => env('MODEL_DESIGN', env('MODEL_COMPLEX', 'claude-opus-5-5')),
  fast: () => env('MODEL_FAST', 'claude-haiku-4-5-20251001'),
  // Forge (the 3D model maker): writing a model from a description is the hard part and gets the strongest model; edits and repairs use the default one
  forge: () => env('MODEL_FORGE', env('MODEL_COMPLEX', 'claude-opus-5-5')),
  forgeEdit: () => env('MODEL_FORGE_EDIT', env('MODEL_DEFAULT', 'claude-sonnet-5')),
};
// Forge daily limits while it is free: per person, and for the whole site (guests share the site-wide ones).
export const FORGE = {
  makesPerDay: Number(env('FORGE_MAKES_PER_DAY', 25)), editsPerDay: Number(env('FORGE_EDITS_PER_DAY', 120)), meshesPerDay: Number(env('FORGE_MESHES_PER_DAY', 6)),
  siteMakesPerDay: Number(env('FORGE_SITE_MAKES_PER_DAY', 400)), siteMeshesPerDay: Number(env('FORGE_SITE_MESHES_PER_DAY', 60)),
  // organic shapes: an image is made from the words, then a mesh from the image (fal.ai)
  imageModel: () => env('FAL_3D_IMAGE_MODEL', 'fal-ai/flux/schnell'), meshModel: () => env('FAL_3D_MODEL', 'fal-ai/hunyuan3d/v2'),
};

export const LIMITS = { promptChars: 200000, images: 10, imageChars: 5_000_000 };
// The deep plan read: after the first reading, Claude checks its tracing against the drawing in rounds (close-ups, measured
// lines, printed sizes) until the checks pass. Each round is one call to the strongest model with up to ten images.
// PLAN_DEEP_ROUNDS sets how many rounds a plan may take (0 turns the deep read off; the quick second look is used instead).
export const DEEP = { rounds: () => Math.max(0, Math.min(8, Number(env('PLAN_DEEP_ROUNDS', 5)) || 0)) };

export function publicConfig(launch) {
  return {
    launch, free: freeMode(), guest: guestMode(), deepRounds: DEEP.rounds(), voiceOn: !!env('FAL_KEY'), forge: { meshOn: !!env('FAL_KEY'), makesPerDay: FORGE.makesPerDay, meshesPerDay: FORGE.meshesPerDay },
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
