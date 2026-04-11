// Simple static file server for testing the WASM app
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = 8787;

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.wasm': 'application/wasm',
  '.css':  'text/css',
  '.json': 'application/json',
};

createServer(async (req, res) => {
  let url = req.url === '/' ? '/index.html' : req.url;
  // Serve www/ for html/js files, pkg/ for wasm/js pkg files
  let filePath;
  if (url.startsWith('/pkg/')) {
    filePath = join(__dir, url);
  } else {
    filePath = join(__dir, 'www', url);
  }

  try {
    const data = await readFile(filePath);
    const ext  = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found: ' + url);
  }
}).listen(PORT, () => {
  console.log(`ATLAS ID Parser running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
