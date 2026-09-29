export class HttpError extends Error {
  constructor(status, code, message, extra) { super(message || code); this.status = status; this.code = code; this.extra = extra; }
}
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

export function fail(e) {
  if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message, ...(e.extra || {}) } }, e.status);
  console.error(e);
  return json({ error: { code: 'server_error', message: 'Something went wrong on our side. Try again.' } }, 500);
}

export async function body(req, max = 12_000_000) {
  const t = await req.text();
  if (t.length > max) throw new HttpError(413, 'prompt_too_large', 'The request was too large.');
  if (!t) return {};
  try { return JSON.parse(t); } catch { throw new HttpError(400, 'bad_request', 'Invalid JSON body.'); }
}

// Wrap a handler so thrown HttpErrors become JSON responses.
export const route = fn => async (req, ctx) => { try { return await fn(req, ctx); } catch (e) { return fail(e); } };
