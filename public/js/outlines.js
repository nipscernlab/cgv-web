// @ts-check
import * as THREE from 'three';
import { scene, markDirty } from './renderer.js';
import { fcalGroup, fcalEdgeMat4, getFcalEdgeBase, visHandles } from './visibility.js';
import { clearChamberHoverOutline } from './trackAtlasIntersections.js';

// ── EdgesGeometry outline (hover) ─────────────────────────────────────────────
// `transparent: true` (at opacity 1.0) moves the hover into Three.js's
// transparent pass so it draws AFTER the permanent 50%-black outline (which
// is itself transparent); otherwise opaque→transparent ordering makes the
// permanent outline paint over the hover.
const eGeoCache = new Map();
const outlineMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 1.0,
});
/** @type {THREE.LineSegments | null} */
let outlineMesh = null;

// Recolor the single hover / pinned outline material (shared by showOutline,
// showFcalOutline and the pinned outlines). Live — repaints next frame.
/** @param {string} hex */
export function setHoverOutlineColor(hex) {
  outlineMat.color.set(hex);
  markDirty();
}

export function clearOutline() {
  // Also drops any per-mesh muon-chamber hover outlines forced visible by
  // showChamberHoverOutline — keeps "leave hover, every outline goes away"
  // a single call at every consumer.
  clearChamberHoverOutline();
  if (!outlineMesh) return;
  scene.remove(outlineMesh);
  outlineMesh = null;
  markDirty();
}

// Build a white EdgesGeometry outline mesh for a cell handle, placed at the
// cell's origMatrix. Shared by the single hover outline (showOutline) and the
// persistent pinned outlines (makePinnedOutline). The edge geometry is cached
// per source geometry so repeat outlines are cheap.
/** @param {any} h cell handle (see CellHandle in state.js) */
function _buildCellOutline(h) {
  const geo = h.iMesh.geometry;
  const uid = geo.uuid;
  if (!eGeoCache.has(uid)) eGeoCache.set(uid, new THREE.EdgesGeometry(geo, 30));
  const mesh = new THREE.LineSegments(eGeoCache.get(uid), outlineMat);
  // Decompose the cell's origMatrix into the outline's position/quaternion/
  // scale so matrixAutoUpdate=true (default) reproduces it correctly each
  // frame — and so a rotated scene's matrixWorld propagates to the outline
  // without any per-add fix-ups.
  mesh.applyMatrix4(h.origMatrix);
  mesh.renderOrder = 999;
  return mesh;
}

/** @param {any} h cell handle (see CellHandle in state.js) */
export function showOutline(h) {
  if (outlineMesh?.userData.src === h.name) return;
  clearOutline();
  outlineMesh = _buildCellOutline(h);
  outlineMesh.userData.src = h.name;
  scene.add(outlineMesh);
  markDirty();
}

// Build a white outline mesh for one FCAL InstancedMesh instance by transforming
// the shared cylinder edge base by the instance matrix. Returns null when the
// FCAL instanced mesh isn't present. Shared by the hover outline
// (showFcalOutline) and the persistent pinned outlines (makePinnedFcalOutline).
/** @param {number} instanceId @returns {THREE.LineSegments | null} */
function _buildFcalOutline(instanceId) {
  const iMesh = /** @type {any} */ (
    fcalGroup?.children.find((/** @type {any} */ c) => c.isInstancedMesh)
  );
  if (!iMesh) return null;
  iMesh.getMatrixAt(instanceId, fcalEdgeMat4);
  const eb = getFcalEdgeBase();
  const buf = new Float32Array(eb.length);
  const m = fcalEdgeMat4.elements;
  for (let j = 0; j < eb.length; j += 3) {
    const lx = eb[j],
      ly = eb[j + 1],
      lz = eb[j + 2];
    buf[j] = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
    buf[j + 1] = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
    buf[j + 2] = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(buf, 3));
  const mesh = new THREE.LineSegments(geo, outlineMat);
  mesh.renderOrder = 999;
  return mesh;
}

