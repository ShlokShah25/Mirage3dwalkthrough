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

// Mira's voice: ElevenLabs through fal. Returns a URL to an mp3 of the line.
export async function falSpeech(text, { voice = env('MIRA_VOICE', 'Charlotte'), timeoutMs = 30000 } = {}) {
  const key = env('FAL_KEY'); if (!key) throw new HttpError(503, 'voice_off', 'The premium voice is not switched on.');
  const url = env('FAL_URL', 'https://fal.run').replace(/\/$/, '') + '/' + env('FAL_TTS_MODEL', 'fal-ai/elevenlabs/tts/multilingual-v2');
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', signal: ac.signal, headers: { authorization: 'Key ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ text, voice, stability: .45, similarity_boost: .8, style: .3, speed: 1 }) });
    const j = await r.json().catch(() => ({}));
    const out = j.audio?.url || j.audio_url?.url || j.audio_url;
    if (!r.ok || !out) {
      // say which kind of failure it is, so the app can tell the owner why her voice is off (never the provider's own words)
      const said = JSON.stringify(j).slice(0, 300); console.error('fal tts', r.status, said);
      const code = /balance|exhaust|locked|credit|payment|billing/i.test(said) || r.status === 402 ? 'voice_credit' : r.status === 401 || r.status === 403 ? 'voice_key' : r.status === 429 ? 'voice_busy' : 'voice_failed';
      throw new HttpError(502, code, 'Voice unavailable right now.');
    }
    return out;
  } catch (e) { if (e?.name === 'AbortError') throw new HttpError(504, 'voice_failed', 'Voice took too long.'); throw e; }
  finally { clearTimeout(t); }
}
