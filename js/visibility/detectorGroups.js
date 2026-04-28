// @ts-check
// Three.js groups for the per-event objects (tracks, photons, electrons,
// muons, clusters, jets, taus, MET arrows, vertex markers) plus the small
// "user intent" booleans for the J / K toolbar toggles.
//
// Each setter is called once when the group is built in processXml; the
// view-level gate then enables / disables them when the user moves between
// levels 1 / 2 / 3 via applyDetectorGroupViewLevel(), invoked from
// visibility.js's _applyViewLevelGate. All visibility decisions route
// through the per-group `_isXGroupVisible` predicates, so the rule for
// each group lives in one place.
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

// ── Visibility predicates (single source of truth for each group's gate) ─────
// Every setter and the level gate route through these — so a change to (say)
// the electron rule lands in one place instead of half a dozen.
const _isPhotonGroupVisible = () => _photonsVisible && getViewLevel() === 3;
const _isElectronGroupVisible = () =>
  _tracksVisible && _electronTracksVisible && getViewLevel() === 3;
const _isMuonGroupVisible = () => _tracksVisible && _muonTracksVisible && getViewLevel() === 3;
const _isClusterGroupVisible = () => _clustersVisible && getViewLevel() === 2;
const _isJetGroupVisible = () => _jetsVisible && getViewLevel() === 3;
const _isTauGroupVisible = () => _tausVisible && getViewLevel() === 3;
const _isMetGroupVisible = () => _metVisible && getViewLevel() === 3;

// Push the predicate onto the actual group ref. No-op when the group hasn't
// been built yet for the current event.
const _refreshPhoton = () => {
  if (_photonGroup) _photonGroup.visible = _isPhotonGroupVisible();
};
const _refreshElectron = () => {
  if (_electronGroup) _electronGroup.visible = _isElectronGroupVisible();
};
const _refreshMuon = () => {
  if (_muonGroup) _muonGroup.visible = _isMuonGroupVisible();
};
const _refreshCluster = () => {
  if (_clusterGroup) _clusterGroup.visible = _isClusterGroupVisible();
};
const _refreshJet = () => {
  if (_jetGroup) _jetGroup.visible = _isJetGroupVisible();
};
const _refreshTau = () => {
  if (_tauGroup) _tauGroup.visible = _isTauGroupVisible();
};
const _refreshMet = () => {
  if (_metGroup) _metGroup.visible = _isMetGroupVisible();
};

// ── Group registration (called once per group at event load) ─────────────────
/** @param {VisibleObject | null} g */
export function setTrackGroup(g) {
  _trackGroup = g;
  if (g) g.visible = _tracksVisible;
}
/** @param {VisibleObject | null} g */
export function setPhotonGroup(g) {
  _photonGroup = g;
  _refreshPhoton();
}
/** @param {VisibleObject | null} g */
export function setElectronGroup(g) {
  _electronGroup = g;
  _refreshElectron();
}
/** @param {VisibleObject | null} g */
export function setMuonGroup(g) {
  _muonGroup = g;
  _refreshMuon();
}
/** @param {VisibleObject | null} g */
export function setClusterGroup(g) {
  _clusterGroup = g;
  _refreshCluster();
}
/** @param {VisibleObject | null} g */
export function setJetGroup(g) {
  _jetGroup = g;
  _refreshJet();
}
/** @param {VisibleObject | null} g */
export function setTauGroup(g) {
  _tauGroup = g;
  _refreshTau();
}
/** @param {VisibleObject | null} g */
export function setMetGroup(g) {
  _metGroup = g;
  _refreshMet();
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
  // e±/μ± labels are anchored to track polylines — hide / restore them with
  // the J button (subject to L3 + K-popover flag, applied by the predicates).
  _refreshElectron();
  _refreshMuon();
}
/** @param {boolean} v */
export function setClustersVisible(v) {
  _clustersVisible = v;
  _refreshCluster();
}
/** @param {boolean} v */
export function setJetsVisible(v) {
  _jetsVisible = v;
  _refreshJet();
}
/** @param {boolean} v */
export function setPhotonsVisible(v) {
  _photonsVisible = v;
  _refreshPhoton();
}
/** @param {boolean} v */
export function setMetVisible(v) {
  _metVisible = v;
  _refreshMet();
}
// Track-subset setters: applyParticleTrackFilters() walks trackGroup.children
// and applies the matched-track flags. The electron / muon flags ALSO refresh
// their label-sprite group's visibility — sprites were built once at draw
// time (see particles.js) and live until the next event load.
/** @param {boolean} v */
export function setElectronTracksVisible(v) {
  _electronTracksVisible = v;
  _refreshElectron();
}
/** @param {boolean} v */
export function setMuonTracksVisible(v) {
  _muonTracksVisible = v;
  _refreshMuon();
}
/** @param {boolean} v */
export function setTauTracksVisible(v) {
  _tauTracksVisible = v;
}

/**
 * Re-applies the per-group level gate. Called from visibility.js's
 * _applyViewLevelGate whenever the user switches between view levels.
 * Tracks (and the always-on vertex group) are unaffected. Each refresh
 * reads getViewLevel() through its predicate, so the level isn't an
 * argument here.
 */
export function applyDetectorGroupViewLevel() {
  _refreshCluster();
  _refreshPhoton();
  _refreshElectron();
  _refreshMuon();
  _refreshJet();
  _refreshTau();
  _refreshMet();
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
