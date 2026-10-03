/* ================= site mode: talk to Mirage's own backend instead of the viewer's Claude =================
   Included only in the website build. Everything that needs the UI helpers is added later in p5_site.js. */
globalThis.__MIRAGE_SITE = (() => {
  const S = { ctx: {}, token: null, me: null, cfg: null, lastEditId: null };
  const toDataURL = b => typeof b === 'string' ? Promise.resolve(b) : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  const err = (code, message, status) => Object.assign(new Error(message || code), { code, status });

  S.api = async (path, data, method) => {
    await S.ensureAuth?.();
    const r = await fetch(path, { method: method || (data ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: data ? JSON.stringify(data) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 401) S.onSignedOut?.(); throw err(j.error?.code || 'server_error', j.error?.message || 'Something went wrong. Try again.', r.status); }
    return j;
  };

  S.sample = {
    async limits() { return { maxPromptBytes: 160000, images: { maxCount: 10, maxInputBytes: 2e7, mediaTypes: ['image/jpeg', 'image/png', 'image/webp'] } }; },
    async json(prompt, opts = {}) {
      await S.ensureAuth?.();
      const imgs = opts.images == null ? [] : Array.isArray(opts.images) ? opts.images : [opts.images];
      const images = await Promise.all(imgs.map(toDataURL));
      const ctx = { ...S.ctx };
      let r;
      try {
        r = await fetch('/api/ai', { method: 'POST', signal: opts.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + S.token }, body: JSON.stringify({ ...ctx, prompt, images }) });
      } catch (e) { if (e?.name === 'AbortError') throw err('cancelled', 'Stopped.'); throw err('network', 'Could not reach Mirage. Check your connection.'); }
      if (!r.ok || !(r.headers.get('content-type') || '').includes('event-stream')) {
        const j = await r.json().catch(() => ({})); if (r.status === 401) S.onSignedOut?.();
        const e = err(j.error?.code || 'server_error', j.error?.message, r.status); S.onError?.(e); throw e;
      }
      const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', text = '', result = null;
      try {
        for (; ;) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true }); let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const line = buf.slice(0, i).split('\n').find(l => l.startsWith('data:')); buf = buf.slice(i + 2); if (!line) continue;
            const o = JSON.parse(line.slice(5));
            if (o.t) { text += o.t; opts.onText?.({ text, delta: o.t }); }
            else if (o.error) { const e = err(o.error.code, o.error.message, 0); S.onError?.(e); throw e; }
            else if (o.done) result = o;
          }
        }
      } catch (e) { if (e?.name === 'AbortError') throw err('cancelled', 'Stopped.'); throw e; }
      if (!result) throw err('empty_completion', 'No answer came back. Try again.');
      if (result.meta?.editId) S.lastEditId = result.meta.editId;
      S.refreshSoon?.();
      return result.json;
    },
  };
  return S;
})();
