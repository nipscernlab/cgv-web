#!/usr/bin/env node
/**
 * setup.mjs — prepara lib/geobase.mjs e lib/csg.mjs com imports corrigidos.
 * Execute uma única vez após: npm install jsroot --ignore-scripts
 */
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC  = 'node_modules/jsroot/modules/geom';
const DEST = 'lib';

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
console.log('  node root2scene.mjs <arquivo.root> [opções]\n');
