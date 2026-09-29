# Mirage

Floor plan in, furnished 3D home out. This repo is the whole site: landing page, the 3D app, and the backend.

```
public/            what visitors load
  index.html       landing page
  app.html         the 3D app (built from the studio source)
  terms, privacy, refunds, contact .html   draft legal pages (fill in the [brackets])
api/               server functions (run on Vercel)
  ai.js            the only route to Claude: checks the plan, meters usage, streams answers
  me.js            plan, usage and per-home access for the signed-in user
  homes.js         registers a home to an account
  generate.js      starts / finishes a design run (refunds runs that place nothing)
  billing.js       Home Pass, top-ups, Pro / Pro Max, verify, change plan, cancel
  razorpay-webhook.js   payment and subscription events from Razorpay
  render.js        "Make it real": turns the current 3D view into a photo-real image (fal.ai)
  config.js        public keys and prices for the browser
  _lib/            shared code (pricing lives in _lib/env.js)
supabase/schema.sql    database tables and security rules
scripts/           local server and tests (not deployed)
```

No npm packages are needed. Everything uses the built-in `fetch` and `crypto` in Node 20+.

## Pricing and limits

All set in `api/_lib/env.js` (server) and shown by the app from `/api/config`:

| | Price | What you get |
|---|---|---|
| Free | ₹0 | Plan reading (10 a day), bare 3D shell, one room preview per home (3 a day) |
| Home Pass | ₹3,999 once (launch offer: first 5 homes ₹1,999, next 45 ₹2,499) | 1 home tied to one floor plan · 1 design + 3 restyles · 30 changes · 90 days of editing |
| Top-up | ₹499 | +15 changes on a Home Pass home |
| Pro | ₹6,999 / month | 6 new homes a month · unlimited restyles · 200 changes a month |
| Pro Max | ₹14,999 / month | 20 new homes a month · unlimited restyles · 600 changes a month |

Photo-real renders ("Make it real", about ₹3 to ₹4 each on fal.ai): Free 2 a day, Home Pass 25 per home, Pro 150 and Pro Max 500 per 30 days, 80 a day at most. Failed renders don't count. Set in `PRICING.renders`.

Loophole guards, all enforced on the server:
- A Home Pass is locked to the floor plan image it was designed with. A different plan needs a new home.
- Designs and changes that place nothing are refunded automatically.
- Pro allowances reset each billing cycle and don't roll over. After a subscription ends, Pro homes become view-only.
- A design run can make at most 32 Claude calls. A change can trigger at most 4 room redos.
- Every Claude call is logged in the `usage` table with token counts, so you can see cost per user.

## Go live: step by step

### 1. Supabase (login and database)
1. Create a project at supabase.com. Pick the Mumbai region.
2. SQL Editor → New query → paste `supabase/schema.sql` → Run.
3. Authentication → Providers: turn on **Email** (magic link). For **Google**, create an OAuth client in Google Cloud Console and paste its ID and secret.
4. Authentication → URL Configuration: set **Site URL** to `https://yourdomain.com` and add `https://yourdomain.com/app` to **Redirect URLs**.
5. Project Settings → API: copy the URL, the `anon` key and the `service_role` key.

### 2. Anthropic (Claude)
1. console.anthropic.com → create an API key.
2. Set a monthly spend limit (Settings → Limits). About ₹30 to ₹50 of Claude usage per designed home is typical.

### 3. Razorpay (payments)
Start with **Test mode** keys, then switch to Live once your KYC is approved.
1. Settings → API Keys → generate a key ID and secret.
2. Subscriptions → Plans → create two monthly plans: **Mirage Pro ₹6,999** and **Mirage Pro Max ₹14,999**. Copy their plan IDs.
3. Optional: Offers → create a ₹3,999-off offer that applies to subscriptions. Its ID goes in `RAZORPAY_OFFER_UPGRADE`.
4. Settings → Webhooks → add `https://yourdomain.com/api/razorpay-webhook` with a secret you make up. Tick these events:
   `payment.captured`, `order.paid`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `subscription.updated`.
5. Razorpay's website review checks for Terms, Privacy, Refunds and Contact pages. Fill in the drafts in `public/` first.

### 3b. fal.ai (photo-real renders)
1. Sign up at fal.ai → Dashboard → Keys → create a key. Put it in `FAL_KEY`.
2. Add credit and set a spend limit. Each render is one FLUX.1 Kontext [pro] image.
3. Without `FAL_KEY` the "Make it real" button stays hidden and `/api/render` answers 503.
4. The same key gives Mira her own voice (ElevenLabs via fal, `/api/voice`) for signed-in users; without it she uses the device voice. `MIRA_VOICE` picks the voice (default Charlotte).

### 4. Vercel (hosting)
1. Push this folder to a GitHub repo and import it at vercel.com/new. Framework preset: **Other**. No build command.
2. Settings → Environment Variables: add everything in `.env.example`.
3. Deploy, then Settings → Domains → add your domain and follow the DNS steps.
4. `api/ai.js` is set to run for up to 300 seconds, because reading a plan can take a couple of minutes. Check that your Vercel plan allows this. If it doesn't, the Pro plan does.

### 5. Test before telling anyone
With Razorpay test keys: sign in → upload a plan → preview a room → buy a Home Pass with test card `4111 1111 1111 1111` → design → make a change → check the meter. Then subscribe to Pro and cancel. Switch Razorpay to live keys when it all works.

## Run it locally

```
node scripts/serve-test.mjs     # http://localhost:3200 with a fake Claude, fake Razorpay and in-memory data
node scripts/test-api.mjs       # 46 end-to-end checks of plans, payments, limits and refunds
```

To run against real services locally, put real values in `.env.local` and run `node scripts/dev.mjs`.

## Updating the app

`public/app.html` is built from the studio source files. Edit the files in `app-src/`, run `python3 app-src/build.py`, then commit.
