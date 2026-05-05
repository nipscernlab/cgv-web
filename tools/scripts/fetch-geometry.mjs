#!/usr/bin/env node
// Downloads geometry assets from the GitHub Release into geometry_data/.
// Idempotent: skips files whose SHA-256 already matches the manifest.
// Usage:
//   node tools/scripts/fetch-geometry.mjs                # only what the viewer needs (~5 MB)
//   node tools/scripts/fetch-geometry.mjs --with-source  # also .root inputs (~24 MB)

import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = 'geometry-v4';
const REPO = 'nipscernlab/cgv-web';
const BASE_URL = `https://github.com/${REPO}/releases/download/${TAG}`;

// kind: 'runtime' = always fetched (viewer can't run without it)
// kind: 'source'  = only with --with-source (needed only to regenerate the .glb)
const MANIFEST = [
  {
    name: 'CaloGeometry.glb.gz',
    sha256: 'e0d4a53992a8a2150c397a56e0a1c6146ec6dd86c881ecb911a140c8e9c1ecc6',
    kind: 'runtime',
  },
  {
    name: 'CaloGeometry.root',
    sha256: '8d5467d0e88490db1ec1aa5cd20a4da4951174bb1525a04c5d90694fa262567f',
    kind: 'source',
  },
  {
    name: 'atlas.root',
    sha256: '7d66bf8c56906cab64aabd07151a403047c007b2eab4cbb2c83d10f40d0d3c46',
    kind: 'source',
  },
];

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = join(PROJECT_ROOT, 'geometry_data');

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', reset: '\x1b[0m' }
  : { dim: '', green: '', red: '', yellow: '', reset: '' };

async function sha256OfFile(path) {
  const h = createHash('sha256');
  h.update(await readFile(path));
  return h.digest('hex');
}

async function fileExists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// GitHub Releases occasionally returns 5xx for a single shard while the rest
// of the download succeeds; retry transient errors with exponential backoff
// before giving up so a one-off CDN hiccup doesn't break the whole deploy.
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 500;

async function fetchWithRetry(url) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.ok) return res;
      // 5xx + 408 (timeout) + 429 (rate limit) — retry; 4xx else — fail fast.
      const transient = res.status >= 500 || res.status === 408 || res.status === 429;
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
      if (!transient || attempt === MAX_ATTEMPTS) throw lastErr;
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_ATTEMPTS) throw err;
    }
    const delay = BASE_BACKOFF_MS * 2 ** (attempt - 1);
    process.stdout.write(`${C.yellow}retrying in ${delay}ms…${C.reset} `);
    await new Promise((r) => setTimeout(r, delay));
  }
  throw lastErr;
}

async function fetchOne(entry) {
  const dest = join(OUT_DIR, entry.name);
  const label = entry.name.padEnd(24);

  if (await fileExists(dest)) {
    const have = await sha256OfFile(dest);
    if (have === entry.sha256) {
      console.log(`${C.dim}✓ ${label} cached${C.reset}`);
      return;
    }
    console.log(`${C.yellow}↻ ${label} stale, re-downloading${C.reset}`);
    await unlink(dest);
  }

  process.stdout.write(`${C.dim}↓${C.reset} ${label} `);
  const url = `${BASE_URL}/${entry.name}`;
  const res = await fetchWithRetry(url);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));

  const got = await sha256OfFile(dest);
  if (got !== entry.sha256) {
    await unlink(dest);
    throw new Error(
      `checksum mismatch for ${entry.name}\n  expected ${entry.sha256}\n  got      ${got}`,
    );
  }
  console.log(`${C.green}done${C.reset}`);
}

async function main() {
  const withSource = process.argv.includes('--with-source');
  const targets = MANIFEST.filter((e) => e.kind === 'runtime' || withSource);

  console.log(`Fetching ${targets.length} asset(s) from release ${TAG} → ${OUT_DIR}`);
  await mkdir(OUT_DIR, { recursive: true });

  for (const entry of targets) {
    await fetchOne(entry);
  }

  if (!withSource) {
    console.log(
      `${C.dim}\nTip: run with --with-source to also fetch .root inputs ` +
        `(needed for npm run build:geom).${C.reset}`,
    );
  }
}

main().catch((err) => {
  console.error(`${C.red}error:${C.reset} ${err.message}`);
  process.exit(1);
});
