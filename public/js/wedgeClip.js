// @ts-check
// GPU-side slicer wedge: shared uniforms + GLSL test + CPU mirror.
//
// The slicer's cylindrical-wedge carve used to be applied on the CPU — a full
// sweep over every cell handle per pointermove. It is now a *uniform*: every
// material that must respect the cut (mega cell meshes, merged outlines, FCAL
// instances, FCAL outlines, muon chambers, hover outlines) includes the same
// uniform objects below, and a slicer drag only writes ~10 floats.
//
// Coordinate space: the mask lives in SCENE-LOCAL coordinates (the slicer
// rotates the whole scene around Z to face the cut; the gizmo and the cells
// rotate together, so the mask itself never rotates). Cell mega meshes bake
// their vertices in scene-local space and test the raw attribute; materials
// whose only available position is world-space (chambers, hover outlines)
// counter-rotate via uWedgeRot — see cgvWorldToScene().
//
// Angular test (no atan2): the sector [φ, φ+θ] is the intersection (θ ≤ π) or
// union (θ > π) of two half-planes whose boundary normals are the sector edge
// directions a = (cosφ, sinφ) and b = (cos(φ+θ), sin(φ+θ)). With
// cross(a,p) = a.x·p.y − a.y·p.x:
//   θ ≤ π : inside ⟺ cross(a,p) ≥ 0 ∧ cross(b,p) ≤ 0
//   θ > π : inside ⟺ cross(a,p) ≥ 0 ∨ cross(b,p) ≤ 0
// which is 4 multiplications per point — SIMD-friendly on the CPU mirror and
// two lines of GLSL on the GPU.

import * as THREE from 'three';

// ── Shared uniform objects ────────────────────────────────────────────────────
// Single uniform instances referenced by every clipped material — writing
// `.value` here updates all programs on the next frame.
export const WEDGE_UNIFORMS = {
  uWedgeOn: { value: 0 }, // 0 off, 1 on
  // 0 = empty θ (hide nothing), 1 = θ ≤ π (AND), 2 = θ > π (OR), 3 = full circle
  uWedgeMode: { value: 0 },
  uWedgeYOff: { value: 0 },
  uWedgeR2: { value: 0 },
  uWedgeZMin: { value: 0 },
  uWedgeZMax: { value: 0 },
  uWedgeNA: { value: new THREE.Vector2(1, 0) },
  uWedgeNB: { value: new THREE.Vector2(1, 0) },
  // (cos, sin) of scene.rotation.z — world → scene-local counter-rotation.
  uWedgeRot: { value: new THREE.Vector2(1, 0) },
};

// GLSL declarations + the wedge test. Prepend to any shader that calls
// cgvInsideWedge / cgvWorldToScene.
export const WEDGE_GLSL = /* glsl */ `
uniform float uWedgeOn;
uniform float uWedgeMode;
uniform float uWedgeYOff;
uniform float uWedgeR2;
uniform float uWedgeZMin;
uniform float uWedgeZMax;
uniform vec2 uWedgeNA;
uniform vec2 uWedgeNB;
uniform vec2 uWedgeRot;
bool cgvInsideWedge(vec3 p) {
  if (uWedgeOn < 0.5 || uWedgeMode < 0.5) return false;
  float wdy = p.y - uWedgeYOff;
  if (p.x * p.x + wdy * wdy >= uWedgeR2) return false;
  if (p.z <= uWedgeZMin || p.z >= uWedgeZMax) return false;
  if (uWedgeMode > 2.5) return true;
  float ca = uWedgeNA.x * wdy - uWedgeNA.y * p.x;
  float cb = uWedgeNB.x * wdy - uWedgeNB.y * p.x;
  return uWedgeMode < 1.5 ? (ca >= 0.0 && cb <= 0.0) : (ca >= 0.0 || cb <= 0.0);
}
vec3 cgvWorldToScene(vec3 w) {
  return vec3(uWedgeRot.x * w.x + uWedgeRot.y * w.y, -uWedgeRot.y * w.x + uWedgeRot.x * w.y, w.z);
}
`;

/**
 * Precomputed half-plane form of the slicer mask. `mode` mirrors uWedgeMode.
 * @typedef {{
 *   active: boolean, mode: number,
 *   yOff: number, r2: number, zMin: number, zMax: number,
 *   nAx: number, nAy: number, nBx: number, nBy: number,
 * }} WedgeMask
 */

/**
 * Builds a WedgeMask from the slicer's raw mask state
 * (slicer.getMaskState() shape).
 * @param {{ active: boolean, r2: number, yOff: number, zMin: number, zMax: number,
 *           thetaLen: number, phi: number, fullTh: boolean, emptyTh: boolean }} s
 * @returns {WedgeMask}
 */
