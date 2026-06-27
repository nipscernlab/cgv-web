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
import { CGV_WAVE_UNIFORM, CGV_WAVE_FADE } from '../collisionReplay.js';
import { markDirty } from '../renderer.js';
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
    // B2 collision replay, shared by reference with the cells (megaCells.js):
    // the same expanding front lights the cones in lockstep. < 0 → off.
    uCgvWaveR: CGV_WAVE_UNIFORM,
    uCgvWaveFade: CGV_WAVE_FADE,
  },
  vertexShader: `varying vec3 vN;
varying vec3 vV;
varying vec3 vWorld;
void main() {
  vN = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * mv;
}`,
  fragmentShader: `uniform vec3 uColor;
uniform float uAlpha;
uniform float uCgvWaveR;
uniform float uCgvWaveFade;
varying vec3 vN;
varying vec3 vV;
varying vec3 vWorld;
void main() {
  float ndv = abs(dot(normalize(vN), normalize(vV)));
  float fres = pow(1.0 - ndv, 2.0);
  float a = uAlpha * (0.2 + 0.8 * fres);
  vec3 col = uColor;
  // B2 collision replay: the light front that ignites the cells washes along
  // the cone too — apex (the vertex) first, base (the calo face) last. Ahead
  // of the front the cone dims to a hush, a warm crest rides the front itself,
  // and behind it the cone settles back to its normal whisper. The fade lerps
  // the modulation back to 1.0 so it dissolves at shutoff. uCgvWaveR < 0 → off.
  if (uCgvWaveR >= 0.0) {
    float wd = length(vWorld) - uCgvWaveR;
    float lit = 1.0 - smoothstep(0.0, 300.0, wd);
    float band = exp(-abs(wd) / 300.0);
    float wa = a * mix(0.05, 1.0, lit) + band * (0.06 + 0.22 * fres);
    a = mix(a, wa, uCgvWaveFade);
    col = mix(uColor, vec3(1.0, 0.96, 0.88), band * 0.7 * uCgvWaveFade);
  }
  gl_FragColor = vec4(col, a);
}`,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});

// ── User controls for the cone colour / opacity / blending ───────────────────
// Surfaced as the colorpicker.js "Cones" tab. Three knobs keep the cones legible
// on any backdrop:
//   • colour   — uColor, so the cone can contrast a dark OR a light scene;
//   • opacity  — a global multiplier on the per-cone ET alpha (default 1×), so
//                the user can crank the whisper up to a clearly visible veil;
//   • blending — additive on dark backdrops (overlapping jets reinforce, the
//                intended glow) but normal alpha on light ones, where "add onto
//                white" is a no-op and the cone would vanish. A transparent PNG
//                export forces normal too: additive writes almost no alpha, so
//                the cone would be missing from the saved file.
export const CONE_COLOR_DEFAULT = '#ff8800';
export const CONE_OPACITY_DEFAULT = 1;
export const CONE_OPACITY_MAX = 4;
const CONE_OPACITY_KEY = 'cgv-cone-opacity';

let _coneOpacityScale = (() => {
  try {
    const v = parseFloat(localStorage.getItem(CONE_OPACITY_KEY) ?? '');
    return Number.isFinite(v) ? Math.max(0, Math.min(CONE_OPACITY_MAX, v)) : CONE_OPACITY_DEFAULT;
  } catch (_) {
    return CONE_OPACITY_DEFAULT;
  }
})();
let _bgIsLight = false; // backdrop luminance says "use normal blending"
let _forceNormalBlend = false; // transparent PNG capture in progress

function _applyConeBlending() {
  const mode = _bgIsLight || _forceNormalBlend ? THREE.NormalBlending : THREE.AdditiveBlending;
  if (_CONE_MAT.blending !== mode) {
    _CONE_MAT.blending = mode;
    _CONE_MAT.needsUpdate = true;
  }
  markDirty();
}

export function getJetConeOpacity() {
  return _coneOpacityScale;
}

/** @param {number} scale  global cone-alpha multiplier, 0..CONE_OPACITY_MAX. */
export function setJetConeOpacity(scale) {
  _coneOpacityScale = Math.max(0, Math.min(CONE_OPACITY_MAX, Number(scale) || 0));
  try {
    localStorage.setItem(CONE_OPACITY_KEY, String(_coneOpacityScale));
  } catch (_) {
    /* ignore */
  }
  markDirty();
}

/** @param {string} hex  cone fill colour. */
export function setJetConeColor(hex) {
  _CONE_MAT.uniforms.uColor.value.set(hex);
  _CONE_MAT.uniformsNeedUpdate = true;
  markDirty();
}

// Perceptual luminance of the backdrop → pick a blend mode the cone survives.
/** @param {string} hex  current scene background colour. */
export function setJetConeBackdrop(hex) {
  const c = new THREE.Color(hex);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // 0..1
  _bgIsLight = lum > 0.45;
  _applyConeBlending();
}

// Transparent PNG export (screenshot.js) blanks the scene background; force
// normal alpha for the capture so the cone writes real alpha into the file,
// then restore the backdrop-driven mode.
/** @param {boolean} on */
export function setJetConeTransparentCapture(on) {
  _forceNormalBlend = !!on;
  _applyConeBlending();
}

// User toggle for the ΔR cones (Helpers panel) — some users prefer the axis
// lines alone. Persisted per browser; default on.
const JET_CONES_KEY = 'cgv-jet-cones';
let _conesVisible = (() => {
  try {
    return localStorage.getItem(JET_CONES_KEY) !== '0';
  } catch (_) {
    return true;
  }
})();

export function getJetConesVisible() {
  return _conesVisible;
}

/** @param {boolean} v */
export function setJetConesVisible(v) {
  _conesVisible = !!v;
  try {
    localStorage.setItem(JET_CONES_KEY, _conesVisible ? '1' : '0');
  } catch (_) {
    /* ignore */
  }
  const g = /** @type {any} */ (getJetGroup());
  if (!g) return;
  for (const line of g.children) {
    for (const child of line.children ?? []) {
      if (child.userData.isJetCone) child.visible = _conesVisible;
    }
  }
}

/**
 * Anti-kt radius from the collection key: "AntiKt4EMPFlowJets" → 0.4,
 * "AntiKt10LCTopo…" → 1.0. Falls back to the ATLAS default 0.4.
 * Exported for the minimap's jet circles (B4).
 * @param {string} key
 */
export function jetRadiusFromKey(key) {
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
  // ET → intensity: 0.03 (soft veil) up to 0.115 at ≥150 GeV. Toned down
  // after the 2026-06-12 review — the cones must whisper, not dominate.
  const a = 0.03 + 0.085 * Math.min(1, Math.max(0, (etGev ?? 30) / 150));
  cone.userData.coneAlpha = a;
  cone.onBeforeRender = () => {
    _CONE_MAT.uniforms.uAlpha.value = cone.userData.coneAlpha * _coneOpacityScale;
    _CONE_MAT.uniformsNeedUpdate = true;
  };
  cone.raycast = () => {}; // the axis line stays the hover target
  cone.renderOrder = 6;
  cone.userData.isJetCone = true;
  cone.visible = _conesVisible; // honours the Helpers "Jet Cones" toggle
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
      const rJet = jetRadiusFromKey(sgk);
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
