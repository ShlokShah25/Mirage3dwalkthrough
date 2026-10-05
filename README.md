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

## How a plan becomes a home

1. **Read** (`app-src/p3b_trace.js`): Claude traces walls, doors (with hinge and swing), windows, rooms, printed sizes, dimension lines and any furniture drawn on the plan, in image pixels. Plans are uploaded at up to 2560 px so small printed sizes stay legible.
2. **Snap** (`app-src/p3g_planfix.js`): every traced wall is moved onto the wall actually drawn in the image (solid or double-line walls), its thickness measured, its ends joined to the walls it meets, and every door and window jamb moved to the edge of its gap.
3. **Deep read** (`app-src/p3j_deepread.js`): the tracing is checked against the drawing in passes, the way a person would check it, until the checks pass (up to `PLAN_DEEP_ROUNDS`, 5 by default):
   - **Measure**: code finds every long straight line of ink in the image (level, upright and sloping, with a darker second cut so a wall beside a grey fill is still found) and its exact position and thickness.
   - **Check**: after every change the tracing is examined: each sized room is measured between its wall faces and compared with the size printed in it (with a scale per direction that may drift, for photographed plans); wall-like ink no wall explains; rooms with no door, no way in, an open side, overlapping outlines; floor no room covers; labels outside their rooms; gaps in the outer wall.
   - **Fix**: Claude is shown the plan, the tracing over it and up to eight enlarged close-ups with a pixel grid and the measured lines (the first pass sweeps the whole home tile by tile, later passes show the open problems, the areas it asked to see and the areas it just changed), and answers with edits, dismissals with a reason, and yes/no questions for anything the drawing cannot settle.
   - The best-scoring tracing is kept; an edit that makes things worse is undone and Claude is told why. Questions are put to the customer as one-tap cards before the walls are built, and anything still open is listed under Fix the layout.
   - With `PLAN_DEEP_ROUNDS=0` (or in a view that cannot send ten images) one quick second look at the whole plan is used instead.
4. **Fit to the printed sizes**: the scale comes from the printed room sizes (interior or centreline, whichever the plan uses), then a least-squares fit moves each wall line so every fully walled room measures what the plan says. Rooms whose drawing and printed size still disagree are flagged.
5. **Furnish** (`app-src/p3i_furnish.js`): each room is described in its own frame: labelled walls, solid stretches, doors and where they lead and swing, windows and sills, keep-clear zones, and the architect's drawn furniture. Claude places each piece against a wall (`wall`, `along`, `off`), next to or on another piece, or at a room coordinate, and the code turns that into exact positions, builds chair, nightstand and stool groups, checks every piece against doors, windows, walls and other pieces, fixes what it can, and sends anything left back to Claude once.

Plan reading and furnishing run on `MODEL_COMPLEX` / `MODEL_DESIGN` (Opus by default) with adaptive thinking. A deep read is one call per pass with ten images, so a plan takes several minutes and several Opus calls to read; accuracy comes first, and `PLAN_DEEP_ROUNDS` caps the cost.

To measure accuracy, `scripts/planlab/` runs the real plan-reading code headless: `lab.mjs` steps a plan through the read with answers from files (any Claude can play the model), and `compare.mjs` scores a tracing against a hand-checked answer key (walls found and their offset, openings, room overlap). A designed home costs more in Claude usage than before (roughly 2 to 3 times), in exchange for layouts that follow the plan.

## The hand (walkthrough interactions)

`app-src/p2d_hand.js`. In walk mode, whatever is in the middle of the view can be acted on, as in a game: **E** opens or shuts a door, **X** picks a piece up. A carried piece follows where you look (it stays on your side of the walls; beds, sofas and wardrobes turn their back to a wall as they near one; art, mirrors and screens go on the wall you look at), **X** or a click puts it down, **R** turns it, **Esc** puts it back. What stands on a piece comes along with it. The same actions are buttons under the aim dot, which is how touch screens use it. Door leaves hang on pivots (`placeDoor`, `toggleDoor`, `stepDoors` in `p2c_world.js`); a shut door blocks walking, its state is saved with the home (`swing.open`, `swing.max`), and a guided tour or presentation opens the doors in its way.

## Mira and changes

Mira (`app-src/p3e_guide.js`) is the guide and designer in the walkthrough. Quick questions and navigation use the fast model (`guide`); ideas and anything that leads to a change use the default model (`guide_pro`, counted as a guide message). She knows the room the visitor is in, the wall, door or window they are facing, what she has offered and which changes are being made.

Changes run through one queue (`requestEdit` in `app-src/p3c_gen.js`): one at a time, a second request waits its turn, and only the Stop button cancels. A plain instruction typed to Mira ("add a reading chair by the window") skips the chat call and goes straight to the change engine, with the last few lines of conversation as context.

Every change is checked as built (`applyOps`): operations that could not be applied (unknown piece, room, catalog type or option) and pieces that do not fit (outside the room, in a doorway, overlapping) are listed. Moved and added pieces are first nudged into place by code; if anything is still wrong, the change is repaired once (`edit_fix`: same change, not charged again, default model at high effort) and the better of the two answers is kept. An unreadable answer is asked for again once. What could not be done is said in the summary rather than hidden. The browser console logs `[change]` lines when a repair runs. Besides furniture, materials, floors and light, the change engine can alter the building (`app-src/p3k_structure.js`):

- **Light walls** (thin interior partitions) can be opened up, removed or moved. **Structure stays**: outside walls, walls much thicker than the partitions, and columns are refused with a note the visitor sees. When a light wall is opened its **beam is kept** at the ceiling unless the visitor says there is none.
- **Windows and doors** can be added, moved, resized, changed or removed. Windows and sliding doors may go in an outside wall; doors and doorways only in light walls.
- **Plan corrections**: when the visitor says the plan was read wrong, any wall may be moved, added or removed, a room split or renamed. These carry `"misread": true`, because they correct the drawing rather than change the building.

`app-src/cat4.js` adds statement pieces her concepts can use: RGB LED strips and neon in any colour, acoustic panels, a studio desk and speakers, guitars, cinema recliners and screen, a linear fireplace wall, a glass wine wall, a window seat, a timber slat ceiling and a home gym.

Graphics default to **Auto quality**: full quality to start, stepping down a level whenever most frames over a few seconds are slow, and remembering the level for that device. Shadows are redrawn only when something changes, and the panels over the 3D view no longer blur what is behind them.

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
- A design run can make at most 80 Claude calls (one per room, plus one fix pass per room, plus style reads). A change can trigger at most 10 follow-up calls (about 5 room redos, each with its fix pass).
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
2. Set a monthly spend limit (Settings → Limits). Estimate (not yet measured on live traffic): a large 4BHK costs roughly ₹350 to ₹900 of Claude usage to read and design in full on Opus, about ₹120 to ₹250 for the plan read and the rest for furnishing (one or two Opus calls per room). Check the `usage` table or the Console for real figures.

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
4. The same key gives Mira her own voice (ElevenLabs via fal, `/api/voice`) for signed-in users; without it she uses the device voice. `MIRA_VOICE` picks the voice (default Charlotte). If fal refuses the key or the balance runs out, she falls back to the device voice and says why once in her panel (`voice_key`, `voice_credit`); the server log has the `fal tts` line.

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
