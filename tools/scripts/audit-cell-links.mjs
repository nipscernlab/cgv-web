#!/usr/bin/env node
// Audit the calorimeter cell → Three.js mesh linkage.
//
// Every calo cell and every GLB cell mesh collapse to the SAME integer key:
//   geometry key = meshNameToKey()      over each "C→…" cell mesh in the GLB
//   cell key     = parse_atlas_ids_bulk  (real WASM decode) of each <id> in the
//                  TILE/LAr/HEC blocks, mapped via processXml's key formulas.
// Cross-checking the two key sets surfaces four linkage pathologies:
//   - geom collisions : two meshes share a key (one shadows the other)
//   - double-linked   : one mesh ← multiple cells   (e.g. the old B9↔BC1 bug)
//   - unmapped cells  : a cell → a key with no mesh (cell can't render)
//   - orphan geometry : a mesh ← no cell            (mesh never lit)
//
// Only TILE gives a conclusive ORPHAN verdict: its JiveXML <TILE> block always
// dumps the full cell set (~5182). LAr/HEC JiveXML lists only energised cells,
// so their "orphans" are mostly just cells-absent-from-this-event, not bugs —
// the double-linked / unmapped / collision checks stay meaningful for them.
//
// Prerequisites (fetched, git-ignored assets):
//   npm run fetch:geometry   # public/geometry_data/CaloGeometry.glb
//   npm run fetch:samples    # public/default_xml/*.xml
// The WASM (public/parser/pkg) is committed.
//
// Usage:  node tools/scripts/audit-cell-links.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GLB = join(ROOT, 'public/geometry_data/CaloGeometry.glb');
const PKG = join(ROOT, 'public/parser/pkg/atlas_id_parser.js');
const WASM = join(ROOT, 'public/parser/pkg/atlas_id_parser_bg.wasm');
const XML_DIR = join(ROOT, 'public/default_xml');

// ── key encoders (verbatim from public/js/state.js) ───────────────────────────
const _tileKey = (layer, pn, ieta, mod) => (layer << 2) | (pn << 7) | (ieta << 8) | (mod << 12);
const _larEmKey = (eb, sampling, region, pn, eta, phi) =>
  1 | ((eb - 1) << 2) | (sampling << 4) | (region << 6) | (pn << 9) | (eta << 10) | (phi << 19);
const _hecKey = (group, region, pn, eta, phi) =>
  2 | (group << 2) | (region << 4) | (pn << 5) | (eta << 6) | (phi << 11);
const HEC_NAMES = ['1', '23', '45', '67'];
const detOfKey = (k) => ['TILE', 'LAR', 'HEC', '?'][k & 3];

