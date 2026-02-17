// cli.js — Node.js ESM CLI (robust, ensures emblem is resized to fit)
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import init, { composite_rgba } from './pkg/aol_web.js';

async function loadWasmFromPkg() {
  const wasmPath = path.resolve('./pkg/aol_web_bg.wasm');
  const bytes = await fs.promises.readFile(wasmPath);
  await init(bytes);
}

async function run() {
  const [,, inputPath, emblemPath, outputPath] = process.argv;
  if (!inputPath || !emblemPath || !outputPath) {
    console.error('Usage: node cli.js input.png emblem.svg output.png');
    process.exit(1);
  }

  await loadWasmFromPkg();

  // --- load base image first
  const baseImg = sharp(inputPath).ensureAlpha();
  const { data: baseData, info: baseInfo } =
    await baseImg.raw().toBuffer({ resolveWithObject: true });

  const baseW = baseInfo.width;
  const baseH = baseInfo.height;
  console.log(`base: ${baseW}x${baseH}`);

  // --- prepare emblem: resize to fit base (avoid emblem > base)
  // scale fraction controls emblem size relative to base width
  const scaleFraction = 0.44; // keep consistent with browser code
  const targetEmblemW = Math.max(32, Math.round(baseW * scaleFraction));

  // Use sharp resize with withoutEnlargement: true to avoid upscaling small emblems
  const emblemSharp = sharp(emblemPath, { density: 300 }).ensureAlpha();
  const emblemResized = emblemSharp
    .resize({ width: targetEmblemW, withoutEnlargement: true });

  const { data: ovData, info: ovInfo } =
    await emblemResized.raw().toBuffer({ resolveWithObject: true });

  const ovW = ovInfo.width;
  const ovH = ovInfo.height;
  console.log(`emblem (resized): ${ovW}x${ovH}`);

  // --- compute centered (horiz) and slightly below center (vert)
  let posX = Math.round((baseW - ovW) / 2);
  let posY = Math.round(baseH * 0.62 - ovH / 2);

  // clamp to valid non-negative coordinates
  posX = Math.max(0, Math.min(posX, baseW - ovW));
  posY = Math.max(0, Math.min(posY, baseH - ovH));

  console.log(`position: x=${posX}, y=${posY}`);

  // --- call wasm composite
  const resultArr = composite_rgba(
    baseData,
    baseW,
    baseH,
    ovData,
    ovW,
    ovH,
    posX,
    posY
  );

  if (!resultArr || resultArr.length !== baseW * baseH * 4) {
    console.error('Invalid result from wasm composite:', resultArr && resultArr.length);
    process.exit(2);
  }

  // write result with sharp
  await sharp(Buffer.from(resultArr), {
    raw: { width: baseW, height: baseH, channels: 4 }
  }).png().toFile(outputPath);

  console.log('Output written to', outputPath);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
