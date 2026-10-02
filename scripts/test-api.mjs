// End-to-end API test against the fake Claude and Razorpay. Run: node scripts/test-api.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

Object.assign(process.env, {
  MIRAGE_DB: 'memory', PORT: '3100', FREE_MODE: 'off', ANTHROPIC_BASE_URL: 'http://localhost:4001', RAZORPAY_BASE_URL: 'http://localhost:4002', FAL_URL: 'http://localhost:4003', FAL_KEY: 'fal_test',
  RAZORPAY_KEY_ID: 'rzp_test', RAZORPAY_KEY_SECRET: 'test_secret', RAZORPAY_WEBHOOK_SECRET: 'whsec',
  RAZORPAY_PLAN_PRO: 'plan_pro', RAZORPAY_PLAN_MAX: 'plan_max', RAZORPAY_OFFER_UPGRADE: 'offer_up',
});
const { startFakes, calls } = await import('./fakes.mjs');
const fakes = startFakes();
await import('./dev.mjs');
await new Promise(r => setTimeout(r, 300));

const B = 'http://localhost:3100';
const IMG = 'data:image/png;base64,' + Buffer.from('plan-one').toString('base64');
const IMG2 = 'data:image/png;base64,' + Buffer.from('plan-two').toString('base64');
const tok = u => `test:${u}:${u}@test.local`;
async function call(u, path, data, method = data ? 'POST' : 'GET') {
  const r = await fetch(B + path, { method, headers: { authorization: 'Bearer ' + tok(u), 'content-type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  return { status: r.status, body: await r.json() };
}
async function ai(u, data) {
  const r = await fetch(B + '/api/ai', { method: 'POST', headers: { authorization: 'Bearer ' + tok(u), 'content-type': 'application/json' }, body: JSON.stringify(data) });
  if (r.headers.get('content-type')?.includes('json')) return { status: r.status, ...(await r.json()) };
  const text = await r.text(); let last = null, deltas = 0;
  for (const part of text.split('\n\n')) { const l = part.split('\n').find(x => x.startsWith('data:')); if (!l) continue; const o = JSON.parse(l.slice(5)); if (o.t) deltas++; else last = o; }
  return { status: r.status, deltas, ...last };
}
const pay = async (u, o) => { const p = await (await fetch('http://localhost:4002/test/pay', { method: 'POST', body: JSON.stringify(o) })).json(); return call(u, '/api/billing', { action: 'verify', ...o, paymentId: p.paymentId, signature: p.signature }); };
const me = async u => (await call(u, '/api/me')).body;
const FURNISH = 'You are placing furniture.\nROOM "Living / Dining"\nROOM "Kitchen"';
let step = 0; const ok = m => console.log(`  ✓ ${++step}. ${m}`);

// --- homeowner with a Home Pass ---
const A = '11111111-aaaa-4aaa-8aaa-000000000001';
assert.equal((await call(A, '/api/me', {})).status, 400); ok('persona is validated');
assert.equal((await call(A, '/api/me', { persona: 'own' })).status, 200);
assert.equal((await me(A)).persona, 'own'); ok('persona saved');
assert.equal((await fetch(B + '/api/me')).status, 401); ok('signed-out calls are rejected');

let r = await ai(A, { kind: 'plan_read', homeId: 'h1', prompt: 'You are an architectural draftsperson...', images: [IMG] });
assert.ok(r.done && r.json.walls, 'plan read returns trace'); assert.ok(r.deltas > 0); ok('free plan read streams a trace');
assert.equal(calls.at(-1).model, 'claude-opus-5-5'); ok('plan read uses the complex model');

r = await ai(A, { kind: 'teaser', homeId: 'h1', prompt: FURNISH.replace('\nROOM "Kitchen"', '') });
assert.ok(r.done && r.json.items.length > 0); ok('free one-room preview works');
r = await ai(A, { kind: 'teaser', homeId: 'h1', prompt: FURNISH });
assert.equal(r.status, 402); assert.equal(r.error.code, 'teaser_used'); ok('second preview on the same home is refused');

r = await call(A, '/api/generate', { action: 'start', homeId: 'h1' });
assert.equal(r.status, 402); assert.equal(r.body.error.code, 'payment_required'); ok('designing without a plan hits the paywall');
r = await ai(A, { kind: 'edit', homeId: 'h1', prompt: 'You are editing' });
assert.equal(r.status, 402); ok('changes without a plan hit the paywall');

let cfg = await (await fetch(B + '/api/config')).json();
assert.equal(cfg.launch.active, true); assert.equal(cfg.launch.amount, 199900); assert.equal(cfg.launch.spotsLeft, 5); ok('launch offer: first 5 homes at ₹1,999');
r = await call(A, '/api/billing', { action: 'pass', homeId: 'h1' });
assert.equal(r.status, 200); assert.equal(r.body.amount, 199900); ok('Home Pass is charged the launch price');
const orderId = r.body.orderId;
r = await call(A, '/api/billing', { action: 'verify', orderId, paymentId: 'pay_fake', signature: 'nope' });
assert.equal(r.status, 400); ok('forged payment signature is rejected');
r = await pay(A, { orderId }); assert.equal(r.status, 200);
cfg = await (await fetch(B + '/api/config')).json(); assert.equal(cfg.launch.spotsLeft, 4); ok('launch spots count down after a sale');
let h = (await me(A)).homes.h1; assert.equal(h.access, 'pass'); assert.equal(h.designs_left, 4); assert.equal(h.changes_left, 30); ok('Home Pass granted after verified payment');
r = await pay(A, { orderId }); h = (await me(A)).homes.h1; assert.equal(h.designs_left, 4); ok('paying twice for the same order grants once');

r = await call(A, '/api/generate', { action: 'start', homeId: 'h1' }); assert.equal(r.status, 200);
let gen = r.body.genId;
r = await ai(A, { kind: 'style', genId: gen, prompt: 'You are an interior designer. The image', images: [IMG] }); assert.ok(r.done);
r = await ai(A, { kind: 'design', genId: gen, prompt: FURNISH }); assert.ok(r.json.items.length > 0);
assert.equal(calls.at(-1).model, 'claude-sonnet-5');
r = await call(A, '/api/generate', { action: 'finish', genId: gen }); assert.equal(r.body.status, 'done');
h = (await me(A)).homes.h1; assert.equal(h.designs_left, 3); assert.equal(h.locked, true); ok('design run uses one design and locks the plan');

r = await ai(A, { kind: 'plan_read', homeId: 'h1', prompt: 'You are an architectural draftsperson', images: [IMG2] });
assert.equal(r.status, 409); assert.equal(r.error.code, 'plan_locked'); ok('a different floor plan cannot reuse the pass');
r = await ai(A, { kind: 'plan_read', homeId: 'h1', prompt: 'You are an architectural draftsperson', images: [IMG] });
assert.ok(r.done); ok('re-reading the same plan is allowed');

r = await ai(A, { kind: 'edit', homeId: 'h1', prompt: 'You are editing: make it night' });
assert.ok(r.done); assert.ok(r.meta.editId);
const editId = r.meta.editId;
assert.equal((await me(A)).homes.h1.changes_left, 29); ok('a change uses one of 30');
r = await ai(A, { kind: 'edit', homeId: 'h1', prompt: 'You are editing NOOP' });
assert.equal((await me(A)).homes.h1.changes_left, 29); ok('a change that does nothing is refunded');
for (let i = 0; i < 4; i++) { r = await ai(A, { kind: 'edit_followup', editId, prompt: FURNISH }); assert.ok(r.done); }
r = await ai(A, { kind: 'edit_followup', editId, prompt: FURNISH }); assert.equal(r.status, 429); ok('room redos after a change are capped at 4');
r = await ai(A, { kind: 'refurnish', homeId: 'h1', prompt: FURNISH }); assert.ok(r.done);
assert.equal((await me(A)).homes.h1.changes_left, 28); ok('"redo this room" uses a change');
r = await ai(A, { kind: 'refurnish', homeId: 'h1', prompt: FURNISH + ' EMPTYROOM' });
assert.equal((await me(A)).homes.h1.changes_left, 28); ok('a redo that places nothing is refunded');

// a design run that places nothing gives the design back
r = await call(A, '/api/generate', { action: 'start', homeId: 'h1' }); gen = r.body.genId;
r = await ai(A, { kind: 'design', genId: gen, prompt: FURNISH + ' EMPTYROOM' });
r = await call(A, '/api/generate', { action: 'finish', genId: gen }); assert.equal(r.body.status, 'refunded');
assert.equal((await me(A)).homes.h1.designs_left, 3); ok('a failed design run is refunded');
for (let i = 0; i < 3; i++) { r = await call(A, '/api/generate', { action: 'start', homeId: 'h1' }); assert.equal(r.status, 200); await ai(A, { kind: 'design', genId: r.body.genId, prompt: FURNISH }); await call(A, '/api/generate', { action: 'finish', genId: r.body.genId }); }
r = await call(A, '/api/generate', { action: 'start', homeId: 'h1' }); assert.equal(r.body.error.code, 'no_designs_left'); ok('restyles stop after 1 design + 3 restyles');

r = await call(A, '/api/billing', { action: 'topup', homeId: 'h1' }); r = await pay(A, { orderId: r.body.orderId });
assert.equal((await me(A)).homes.h1.changes_left, 43); ok('top-up adds 15 changes');

// someone else can't touch this home
const X = '99999999-aaaa-4aaa-8aaa-000000000009';
r = await ai(X, { kind: 'edit', homeId: 'h1', prompt: 'You are editing' }); assert.equal(r.status, 403);
r = await call(X, '/api/generate', { action: 'finish', genId: gen }); assert.equal(r.status, 404); ok("other accounts can't use your home or runs");

// upgrade offer applies within 7 days of buying a pass
r = await call(A, '/api/billing', { action: 'subscribe', plan: 'pro' }); assert.equal(r.body.offerApplied, true); ok('Home Pass buyer gets the upgrade offer on Pro');

// --- designer on Pro ---
const P = '22222222-bbbb-4bbb-8bbb-000000000002';
r = await call(P, '/api/billing', { action: 'subscribe', plan: 'pro' }); assert.equal(r.body.offerApplied, false);
const subId = r.body.subscriptionId;
r = await pay(P, { subscriptionId: subId }); assert.equal(r.status, 200);
let m = await me(P); assert.equal(m.sub.active, true); assert.equal(m.sub.homes_limit, 6); ok('Pro subscription activates after verified payment');
for (let i = 1; i <= 6; i++) {
  await ai(P, { kind: 'plan_read', homeId: 'p' + i, prompt: 'You are an architectural draftsperson', images: ['data:image/png;base64,' + Buffer.from('plan' + i).toString('base64')] });
  r = await call(P, '/api/generate', { action: 'start', homeId: 'p' + i }); assert.equal(r.status, 200, JSON.stringify(r.body));
  await ai(P, { kind: 'design', genId: r.body.genId, prompt: FURNISH }); await call(P, '/api/generate', { action: 'finish', genId: r.body.genId });
}
await ai(P, { kind: 'plan_read', homeId: 'p7', prompt: 'You are an architectural draftsperson', images: [IMG2] });
r = await call(P, '/api/generate', { action: 'start', homeId: 'p7' }); assert.equal(r.body.error.code, 'homes_limit'); ok('Pro stops at 6 new homes a month');
r = await call(P, '/api/generate', { action: 'start', homeId: 'p1' }); assert.equal(r.status, 200); assert.equal(r.body.source, 'pro_restyle');
await call(P, '/api/generate', { action: 'finish', genId: r.body.genId }); ok('restyling a Pro home is free');
r = await call(P, '/api/billing', { action: 'pass', homeId: 'p7' }); assert.equal(r.status, 409); ok("Pro users aren't sold a Home Pass");

// new billing period via webhook resets usage
const sub = await (await fetch('http://localhost:4002/test/sub', { method: 'POST', body: JSON.stringify({ id: subId }) })).json();
const next = { ...sub, current_start: sub.current_start + 30 * 86400, current_end: sub.current_end + 30 * 86400 };
const raw = JSON.stringify({ event: 'subscription.charged', payload: { subscription: { entity: next } } });
r = await fetch(B + '/api/razorpay-webhook', { method: 'POST', headers: { 'x-razorpay-signature': 'bad' }, body: raw }); assert.equal(r.status, 400); ok('webhook with a bad signature is rejected');
r = await fetch(B + '/api/razorpay-webhook', { method: 'POST', headers: { 'x-razorpay-signature': createHmac('sha256', 'whsec').update(raw).digest('hex') }, body: raw }); assert.equal(r.status, 200);
m = await me(P); assert.equal(m.sub.homes_used, 0); ok('renewal webhook resets the month');

// cancel → view-only after the period ends
r = await call(P, '/api/billing', { action: 'cancel' }); assert.equal(r.body.me.sub.cancel_at_period_end, true);
const ended = { ...next, status: 'cancelled', current_end: Math.floor(Date.now() / 1000) - 60 };
const raw2 = JSON.stringify({ event: 'subscription.cancelled', payload: { subscription: { entity: ended } } });
await fetch(B + '/api/razorpay-webhook', { method: 'POST', headers: { 'x-razorpay-signature': createHmac('sha256', 'whsec').update(raw2).digest('hex') }, body: raw2 });
m = await me(P); assert.equal(m.sub.active, false); assert.equal(m.homes.p1.editable, false);
r = await ai(P, { kind: 'edit', homeId: 'p1', prompt: 'You are editing' }); assert.equal(r.error.code, 'sub_inactive'); ok('after cancelling, Pro homes become view-only');

// free limits
const F = '33333333-cccc-4ccc-8ccc-000000000003';
for (let i = 0; i < 10; i++) await ai(F, { kind: 'plan_read', homeId: 'f' + i, prompt: 'You are an architectural draftsperson', images: [IMG] });
r = await ai(F, { kind: 'plan_read', homeId: 'f10', prompt: 'You are an architectural draftsperson', images: [IMG] }); assert.equal(r.status, 429); ok('free plan reads are capped at 10 a day');
r = await ai(F, { kind: 'bogus', homeId: 'f1', prompt: 'x' }); assert.equal(r.status, 400); ok('unknown request types are rejected');

// the guide
r = await ai(F, { kind: 'guide', homeId: 'sample-home', prompt: 'You are Mira, the guide inside Mirage. VISITOR SAYS: "show me the kitchen"' });
assert.ok(r.done && r.json.actions[0].do === 'go'); assert.equal(calls.at(-1).model, 'claude-haiku-4-5-20251001'); ok('guide chat works on the fast model');

// photo-real renders
const VIEW = 'data:image/jpeg;base64,' + Buffer.from('view').toString('base64');
r = await call(F, '/api/render', { homeId: 'sample-home', image: VIEW, room: 'Living / Dining', roomType: 'living', style: 'Modern Indian', time: 'golden', w: 1280, h: 720 });
assert.equal(r.status, 200); assert.ok(r.body.image.startsWith('data:image/jpeg')); assert.equal(r.body.tier, 'free');
const fc = calls.filter(c => c.fal).at(-1); assert.equal(fc.auth, 'Key fal_test'); assert.equal(fc.ratio, '16:9'); assert.ok(fc.hasImage); assert.match(fc.prompt, /Keep EXACTLY the same camera angle/); ok('free render works, sends Key auth, the view and a 16:9 frame');
r = await call(F, '/api/render', { homeId: 'sample-home', image: VIEW, style: 'FAILME' }); assert.equal(r.status, 502); assert.equal(r.body.error.code, 'render_failed');
r = await call(F, '/api/render', { homeId: 'sample-home', image: VIEW }); assert.equal(r.status, 200); ok('a failed render is not counted');
// Mira's premium voice
r = await call(F, '/api/voice', { text: 'Welcome home.' }); assert.equal(r.status, 200); assert.equal(r.body.url, 'https://fal.test/mira.mp3');
assert.match(calls.filter(c => c.fal).at(-1).fal, /elevenlabs/); ok('Mira speaks in the premium voice through fal');
r = await call(F, '/api/voice', { text: 'x'.repeat(500) }); assert.equal(r.status, 413); ok('overlong voice lines are refused');
r = await call(F, '/api/render', { homeId: 'sample-home', image: VIEW }); assert.equal(r.status, 402); assert.equal(r.body.error.code, 'render_limit'); ok('free renders are capped at 2 a day');
r = await call(A, '/api/render', { homeId: 'h1', image: VIEW, room: 'Bedroom 2' }); assert.equal(r.status, 200); assert.equal(r.body.tier, 'pass'); ok('Home Pass homes render on their own allowance');
r = await call(F, '/api/render', { homeId: 'h1', image: VIEW }); assert.equal(r.status, 403); ok("you can't render someone else's home");
r = await call(A, '/api/render', { homeId: 'h1', image: 'https://evil.example/x.png' }); assert.equal(r.status, 400); ok('only an image of the view is accepted');
delete process.env.FAL_KEY; r = await call(A, '/api/render', { homeId: 'h1', image: VIEW }); assert.equal(r.status, 503); process.env.FAL_KEY = 'fal_test'; ok('without FAL_KEY renders are cleanly off');

// --- collaborators ---
const ED = '77777777-eeee-4eee-8eee-000000000001', VW = '77777777-eeee-4eee-8eee-000000000002', NO = '77777777-eeee-4eee-8eee-000000000003', em = u => `${u}@test.local`;
r = await call(ED, '/api/share', { homeId: 'h1', action: 'invite', email: em(VW), role: 'viewer' }); assert.equal(r.status, 403); ok('only invited people can touch a home');
r = await call(A, '/api/share', { homeId: 'h1', action: 'invite', email: 'not-an-email', role: 'viewer' }); assert.equal(r.status, 400);
r = await call(A, '/api/share', { homeId: 'h1', action: 'invite', email: em(ED), role: 'owner' }); assert.equal(r.status, 400); ok('invites need a real email and a known role');
r = await call(A, '/api/share', { homeId: 'h1', action: 'invite', email: em(ED).toUpperCase(), role: 'editor' }); assert.equal(r.status, 200); assert.equal(r.body.members[0].email, em(ED));
r = await call(A, '/api/share', { homeId: 'h1', action: 'invite', email: em(VW), role: 'commenter' });
r = await call(A, '/api/share', { homeId: 'h1', action: 'role', email: em(VW), role: 'viewer' }); assert.equal(r.body.members.length, 2); assert.equal(r.body.members[1].role, 'viewer'); ok('owner invites by email and changes roles');
r = await call(ED, '/api/share', { homeId: 'h1', action: 'invite', email: em(NO), role: 'editor' }); assert.equal(r.status, 403); ok('editors cannot invite others');
r = await call(VW, '/api/share?home=h1'); assert.equal(r.body.role, 'viewer'); assert.equal(r.body.members.length, 2); assert.equal(r.body.owner, `${A}@test.local`);
assert.equal((await me(ED)).shared[0].role, 'editor'); assert.equal((await me(A)).homes.h1.members, 2); ok('members see the home in their list, the owner sees the count');
r = await call(VW, '/api/homedata?home=h1'); assert.equal(r.body.version, 0); assert.equal(r.body.data, null);
r = await call(VW, '/api/homedata', { homeId: 'h1', version: 0, data: { name: 'x', layout: {} } }, 'PUT'); assert.equal(r.status, 403); ok('viewers cannot save');
r = await call(A, '/api/homedata', { homeId: 'h1', version: 0, data: { name: 'Sea View 4BHK', layout: { walls: [], rooms: [], furniture: [] } } }, 'PUT'); assert.equal(r.body.version, 1);
r = await call(ED, '/api/homedata', { homeId: 'h1', version: 0, data: { name: 'stale', layout: {} } }, 'PUT'); assert.equal(r.status, 409); assert.equal(r.body.error.version, 1); ok('a stale save is refused with 409');
r = await call(ED, '/api/homedata', { homeId: 'h1', version: 1, data: { name: 'Sea View 4BHK', layout: { walls: [1], rooms: [], furniture: [] } } }, 'PUT'); assert.equal(r.body.version, 2);
r = await call(VW, '/api/homedata?home=h1&since=2'); assert.equal(r.body.same, true);
r = await call(VW, '/api/homedata?home=h1&since=1'); assert.equal(r.body.data.layout.walls[0], 1); assert.equal(r.body.updated_by, em(ED)); ok('editors save, viewers pull the new version and see who changed it');
assert.equal((await me(ED)).shared[0].name, 'Sea View 4BHK');
r = await call(NO, '/api/homedata?home=h1'); assert.equal(r.status, 403); ok('strangers cannot read a shared home');
let before = (await me(A)).homes.h1.changes_left;
r = await ai(ED, { kind: 'edit', homeId: 'h1', prompt: 'You are editing a furnished 3D model' }); assert.ok(r.done); assert.ok(r.meta?.editId);
assert.equal((await me(A)).homes.h1.changes_left, before - 1); ok("an editor's change is paid from the owner's plan");
r = await ai(ED, { kind: 'edit_followup', editId: r.meta.editId, prompt: FURNISH }); assert.ok(r.done); ok('editors can finish a change with room redos');
r = await ai(VW, { kind: 'edit', homeId: 'h1', prompt: 'You are editing' }); assert.equal(r.status, 403); ok('viewers cannot change the home');
r = await call(VW, '/api/comments', { homeId: 'h1', text: 'Love this' }); assert.equal(r.status, 403);
await call(A, '/api/share', { homeId: 'h1', action: 'role', email: em(VW), role: 'commenter' });
r = await call(VW, '/api/comments', { homeId: 'h1', text: 'Can the sofa face the window?', room: 'Living / Dining', x: 10.123, y: 3, z: 12 }); assert.equal(r.status, 200); assert.equal(r.body.comment.x, 10.12);
const cid = r.body.comment.id; r = await call(ED, '/api/comments?home=h1'); assert.equal(r.body.comments.length, 1); assert.equal(r.body.comments[0].author, em(VW)); ok('commenters pin comments, everyone sees them');
r = await call(NO, '/api/comments', { id: cid, resolved: true }, 'PATCH'); assert.equal(r.status, 403);
r = await call(ED, '/api/comments', { id: cid, resolved: true }, 'PATCH'); assert.equal(r.status, 200); assert.equal((await call(A, '/api/comments?home=h1')).body.comments[0].resolved, true); ok('editors resolve comments; strangers cannot');
await call(A, '/api/share', { homeId: 'h1', action: 'remove', email: em(VW) });
assert.equal((await me(VW)).shared.length, 0); assert.equal((await call(VW, '/api/homedata?home=h1')).status, 403); ok('removing someone ends their access');
r = await call(ED, '/api/share', { homeId: 'h1', action: 'remove', email: em(ED) }); assert.equal(r.status, 200); assert.equal((await me(ED)).shared.length, 0); ok('a member can leave a shared home');

// --- free mode: everything unlocked, with daily caps ---
process.env.FREE_MODE = 'on';
const G = '88888888-ffff-4fff-8fff-000000000001';
assert.equal((await (await fetch(B + '/api/config', { cache: 'no-store' })).json()).free, true);
await ai(G, { kind: 'plan_read', homeId: 'g1', prompt: 'You are an architectural draftsperson', images: ['data:image/png;base64,' + Buffer.from('free-plan').toString('base64')] });
r = await call(G, '/api/generate', { action: 'start', homeId: 'g1' }); assert.equal(r.status, 200); ok('free mode: designing needs no plan or payment');
let gid = r.body.genId; r = await ai(G, { kind: 'design', genId: gid, prompt: FURNISH }); assert.ok(r.json.items.length > 0); await call(G, '/api/generate', { action: 'finish', genId: gid });
r = await ai(G, { kind: 'edit', homeId: 'g1', prompt: 'You are editing a furnished 3D model' }); assert.ok(r.done); assert.equal((await me(G)).homes.g1.editable, true); ok('free mode: changes work and the home is editable');
r = await ai(G, { kind: 'edit', homeId: 'g1', prompt: 'You are editing NOOP' }); assert.ok(r.done); r = await ai(G, { kind: 'refurnish', homeId: 'g1', prompt: FURNISH }); assert.ok(r.done); ok('free mode: refunds and room redos need no balance');
for (let i = 0; i < 4; i++) { const x = await call(G, '/api/generate', { action: 'start', homeId: 'g1' }); assert.equal(x.status, 200); await ai(G, { kind: 'design', genId: x.body.genId, prompt: FURNISH }); await call(G, '/api/generate', { action: 'finish', genId: x.body.genId }); }
r = await call(G, '/api/generate', { action: 'start', homeId: 'g1' }); assert.equal(r.status, 429); ok('free mode: designs are capped at 5 a day per account');
r = await ai(A, { kind: 'plan_read', homeId: 'h1', prompt: 'You are an architectural draftsperson', images: [IMG] }); assert.ok(r.done); ok('free mode leaves existing paid homes working');
// --- guest mode: no sign-in ---
const gcall = async (secret, path, data) => { const r = await fetch(B + path, { method: data ? 'POST' : 'GET', headers: { authorization: 'Bearer guest:' + secret, 'content-type': 'application/json' }, body: data ? JSON.stringify(data) : undefined }); return { status: r.status, body: await r.json() }; };
const S1 = 'guestsecret_AAAAAAAAAAAAAAAAAAAA', S2 = 'guestsecret_BBBBBBBBBBBBBBBBBBBB';
assert.equal((await (await fetch(B + '/api/config', { cache: 'no-store' })).json()).guest, true);
r = await gcall(S1, '/api/me'); assert.equal(r.status, 200); assert.equal(r.body.user.guest, true); const gid1 = r.body.user.id;
assert.match(gid1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/); assert.notEqual((await gcall(S2, '/api/me')).body.user.id, gid1); ok('guests get their own account with no sign-in');
assert.equal((await gcall('short', '/api/me')).status, 401); ok('a weak guest key is refused');
r = await fetch(B + '/api/ai', { method: 'POST', headers: { authorization: 'Bearer guest:' + S1, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'plan_read', homeId: 'guest-home', prompt: 'You are an architectural draftsperson', images: ['data:image/png;base64,' + Buffer.from('guest-plan').toString('base64')] }) }); assert.equal(r.status, 200); await r.text();
r = await gcall(S1, '/api/generate', { action: 'start', homeId: 'guest-home' }); assert.equal(r.status, 200); await gcall(S1, '/api/generate', { action: 'finish', genId: r.body.genId }); ok('a guest can read a plan and start a design');
assert.equal((await gcall(S2, '/api/generate', { action: 'start', homeId: 'guest-home' })).status, 403); ok("one guest cannot touch another guest's home");
process.env.SITE_DESIGNS_PER_DAY = '1'; process.env.GUEST_MODE = 'off';
assert.equal((await gcall('guestsecret_CCCCCCCCCCCCCCCCCCCC', '/api/me')).status, 401); ok('GUEST_MODE=off requires sign-in again'); delete process.env.GUEST_MODE; delete process.env.SITE_DESIGNS_PER_DAY;
process.env.FREE_MODE = 'off';

// launch tiers step up: simulate sales until the first tier is gone
for (let i = 0; i < 4; i++) { const u = `55555555-dddd-4ddd-8ddd-00000000000${i}`; await ai(u, { kind: 'plan_read', homeId: 'L' + i, prompt: 'You are an architectural draftsperson', images: ['data:image/png;base64,' + Buffer.from('L' + i).toString('base64')] }); const o = await call(u, '/api/billing', { action: 'pass', homeId: 'L' + i }); await pay(u, { orderId: o.body.orderId }); }
cfg = await (await fetch(B + '/api/config')).json(); assert.equal(cfg.launch.amount, 249900); assert.equal(cfg.launch.spotsLeft, 45); ok('after 5 sales the price steps up to ₹2,499 for the next 45');
process.env.LAUNCH_OFFER = 'off'; cfg = await (await fetch(B + '/api/config')).json(); assert.equal(cfg.launch.active, false); assert.equal(cfg.launch.amount, 399900); ok('LAUNCH_OFFER=off returns to ₹3,999'); delete process.env.LAUNCH_OFFER;

console.log(`\nAll ${step} checks passed.`);
fakes.close(); process.exit(0);
