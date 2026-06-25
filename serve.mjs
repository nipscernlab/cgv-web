#!/usr/bin/env node
// Zero-dependency static server for the cgvweb-enmc snapshot (c8905eb + ported cinema).
// Correct MIME: application/wasm, application/gzip (raw bytes for the in-page
// DecompressionStream — NO Content-Encoding). Optional browser auto-open.
//   node serve.mjs            # port 8093, opens browser
//   node serve.mjs --no-open  --port 3000
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const ap = process.argv.indexOf('--port');
const PORT = Number(process.env.PORT) || (ap !== -1 ? Number(process.argv[ap + 1]) : 0) || 8093;
const NO_OPEN = process.argv.includes('--no-open');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.gz': 'application/gzip', '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};
createServer(async (req, res) => {
  let rel = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  if (rel === '/' || rel === '\\' || rel === '') rel = '/index.html';
  const fp = join(ROOT, rel);
  if (fp !== ROOT && !fp.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
  try {
    const st = await stat(fp);
    if (st.isDirectory()) { res.writeHead(301, { Location: rel.replace(/\/?$/, '/') + 'index.html' }); return res.end(); }
    const h = { 'Content-Type': MIME[extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' };
    if (req.method === 'HEAD') { res.writeHead(200, h); return res.end(); }
    res.writeHead(200, h); createReadStream(fp).pipe(res);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end(`404 ${rel}\n`); }
}).listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\ncgvweb-enmc (c8905eb + ported cinema) at:\n  ${url}\nCtrl+C to stop.`);
  if (!NO_OPEN) { try { const c = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]; spawn(c[0], c[1], { stdio: 'ignore', detached: true }).unref(); } catch {} }
}).on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `port ${PORT} in use` : e.message); process.exit(1); });
