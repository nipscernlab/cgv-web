// @ts-check
// Calorimeter clusters drawn as η/φ-direction dashed lines spanning the band
// between the inner-detector cylinder (r ≈ 1.42 m) and the outer cylinder
// (r ≈ 3.82 m) — the visual zone occupied by the calo.
//
// Splash glyphs (docs/VISUAL_PLAN.md, item B5): every visible cluster also
// gets a soft ring "splash" on the inner calo face, scaled by its ET — the
// quantity the dashed line could never show. All glyphs live in ONE
// InstancedMesh (a single extra draw call however many clusters the event
// carries); per-cluster visibility is synced from the lines' visible flags
// by syncClusterGlyphs, which applyClusterThreshold calls after every
// threshold / region pass.

import * as THREE from 'three';
import { getClusterGroup, setClusterGroup, applyClusterThreshold } from '../visibility.js';
import { makeFatLineMaterial } from '../fatLines.js';
import { _disposeGroup, _buildEtaPhiLineGroup, _innerCaloFaceIntersect } from './_internal.js';

// Lines are drawn from the inner cylinder out to the outer cylinder in the
// η/φ direction (5 m bridge). Coordinate convention matches tracks:
// Three.js X = −ATLAS x, Y = −ATLAS y.
const CLUSTER_MAT = makeFatLineMaterial({
  color: 0xff4400,
  widthPx: 2,
  dashed: true,
  dashSize: 40,
  gapSize: 60,
});

// Set cluster-line opacity (0..1). Fully opaque writes depth like solid
// geometry; translucent disables depth-write so overlapping lines blend
// instead of occluding each other. Driven by the Helpers line-opacity slider.
/** @param {number} o  line opacity in 0..1. */
export function setClusterLineOpacity(o) {
  CLUSTER_MAT.opacity = o;
  CLUSTER_MAT.transparent = o < 1;
  CLUSTER_MAT.depthWrite = o >= 1;
  CLUSTER_MAT.needsUpdate = true;
}

// ── B5: splash glyphs ────────────────────────────────────────────────────────
// One shared fresnel-ish ring shader; the soft core + bright rim reads as an
// energy splash on the calo face without occluding the cells behind it.
const _GLYPH_MAT = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(0xff4400) } },
  vertexShader: `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`,
  fragmentShader: `uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  if (d > 1.0) discard;
  float core = pow(max(0.0, 1.0 - d), 1.5) * 0.30;
  float ring = smoothstep(0.55, 0.8, d) * (1.0 - smoothstep(0.85, 1.0, d)) * 0.55;
  gl_FragColor = vec4(uColor, core + ring);
}`,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});

const _Z_AXIS = new THREE.Vector3(0, 0, 1);
/** @type {any} */
let _glyphMesh = null;

/** ET (GeV) → splash radius in mm: 1 GeV ≈ 45, 10 ≈ 65, 100+ ≈ 100. */
function _glyphRadiusMm(etGev) {
  const et = Math.max(0, etGev ?? 0);
  return 30 + 70 * Math.min(1, Math.log10(1 + et) / 2);
}

/**
 * Builds the per-event glyph InstancedMesh and parents it to the cluster
 * group. Each line stores its glyph matrix on userData.glyphMat;
 * syncClusterGlyphs compacts the visible ones into the instance buffer.
 * @param {any} grp  the cluster line group
 */
function _buildClusterGlyphs(grp) {
  const lines = grp.children;
  if (!lines.length) return;
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  for (const line of lines) {
    const { eta, phi, etGev } = line.userData;
    const theta = 2 * Math.atan(Math.exp(-eta));
    const sinT = Math.sin(theta);
    const dir = new THREE.Vector3(-sinT * Math.cos(phi), -sinT * Math.sin(phi), Math.cos(theta));
    const t0 = _innerCaloFaceIntersect(dir.x, dir.y, dir.z);
    pos.copy(dir).multiplyScalar(t0);
    quat.setFromUnitVectors(_Z_AXIS, dir); // CircleGeometry faces +Z → face the vertex
    const r = _glyphRadiusMm(etGev);
    scl.set(r, r, 1);
    line.userData.glyphMat = new THREE.Matrix4().compose(pos, quat, scl);
  }
  // Per-event geometry (not the shared singleton) so _disposeGroup's
  // traverse can free it with the rest of the group.
  const geo = new THREE.CircleGeometry(1, 20);
  const imesh = new THREE.InstancedMesh(geo, _GLYPH_MAT, lines.length);
  imesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  imesh.frustumCulled = false;
  imesh.renderOrder = 6;
  imesh.raycast = () => {}; // hover stays on the lines
  imesh.count = 0; // filled by syncClusterGlyphs
  _glyphMesh = imesh;
  grp.add(imesh);
}

/**
 * Compacts the glyphs of currently-visible cluster lines into the instance
 * buffer. Called by applyClusterThreshold after every threshold/region pass.
 */
export function syncClusterGlyphs() {
  if (!_glyphMesh) return;
  const grp = /** @type {any} */ (getClusterGroup());
  if (!grp) return;
  let k = 0;
  for (const child of grp.children) {
    if (!child.visible || !child.userData.glyphMat) continue;
    _glyphMesh.setMatrixAt(k++, child.userData.glyphMat);
  }
  _glyphMesh.count = k;
  _glyphMesh.instanceMatrix.needsUpdate = true;
}

// Cached cluster list so refreshCaloBoundParticles (in particles.js) can
// re-run drawClusters after a visibility change without re-parsing the XML.
/** @type {any[]} */
let _lastClusters = [];
export function getLastClusters() {
  return _lastClusters;
}

export function clearClusters() {
  _lastClusters = [];
  // The glyph InstancedMesh owns GPU instance buffers that the generic
  // geometry-disposing traverse in _disposeGroup doesn't know about.
  if (_glyphMesh) {
    _glyphMesh.dispose();
    _glyphMesh = null;
  }
  _disposeGroup(getClusterGroup, setClusterGroup);
}

/** @param {any[]} clusters  draw list ({ eta, phi, etGev, storeGateKey }). */
export function drawClusters(clusters) {
  clearClusters();
  _lastClusters = Array.isArray(clusters) ? clusters : [];
  _buildEtaPhiLineGroup({
    items: _lastClusters,
    mat: CLUSTER_MAT,
    mapToUserData: (c) => ({
      etGev: c.etGev,
      eta: c.eta,
      phi: c.phi,
      storeGateKey: c.storeGateKey ?? '',
    }),
    setter: setClusterGroup,
    // Cluster events routinely carry thousands of lines (most then hidden
    // by the ET threshold); per-cluster raycasting freezes slider drags.
    // Use the surface-based inner-face intersect — accurate to tens of mm,
    // invisible at the band scale (1.4–3.8 m radial).
    useCellRaycast: false,
  });
  // B5: ET splash glyphs, one InstancedMesh for the whole collection.
  const grp = /** @type {any} */ (getClusterGroup());
  if (grp) _buildClusterGlyphs(grp);
  applyClusterThreshold();
}
