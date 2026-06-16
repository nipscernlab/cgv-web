#!/usr/bin/env node
// Downloads JiveXML sample files from the GitHub Release into public/default_xml/
// and writes public/default_xml/index.json from the manifest.
// Idempotent: skips files whose SHA-256 already matches the manifest.
// Usage:
//   node tools/scripts/fetch-samples.mjs

import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = 'samples-v1';
const REPO = 'nipscernlab/cgv-web';
const BASE_URL = `https://github.com/${REPO}/releases/download/${TAG}`;

const MANIFEST = [
  {
    name: 'JiveXML_516761_840521342.xml',
    sha256: '7e3d6add6d8ccd2ce9d19593d09e9cdb04b4069f7dccab8f84f6febabefd9c6f',
  },
  {
    name: 'JiveXML_517743_4019328363.xml',
    sha256: 'baf9f4e2adc548d41e9b11ea8a8fac75cfc830faa26e59f5420a261d05d5f599',
  },
  {
    name: 'JiveXML_518084_13988232891.xml',
    sha256: '6eadda1ea9985b6b8d328d10f90458832372278d24ad5c417e82eed782535969',
  },
  {
    name: 'JiveXML_518084_14173642443.xml',
    sha256: 'c876ca39824424c066907b15e5b28da4cbf0f1b23e5da1ea1b5fed5ca6cf6000',
  },
  {
    name: 'JiveXML_518852_1290901901.xml',
    sha256: '8f4fefd96462f3e7961c78c70ff719d4047e0dd7ce662d710b63f2eba7b4ee44',
  },
  {
    name: 'JiveXML_520249_347152978.xml',
    sha256: 'd386d5d55f2c3967027cbb702884e2daa95b176ed3986069642c60ebb4df9f36',
  },
  {
    name: 'JiveXML_520526_399935948.xml',
    sha256: '6e4b7a73e0bd97aa442881886dd6a6d2a1f7752861749881edb3c7290b97fd55',
  },
  {
    name: 'JiveXML_520534_4444305398.xml',
    sha256: '7f6887008af33e1e52c7a2dcbc0202cc18f10af2203d02d902243ca011d524da',
  },
];

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = join(PROJECT_ROOT, 'public', 'default_xml');

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
  const label = entry.name.padEnd(36);

  if (await fileExists(dest)) {
    const have = await sha256OfFile(dest);
    if (have === entry.sha256) {
      console.log(`${C.dim}✓ ${label} cached${C.reset}`);
      return true;
    }
    console.log(`${C.yellow}↻ ${label} stale, re-downloading${C.reset}`);
    await unlink(dest);
  }

  process.stdout.write(`${C.dim}↓${C.reset} ${label} `);
  const url = `${BASE_URL}/${entry.name}`;
  let res;
  try {
    res = await fetchWithRetry(url);
  } catch (err) {
    // An entry listed in the manifest but not (yet) uploaded to the release
    // answers 404. Don't let one missing sample abort the entire deploy:
    // skip it with a warning and leave it out of index.json. It reappears
    // automatically once the asset is uploaded. Genuine failures (checksum
    // mismatch, network, other HTTP codes) still fail the build below.
    if (/HTTP 404\b/.test(err.message)) {
      console.log(`${C.yellow}missing in release — skipped${C.reset}`);
      return false;
    }
    throw err;
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));

  const got = await sha256OfFile(dest);
  if (got !== entry.sha256) {
    await unlink(dest);
    throw new Error(
      `checksum mismatch for ${entry.name}\n  expected ${entry.sha256}\n  got      ${got}`,
    );
  }
  console.log(`${C.green}done${C.reset}`);
  return true;
}

async function writeIndex(names) {
  const indexPath = join(OUT_DIR, 'index.json');
  await writeFile(indexPath, JSON.stringify(names) + '\n');
  console.log(`${C.dim}✓ index.json written (${names.length} entries)${C.reset}`);
}

async function main() {
  console.log(`Fetching ${MANIFEST.length} sample(s) from release ${TAG} → ${OUT_DIR}`);
  await mkdir(OUT_DIR, { recursive: true });

  const present = [];
  const missing = [];
  for (const entry of MANIFEST) {
    if (await fetchOne(entry)) present.push(entry.name);
    else missing.push(entry.name);
  }

  // index.json only lists samples actually available, so the UI never offers a
  // file the server can't deliver.
  await writeIndex(present);

  if (missing.length) {
    console.log(
      `${C.yellow}warning: ${missing.length} sample(s) not in release ${TAG}, omitted: ${missing.join(', ')}${C.reset}`,
    );
  }
}

main().catch((err) => {
  console.error(`${C.red}error:${C.reset} ${err.message}`);
  process.exit(1);
});
