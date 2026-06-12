// @ts-check
// Jets: η/φ axis line (same cylinder span as clusters, orange + dashed) PLUS
// a translucent cone of the jet's real ΔR (docs/VISUAL_PLAN.md, item B1).
//
// An anti-kt jet IS a circle of radius R in η/φ space; around a direction at
// polar angle θ, that circle subtends a 3-D half-angle ≈ sinθ·R. The cone
// (apex at the vertex, base on the outer calo cylinder) is the faithful
// volume of the jet — the dashed line remains as its axis and the hover
// target. Cone intensity scales with ET, so a 30 GeV jet whispers and a
// 300 GeV jet glows. R is parsed from the collection key (AntiKt4… → 0.4,
// AntiKt10… → 1.0); cones are children of their axis line, so visibility,
// thresholds and disposal follow the line automatically.

import * as THREE from 'three';
import { getJetGroup, setJetGroup, applyJetThreshold } from '../visibility.js';
import { makeFatLineMaterial } from '../fatLines.js';
import {
  _disposeGroup,
  _buildEtaPhiLineGroup,
  _refreshEtaPhiLineGroupGeometry,
  _cylIntersect,
  CLUSTER_CYL_OUT_R,
  CLUSTER_CYL_OUT_HALF_H,
} from './_internal.js';

const JET_MAT = makeFatLineMaterial({
  color: 0xff8800,
  widthPx: 2,
  dashed: true,
  dashSize: 40,
  gapSize: 60,
});

// ── Jet cone (B1) ────────────────────────────────────────────────────────────
// One shared fresnel ShaderMaterial: faint through the body, brighter at the
// silhouette, additive so overlapping jets reinforce instead of muddying.
// Per-cone intensity rides in via onBeforeRender + uniformsNeedUpdate (the
// documented per-draw escape hatch for shared ShaderMaterials).
const _Y_AXIS = new THREE.Vector3(0, 1, 0);
const _CONE_MAT = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color(0xff8800) },
    uAlpha: { value: 0.12 },
  },
  vertexShader: `varying vec3 vN;
varying vec3 vV;
void main() {
  vN = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`,
  fragmentShader: `uniform vec3 uColor;
uniform float uAlpha;
varying vec3 vN;
varying vec3 vV;
void main() {
  float ndv = abs(dot(normalize(vN), normalize(vV)));
  float fres = pow(1.0 - ndv, 2.0);
  gl_FragColor = vec4(uColor, uAlpha * (0.2 + 0.8 * fres));
}`,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});

/**
 * Anti-kt radius from the collection key: "AntiKt4EMPFlowJets" → 0.4,
 * "AntiKt10LCTopo…" → 1.0. Falls back to the ATLAS default 0.4.
 * @param {string} key
 */
function _jetRadiusFromKey(key) {
  const m = /antikt(\d+)/i.exec(key || '');
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 20) return n / 10;
  }
  return 0.4;
}

/**
 * Builds the ΔR cone for one jet axis line and parents it to the line (world
 * coords — the line has an identity transform).
 * @param {any} line  jet axis Line2 with userData { eta, phi, etGev }
 * @param {number} rJet  anti-kt R
 */
function _attachJetCone(line, rJet) {
  const { eta, phi, etGev } = line.userData;
  if (eta == null || phi == null) return;
  const theta = 2 * Math.atan(Math.exp(-eta));
  const sinT = Math.sin(theta);
  const dx = -sinT * Math.cos(phi);
  const dy = -sinT * Math.sin(phi);
  const dz = Math.cos(theta);
  const t1 = _cylIntersect(dx, dy, dz, CLUSTER_CYL_OUT_R, CLUSTER_CYL_OUT_HALF_H);
  // ΔR circle → 3-D half-angle ≈ sinθ·R (small-angle map of (Δη, Δφ)).
  const halfAngle = Math.min(1.2, sinT * rJet);
  const baseR = Math.tan(halfAngle) * t1;
  // Per-cone geometry (not shared) so _disposeGroup's traverse can free it
  // with the rest of the per-event group.
  const geo = new THREE.ConeGeometry(baseR, t1, 24, 1, true);
  const cone = new THREE.Mesh(geo, _CONE_MAT);
  // ConeGeometry's apex sits at +Y·h/2: map +Y onto −dir so the apex lands on
  // the origin (vertex) and the base ring on the outer cylinder at t1·dir.
  cone.quaternion.setFromUnitVectors(_Y_AXIS, new THREE.Vector3(-dx, -dy, -dz));
  cone.position.set(dx * t1 * 0.5, dy * t1 * 0.5, dz * t1 * 0.5);
  // ET → intensity: 0.05 (soft veil) up to 0.18 at ≥150 GeV.
  const a = 0.05 + 0.13 * Math.min(1, Math.max(0, (etGev ?? 30) / 150));
  cone.userData.coneAlpha = a;
  cone.onBeforeRender = () => {
    _CONE_MAT.uniforms.uAlpha.value = cone.userData.coneAlpha;
    _CONE_MAT.uniformsNeedUpdate = true;
  };
  cone.raycast = () => {}; // the axis line stays the hover target
  cone.renderOrder = 6;
  line.add(cone);
}

// Set jet-line opacity (0..1). Fully opaque writes depth like solid geometry;
// translucent disables depth-write so overlapping lines blend instead of
// occluding each other. Driven by the Helpers line-opacity slider.
/** @param {number} o  line opacity in 0..1. */
export function setJetLineOpacity(o) {
  JET_MAT.opacity = o;
  JET_MAT.transparent = o < 1;
  JET_MAT.depthWrite = o >= 1;
  JET_MAT.needsUpdate = true;
}

export function clearJets() {
  _disposeGroup(getJetGroup, setJetGroup);
}

// Draws one line per jet in the given collection. `collection` is
// { key, jets: [...] } from jets.js (or null/empty). The collection key
// is stamped on each line so the hover tooltip can show it.
/** @param {{ key: string, jets: any[] } | null | undefined} collection */
export function drawJets(collection) {
  clearJets();
  const jets = collection?.jets ?? [];
  // Always run applyJetThreshold so downstream effects (cell filter,
  // jet→track highlight) flush even when the collection is empty.
  if (collection && jets.length) {
    const sgk = collection.key;
    _buildEtaPhiLineGroup({
      items: jets,
      mat: JET_MAT,
      mapToUserData: (j) => ({
        etGev: j.etGev,
        ptGev: j.ptGev,
        energyGev: j.energyGev,
        massGev: j.massGev,
        eta: j.eta,
        phi: j.phi,
        storeGateKey: sgk,
      }),
      setter: setJetGroup,
    });
    // B1: one ΔR cone per axis line, parented to it (visibility + disposal
    // ride along with the line).
    const g = /** @type {any} */ (getJetGroup());
    if (g) {
      const rJet = _jetRadiusFromKey(sgk);
      for (const line of g.children.slice()) _attachJetCone(line, rJet);
    }
  }
  applyJetThreshold();
}

// Visibility-driven refresh: rewrites the existing jet-line position
// attributes in place rather than rebuilding the group.
export function refreshJetsGeometry() {
  _refreshEtaPhiLineGroupGeometry(getJetGroup(), true);
}
