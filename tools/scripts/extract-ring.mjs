#!/usr/bin/env node
/**
 * extract-ring.mjs — extrai um único anel de 64 células do CaloGeometry.glb
 *
 * Uso:
 *   node tools/scripts/extract-ring.mjs [--ring T1p0_0] [--in <glb>] [--out <glb>]
 *
 * Padrão: mantém o grupo T1p0_0 (primeiro anel do TileCal barrel).
 * O resultado é um novo .glb com exatamente 64 meshes de células + 1 nó raiz.
 */
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup } from '@gltf-transform/functions';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

// ── CLI args ──────────────────────────────────────────────────────────────────
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    ring: { type: 'string', default: 'T1p0_0' },
    in:   { type: 'string', default: 'public/geometry_data/CaloGeometry.glb' },
    out:  { type: 'string', default: 'public/geometry_data/OneRing.glb' },
  },
});

const ringGroup = values.ring;          // e.g. "T1p0_0"
const inPath    = resolve(values.in);
const outPath   = resolve(values.out);

console.log(`Lendo: ${inPath}`);
console.log(`Anel alvo: ${ringGroup}`);

// ── Lê o GLB ─────────────────────────────────────────────────────────────────
const io = new NodeIO();
const doc = await io.read(inPath);
const root = doc.getRoot();

// ── Identifica quais nós manter ───────────────────────────────────────────────
// Nomes de mesh seguem o padrão: "C→<group>→c_<n>"
// O nó raiz "CaloGeometry" (ou "C") também deve ser mantido como âncora.
const ringPrefix = `C→${ringGroup}→`;   // "C→T1p0_0→"

let kept = 0;
let removed = 0;

for (const scene of root.listScenes()) {
  const toRemove = [];

  for (const node of scene.listChildren()) {
    const name = node.getName();

    // Mantém o nó raiz vazio "CaloGeometry" / "C"
    if (name === 'CaloGeometry' || name === 'C') {
      // Remove filhos que não pertencem ao anel alvo
      for (const child of node.listChildren()) {
        const childName = child.getName();
        if (!childName.startsWith(ringPrefix)) {
          child.detach();
          removed++;
        } else {
          kept++;
        }
      }
      continue;
    }

    // Nós de nível raiz que não são o anel alvo (ex: "atlas", outros grupos)
    if (!name.startsWith(ringPrefix) && name !== ringPrefix.slice(0, -1)) {
      toRemove.push(node);
    }
  }

  for (const node of toRemove) {
    node.detach();
    removed++;
  }
}

console.log(`Nós mantidos: ${kept}`);
console.log(`Nós removidos: ${removed}`);

if (kept !== 64) {
  console.warn(`Aviso: esperado 64 células, encontrado ${kept}.`);
}

// ── Limpa recursos não-referenciados ─────────────────────────────────────────
await doc.transform(prune(), dedup());

// ── Escreve o novo GLB ────────────────────────────────────────────────────────
const glbBuf = await io.writeBinary(doc);
writeFileSync(outPath, Buffer.from(glbBuf));

const sizeMb = (glbBuf.byteLength / 1e6).toFixed(2);
console.log(`Escrito: ${outPath}  (${sizeMb} MB, ${kept} células)`);
