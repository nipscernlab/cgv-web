#!/usr/bin/env node
/**
 * optimize_glb.mjs — Strip unused vertex data and compress CaloGeometry.glb
 *
 * The viewer replaces all materials with a flat MeshPhongMaterial and uses
 * per-instance coloring.  That means UVs, tangents, vertex colors, materials,
 * and textures inside the GLB are dead weight.  This script strips them and
 * optionally quantizes positions/normals to shrink the file further.
 *
 * Usage:
 *   node optimize_glb.mjs                           # default in/out
 *   node optimize_glb.mjs --input X.glb --output Y.glb
 *   node optimize_glb.mjs --quantize                # also quantize (smaller, ~lossless)
 *
 * Dependencies (already in package.json devDependencies):
 *   npm install
 */
import { NodeIO }           from '@gltf-transform/core';
import { dedup, prune,
         quantize as quantizeFn,
         weld }             from '@gltf-transform/functions';
import { statSync }         from 'fs';
import { parseArgs }        from 'node:util';

// ── CLI ──────────────────────────────────────────────────────────────────────
const { values: opts } = parseArgs({
  options: {
    input:    { type: 'string',  default: './geometry_data/CaloGeometry.glb'     },
    output:   { type: 'string',  default: './geometry_data/CaloGeometry_opt.glb' },
    quantize: { type: 'boolean', default: false },
    help:     { type: 'boolean', default: false },
  },
});

if (opts.help) {
  console.log(`
  Usage: node optimize_glb.mjs [options]
    --input  <path>   Source GLB          (default: ./geometry_data/CaloGeometry.glb)
    --output <path>   Output GLB          (default: ./geometry_data/CaloGeometry_opt.glb)
    --quantize        Quantize positions/normals (smaller file, visually identical)
    --help            Show this help
  `);
  process.exit(0);
}

const INPUT  = opts.input;
const OUTPUT = opts.output;

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const origBytes = statSync(INPUT).size;
  console.log(`Reading ${INPUT} (${(origBytes / 1e6).toFixed(1)} MB)…`);

  const io  = new NodeIO();
  const doc = await io.read(INPUT);
  const root = doc.getRoot();

  // 1. Strip TEXCOORD, TANGENT, COLOR vertex attributes (unused by viewer)
  let stripped = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const sem of ['TEXCOORD_0','TEXCOORD_1','TANGENT','COLOR_0']) {
        const acc = prim.getAttribute(sem);
        if (acc) {
          prim.setAttribute(sem, null);
          stripped++;
        }
      }
      // Strip material from primitive (viewer replaces with baseMat)
      prim.setMaterial(null);
    }
  }
  console.log(`  Stripped ${stripped} unused vertex attributes`);

  // 2. Dispose all materials and textures
  const nMat = root.listMaterials().length;
  const nTex = root.listTextures().length;
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  console.log(`  Disposed ${nMat} materials, ${nTex} textures`);

  // 3. Deduplicate identical accessors/buffers and prune unreferenced resources
  console.log('  Deduplicating & pruning…');
  await doc.transform(dedup(), prune());

  // 4. Optional quantization (float32 → int16 with scale/offset)
  if (opts.quantize) {
    console.log('  Quantizing positions (14-bit) and normals (10-bit)…');
    await doc.transform(
      quantizeFn({ quantizePosition: 14, quantizeNormal: 10 })
    );
  }

  // 5. Write optimized GLB
  console.log(`Writing ${OUTPUT}…`);
  await io.write(OUTPUT, doc);

  const optBytes = statSync(OUTPUT).size;
  const pct = ((1 - optBytes / origBytes) * 100).toFixed(1);
  console.log(`\n  Original:  ${(origBytes / 1e6).toFixed(1)} MB`);
  console.log(`  Optimized: ${(optBytes  / 1e6).toFixed(1)} MB`);
  console.log(`  Reduction: ${pct}%`);
  console.log(`\nTo use: rename ${OUTPUT} → CaloGeometry.glb and bump GEO_CACHE_VER in index.html`);
}

main().catch(e => { console.error(e); process.exit(1); });
