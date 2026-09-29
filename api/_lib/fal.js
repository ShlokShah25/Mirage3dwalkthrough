// fal.ai image model client (Flux Kontext by default): turns a 3D view into a photo-real image of the same room.
import { env } from './env.js';
import { HttpError } from './http.js';

const RATIOS = { '21:9': 21 / 9, '16:9': 16 / 9, '3:2': 1.5, '4:3': 4 / 3, '1:1': 1, '3:4': .75, '2:3': 2 / 3, '9:16': 9 / 16 };
export const nearestRatio = r => Object.entries(RATIOS).sort((a, b) => Math.abs(Math.log(a[1] / r)) - Math.abs(Math.log(b[1] / r)))[0][0];

export async function falImage(input, { timeoutMs = 120000 } = {}) {
  const key = env('FAL_KEY'); if (!key) throw new HttpError(503, 'renders_off', 'Photo-real renders are not switched on yet.');
  const url = env('FAL_URL', 'https://fal.run').replace(/\/$/, '') + '/' + env('FAL_MODEL', 'fal-ai/flux-pro/kontext');
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', signal: ac.signal, headers: { authorization: 'Key ' + key, 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('fal', r.status, JSON.stringify(j).slice(0, 400)); throw new HttpError(502, 'render_failed', 'The photo-real render did not work this time. You have not been charged. Try again.'); }
    if (j.has_nsfw_concepts?.[0]) throw new HttpError(422, 'render_failed', 'That view could not be rendered. Try a different angle.');
    const out = j.images?.[0]?.url; if (!out) throw new HttpError(502, 'render_failed', 'The render came back empty. You have not been charged. Try again.');
    if (out.startsWith('data:')) return out;
    const img = await fetch(out); if (!img.ok) throw new HttpError(502, 'render_failed', 'Could not fetch the rendered image. Try again.');
    const type = img.headers.get('content-type') || 'image/jpeg';
    return `data:${type};base64,` + Buffer.from(await img.arrayBuffer()).toString('base64');
  } catch (e) {
    if (e?.name === 'AbortError') throw new HttpError(504, 'render_failed', 'The render took too long. You have not been charged. Try again.');
    throw e;
  } finally { clearTimeout(t); }
}
