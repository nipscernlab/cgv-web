// @ts-check
// Three.js groups for the per-event objects (tracks, photons, electrons,
// muons, clusters, jets, taus, MET arrows, vertex markers) plus the small
// "user intent" booleans for the J / K toolbar toggles.
//
// Each setter is called once when the group is built in processXml; the
// view-level gate then enables / disables them when the user moves between
// levels 1 / 2 / 3 via applyDetectorGroupViewLevel(level), invoked from
// visibility.js's _applyViewLevelGate.
//
// No Three.js is imported directly here — the groups arrive from outside,
// already constructed; we only flip mesh.visible / group.visible. That keeps
// this module pure-ish so it can be tested in node with a stub group object.
import { getViewLevel } from '../viewLevel.js';

/**
 * Structural type that fits THREE.Group / THREE.Object3D without importing
 * Three.js. Visibility consumers (visibility.applyTrackThreshold, etc.) read
 * `children[i].userData.<thing>`, so the children's userData is part of the
 * shape.
 * @typedef {{
 *   visible: boolean,
 *   children?: ReadonlyArray<{ visible: boolean, userData: Record<string, any> }>,
 * }} VisibleObject
 */

// ── Group references ─────────────────────────────────────────────────────────
/** @type {VisibleObject | null} */ let _trackGroup = null;
/** @type {VisibleObject | null} */ let _photonGroup = null;
/** @type {VisibleObject | null} */ let _electronGroup = null;
/** @type {VisibleObject | null} */ let _muonGroup = null;
/** @type {VisibleObject | null} */ let _clusterGroup = null;
/** @type {VisibleObject | null} */ let _jetGroup = null;
/** @type {VisibleObject | null} */ let _tauGroup = null;
/** @type {VisibleObject | null} */ let _metGroup = null;
/** @type {VisibleObject | null} */ let _vertexGroup = null;

// ── User-intent toggles ──────────────────────────────────────────────────────
// Tracks toggle (J button): controls only the track lines. Photons and
// electrons are no longer linked to this flag — their visibility comes from
// the view level (level 3 shows them).
let _tracksVisible = true;
// User intent for the cluster toggle (K button at level 2). The cluster group
// is only actually shown when level === 2 AND the user has clusters enabled.
let _clustersVisible = true;
// Per-particle-type toggles (level-3 only, controlled from the K-button
// popover). Each AND-s with `level === 3` in applyDetectorGroupViewLevel.
let _jetsVisible = true; // jet η/φ centerlines
let _photonsVisible = true; // photon "spring" lines
let _metVisible = true; // MET arrow
// τs follow the same level-3 gate as jets but have no toolbar toggle of
// their own — they are silently on whenever jets are.
const _tausVisible = true;
// Track-line subset filters (level-3 popover): hide only the matched subset
// of trackGroup.children. The J button still gates the whole trackGroup,
// these add a second pass on top. Filters live in applyParticleTrackFilters
// below.
let _electronTracksVisible = true;
let _muonTracksVisible = true;
let _tauTracksVisible = true;

// ── Read accessors ───────────────────────────────────────────────────────────
export const getTrackGroup = () => _trackGroup;
export const getPhotonGroup = () => _photonGroup;
export const getElectronGroup = () => _electronGroup;
export const getMuonGroup = () => _muonGroup;
export const getClusterGroup = () => _clusterGroup;
export const getJetGroup = () => _jetGroup;
export const getTauGroup = () => _tauGroup;
export const getMetGroup = () => _metGroup;
export const getVertexGroup = () => _vertexGroup;

export const getTracksVisible = () => _tracksVisible;
export const getClustersVisible = () => _clustersVisible;
export const getJetsVisible = () => _jetsVisible;
export const getPhotonsVisible = () => _photonsVisible;
export const getMetVisible = () => _metVisible;
export const getElectronTracksVisible = () => _electronTracksVisible;
export const getMuonTracksVisible = () => _muonTracksVisible;
export const getTauTracksVisible = () => _tauTracksVisible;

