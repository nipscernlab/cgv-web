#!/usr/bin/env node
/**
 * setup.mjs — prepara setup/lib/geobase.mjs e setup/lib/csg.mjs com imports corrigidos.
 * Execute a partir da raiz do projeto, após: npm install jsroot --ignore-scripts
 *   node setup/setup.mjs
 */
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const SRC  = join(PROJECT_ROOT, 'node_modules/jsroot/modules/geom');
const DEST = join(__dirname, 'lib');

mkdirSync(DEST, { recursive: true });

function patch(filename, replacements) {
  const srcPath  = `${SRC}/${filename}`;
  const destPath = `${DEST}/${filename}`;
  let content = readFileSync(srcPath, 'utf8');
  for (const [from, to] of replacements)
    content = content.replaceAll(from, to);
  writeFileSync(destPath, content, 'utf8');
  console.log(`  ✔ ${destPath}`);
}

patch('geobase.mjs', [
  ["from '../core.mjs'",       "from 'jsroot/core'"],
  ["from '../base/colors.mjs'","from 'jsroot/colors'"],
  ["from '../base/base3d.mjs'","from 'jsroot/base3d'"],
]);

patch('csg.mjs', [
  ["from '../base/base3d.mjs'","from 'jsroot/base3d'"],
]);

console.log('\nSetup concluído. Agora execute:');
console.log('  node setup/root2scene.mjs geometry_data/CaloGeometry.root --out geometry_data\n');
