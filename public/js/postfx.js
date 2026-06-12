// @ts-check
// Post-processing chain (docs/VISUAL_PLAN.md, item A2) — Beauty preset only.
//
// RenderPass → UnrealBloomPass → OutputPass, into an MSAA (4×) half-float
// render target so enabling the composer doesn't lose the antialiasing the
// default framebuffer used to provide. Bloom is threshold-selective: only
// the brightest pixels (hot cells, the specular/rim highlights from A3,
// bright tracks) overflow into glow — energy → light, the one effect that
// is semantically *right* for an event display.
//
// The composer is built lazily on the first Beauty frame and kept around
// (toggling presets just flips which path renderLoop takes). OutputPass
// applies the renderer's tone mapping (AgX in Beauty, A4) + sRGB conversion,
// matching what direct-to-canvas rendering does.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { renderer, scene, camera, markDirty } from './renderer.js';
import { getQualityPreset, onQualityChange } from './quality.js';

const BLOOM_STRENGTH = 0.45;
const BLOOM_RADIUS = 0.35;
const BLOOM_THRESHOLD = 0.82;

/** @type {EffectComposer | null} */
let _composer = null;
/** @type {UnrealBloomPass | null} */
let _bloomPass = null;

function _drawingBufferSize() {
  const v = new THREE.Vector2();
  renderer.getDrawingBufferSize(v);
  return v;
}

function _build() {
  const size = _drawingBufferSize();
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4, // keep MSAA when going through the composer
  });
  rt.texture.name = 'cgv-postfx';
  _composer = new EffectComposer(renderer, rt);
  _composer.addPass(new RenderPass(scene, camera));
  _bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  _composer.addPass(_bloomPass);
  _composer.addPass(new OutputPass());
}

/** Keeps the composer's buffers in step with the canvas. */
export function resizePostFx() {
  if (!_composer) return;
  const size = _drawingBufferSize();
  _composer.setSize(size.x, size.y);
}

/**
 * The active composer when the Beauty preset wants bloom, else null (render
 * loop falls back to the plain renderer.render path).
 * @returns {EffectComposer | null}
 */
export function getPostFxComposer() {
  if (!getQualityPreset().bloom) return null;
  if (!_composer) _build();
  return _composer;
}

onQualityChange(() => {
  // Buffers may be stale if the window resized while bloom was off.
  resizePostFx();
  markDirty();
});
window.addEventListener('resize', resizePostFx);