// ── meshNameToKey (verbatim from public/js/loader.js) ─────────────────────────
function meshNameToKey(name) {
  const S = '→';
  const a = name.indexOf(S);
  if (a < 0) return null;
  const b = name.indexOf(S, a + 1);
  if (b < 0) return null;
  const c = name.indexOf(S, b + 1);
  const l1 = name.slice(a + 1, b);
  const l2 = c < 0 ? name.slice(b + 1) : name.slice(b + 1, c);
  const l3 = c < 0 ? '' : name.slice(c + 1);
  let m;
  if ((m = /^Tile(\d+)([pn])_0$/.exec(l1))) {
    const layer = +m[1],
      pn = m[2] === 'p' ? 1 : 0;
    const m2 = /^Tile\d+[pn](\d+)_\d+$/.exec(l2);
    const m3 = /^cell_(\d+)$/.exec(l3);
    return m2 && m3 ? _tileKey(layer, pn, +m2[1], +m3[1]) : null;
  }
  if ((m = /^T(\d+)([pn])(\d+)_\d+$/.exec(l1))) {
    const layer = +m[1],
      pn = m[2] === 'p' ? 1 : 0,
      ieta = +m[3];
    const m2 = /^c_(\d+)$/.exec(l2);
    return m2 ? _tileKey(layer, pn, ieta, +m2[1]) : null;
  }
  if ((m = /^EM(Barrel|EndCap)_(\d+)_(\d+)_([pn])_\d+$/.exec(l1))) {
    const eb = m[1] === 'Barrel' ? 1 : +m[3],
      sampling = +m[2],
      region = +m[3],
      pn = m[4] === 'p' ? 1 : 0;
    const m2 = /^EM(?:Barrel|EndCap)_\d+_\d+_[pn]_(\d+)_\d+$/.exec(l2);
    const m3 = /^cell(2?)_(\d+)$/.exec(l3);
    return m2 && m3 ? _larEmKey(eb, sampling, region, pn, +m2[1], +m3[2]) : null;
  }
  if ((m = /^EB_(\d+)_(\d+)_([pn])_(\d+)_\d+$/.exec(l1))) {
    const sampling = +m[1],
      region = +m[2],
      pn = m[3] === 'p' ? 1 : 0,
      eta = +m[4];
    const m2 = /^c(2?)_(\d+)$/.exec(l2);
    return m2 ? _larEmKey(1, sampling, region, pn, eta, +m2[2]) : null;
  }
  if ((m = /^EE_(\d+)_(\d+)_([pn])_(\d+)_\d+$/.exec(l1))) {
    const sampling = +m[1],
      eb = +m[2],
      pn = m[3] === 'p' ? 1 : 0,
      eta = +m[4];
    const m2 = /^c(2?)_(\d+)$/.exec(l2);
    return m2 ? _larEmKey(eb, sampling, eb, pn, eta, +m2[2]) : null;
  }
  if ((m = /^HEC_(\w+)_(\d+)_([pn])_0$/.exec(l1))) {
    const group = HEC_NAMES.indexOf(m[1]);
    const m2 = /^HEC_\w+_\d+_[pn]_(\d+)_\d+$/.exec(l2);
    const m3 = /^cell_(\d+)$/.exec(l3);
    return group >= 0 && m2 && m3
      ? _hecKey(group, +m[2], m[3] === 'p' ? 1 : 0, +m2[1], +m3[1])
      : null;
  }
  if ((m = /^H_(\d+)_(\d+)_([pn])_(\d+)_\d+$/.exec(l1))) {
    const group = HEC_NAMES.indexOf(m[1]);
    const m2 = /^c_(\d+)$/.exec(l2);
    return group >= 0 && m2 ? _hecKey(group, +m[2], m[3] === 'p' ? 1 : 0, +m[4], +m2[1]) : null;
  }
  return null;
}

// cell key from one 8-int packed record (mirrors public/js/processXml.js)
function cellKey(p, b) {
  switch (p[b]) {
    case 1:
      return _tileKey(p[b + 1], p[b + 3] < 0 ? 0 : 1, p[b + 2], p[b + 4]); // TILE
    case 2:
      return _larEmKey(p[b + 1], p[b + 2], p[b + 5], p[b + 4], p[b + 6], p[b + 7]); // LAr EM
    case 3:
      return _hecKey(p[b + 1], p[b + 2], p[b + 3], p[b + 4], p[b + 5]); // HEC
    default:
      return null;
  }
}

// Classify a TILE orphan key. The known-benign orphans are documented ATLAS
// quirks, NOT linkage bugs; anything else is flagged UNEXPECTED.
function classifyTileOrphan(key) {
  const layer = (key >> 2) & 31,
    pn = (key >> 7) & 1,
    ieta = (key >> 8) & 15,
    mod = (key >> 12) & 63;
  // x=14 / x=15 are the 32 MBTS scintillators. They ARE read out by the Tile
  // electronics in real life, but JiveXML ships their energy in a separate
  // <MBTS> block (label→key), not <TILE> — so they look orphan to a TILE audit.
  if (layer === 14 || layer === 15)
    return 'MBTS — read by Tile electronics, but in the separate <MBTS> XML block';
  // D0 is one central cell straddling z=0, drawn on both A and C sides but read
  // out as a single channel (assigned to the A side here) → C-side mesh orphan.
  if (layer === 4 && ieta === 0 && pn === 0)
    return 'D0 central cell — drawn both sides, read out once (A side)';
  // EBA15 / EBC18 are the two special extended-barrel modules whose D4 cell is
  // physically removed for detector services → geometry has the mesh, no cell.
  if (layer === 8 && ((pn === 1 && mod === 14) || (pn === 0 && mod === 17)))
    return `D4 removed in special module ${pn ? 'EBA15' : 'EBC18'} (detector services)`;
  return 'UNEXPECTED';
}