// ── Group registration (called once per group at event load) ─────────────────
/** @param {VisibleObject | null} g */
export function setTrackGroup(g) {
  _trackGroup = g;
  if (g) g.visible = _tracksVisible;
}
/** @param {VisibleObject | null} g */
export function setPhotonGroup(g) {
  _photonGroup = g;
  if (g) g.visible = getViewLevel() === 3;
}
/** @param {VisibleObject | null} g */
export function setElectronGroup(g) {
  _electronGroup = g;
  if (g) g.visible = _tracksVisible && _electronTracksVisible && getViewLevel() === 3;
}
/** @param {VisibleObject | null} g */
export function setMuonGroup(g) {
  _muonGroup = g;
  if (g) g.visible = _tracksVisible && _muonTracksVisible && getViewLevel() === 3;
}
/** @param {VisibleObject | null} g */
export function setClusterGroup(g) {
  _clusterGroup = g;
  if (g) g.visible = _clustersVisible && getViewLevel() === 2;
}
/** @param {VisibleObject | null} g */
export function setJetGroup(g) {
  _jetGroup = g;
  if (g) g.visible = _jetsVisible && getViewLevel() === 3;
}
/** @param {VisibleObject | null} g */
export function setTauGroup(g) {
  _tauGroup = g;
  if (g) g.visible = _tausVisible && getViewLevel() === 3;
}
/** @param {VisibleObject | null} g */
export function setMetGroup(g) {
  _metGroup = g;
  if (g) g.visible = getViewLevel() === 3;
}
// Vertices are event-level summary info — relevant at every view level, so
// no gate. Always visible while the marker group exists.
/** @param {VisibleObject | null} g */
export function setVertexGroup(g) {
  _vertexGroup = g;
}

// ── Toolbar toggles ──────────────────────────────────────────────────────────
/** @param {boolean} v */
export function setTracksVisible(v) {
  _tracksVisible = v;
  if (_trackGroup) _trackGroup.visible = v;
  // e±/μ± labels are anchored to track polylines — hide them with the J
  // button, restore them on toggle back (subject to L3 gate + K-popover flag).
  if (_electronGroup)
    _electronGroup.visible = v && _electronTracksVisible && getViewLevel() === 3;
  if (_muonGroup) _muonGroup.visible = v && _muonTracksVisible && getViewLevel() === 3;
}
/** @param {boolean} v */
export function setClustersVisible(v) {
  _clustersVisible = v;
  if (_clusterGroup) _clusterGroup.visible = v && getViewLevel() === 2;
}
/** @param {boolean} v */
export function setJetsVisible(v) {
  _jetsVisible = v;
  if (_jetGroup) _jetGroup.visible = v && getViewLevel() === 3;
}
/** @param {boolean} v */
export function setPhotonsVisible(v) {
  _photonsVisible = v;
  if (_photonGroup) _photonGroup.visible = v && getViewLevel() === 3;
}
/** @param {boolean} v */
export function setMetVisible(v) {
  _metVisible = v;
  if (_metGroup) _metGroup.visible = v && getViewLevel() === 3;
}
// Track-subset setters do not touch any group themselves — they just record
// intent. applyParticleTrackFilters() walks trackGroup.children and applies
// the three flags by inspecting userData.
/** @param {boolean} v */
export function setElectronTracksVisible(v) {
  _electronTracksVisible = v;
  if (_electronGroup) _electronGroup.visible = _tracksVisible && v && getViewLevel() === 3;
}
/** @param {boolean} v */
export function setMuonTracksVisible(v) {
  _muonTracksVisible = v;
  if (_muonGroup) _muonGroup.visible = _tracksVisible && v && getViewLevel() === 3;
}
/** @param {boolean} v */
export function setTauTracksVisible(v) {
  _tauTracksVisible = v;
}

/**
 * Re-applies the per-group level gate. Called from visibility.js's
 * _applyViewLevelGate whenever the user switches between view levels.
 * Tracks (and the always-on vertex group) are unaffected.
 * @param {number} level
 */
export function applyDetectorGroupViewLevel(level) {
  if (_clusterGroup) _clusterGroup.visible = _clustersVisible && level === 2;
  if (_photonGroup) _photonGroup.visible = _photonsVisible && level === 3;
  if (_electronGroup)
    _electronGroup.visible = _tracksVisible && _electronTracksVisible && level === 3;
  if (_muonGroup) _muonGroup.visible = _tracksVisible && _muonTracksVisible && level === 3;
  if (_jetGroup) _jetGroup.visible = _jetsVisible && level === 3;
  if (_tauGroup) _tauGroup.visible = _tausVisible && level === 3;
  if (_metGroup) _metGroup.visible = _metVisible && level === 3;
}

/**
 * Filters the track-line group by the three matched-particle flags. A line
 * stays visible when none of the three "Off" rules applies; the function
 * does NOT override visibility set by applyTrackThreshold (per-track |pT|
 * threshold) — both gates AND together via direct .visible writes.
 *
 * Called from applyTrackThreshold and from the K-popover handlers.
 */
export function applyParticleTrackFilters() {
  if (!_trackGroup) return;
  for (const child of _trackGroup.children ?? []) {
    if (child.visible === false) continue; // pT threshold already hid it
    const u = child.userData;
    if (!_electronTracksVisible && u.matchedElectronPdgId != null) {
      child.visible = false;
      continue;
    }
    if (!_muonTracksVisible && (u.isMuonMatched || u.storeGateKey === 'CombinedMuonTracks')) {
      child.visible = false;
      continue;
    }
    if (!_tauTracksVisible && u.isTauMatched) {
      child.visible = false;
      continue;
    }
  }
}
