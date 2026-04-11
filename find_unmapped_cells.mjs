#!/usr/bin/env node
/**
 * find_unmapped_cells.mjs
 * Reads LAr and HEC from a JiveXML, builds expected mesh paths using the same
 * logic as index.html, checks them against CaloGeometry.cgv, and writes all
 * unmatched paths to a txt file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initSync, parse_atlas_id } from './atlas-id-parser/pkg/atlas_id_parser.js';

// ── Init WASM ──
const wasmBytes = readFileSync(resolve('atlas-id-parser/pkg/atlas_id_parser_bg.wasm'));
initSync({ module: new WebAssembly.Module(wasmBytes) });

// ── Read CGV hierarchy into a Set of known paths ──
const cgvText = readFileSync(resolve('CaloGeometry.cgv'), 'utf8');
const cgvPaths = new Set();
for (const line of cgvText.split('\n')) {
  if (line.startsWith('#') || !line.trim()) continue;
  // CGV uses tab-arrow-tab separator; the GLB/viewer uses → (U+2192)
  const path = line.replace(/\t→\t/g, '\u2192');
  cgvPaths.add(path);
}
console.log(`CGV paths loaded: ${cgvPaths.size}`);

// ── Read XML ──
const xmlPath = resolve(process.argv[2] ?? 'JiveXML_516761_840521342.xml');
const xml = readFileSync(xmlPath, 'utf8');

function extractIds(xml, tagName, storeGateKey) {
  const re = new RegExp(`<${tagName}\\b[^>]*${storeGateKey ? `storeGateKey="${storeGateKey}"` : ''}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'g');
  const ids = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const idMatch = block.match(/<id>([\s\S]*?)<\/id>/);
    if (idMatch) ids.push(...idMatch[1].trim().split(/\s+/));
  }
  return ids;
}

const larIds = extractIds(xml, 'LAr', 'AllCalo');
const hecIds = extractIds(xml, 'HEC', null);
console.log(`LAr IDs: ${larIds.length}, HEC IDs: ${hecIds.length}`);

// ── HEC_GROUPS_MAP (same as index.html) ──
const HEC_GROUPS_MAP = [
  { name: '1',  innerBins: 10 },
  { name: '23', innerBins: 10 },
  { name: '45', innerBins: 9  },
  { name: '67', innerBins: 8  },
];

// ── Process LAr EM ──
const unmapped = [];
let nLAr = 0, nLArMiss = 0;

for (const idStr of larIds) {
  let p;
  try { p = parse_atlas_id(idStr); } catch { continue; }
  if (!p?.valid || p.subsystem !== 'LAr EM') continue;
  nLAr++;

  const f = Object.fromEntries(p.fields.map(({ name, value }) => [name, value]));
  const bec = f['barrel-endcap'];
  if (bec === undefined || f.sampling === undefined || f.eta === undefined || f.phi === undefined) {
    unmapped.push(`[LAr EM] missing fields — id=${idStr}`);
    nLArMiss++;
    continue;
  }

  // Replicate larMeshPath from index.html
  const X = (bec === -1 || bec === 1) ? 'Barrel' : 'EndCap';
  const W = X === 'Barrel' ? 0 : 1;
  const Z = bec > 0 ? 'p' : 'n';
  const prefix = `Calorimeter\u2192EM${X}${f.sampling}${Z}_${W}\u2192EM${X}${f.sampling}${Z}${f.eta}_${f.eta}\u2192`;
  const path1 = prefix + `cell_${f.phi}`;
  const path2 = prefix + `cell2_${f.phi}`;

  if (!cgvPaths.has(path1) && !cgvPaths.has(path2)) {
    unmapped.push(path1);
    nLArMiss++;
  }
}

// ── Process HEC ──
let nHec = 0, nHecMiss = 0;

for (const idStr of hecIds) {
  let p;
  try { p = parse_atlas_id(idStr); } catch { continue; }
  if (!p?.valid || p.subsystem !== 'LAr HEC') continue;
  nHec++;

  const f = Object.fromEntries(p.fields.map(({ name, value }) => [name, value]));
  const be = f['barrel-endcap'];
  if (be === undefined || f.sampling === undefined || f.region === undefined ||
      f.eta === undefined || f.phi === undefined) {
    unmapped.push(`[HEC] missing fields — id=${idStr}`);
    nHecMiss++;
    continue;
  }

  const g = HEC_GROUPS_MAP[f.sampling];
  if (!g) {
    unmapped.push(`[HEC] no group for sampling=${f.sampling} — id=${idStr}`);
    nHecMiss++;
    continue;
  }

  const Z   = be > 0 ? 'p' : 'n';
  const cum = f.region === 0 ? f.eta : g.innerBins + f.eta;
  const B   = g.name === '1' ? cum : Math.max(0, cum - 1);
  const path = `Calorimeter\u2192HEC${g.name}${Z}_0\u2192HEC${g.name}${Z}${cum}_${B}\u2192cell_${f.phi}`;

  if (!cgvPaths.has(path)) {
    unmapped.push(path);
    nHecMiss++;
  }
}

console.log(`LAr EM: ${nLAr} total, ${nLArMiss} unmapped`);
console.log(`HEC:    ${nHec} total, ${nHecMiss} unmapped`);
console.log(`Total unmapped: ${unmapped.length}`);

const outPath = resolve('unmapped_cells.txt');
writeFileSync(outPath, unmapped.join('\n') + '\n', 'utf8');
console.log(`Written to: ${outPath}`);
