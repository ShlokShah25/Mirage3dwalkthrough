// POST /api/voice { text } → { url } — one spoken line in Mira's premium voice (ElevenLabs via fal).
// Only for Mira's own lines inside the app; capped per day, and the app falls back to the device voice on any error.
import { requireUser } from './_lib/auth.js';
import { route, body, json, HttpError } from './_lib/http.js';
import { allowVoice } from './_lib/entitle.js';
import { falSpeech } from './_lib/fal.js';
import { PRICING } from './_lib/env.js';

export const POST = route(async req => {
  const user = await requireUser(req);
  const b = await body(req, 8000);
  const text = String(b.text || '').replace(/[<>{}]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) throw new HttpError(400, 'bad_request', 'Nothing to say.');
  if (text.length > PRICING.voice.maxChars) throw new HttpError(413, 'prompt_too_large', 'That line is too long to speak.');
  await allowVoice(user.id);
  return json({ url: await falSpeech(text) });
});
