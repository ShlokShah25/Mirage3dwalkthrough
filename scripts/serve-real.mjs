// Local server with the REAL Claude API (ANTHROPIC_API_KEY from your shell), in-memory data and fake Razorpay.
// Use it to test plan reading and design end to end before deploying. Costs real Claude credit.
if (!process.env.ANTHROPIC_API_KEY) { console.error('Set ANTHROPIC_API_KEY first.'); process.exit(1); }
Object.assign(process.env, {
  MIRAGE_DB: 'memory', PORT: process.env.PORT || '3300', ANTHROPIC_BASE_URL: 'https://api.anthropic.com', RAZORPAY_BASE_URL: 'http://localhost:4002',
  RAZORPAY_KEY_ID: 'rzp_test', RAZORPAY_KEY_SECRET: 'test_secret', RAZORPAY_WEBHOOK_SECRET: 'whsec',
  RAZORPAY_PLAN_PRO: 'plan_pro', RAZORPAY_PLAN_MAX: 'plan_max',
});
const { startFakes } = await import('./fakes.mjs');
startFakes();
await import('./dev.mjs');
