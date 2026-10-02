// POST /api/render { homeId, image: dataURL (the current 3D view), room?, roomType?, style?, time? } → { image: dataURL, tier }
// Turns the view into a photo-real image of the same room. The prompt is built here, so the endpoint can't be used as a general image generator.
import { requireUser } from './_lib/auth.js';
import { route, body, json, HttpError } from './_lib/http.js';
import { allowRender, settleRender } from './_lib/entitle.js';
import { falImage, nearestRatio } from './_lib/fal.js';
import { env } from './_lib/env.js';
import * as G from './_lib/guest.js';

const clean = (s, n) => String(s || '').replace(/[\r\n<>{}]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const TIMES = { dusk: 'dusk just after sunset, peach and lavender sky with a city skyline outside, every interior light on: warm 2700K cove lights, LED strips glowing under shelves and along wall panels, wall-washer downlights, pendants',  day: 'bright natural daylight', golden: 'warm late-afternoon golden-hour sunlight', night: 'evening with warm interior lamps and cove lights on, dark sky outside' };

export function renderPrompt({ room, roomType, style, time }) {
  const where = clean(room, 40) || 'room', kind = clean(roomType, 30), st = clean(style, 400);
  return [
    `Turn this 3D render into a real photograph of the same finished ${kind && kind !== where.toLowerCase() ? kind + ' (' + where + ')' : where}.`,
    'Keep EXACTLY the same camera angle, room shape, walls, ceiling, windows and doors, and the same position, size, shape and colour of every piece of furniture, light and object. Do not add, remove or move anything.',
    'Make every material real: true wood grain, veined natural stone, woven and velvet fabric texture with soft folds, brushed brass, real glass reflections, fine plaster.',
    `Lighting: ${TIMES[time] || TIMES.golden}, soft realistic shadows and bounce light, warm light pooling from lamps and cove lighting.`,
    st ? `Design style: ${st}.` : '',
    'Architectural Digest interior photography, full-frame camera, 24mm lens, natural colour grading, crisp detail. No people, no text, no watermark.',
  ].filter(Boolean).join(' ');
}

export const POST = route(async req => {
  const user = await requireUser(req);
  const b = await body(req, 6_000_000);
  if (typeof b.image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(b.image)) throw new HttpError(400, 'bad_request', 'Send the current view as an image.');
  if (b.image.length > 5_000_000) throw new HttpError(413, 'prompt_too_large', 'That view is too large. Try a smaller window.');
  if (!env('FAL_KEY')) throw new HttpError(503, 'renders_off', 'Photo-real renders are not switched on yet.');
  let tier = 'free', usageId = null;
  if (user.guest) G.take(user.id, 'render'); else ({ tier, usageId } = await allowRender(user.id, b.homeId ? String(b.homeId).slice(0, 80) : null));
  const w = +b.w || 16, h = +b.h || 9;
  try {
    const image = await falImage({ prompt: renderPrompt(b), image_url: b.image, guidance_scale: 3.5, num_images: 1, output_format: 'jpeg', safety_tolerance: '2', aspect_ratio: nearestRatio(w / h), ...(Number.isInteger(b.seed) ? { seed: b.seed } : {}) });
    if (usageId) await settleRender(usageId, true);
    return json({ image, tier });
  } catch (e) { if (usageId) await settleRender(usageId, false); else G.giveBack(user.id, 'render'); throw e; }
});
