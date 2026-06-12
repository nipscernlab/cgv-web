// @ts-check
// Mega cell meshes — one merged, GPU-resident mesh per detector.
//
// The GLB carries ~184k calorimeter cells built from ~13.7k unique shapes.
// The previous renderer instanced them as one InstancedMesh per unique shape,
// which meant ~13k draw calls per frame and a full instanceMatrix re-upload
// (~14 MB) whenever visibility changed. This module replaces all of that:
//
//   • Vertices are baked into ONE static BufferGeometry per detector at load
//     (cells never move — origMatrix is immutable), so each detector is a
//     single draw call forever and the vertex buffers never change again.
//   • Per-cell colour + visibility live in a small RGBA8 DataTexture (one
//     texel per cell). Toggling a threshold writes bytes + re-uploads ≤1 MB —
//     no matrices, no bounding-sphere recompute.
//   • Per-cell centres live in an RGBA32F DataTexture; the vertex shader uses
//     them for the slicer-wedge test (see wedgeClip.js), reproducing the
//     CPU rule "the whole cell disappears when its centre is in the wedge".
//   • The material is a stock MeshLambertMaterial (flat-shaded, front-lit by
//     the same scene lights as before) with a small onBeforeCompile patch, so
//     lighting/tonemapping/colour-space output is pixel-equivalent to the old
//     MeshStandardMaterial look at a fraction of the fragment cost.
//
// Picking: Raycaster.intersectObjects can't see per-texel visibility, so this
// module also owns the cell raycast — a ray/bounding-sphere sweep over a flat
// SoA of cell centres (skipping invisible/wedge-hidden cells), then an exact
// ray/triangle test on the few candidate cells via their shared unique
// geometry. O(visible cells) per pick, no 13k-object scene traversal.

import * as THREE from 'three';
import { WEDGE_GLSL, WEDGE_UNIFORMS, getWedgeMask, insideWedge } from './wedgeClip.js';
import { getQualityPreset, onQualityChange } from './quality.js';
import { CGV_WAVE_UNIFORM } from './collisionReplay.js';

const TEX_W = 2048; // texels per DataTexture row (cells per row)

/**
 * @typedef {import('./state.js').CellHandle} CellHandle
 *
 * @typedef {{
 *   det: string,
 *   mesh: THREE.Mesh,
 *   handles: CellHandle[],
 *   colorVis: Uint8Array,
 *   tex: THREE.DataTexture,
 *   centersTex: THREE.DataTexture,
 *   texW: number,
 *   soa: { cx: Float32Array, cy: Float32Array, cz: Float32Array, rad: Float32Array },
 *   dirty: boolean,
 * }} MegaRecord
 */

/** @type {MegaRecord[]} */
const _megas = [];
/** @type {Map<string, MegaRecord>} */
const _megaByDet = new Map();

/** @param {string} det @returns {MegaRecord | undefined} */
export const getMega = (det) => _megaByDet.get(det);
export const getMegaRecords = () => _megas;

// ── Material ─────────────────────────────────────────────────────────────────
// MeshLambertMaterial(flatShading) lit by the existing ambient+headlight rig.
// The injected chunk fetches per-cell colour/visibility/centre by slot and
// collapses culled cells in the vertex stage (zero fragment cost).
//
// uCgvShade (docs/VISUAL_PLAN.md, item A3): Fresnel rim + headlight specular,
// scaled by a single uniform driven by the quality preset. At 0 (low /
// standard) the math still runs but contributes exactly nothing — pixel
// output identical to pre-A3 — so toggling presets never recompiles the
// program (customProgramCacheKey stays 'cgv-mega-cell').
const _CGV_SHADE_UNIFORM = { value: getQualityPreset().cellShading ? 1 : 0 };
onQualityChange(() => {
  _CGV_SHADE_UNIFORM.value = getQualityPreset().cellShading ? 1 : 0;
});

/**
 * @param {THREE.DataTexture} tex
 * @param {THREE.DataTexture} centersTex
 */
