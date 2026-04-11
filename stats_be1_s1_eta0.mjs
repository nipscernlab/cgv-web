#!/usr/bin/env node
/**
 * stats_be1_s1_eta0.mjs
 * For LAr EM cells with |barrel-endcap|=1, sampling=1, eta_idx=0:
 * shows region and the global_eta after lar_em_global_eta.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initSync, parse_atlas_id } from './atlas-id-parser/pkg/atlas_id_parser.js';

const wasmBytes = readFileSync(resolve('atlas-id-parser/pkg/atlas_id_parser_bg.wasm'));
initSync({ module: new WebAssembly.Module(wasmBytes) });

const xmlPath = resolve(process.argv[2] ?? 'JiveXML_516761_840521342.xml');
const xml = readFileSync(xmlPath, 'utf8');

// Extract LAr IDs
const larMatch = xml.match(/<LAr\b[^>]*storeGateKey="AllCalo"[^>]*>([\s\S]*?)<\/LAr>/);
if (!larMatch) { console.error('No LAr block found'); process.exit(1); }
const idMatch = larMatch[1].match(/<id>([\s\S]*?)<\/id>/);
if (!idMatch) { console.error('No <id> in LAr block'); process.exit(1); }
const ids = idMatch[1].trim().split(/\s+/);

console.log(`Total LAr IDs: ${ids.length}`);

// Parse cell_name to extract global_eta: pattern "η=<number>"
function extractGlobalEta(cellName) {
  const m = cellName.match(/η=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

const results = [];
for (const idStr of ids) {
  let p;
  try { p = parse_atlas_id(idStr); } catch { continue; }
  if (!p?.valid || p.subsystem !== 'LAr EM') continue;

  const f = Object.fromEntries(p.fields.map(({ name, value }) => [name, value]));
  const be = f['barrel-endcap'];
  const sampling = f['sampling'];
  const eta_idx = f['eta'];

  if (Math.abs(be) === 1 && sampling === 1 && eta_idx === 0) {
    results.push({
      id: idStr,
      be,
      region: f['region'],
      eta_idx,
      global_eta: extractGlobalEta(p.cell_name),
      phi: f['phi'],
      cell_name: p.cell_name,
      full_id: p.full_id,
    });
  }
}

console.log(`Filtered (|be|=1, sampling=1, eta=0): ${results.length} cells`);

// Sort by region then phi
results.sort((a, b) => a.region - b.region || a.be - b.be || a.phi - b.phi);

const lines = [];
lines.push(`# LAr EM cells: |barrel-endcap|=1, sampling=1, eta_idx=0`);
lines.push(`# Source: ${xmlPath}`);
lines.push(`# Filtered: ${results.length} cells`);
lines.push(`#`);
lines.push(`# barrel-endcap\tregion\teta_idx\tglobal_eta\tphi\tcell_name\tfull_id\tid`);

for (const r of results) {
  lines.push(`${r.be}\t${r.region}\t${r.eta_idx}\t${r.global_eta}\t${r.phi}\t${r.cell_name}\t${r.full_id}\t${r.id}`);
}

const outPath = resolve('stats_be1_s1_eta0.txt');
writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log(`Written to: ${outPath}`);