// Show hover outline (white) for a specific FCAL InstancedMesh instance.
/** @param {number} instanceId */
export function showFcalOutline(instanceId) {
  const src = 'fcal_' + instanceId;
  if (outlineMesh?.userData.src === src) return;
  clearOutline();
  const mesh = _buildFcalOutline(instanceId);
  if (!mesh) return;
  outlineMesh = mesh;
  outlineMesh.userData.src = src;
  scene.add(outlineMesh);
  markDirty();
}

// ── Pinned (persistent) outlines ─────────────────────────────────────────────
// A pinned tooltip card (see js/hoverTooltip.js) keeps its cell outlined in
// white for as long as the card lives — independent of the single hover outline
// above, so orbiting the scene (which clears the hover outline) leaves these in
// place. The caller owns each returned mesh and hands it back to
// removePinnedOutline when the card is dismissed or pruned. Several may coexist
// (one per pinned card); they all share the white outlineMat.
/** @param {any} h cell handle (see CellHandle in state.js) @returns {THREE.LineSegments} */
export function makePinnedOutline(h) {
  const mesh = _buildCellOutline(h);
  scene.add(mesh);
  markDirty();
  return mesh;
}

/** @param {number} instanceId @returns {THREE.LineSegments | null} */
export function makePinnedFcalOutline(instanceId) {
  const mesh = _buildFcalOutline(instanceId);
  if (mesh) {
    scene.add(mesh);
    markDirty();
  }
  return mesh;
}

/** @param {THREE.LineSegments | null | undefined} mesh */
export function removePinnedOutline(mesh) {
  if (!mesh) return;
  scene.remove(mesh);
  markDirty();
}

// ── All-cells outline (optimised: cached world-space edges per mesh) ─────────
const outlineAllMat = new THREE.LineBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});
const _edgeWorldCache = new Map(); // handle.name → Float32Array (world-space positions)
/** @type {THREE.LineSegments | null} */
let allOutlinesMesh = null;

// Recolor the persistent all-cells outline material. Live — repaints next frame.
/** @param {string} hex */
export function setAllOutlineColor(hex) {
  outlineAllMat.color.set(hex);
  markDirty();
}

/** @param {any} h cell handle (see CellHandle in state.js) */
function _getWorldEdges(h) {
  const cached = _edgeWorldCache.get(h.name);
  if (cached) return cached;
  const geo = h.iMesh.geometry;
  const uid = geo.uuid;
  if (!eGeoCache.has(uid)) eGeoCache.set(uid, new THREE.EdgesGeometry(geo, 30));
  const src = eGeoCache.get(uid).getAttribute('position').array;
  const m = h.origMatrix.elements;
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i],
      y = src[i + 1],
      z = src[i + 2];
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  _edgeWorldCache.set(h.name, out);
  return out;
}

export function clearAllOutlines() {
  if (!allOutlinesMesh) return;
  scene.remove(allOutlinesMesh);
  allOutlinesMesh.geometry.dispose();
  allOutlinesMesh = null;
  markDirty();
}

export function rebuildAllOutlines() {
  clearAllOutlines();
  if (!visHandles.length) return;
  // Count total floats needed
  let total = 0;
  const edgeArrays = new Array(visHandles.length);
  for (let i = 0; i < visHandles.length; i++) {
    const arr = _getWorldEdges(visHandles[i]);
    edgeArrays[i] = arr;
    total += arr.length;
  }
  // Single allocation, memcpy each cached array
  const buf = new Float32Array(total);
  let offset = 0;
  for (let i = 0; i < edgeArrays.length; i++) {
    buf.set(edgeArrays[i], offset);
    offset += edgeArrays[i].length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(buf, 3));
  allOutlinesMesh = new THREE.LineSegments(geo, outlineAllMat);
  allOutlinesMesh.frustumCulled = false;
  allOutlinesMesh.renderOrder = 3;
  scene.add(allOutlinesMesh);
  markDirty();
}