function _makeCellMaterial(tex, centersTex) {
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    side: THREE.FrontSide,
    flatShading: true,
  });
  mat.defines = { CGV_TEXW: TEX_W };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WEDGE_UNIFORMS);
    shader.uniforms.uCellTex = { value: tex };
    shader.uniforms.uCenterTex = { value: centersTex };
    shader.uniforms.uCgvShade = _CGV_SHADE_UNIFORM;
    shader.uniforms.uCgvWaveR = CGV_WAVE_UNIFORM;
    shader.vertexShader =
      `attribute float aSlot;
uniform sampler2D uCellTex;
uniform sampler2D uCenterTex;
uniform float uCgvWaveR;
varying vec3 vCgvColor;
varying float vCgvWave;
` +
      WEDGE_GLSL +
      shader.vertexShader
        .replace(
          '#include <color_vertex>',
          `#include <color_vertex>
  int cgvS = int(aSlot + 0.5);
  ivec2 cgvTc = ivec2(cgvS % CGV_TEXW, cgvS / CGV_TEXW);
  vec4 cgvCV = texelFetch(uCellTex, cgvTc, 0);
  vCgvColor = cgvCV.rgb;`,
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
  vec3 cgvCentre = texelFetch(uCenterTex, cgvTc, 0).xyz;
  if (cgvCV.a < 0.5 || cgvInsideWedge(cgvCentre)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  // B2 collision replay: light front at r = uCgvWaveR (mm from the vertex).
  // Cells behind the front are lit, ahead are dimmed, and a bright band
  // rides the front itself. uCgvWaveR < 0 → effect off (factor 1).
  vCgvWave = 1.0;
  if (uCgvWaveR >= 0.0) {
    float cgvWd = length(cgvCentre) - uCgvWaveR;
    float cgvLit = 1.0 - smoothstep(0.0, 300.0, cgvWd);
    float cgvBand = exp(-abs(cgvWd) / 250.0);
    vCgvWave = mix(0.05, 1.0, cgvLit) + cgvBand * 0.9;
  }`,
        );
    shader.fragmentShader =
      'varying vec3 vCgvColor;\nvarying float vCgvWave;\nuniform float uCgvShade;\n' +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  diffuseColor.rgb *= vCgvColor * vCgvWave;`,
        )
        .replace(
          '#include <opaque_fragment>',
          // A3 — rim + specular, added to outgoingLight just before output.
          //   rim : Fresnel-ish silhouette lift, tinted toward the cell's own
          //         colour so the energy reading isn't washed out by white.
          //   spec: Blinn-Phong against the headlight (dirLight tracks the
          //         camera, so H ≈ V and N·V doubles as N·H) — a tight, dim
          //         highlight that makes the flat-shaded facets read as solid.
          `{
    vec3 cgvV = normalize( vViewPosition );
    float cgvNdV = clamp( dot( normal, cgvV ), 0.0, 1.0 );
    float cgvRim = pow( 1.0 - cgvNdV, 3.0 );
    float cgvSpec = pow( cgvNdV, 48.0 ) * 0.18;
    outgoingLight += uCgvShade * ( cgvRim * 0.30 * ( 0.4 + 0.6 * vCgvColor ) + cgvSpec );
  }
  #include <opaque_fragment>`,
        );
  };
  mat.customProgramCacheKey = () => 'cgv-mega-cell';
  return mat;
}

// ── Build ─────────────────────────────────────────────────────────────────────
/**
 * Bakes one detector's cells (grouped by shared unique geometry) into a single
 * merged mesh + per-cell textures. `buckets` come straight from the GLB
 * traversal in loader.js.
 * @param {string} det
 * @param {Array<{ geo: THREE.BufferGeometry, items: Array<{
 *   matrix: THREE.Matrix4, name: string, key: number | null,
 *   subDet: string, sampling: string | number }> }>} buckets
 * @returns {MegaRecord | null}
 */
