// Local server that behaves like Vercel: static files from public/, /api/<name> → api/<name>.js.
// Usage: node scripts/dev.mjs   (reads .env.local if present)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env.local'))) for (const line of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8' };

async function api(req, res, name) {
  const file = join(root, 'api', name + '.js');
  if (!existsSync(file) || name.startsWith('_')) { res.writeHead(404).end('not found'); return; }
  const mod = await import(pathToFileURL(file).href);
  const fn = mod[req.method]; if (!fn) { res.writeHead(405).end(); return; }
  const chunks = []; for await (const c of req) chunks.push(c);
  const ac = new AbortController(); res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks), signal: ac.signal });
  const out = await fn(request);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  if (!out.body) return res.end();
  const reader = out.body.getReader();
  try { for (; ;) { const { value, done } = await reader.read(); if (done) break; res.write(value); } } catch { }
  res.end();
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url.pathname.slice(5).replace(/\/$/, ''));
    let p = join(root, 'public', decodeURIComponent(url.pathname));
    if (!p.startsWith(join(root, 'public'))) { res.writeHead(403).end(); return; }
    try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html'); } catch { if (existsSync(p + '.html')) p += '.html'; }
    const data = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', ...(extname(p) === '.glb' ? { 'cache-control': 'public, max-age=604800' } : {}) }).end(data);
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404).end('not found'); return; }
    console.error(e); res.writeHead(500).end('error');
  }
}).listen(PORT, () => console.log(`Mirage running at http://localhost:${PORT}`));
