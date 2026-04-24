#!/usr/bin/env node
// Downloads JiveXML sample files from the GitHub Release into default_xml/
// and writes default_xml/index.json from the manifest.
// Idempotent: skips files whose SHA-256 already matches the manifest.
// Usage:
//   node scripts/fetch-samples.mjs

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
];

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(PROJECT_ROOT, 'default_xml');

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

async function fetchOne(entry) {
  const dest = join(OUT_DIR, entry.name);
  const label = entry.name.padEnd(36);

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
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
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

async function writeIndex() {
  const indexPath = join(OUT_DIR, 'index.json');
  const names = MANIFEST.map((e) => e.name);
  await writeFile(indexPath, JSON.stringify(names) + '\n');
  console.log(`${C.dim}✓ index.json written (${names.length} entries)${C.reset}`);
}

async function main() {
  console.log(`Fetching ${MANIFEST.length} sample(s) from release ${TAG} → ${OUT_DIR}`);
  await mkdir(OUT_DIR, { recursive: true });

  for (const entry of MANIFEST) {
    await fetchOne(entry);
  }

  await writeIndex();
}

main().catch((err) => {
  console.error(`${C.red}error:${C.reset} ${err.message}`);
  process.exit(1);
});
