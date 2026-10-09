// Forge: organic shapes (figurines, sculptures, anything that is not built from exact geometry).
// POST /api/mesh { prompt } or { image: dataURL } → { job }        starts the work; a description is first turned into a picture
// GET  /api/mesh?job=ID                              → { state: 'working' | 'done' | 'failed' }
// GET  /api/mesh?job=ID&file=1                       → the finished mesh (GLB bytes), passed through so the browser may read it
// The picture prompt is built here, so this cannot be used as a general image generator. Jobs live in this server's memory.
import { randomUUID } from 'node:crypto';
import { requireUser } from './_lib/auth.js';
import { route, body, json, HttpError } from './_lib/http.js';
import { env, FORGE } from './_lib/env.js';
import { allowMesh } from './_lib/entitle.js';
import { falTextImage, falMeshStart, falMeshCheck } from './_lib/fal.js';
import * as G from './_lib/guest.js';

const jobs = new Map();     // id → { uid, statusUrl, responseUrl, until, state, url }
const sweep = () => { if (jobs.size < 2000) return; const now = Date.now(); for (const [k, v] of jobs) if (v.until < now) jobs.delete(k); };
const clean = (s, n) => String(s || '').replace(/[\r\n<>{}]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export const picturePrompt = what => `A single ${clean(what, 500)}, shown whole and centred as one solid object, three-quarter view from slightly above, plain matte light-grey clay material with no colour or pattern, soft even studio light, pure white seamless background, no shadow on the ground, no text, no other objects, product photo for 3D modelling.`;

export const POST = route(async req => {
  const user = await requireUser(req);
  const b = await body(req, 8_000_000);
  if (!env('FAL_KEY')) throw new HttpError(503, 'mesh_off', 'Sculpted shapes are not switched on yet.');
  const hasImage = typeof b.image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(b.image), words = clean(b.prompt, 500);
  if (!hasImage && words.length < 3) throw new HttpError(400, 'bad_request', 'Describe the shape, or add a picture of it.');
  if (hasImage && b.image.length > 6_000_000) throw new HttpError(413, 'prompt_too_large', 'That picture is too large. Try a smaller one.');
  if (user.guest) G.take(user.id, 'model_mesh'); else await allowMesh(user.id, FORGE.meshesPerDay);
  try {
    const picture = hasImage ? b.image : await falTextImage(picturePrompt(words), FORGE.imageModel());
    const job = await falMeshStart(picture, FORGE.meshModel());
    sweep(); const id = 'm_' + randomUUID(); jobs.set(id, { uid: user.id, ...job, until: Date.now() + 3600e3, state: 'working', url: null });
    return json({ job: id, picture: hasImage ? null : picture });
  } catch (e) { if (user.guest) G.giveBack(user.id, 'model_mesh'); throw e; }
});

export const GET = route(async req => {
  const user = await requireUser(req);
  const u = new URL(req.url), j = jobs.get(u.searchParams.get('job') || '');
  if (!j || j.uid !== user.id) throw new HttpError(404, 'not_found', 'That shape is no longer here. Make it again.');
  if (j.state === 'working') { const s = await falMeshCheck(j); j.state = s.state; j.url = s.url || null; if (s.state === 'working') return json({ state: 'working', queue: s.queue ?? null }); }
  if (j.state !== 'done') return json({ state: 'failed' });
  if (!u.searchParams.get('file')) return json({ state: 'done' });
  const r = await fetch(j.url); if (!r.ok) throw new HttpError(502, 'mesh_failed', 'The finished shape could not be fetched. Try again.');
  const bytes = new Uint8Array(await r.arrayBuffer()); if (bytes.length > 60_000_000) throw new HttpError(502, 'mesh_failed', 'The finished shape is too large to open here.');
  return new Response(bytes, { status: 200, headers: { 'content-type': 'model/gltf-binary', 'cache-control': 'no-store' } });
});