function _buildDetector(det, buckets) {
  let nCells = 0;
  let nVerts = 0;
  let nIdx = 0;
  for (const b of buckets) {
    const vc = b.geo.attributes.position.count;
    const ic = b.geo.index ? b.geo.index.count : vc;
    nCells += b.items.length;
    nVerts += vc * b.items.length;
    nIdx += ic * b.items.length;
  }
  if (!nCells) return null;

  const posArr = new Float32Array(nVerts * 3);
  const slotArr = new Float32Array(nVerts);
  const idxArr = nVerts > 65535 ? new Uint32Array(nIdx) : new Uint16Array(nIdx);
  const cx = new Float32Array(nCells);
  const cy = new Float32Array(nCells);
  const cz = new Float32Array(nCells);
  const rad = new Float32Array(nCells);
  const texH = Math.max(1, Math.ceil(nCells / TEX_W));
  const colorVis = new Uint8Array(TEX_W * texH * 4);
  const centers = new Float32Array(TEX_W * texH * 4);
  /** @type {CellHandle[]} */
  const handles = new Array(nCells);

  const v = new THREE.Vector3();
  let slot = 0;
  let vOff = 0;
  let iOff = 0;
  let maxR = 0;

  /** @type {MegaRecord} */
  const rec = /** @type {any} */ ({ det });

  for (const b of buckets) {
    const geo = b.geo;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const vc = pos.count;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const bs = /** @type {THREE.Sphere} */ (geo.boundingSphere);
    const pa = /** @type {Float32Array} */ (pos.array);
    for (const it of b.items) {
      const e = it.matrix.elements;
      for (let i = 0; i < vc; i++) {
        const x = pa[i * 3];
        const y = pa[i * 3 + 1];
        const z = pa[i * 3 + 2];
        const o = (vOff + i) * 3;
        posArr[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
        posArr[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        posArr[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        slotArr[vOff + i] = slot;
      }
      if (idx) {
        for (let i = 0; i < idx.count; i++) idxArr[iOff + i] = vOff + idx.getX(i);
        iOff += idx.count;
      } else {
        for (let i = 0; i < vc; i++) idxArr[iOff + i] = vOff + i;
        iOff += vc;
      }
      vOff += vc;

      v.copy(bs.center).applyMatrix4(it.matrix);
      const sx = Math.hypot(e[0], e[1], e[2]);
      const sy = Math.hypot(e[4], e[5], e[6]);
      const sz = Math.hypot(e[8], e[9], e[10]);
      const r = bs.radius * Math.max(sx, sy, sz);
      cx[slot] = v.x;
      cy[slot] = v.y;
      cz[slot] = v.z;
      rad[slot] = r;
      maxR = Math.max(maxR, v.length() + r);
      const t4 = slot * 4;
      centers[t4] = v.x;
      centers[t4 + 1] = v.y;
      centers[t4 + 2] = v.z;
      centers[t4 + 3] = r;
      // Neutral white, hidden (alpha 0) — events paint colours, thresholds
      // flip visibility.
      colorVis[t4] = 255;
      colorVis[t4 + 1] = 255;
      colorVis[t4 + 2] = 255;
      colorVis[t4 + 3] = 0;

      handles[slot] = {
        det,
        slot,
        mega: rec,
        geo,
        origMatrix: it.matrix,
        center: v.clone(),
        radius: r,
        name: it.name,
        key: it.key,
        subDet: it.subDet,
        sampling: it.sampling,
        visible: false,
      };
      slot++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geometry.setAttribute('aSlot', new THREE.BufferAttribute(slotArr, 1));
  geometry.setIndex(new THREE.BufferAttribute(idxArr, 1));
  // Static, conservative bound (cells never move); avoids three's O(verts)
  // recompute and keeps frustum culling decisions trivially correct.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), maxR);

  const tex = new THREE.DataTexture(
    colorVis,
    TEX_W,
    texH,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const centersTex = new THREE.DataTexture(centers, TEX_W, texH, THREE.RGBAFormat, THREE.FloatType);
  centersTex.minFilter = THREE.NearestFilter;
  centersTex.magFilter = THREE.NearestFilter;
  centersTex.needsUpdate = true;

  const mesh = new THREE.Mesh(geometry, _makeCellMaterial(tex, centersTex));
  mesh.name = `cells_${det}`;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  Object.assign(rec, {
    mesh,
    handles,
    colorVis,
    tex,
    centersTex,
    texW: TEX_W,
    soa: { cx, cy, cz, rad },
    dirty: false,
  });
  return rec;
}

/**
 * Builds every detector's mega mesh and returns the scene group to add.
 * @param {{ [det: string]: Parameters<typeof _buildDetector>[1] }} groupsByDet
 * @returns {{ group: THREE.Group, records: MegaRecord[] }}
 */
export function buildMegaCells(groupsByDet) {
  const group = new THREE.Group();
  group.name = 'cells';
  for (const det of Object.keys(groupsByDet)) {
    const rec = _buildDetector(det, groupsByDet[det]);
    if (!rec) continue;
    _megas.push(rec);
    _megaByDet.set(det, rec);
    group.add(rec.mesh);
  }
  return { group, records: _megas };
}

// ── Per-cell state writes ────────────────────────────────────────────────────

// Monotonic counter bumped whenever ANY cell actually flips visibility.
// Consumers that derive expensive state from "which cells are visible"
// (calo-bound particle endpoints, outline rebuilds) compare generations to
// skip work when a refresh pass ended up changing nothing — e.g. threshold
// slider drags while the slicer's show-all mode has everything visible.
let _visGeneration = 0;
export function getCellVisGeneration() {
  return _visGeneration;
}

/**
 * @param {CellHandle} h
 * @param {THREE.Color} color
 */
export function setCellColor(h, color) {
  const rec = /** @type {MegaRecord} */ (h.mega);
  const t4 = h.slot * 4;
  rec.colorVis[t4] = Math.min(255, Math.max(0, Math.round(color.r * 255)));
  rec.colorVis[t4 + 1] = Math.min(255, Math.max(0, Math.round(color.g * 255)));
  rec.colorVis[t4 + 2] = Math.min(255, Math.max(0, Math.round(color.b * 255)));
  rec.dirty = true;
}

/**
 * @param {CellHandle} h
 * @param {boolean} vis
 */
export function setCellVisible(h, vis) {
  if (h.visible === vis) return;
  h.visible = vis;
  _visGeneration++;
  const rec = /** @type {MegaRecord} */ (h.mega);
  rec.colorVis[h.slot * 4 + 3] = vis ? 255 : 0;
  rec.dirty = true;
}

/** Hides every cell (new-event reset). Callers flush afterwards. */
export function hideAllCells() {
  for (const rec of _megas) {
    for (const h of rec.handles) {
      if (!h.visible) continue;
      h.visible = false;
      _visGeneration++;
      rec.colorVis[h.slot * 4 + 3] = 0;
      rec.dirty = true;
    }
  }
}

/** Re-uploads each dirty detector's colour/visibility texture (≤1 MB each). */
export function flushCells() {
  for (const rec of _megas) {
    if (!rec.dirty) continue;
    rec.dirty = false;
    rec.tex.needsUpdate = true;
  }
}

// ── Picking ──────────────────────────────────────────────────────────────────
const _invMat = new THREE.Matrix4();
const _localRay = new THREE.Ray();
const _scratchMesh = new THREE.Mesh(
  undefined,
  new THREE.MeshBasicMaterial({ side: THREE.FrontSide }),
);
_scratchMesh.matrixAutoUpdate = false;
/** @type {THREE.Intersection[]} */
const _scratchHits = [];

/**
 * Cell raycast replacing Raycaster.intersectObjects over InstancedMeshes.
 * Sphere-prefilters in flat SoA arrays (skipping hidden and wedge-carved
 * cells), then runs the exact triangle test on candidates via the cell's
 * shared unique geometry, nearest-first with early exit.
 * @param {THREE.Raycaster} raycaster
 * @param {{ requireActive?: Map<CellHandle, any> | null }} [opts]
 * @returns {{ handle: CellHandle, point: THREE.Vector3, distance: number } | null}
 */
export function pickCell(raycaster, { requireActive = null } = {}) {
  const wedge = getWedgeMask();
  /** @type {{ handle: CellHandle, tNear: number }[]} */
  const candidates = [];

  for (const rec of _megas) {
    if (!rec.mesh.visible) continue;
    _invMat.copy(rec.mesh.matrixWorld).invert();
    _localRay.copy(raycaster.ray).applyMatrix4(_invMat);
    const ox = _localRay.origin.x;
    const oy = _localRay.origin.y;
    const oz = _localRay.origin.z;
    const dx = _localRay.direction.x;
    const dy = _localRay.direction.y;
    const dz = _localRay.direction.z;
    const { cx, cy, cz, rad } = rec.soa;
    const handles = rec.handles;
    for (let i = 0; i < handles.length; i++) {
      const h = handles[i];
      if (!h.visible) continue;
      if (requireActive && !requireActive.has(h)) continue;
      const px = cx[i] - ox;
      const py = cy[i] - oy;
      const pz = cz[i] - oz;
      const tCenter = px * dx + py * dy + pz * dz;
      const r = rad[i];
      if (tCenter < -r) continue;
      const distSq = px * px + py * py + pz * pz - tCenter * tCenter;
      const r2 = r * r;
      if (distSq > r2) continue;
      if (wedge && insideWedge(cx[i], cy[i], cz[i], wedge)) continue;
      candidates.push({ handle: h, tNear: Math.max(0, tCenter - r) });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.tNear - b.tNear);

  let best = null;
  for (const c of candidates) {
    if (best && c.tNear > best.distance) break;
    const h = c.handle;
    const rec = /** @type {MegaRecord} */ (h.mega);
    _scratchMesh.geometry = h.geo;
    _scratchMesh.matrixWorld.multiplyMatrices(rec.mesh.matrixWorld, h.origMatrix);
    _scratchHits.length = 0;
    _scratchMesh.raycast(raycaster, _scratchHits);
    for (const hit of _scratchHits) {
      if (!best || hit.distance < best.distance) {
        best = { handle: h, point: hit.point.clone(), distance: hit.distance };
      }
    }
  }
  return best;
}
