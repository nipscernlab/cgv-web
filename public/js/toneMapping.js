// @ts-check
// Tone mapping (docs/VISUAL_PLAN.md, item A4) — Beauty preset only.
//
// AgX is three's filmic-neutral curve: it compresses the over-saturated
// "neon" response of the brightest energy deposits and adds tonal depth
// without the strong hue shifts of ACES. It REMAPS COLOURS, and cell colour
// is physics data — which is exactly why this lives behind the Beauty
// preset and Standard stays at NoToneMapping, pixel-identical to today.
// (The minimap is Canvas 2D and never tone-mapped; in Beauty it will read
// slightly more saturated than the 3-D view. Known, accepted divergence —
// see VISUAL_PLAN "Pendências de decisão".)
//
// Materials that must keep their exact colour under tone mapping (e.g. the
// MET overlay) already opt out via material.toneMapped = false.
//
// Switching renderer.toneMapping does not recompile existing programs on its
// own — every material in the scene gets needsUpdate so the next frame
// rebuilds them (one-time hitch, amortised by the warm frames the quality
// switch already schedules).

import * as THREE from 'three';
import { renderer, scene, markDirty } from './renderer.js';
import { getQualityPreset, onQualityChange } from './quality.js';

function _apply() {
  const on = getQualityPreset().toneMapping;
  const target = on ? THREE.AgXToneMapping : THREE.NoToneMapping;
  if (renderer.toneMapping === target) return;
  renderer.toneMapping = target;
  renderer.toneMappingExposure = 1.0;
  scene.traverse((/** @type {any} */ o) => {
    const m = o.material;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
  });
  markDirty();
}

onQualityChange(_apply);
_apply();
