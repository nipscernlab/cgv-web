// @ts-check
import * as THREE from 'three';
import { scene, markDirty } from './renderer.js';
import { fcalGroup, fcalEdgeMat4, getFcalEdgeBase, visHandles } from './visibility.js';
import { clearChamberHoverOutline } from './trackAtlasIntersections.js';
import { getMega } from './megaCells.js';
import { WEDGE_GLSL, WEDGE_UNIFORMS, applyWedgeClipWorld } from './wedgeClip.js';

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
// Hover / pinned outlines follow the slicer carve per fragment (world-space
// test) so an outline never floats inside the cut.
applyWedgeClipWorld(outlineMat);
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
  const geo = h.geo;
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

// ── All-cells outline (merged, slot-driven) ──────────────────────────────────
// One merged LineSegments per detector whose vertices carry the owning cell's
// slot. The shader fetches the SAME colour/visibility + centre textures as
// the cell mega meshes (megaCells.js), so:
//   • a cell hidden by thresholds hides its outline with zero CPU work,
//   • the slicer wedge carves outlines per-cell exactly like the cells,
//   • slicer drags never rebuild this buffer (uniform-only updates).
// The buffer itself is rebuilt only when the *set* of visible handles changes
// (event load, detector toggles) — same cadence as before, same look.
const _outlineUniforms = {
  uColor: { value: new THREE.Color(0x000000) },
  // 2026-06-12 review rounds: 0.5 → 0.8 (crisper) → 0.65 (thinner read while
  // keeping the definition). GL lines are fixed at 1 device pixel, so the
  // only "weight" knob is contrast.
  uOpacity: { value: 0.65 },
};
const _edgeWorldCache = new Map(); // handle.name → Float32Array (world-space positions)
/** @type {Map<string, THREE.LineSegments>} det → merged outline mesh */
const _allOutlineByDet = new Map();
/** @type {Map<string, THREE.ShaderMaterial>} det → slot-outline material */
const _allOutlineMatByDet = new Map();

// Recolor the persistent all-cells outline material. Live — repaints next frame.
/** @param {string} hex */
export function setAllOutlineColor(hex) {
  _outlineUniforms.uColor.value.set(hex);
  markDirty();
}

/** @param {string} det @returns {THREE.ShaderMaterial | null} */
function _allOutlineMaterial(det) {
  let mat = _allOutlineMatByDet.get(det) ?? null;
  if (mat) return mat;
  const mega = getMega(det);
  if (!mega) return null;
  mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      ..._outlineUniforms,
      ...WEDGE_UNIFORMS,
      uCellTex: { value: mega.tex },
      uCenterTex: { value: mega.centersTex },
    },
    defines: { CGV_TEXW: mega.texW },
    vertexShader:
      WEDGE_GLSL +
      /* glsl */ `
attribute float aSlot;
uniform sampler2D uCellTex;
uniform sampler2D uCenterTex;
void main() {
  int s = int(aSlot + 0.5);
  ivec2 tc = ivec2(s % CGV_TEXW, s / CGV_TEXW);
  vec4 cv = texelFetch(uCellTex, tc, 0);
  vec3 centre = texelFetch(uCenterTex, tc, 0).xyz;
  if (cv.a < 0.5 || cgvInsideWedge(centre)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  } else {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(uColor, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  _allOutlineMatByDet.set(det, mat);
  return mat;
}

/** @param {any} h cell handle (see CellHandle in state.js) */
function _getWorldEdges(h) {
  const cached = _edgeWorldCache.get(h.name);
  if (cached) return cached;
  const geo = h.geo;
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

// Whether any all-cells outline meshes currently exist — lets applyThreshold
// skip the (expensive) rebuild when per-cell visibility didn't change, while
// still rebuilding after an external clearAllOutlines (e.g. a new event).
export function hasAllOutlines() {
  return _allOutlineByDet.size > 0;
}

export function clearAllOutlines() {
  if (!_allOutlineByDet.size) return;
  for (const mesh of _allOutlineByDet.values()) {
    scene.remove(mesh);
    mesh.geometry.dispose();
  }
  _allOutlineByDet.clear();
  markDirty();
}

export function rebuildAllOutlines() {
  clearAllOutlines();
  if (!visHandles.length) return;
  // Group by detector — each detector has its own slot space / textures.
  /** @type {Map<string, any[]>} */
  const byDet = new Map();
  for (const h of visHandles) {
    let list = byDet.get(h.det);
    if (!list) byDet.set(h.det, (list = []));
    list.push(h);
  }
  for (const [det, list] of byDet) {
    const mat = _allOutlineMaterial(det);
    if (!mat) continue;
    let total = 0;
    const edgeArrays = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const arr = _getWorldEdges(list[i]);
      edgeArrays[i] = arr;
      total += arr.length;
    }
    const buf = new Float32Array(total);
    const slots = new Float32Array(total / 3);
    let offset = 0;
    for (let i = 0; i < edgeArrays.length; i++) {
      buf.set(edgeArrays[i], offset);
      slots.fill(list[i].slot, offset / 3, (offset + edgeArrays[i].length) / 3);
      offset += edgeArrays[i].length;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buf, 3));
    geo.setAttribute('aSlot', new THREE.BufferAttribute(slots, 1));
    const mesh = new THREE.LineSegments(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    scene.add(mesh);
    _allOutlineByDet.set(det, mesh);
  }
  markDirty();
}
