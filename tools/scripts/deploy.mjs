#!/usr/bin/env node
// Deploys cgv-web to the sibling nipscernweb repository.
// Works on Windows, Linux and macOS — Node ≥ 18 required (same as the project).
//
// Usage:
//   npm run deploy
//   node tools/scripts/deploy.mjs

import { cp, rm, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT       = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const NIPSCERN   = resolve(ROOT, '../nipscernweb');
const DEST       = join(NIPSCERN, 'projects', 'cgvweb');
const TWIKI_DEST = join(NIPSCERN, 'library', 'cgvweb', 'twiki');
const NODE       = process.execPath;

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m', bold: '\x1b[1m', reset: '\x1b[0m' }
  : { dim: '', green: '', red: '', cyan: '', bold: '', reset: '' };

const log = {
  step: (msg) => console.log(`\n${C.cyan}${C.bold}▸ ${msg}${C.reset}`),
  ok:   (msg) => console.log(`${C.green}  ✓${C.reset} ${msg}`),
  die:  (msg) => { console.error(`\n${C.red}error:${C.reset} ${msg}`); process.exit(1); },
};

async function countFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).length;
}

// ── Verify nipscernweb ────────────────────────────────────────────────────────
log.step('Verifying nipscernweb checkout…');
if (!existsSync(NIPSCERN)) {
  log.die(`${NIPSCERN} not found.\nClone nipscernweb next to cgv-web first.`);
}
log.ok(`Found ${NIPSCERN}`);

// ── Fetch assets from GitHub Releases ─────────────────────────────────────────
log.step('Fetching geometry from GitHub Release…');
execFileSync(NODE, [join(ROOT, 'tools/scripts/fetch-geometry.mjs')], { stdio: 'inherit', cwd: ROOT });

log.step('Fetching sample XMLs from GitHub Release…');
execFileSync(NODE, [join(ROOT, 'tools/scripts/fetch-samples.mjs')], { stdio: 'inherit', cwd: ROOT });

// ── Wipe + copy public/ → projects/cgvweb/ ────────────────────────────────────
log.step('Wiping projects/cgvweb and copying public/…');
await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });
await cp(join(ROOT, 'public'), DEST, {
  recursive: true,
  filter: (src) => !src.endsWith('.root'),
});
log.ok(`public/ → ${DEST}`);

// ── Wipe + copy tools/twiki/ → library/cgvweb/twiki/ ─────────────────────────
log.step('Wiping library/cgvweb/twiki and copying tools/twiki/…');
await rm(TWIKI_DEST, { recursive: true, force: true });
await mkdir(join(NIPSCERN, 'library', 'cgvweb'), { recursive: true });
await cp(join(ROOT, 'tools', 'twiki'), TWIKI_DEST, { recursive: true });
log.ok(`tools/twiki/ → ${TWIKI_DEST}`);

// ── Summary ───────────────────────────────────────────────────────────────────
log.step('Verifying…');
const nDest  = await countFiles(DEST);
const nTwiki = await countFiles(TWIKI_DEST);
console.log(`\n  projects/cgvweb        ${nDest} files`);
console.log(`  library/cgvweb/twiki   ${nTwiki} files`);

console.log(`
${C.green}${C.bold}Deploy complete!${C.reset}

Next steps:
  cd ../nipscernweb
  git add projects/cgvweb library/cgvweb/twiki
  git commit -m "Update CGV-Web"
  git push
`);
