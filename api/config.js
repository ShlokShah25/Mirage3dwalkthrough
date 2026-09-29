// GET /api/config — public keys and prices for the browser.
import { json } from './_lib/http.js';
import { publicConfig } from './_lib/env.js';
import { launchState } from './_lib/entitle.js';

export const GET = async () => {
  let launch = null; try { launch = await launchState(); } catch (e) { console.error('launch state', e); }
  return json(publicConfig(launch), 200, { 'cache-control': 'public, max-age=20' });
};