export function buildWedgeMask(s) {
  const mode = !s.active || s.emptyTh ? 0 : s.fullTh ? 3 : s.thetaLen <= Math.PI ? 1 : 2;
  return {
    active: !!s.active && mode > 0,
    mode,
    yOff: s.yOff,
    r2: s.r2,
    zMin: s.zMin,
    zMax: s.zMax,
    nAx: Math.cos(s.phi),
    nAy: Math.sin(s.phi),
    nBx: Math.cos(s.phi + s.thetaLen),
    nBy: Math.sin(s.phi + s.thetaLen),
  };
}

/**
 * CPU mirror of cgvInsideWedge — used by picking, particle endpoints and the
 * cinema tour so CPU-side decisions agree with what the GPU draws.
 * @param {number} x @param {number} y @param {number} z
 * @param {WedgeMask | null | undefined} m
 */
export function insideWedge(x, y, z, m) {
  if (!m || !m.active) return false;
  const dy = y - m.yOff;
  if (x * x + dy * dy >= m.r2) return false;
  if (z <= m.zMin || z >= m.zMax) return false;
  if (m.mode === 3) return true;
  const ca = m.nAx * dy - m.nAy * x;
  const cb = m.nBx * dy - m.nBy * x;
  return m.mode === 1 ? ca >= 0 && cb <= 0 : ca >= 0 || cb <= 0;
}

/** @type {WedgeMask | null} */
let _currentMask = null;

/** Latest mask pushed to the GPU — CPU consumers read this for parity. */
export const getWedgeMask = () => _currentMask;

/**
 * Pushes the slicer's mask state into the shared uniforms (and the CPU
 * mirror). This is the entire per-drag cost of the slicer.
 * @param {Parameters<typeof buildWedgeMask>[0]} state
 */
export function updateWedgeMask(state) {
  const m = buildWedgeMask(state);
  _currentMask = m.active ? m : null;
  WEDGE_UNIFORMS.uWedgeOn.value = m.active ? 1 : 0;
  WEDGE_UNIFORMS.uWedgeMode.value = m.mode;
  WEDGE_UNIFORMS.uWedgeYOff.value = m.yOff;
  WEDGE_UNIFORMS.uWedgeR2.value = m.r2;
  WEDGE_UNIFORMS.uWedgeZMin.value = m.zMin;
  WEDGE_UNIFORMS.uWedgeZMax.value = m.zMax;
  WEDGE_UNIFORMS.uWedgeNA.value.set(m.nAx, m.nAy);
  WEDGE_UNIFORMS.uWedgeNB.value.set(m.nBx, m.nBy);
}

/** @param {number} z scene.rotation.z */
export function setWedgeSceneRotation(z) {
  WEDGE_UNIFORMS.uWedgeRot.value.set(Math.cos(z), Math.sin(z));
}

// ── Built-in material injection helpers ──────────────────────────────────────
// All three helpers share WEDGE_UNIFORMS by reference, so a single
// updateWedgeMask() call drives every clipped material.

/**
 * Per-instance clip for InstancedMesh materials (FCAL): culls whole instances
 * in the vertex stage by testing the instance translation (scene-local when
 * the mesh's ancestors carry no transform, which holds for fcalGroup).
 * @param {THREE.Material} mat
 */
export function applyWedgeClipInstanced(mat) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WEDGE_UNIFORMS);
    shader.vertexShader =
      WEDGE_GLSL +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
#ifdef USE_INSTANCING
  if (cgvInsideWedge(vec3(instanceMatrix[3]))) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
#endif`,
      );
  };
  mat.customProgramCacheKey = () => 'cgv-wedge-instanced';
}

/**
 * Per-vertex clip against an explicit `aCenter` vec3 attribute carrying the
 * owning cell's scene-local centre (FCAL outline lines). Whole primitives
 * vanish when their cell centre is inside the wedge — same semantics as the
 * cell meshes.
 * @param {THREE.Material} mat
 */
export function applyWedgeClipAttrCenter(mat) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WEDGE_UNIFORMS);
    shader.vertexShader =
      'attribute vec3 aCenter;\n' +
      WEDGE_GLSL +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  if (cgvInsideWedge(aCenter)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`,
      );
  };
  mat.customProgramCacheKey = () => 'cgv-wedge-attr-center';
}

/**
 * Per-fragment clip in world space (counter-rotated into scene-local) — for
 * materials whose geometry has no per-cell identity: muon chambers and their
 * outlines, the single-cell hover/pinned outlines. Produces a true geometric
 * cut through the surface.
 * @param {THREE.Material} mat
 */
export function applyWedgeClipWorld(mat) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WEDGE_UNIFORMS);
    shader.vertexShader =
      'varying vec3 vCgvWorld;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vCgvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader =
      'varying vec3 vCgvWorld;\n' +
      WEDGE_GLSL +
      shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
  if (cgvInsideWedge(cgvWorldToScene(vCgvWorld))) discard;`,
      );
  };
  mat.customProgramCacheKey = () => 'cgv-wedge-world';
}
