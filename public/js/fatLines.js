// @ts-check
// Fat-line factory (docs/VISUAL_PLAN.md, item A1).
//
// WebGL ignores LineBasicMaterial.linewidth > 1 on virtually every platform,
// so every particle line in CGV historically rendered 1 px thin regardless of
// what the material asked for. This module wraps three's Line2 /
// LineMaterial addons (screen-space-extruded quads — real pixel widths) and
// centralises the two pieces of bookkeeping they need:
//
//   - every LineMaterial carries a `resolution` uniform that must track the
//     viewport size — registered materials are updated on window resize;
//   - the effective width is baseWidthPx × the active quality preset's
//     lineWidthScale (low ≈ the old 1 px look, standard = the width each
//     call site declares, beauty slightly heavier).
//
// Line2's geometry (LineSegmentsGeometry) stores positions as interleaved
// instance attributes, NOT a plain 'position' attribute — consumers that walk
// a track's polyline (label anchoring, TRT interpolation, chamber raycast)
// must go through polylineAttr(), which returns the original points stashed
// on userData at build time.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { markDirty } from './renderer.js';
import { getQualityPreset, onQualityChange } from './quality.js';

/** Registry of every material created here, for resolution / width syncs. */
const _materials = new Set();

function _syncMaterial(/** @type {any} */ mat) {
  mat.resolution.set(window.innerWidth, window.innerHeight);
  mat.linewidth = mat.userData.baseWidthPx * getQualityPreset().lineWidthScale;
}

function _syncAll() {
  for (const mat of _materials) _syncMaterial(mat);
  markDirty();
}
window.addEventListener('resize', _syncAll);
onQualityChange(_syncAll);

/**
 * Creates a registered LineMaterial. Width is in CSS pixels (worldUnits is
 * off); `widthPx` is the base width at the `standard` preset.
 * @param {{
 *   color: number,
 *   widthPx: number,
 *   dashed?: boolean,
 *   dashSize?: number,
 *   gapSize?: number,
 *   opacity?: number,
 *   transparent?: boolean,
 *   depthWrite?: boolean,
 *   depthTest?: boolean,
 *   toneMapped?: boolean,
 * }} opts
 */
export function makeFatLineMaterial(opts) {
  const mat = new LineMaterial({
    color: opts.color,
    linewidth: opts.widthPx,
    worldUnits: false,
    dashed: opts.dashed ?? false,
    dashSize: opts.dashSize ?? 1,
    gapSize: opts.gapSize ?? 1,
    opacity: opts.opacity ?? 1,
    transparent: opts.transparent ?? false,
  });
  if (opts.depthWrite !== undefined) mat.depthWrite = opts.depthWrite;
  if (opts.depthTest !== undefined) mat.depthTest = opts.depthTest;
  if (opts.toneMapped !== undefined) mat.toneMapped = opts.toneMapped;
  mat.userData.baseWidthPx = opts.widthPx;
  _materials.add(mat);
  _syncMaterial(mat);
  return mat;
}

/**
 * Normalises a polyline into a flat [x0,y0,z0, x1,y1,z1, ...] Float32Array.
 * @param {ReadonlyArray<{x:number,y:number,z:number}> | Float32Array | number[]} pts
 */
function _toFlat(pts) {
  if (pts instanceof Float32Array) return pts;
  if (Array.isArray(pts) && typeof pts[0] === 'number') {
    return Float32Array.from(/** @type {number[]} */ (pts));
  }
  const v = /** @type {ReadonlyArray<{x:number,y:number,z:number}>} */ (pts);
  const flat = new Float32Array(v.length * 3);
  for (let i = 0; i < v.length; i++) {
    flat[i * 3] = v[i].x;
    flat[i * 3 + 1] = v[i].y;
    flat[i * 3 + 2] = v[i].z;
  }
  return flat;
}

/**
 * Builds a Line2 polyline. computeLineDistances() is always run so dashed
 * materials work out of the box. The original points are kept on
 * userData.polyAttr (a plain BufferAttribute) for consumers that need to walk
 * the polyline — see polylineAttr().
 * @param {ReadonlyArray<{x:number,y:number,z:number}> | Float32Array | number[]} pts
 * @param {any} mat  a LineMaterial from makeFatLineMaterial
 */
export function makeFatLine(pts, mat) {
  const flat = _toFlat(pts);
  const geo = new LineGeometry();
  geo.setPositions(/** @type {any} */ (flat));
  const line = new Line2(geo, mat);
  line.computeLineDistances();
  line.userData.polyAttr = new THREE.BufferAttribute(flat, 3);
  return line;
}

/**
 * Replaces a fat line's polyline in place (geometry swap + dispose — Line2
 * geometries can't rewrite their interleaved buffers without leaking the old
 * GPU allocation). Keeps the Line2 object, material and userData intact.
 * @param {any} line  a Line2 from makeFatLine
 * @param {Float32Array | number[]} flat
 */
export function setFatLinePositions(line, flat) {
  const arr = flat instanceof Float32Array ? flat : Float32Array.from(flat);
  const old = line.geometry;
  const geo = new LineGeometry();
  geo.setPositions(/** @type {any} */ (arr));
  line.geometry = geo;
  line.computeLineDistances();
  old.dispose();
  line.userData.polyAttr = new THREE.BufferAttribute(arr, 3);
}

/**
 * The polyline of a line object as a BufferAttribute, regardless of whether
 * it's a fat Line2 (points stashed on userData) or a legacy THREE.Line
 * (plain position attribute). Null when neither exists.
 * @param {any} line
 * @returns {THREE.BufferAttribute | null}
 */
export function polylineAttr(line) {
  return line?.userData?.polyAttr ?? line?.geometry?.getAttribute?.('position') ?? null;
}
