// @ts-check
// Scene backdrop + atmosphere (docs/VISUAL_PLAN.md, item A6).
//
// Owns scene.background and scene.fog so the background colour the user picks
// (colorpicker.js 'bg' channel) and the quality preset compose instead of
// fighting:
//
//   low / standard — flat colour background (exactly the pre-A6 look),
//                    fog density 0 (compiled in but mathematically a no-op).
//   beauty         — screen-space radial gradient derived from the SAME base
//                    colour (lighter centre, darker rim) + a subtle FogExp2
//                    tinted to match, giving the 50 m detector depth cueing.
//
// scene.fog is attached at module load with density 0 so every material in
// the app compiles its fog chunks exactly once — toggling presets only writes
// the density uniform, never triggering a shader rebuild mid-session.

import * as THREE from 'three';
import { scene, markDirty } from './renderer.js';
import { getQualityPreset, onQualityChange } from './quality.js';

const DEFAULT_BG_HEX = '#020d1c';
// FogExp2 factor = exp(-(d·density)²): at 20 m this density fades ~15 %,
// at 50 m (far wall of the muon envelope) ~70 % — present but not murky.
const FOG_DENSITY = 2.2e-5;

const _fog = new THREE.FogExp2(0x010810, 0);
scene.fog = _fog;

let _baseHex = DEFAULT_BG_HEX;
/** @type {THREE.CanvasTexture | null} */
let _gradTex = null;
const _solid = new THREE.Color(DEFAULT_BG_HEX);

/**
 * @param {string} hex
 * @param {number} dl  lightness offset, -1..1 (offsetHSL)
 */
function _shade(hex, dl) {
  return new THREE.Color(hex).offsetHSL(0, 0, dl);
}

/** Builds the radial-gradient backdrop texture from the base colour. */
function _makeGradientTexture(hex) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const grad = ctx.createRadialGradient(
    size / 2,
    size * 0.42, // centre slightly above middle — reads as a soft key light
    size * 0.05,
    size / 2,
    size / 2,
    size * 0.75,
  );
  grad.addColorStop(0, `#${_shade(hex, +0.06).getHexString()}`);
  grad.addColorStop(0.55, hex);
  grad.addColorStop(1, `#${_shade(hex, -0.035).getHexString()}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function _apply() {
  const atmosphere = getQualityPreset().atmosphere;
  if (atmosphere) {
    const old = _gradTex;
    _gradTex = _makeGradientTexture(_baseHex);
    scene.background = _gradTex;
    if (old) old.dispose();
    _fog.density = FOG_DENSITY;
  } else {
    scene.background = _solid.set(_baseHex);
    if (_gradTex) {
      _gradTex.dispose();
      _gradTex = null;
    }
    _fog.density = 0;
  }
  // Fog always sinks toward a darker shade of the backdrop so distant
  // geometry recedes INTO the background rather than greying out.
  _fog.color.copy(_shade(_baseHex, -0.02));
  markDirty();
}

/**
 * Single entry point for the background colour — called by the colorpicker's
 * 'bg' channel (startup restore + live edits). The active preset decides how
 * the colour is presented (flat vs gradient).
 * @param {string} hex
 */
export function setBackdropBaseColor(hex) {
  _baseHex = hex;
  _apply();
}

onQualityChange(_apply);
_apply();