// ── geometry side ─────────────────────────────────────────────────────────────
const glb = readFileSync(GLB);
if (glb.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB: ' + GLB);
const json = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
const geom = { TILE: new Map(), LAR: new Map(), HEC: new Map() }; // key -> [names]
for (const n of json.nodes ?? []) {
  if (!n.name || !n.name.startsWith('C→')) continue;
  const key = meshNameToKey(n.name);
  if (key == null) continue;
  const d = detOfKey(key);
  if (!geom[d]) continue;
  (geom[d].get(key) ?? geom[d].set(key, []).get(key)).push(n.name);
}

// ── WASM ──────────────────────────────────────────────────────────────────────
const wasm = await import('file://' + PKG);
wasm.initSync({ module: readFileSync(WASM) });

function idsInBlock(xml, tag) {
  const out = [];
  const block = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const idf = /<(?:id|cellID)>([\s\S]*?)<\/(?:id|cellID)>/g;
  let bm;
  while ((bm = block.exec(xml))) {
    idf.lastIndex = 0;
    let im;
    while ((im = idf.exec(bm[1]))) out.push(im[1].trim());
  }
  return out.join(' ').trim();
}

const xmls = readdirSync(XML_DIR)
  .filter((f) => f.endsWith('.xml'))
  .sort();
if (!xmls.length) {
  console.error(`No XMLs in ${XML_DIR} — run \`npm run fetch:samples\` first.`);
  process.exit(1);
}

console.log(
  `geometry cell meshes:  TILE=${geom.TILE.size}  LAR=${geom.LAR.size}  HEC=${geom.HEC.size}\n`,
);
let problems = 0;
for (const d of ['TILE', 'LAR', 'HEC']) {
  const dupes = [...geom[d]].filter(([, names]) => names.length > 1);
  if (dupes.length) {
    problems++;
    console.log(`!! ${d}: ${dupes.length} geometry KEY COLLISIONS (two meshes → one key)`);
  }
}

let tileOrphanClass = null;
for (const f of xmls) {
  const xml = readFileSync(join(XML_DIR, f), 'utf8');
  console.log(f);
  for (const [tag, det] of [
    ['TILE', 'TILE'],
    ['LAr', 'LAR'],
    ['HEC', 'HEC'],
  ]) {
    const idStr = idsInBlock(xml, tag);
    const hits = new Map(); // key -> count
    let cells = 0,
      unmapped = 0;
    if (idStr) {
      const packed = wasm.parse_atlas_ids_bulk(idStr);
      for (let b = 0; b < packed.length; b += 8) {
        const key = cellKey(packed, b);
        if (key == null) continue;
        cells++;
        hits.set(key, (hits.get(key) || 0) + 1);
        if (!geom[det].has(key)) unmapped++;
      }
    }
    const doubles = [...hits].filter(([k, c]) => c > 1 && geom[det].has(k));
    const orphans = [...geom[det].keys()].filter((k) => !hits.has(k));
    if (doubles.length || unmapped) problems++;
    const orphanNote =
      det === 'TILE' ? `${orphans.length}` : `${orphans.length} (sparse — not conclusive)`;
    console.log(
      `  ${det}: cells=${cells}  geom=${geom[det].size}  doubleLinked=${doubles.length}` +
        `  unmappedCells=${unmapped}  orphanGeom=${orphanNote}`,
    );
    if (det === 'TILE' && !tileOrphanClass) {
      tileOrphanClass = new Map();
      for (const k of orphans) {
        const c = classifyTileOrphan(k);
        tileOrphanClass.set(c, (tileOrphanClass.get(c) || 0) + 1);
      }
    }
  }
  console.log();
}

console.log('TILE orphan-mesh classification (full cell dump, conclusive):');
for (const [c, n] of [...tileOrphanClass].sort((a, b) => b[1] - a[1])) {
  if (c === 'UNEXPECTED') problems++;
  console.log(`  ${String(n).padStart(3)}  ${c}`);
}

console.log(
  `\n${problems === 0 ? '✓ PASS' : '✗ ' + problems + ' problem(s)'} — ` +
    'collisions / double-links / unmapped cells / unexpected orphans must all be 0.',
);
process.exit(problems === 0 ? 0 : 1);
