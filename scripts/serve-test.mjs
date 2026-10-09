// Local test server: in-memory database, fake Claude and fake Razorpay. Never use in production.
Object.assign(process.env, {
  MIRAGE_DB: 'memory', PORT: process.env.PORT || '3200', ANTHROPIC_BASE_URL: 'http://localhost:4001', RAZORPAY_BASE_URL: 'http://localhost:4002', FAL_URL: 'http://localhost:4003', FAL_QUEUE_URL: 'http://localhost:4003/queue', FAL_KEY: 'fal_test',
  RAZORPAY_KEY_ID: 'rzp_test', RAZORPAY_KEY_SECRET: 'test_secret', RAZORPAY_WEBHOOK_SECRET: 'whsec',
  RAZORPAY_PLAN_PRO: 'plan_pro', RAZORPAY_PLAN_MAX: 'plan_max', RAZORPAY_OFFER_UPGRADE: 'offer_up',
});
const { startFakes } = await import('./fakes.mjs');
startFakes();
await import('./dev.mjs');
