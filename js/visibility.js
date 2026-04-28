import * as THREE from 'three';
import {
  active,
  cellMeshesByDet,
  rayTargets,
  _ZERO_MAT4,
  _markIMDirty,
  _flushIMDirty,
  _rayIMeshes,
} from './state.js';
import { PAL_TILE_COLOR, PAL_LAR_COLOR, PAL_HEC_COLOR } from './palette.js';
import { markDirty } from './renderer.js';
import { getViewLevel, onViewLevelChange } from './viewLevel.js';
import { getActiveJetCollection } from './jets.js';
import { recomputeJetTrackMatch } from './trackAtlasIntersections.js';
import {
  getLastElectrons,
  syncElectronTrackMatch,
  getLastTaus,
  syncTauTrackMatch,
  getLastMuons,
  syncMuonTrackMatch,
} from './particles.js';
import { layerVis, setLayerLeaf, setLayerSubtree, anyLayerLeafOn, isLayerOn } from './layerVis.js';
import {
  setMuonTrees,
  getMuonAtlasTrees,
  onMuonTreesChange,
  applyMuonVisibility,
} from './muonVisibility.js';
import {
  fcalGroup,
  fcalVisibleMap,
  fcalEdgeMat4,
  getFcalEdgeBase,
  clearFcal,
  drawFcal,
  applyFcalThreshold,
} from './fcalRenderer.js';
import {
  getTrackGroup,
  getPhotonGroup,
  getElectronGroup,
  getMuonGroup,
  getClusterGroup,
  getJetGroup,
  getTauGroup,
  getMetGroup,
  getVertexGroup,
  getTracksVisible,
  getClustersVisible,
  getJetsVisible,
  setTrackGroup,
  setPhotonGroup,
  setElectronGroup,
  setMuonGroup,
  setClusterGroup,
  setJetGroup,
  setTauGroup,
  setMetGroup,
  setVertexGroup,
  setTracksVisible,
  setClustersVisible,
  setJetsVisible,
  applyDetectorGroupViewLevel,
} from './detectorGroups.js';
import {
  thrTileMev,
  thrLArMev,
  thrHecMev,
  thrFcalMev,
  thrTrackGev,
  trackPtMinGev,
  trackPtMaxGev,
  thrClusterEtGev,
  clusterEtMinGev,
  clusterEtMaxGev,
  thrJetEtGev,
  jetEtMinGev,
  jetEtMaxGev,
  setThrTileMev,
  setThrLArMev,
  setThrHecMev,
  setThrFcalMev,
  setThrTrackGev,
  setTrackPtMinGev,
  setTrackPtMaxGev,
  setThrClusterEtGev,
  setClusterEtMinGev,
  setClusterEtMaxGev,
  setThrJetEtGev,
  setJetEtMinGev,
  setJetEtMaxGev,
} from './thresholds.js';

// Re-exported for the layers panel + any other consumer that imported them
// from visibility.js historically. Live-binding semantics preserved.
export { layerVis, setLayerLeaf, setLayerSubtree, anyLayerLeafOn, isLayerOn };
export { setMuonTrees, getMuonAtlasTrees, onMuonTreesChange, applyMuonVisibility };
export {
  fcalGroup,
  fcalVisibleMap,
  fcalEdgeMat4,
  getFcalEdgeBase,
  clearFcal,
  drawFcal,
  applyFcalThreshold,
};
export {
  getTrackGroup,
  getPhotonGroup,
  getElectronGroup,
  getMuonGroup,
  getClusterGroup,
  getJetGroup,
  getTauGroup,
  getMetGroup,
  getVertexGroup,
  getTracksVisible,
  getClustersVisible,
  getJetsVisible,
  setTrackGroup,
  setPhotonGroup,
  setElectronGroup,
  setMuonGroup,
  setClusterGroup,
  setJetGroup,
  setTauGroup,
  setMetGroup,
  setVertexGroup,
  setTracksVisible,
  setClustersVisible,
  setJetsVisible,
};
export {
  thrTileMev,
  thrLArMev,
  thrHecMev,
  thrFcalMev,
  thrTrackGev,
  trackPtMinGev,
  trackPtMaxGev,
  thrClusterEtGev,
  clusterEtMinGev,
  clusterEtMaxGev,
  thrJetEtGev,
  jetEtMinGev,
  jetEtMaxGev,
  setThrTileMev,
  setThrLArMev,
  setThrHecMev,
  setThrFcalMev,
  setThrTrackGev,
  setTrackPtMinGev,
  setTrackPtMaxGev,
  setThrClusterEtGev,
  setClusterEtMinGev,
  setClusterEtMaxGev,
  setThrJetEtGev,
  setJetEtMinGev,
  setJetEtMaxGev,
};

// ── Late-injected dependencies (set via initVisibility after slicer is ready) ─
let _slicer = null;
let _rebuildAllOutlines = null;
let _updateTrackAtlasIntersections = null;

export function initVisibility({ slicer, rebuildAllOutlines, updateTrackAtlasIntersections }) {
  _slicer = slicer;
  _rebuildAllOutlines = rebuildAllOutlines;
  _updateTrackAtlasIntersections = updateTrackAtlasIntersections;
}

// Re-applies cluster / photon / electron visibility AND the cell cluster-filter
// when the view level changes. Tracks are unaffected (they show at every level,
// gated only by setTracksVisible).
function _applyViewLevelGate() {
  const lvl = getViewLevel();
  applyDetectorGroupViewLevel(lvl);
  // Refresh cell visibility: rebuildActiveClusterCellIds reads getViewLevel()
  // and disables the cluster-membership filter outside level 2; applyThreshold
  // then re-evaluates per-cell visibility.
  rebuildActiveClusterCellIds();
  applyThreshold();
  applyFcalThreshold();
  // Track jet-match highlight is only meaningful on level 3; passing null
  // (off levels) makes recompute clear all isJetMatched flags.
  recomputeJetTrackMatch(lvl === 3 ? getActiveJetCollection() : null, thrJetEtGev);
  // Same gate for the electron→track ΔR match — outside L3 we don't want the
  // red/green colours bleeding into the simpler views. syncElectronTrackMatch
  // re-marks tracks AND rebuilds the floating "e±" label sprites.
  syncElectronTrackMatch(lvl === 3 ? getLastElectrons() : null);
  // τ→track colour mirrors the same L3-only gate.
  syncTauTrackMatch(lvl === 3 ? getLastTaus() : null);
  // μ→track sprite labels — same L3-only gate.
  syncMuonTrackMatch(lvl === 3 ? getLastMuons() : null);
  markDirty();
}
onViewLevelChange(_applyViewLevelGate);

// Local alias — the dispatcher itself lives in ./layerVis.js so it can be
// unit-tested without pulling Three.js / scene. The threshold loops below
// reference _detOnFor for backwards-compatible naming inside this module.
const _detOnFor = isLayerOn;

// ── Cluster filter sets (computed from cluster data) ─────────────────────────
let lastClusterData = null;
let activeClusterCellIds = null;
let activeMbtsLabels = null;

export function setLastClusterData(v) {
  lastClusterData = v;
}

// Read accessors used by extracted modules (fcalRenderer) so they can read
// late-injected state without a circular value-import. Functions are safe to
// import in a cycle because their body runs after both modules finish loading.
export const getSlicer = () => _slicer;
export const getActiveClusterCellIds = () => activeClusterCellIds;

// ── Visibility bookkeeping ────────────────────────────────────────────────────
export let visHandles = [];

export function clearVisibilityState() {
  visHandles = [];
  lastClusterData = null;
  activeClusterCellIds = null;
  activeMbtsLabels = null;
}

// ── Core cell handle visibility primitive ─────────────────────────────────────
function _setHandleVisible(h, vis) {
  if (h.visible === vis) return;
  h.visible = vis;
  h.iMesh.setMatrixAt(h.instId, vis ? h.origMatrix : _ZERO_MAT4);
  _markIMDirty(h.iMesh);
}

function _rebuildRayIMeshes() {
  _rayIMeshes.clear();
  for (const h of visHandles) _rayIMeshes.add(h.iMesh);
  rayTargets.length = 0;
  _rayIMeshes.forEach((im) => rayTargets.push(im));
}

// Cached world-space centre of a cell handle (derived from origMatrix).
function _cellCenter(h) {
  if (h._center) return h._center;
  const m = h.origMatrix.elements;
  const c = new THREE.Vector3(m[12], m[13], m[14]);
  if (c.lengthSq() < 1e-6) {
    const geo = h.iMesh.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const bs = geo.boundingSphere;
    if (bs) c.copy(bs.center).applyMatrix4(h.origMatrix);
  }
  h._center = c;
  return c;
}

// Called by the slicer's onHideNonActiveShowAll callback: hide all non-active cells.
export function hideNonActiveCells() {
  for (const det of ['TILE', 'LAR', 'HEC']) {
    for (const h of cellMeshesByDet[det]) {
      if (!active.has(h)) _setHandleVisible(h, false);
    }
  }
  _flushIMDirty();
}

// ── Cell-membership filter (cluster at L2, jet at L3) ─────────────────────────
// Builds the set of cell IDs that pass the current overlay's filter.
//   Level 1: filter off (null = pass all).
//   Level 2: cells belonging to any cluster passing thrClusterEtGev.
//   Level 3: cells belonging to any jet (in the active collection) passing
//            thrJetEtGev. Collections without a <cells> field (EMPFlow,
//            UFOCSSK) yield an empty set, which hides every cell — matches
//            the strict cluster behaviour the user asked for.
// activeMbtsLabels is only populated for clusters; jets don't expose MBTS.
export function rebuildActiveClusterCellIds() {
  const lvl = getViewLevel();
  if (lvl === 2 && lastClusterData) {
    const ids = new Set();
    const mbts = new Set();
    for (const { clusters } of lastClusterData.collections) {
      for (const { eta, phi: rawPhi, etGev, cells } of clusters) {
        if (etGev < thrClusterEtGev) continue;
        for (const k of ['TILE', 'LAR_EM', 'HEC', 'FCAL', 'TRACK', 'OTHER'])
          for (const id of cells[k]) ids.add(id);
        const absEta = Math.abs(eta);
        let ch;
        if (absEta >= 2.78 && absEta <= 3.86) ch = 1;
        else if (absEta >= 2.08 && absEta < 2.78) ch = 0;
        else continue;
        const type = eta >= 0 ? 1 : -1;
        const phiPos = rawPhi < 0 ? rawPhi + 2 * Math.PI : rawPhi;
        const mod = Math.floor(phiPos / ((2 * Math.PI) / 8)) % 8;
        mbts.add(`type_${type}_ch_${ch}_mod_${mod}`);
      }
    }
    activeClusterCellIds = ids;
    activeMbtsLabels = mbts;
    return;
  }
  if (lvl === 3) {
    const c = getActiveJetCollection();
    const ids = new Set();
    if (c) {
      for (const j of c.jets) {
        if (j.etGev < thrJetEtGev) continue;
        for (const id of j.cells) ids.add(id);
      }
    }
    activeClusterCellIds = ids;
    activeMbtsLabels = null;
    return;
  }
  // Level 1 (or no data): filter off entirely.
  activeClusterCellIds = null;
  activeMbtsLabels = null;
}

// ── Track threshold ───────────────────────────────────────────────────────────
export function applyTrackThreshold() {
  const trackGroup = getTrackGroup();
  const photonGroup = getPhotonGroup();
  const electronGroup = getElectronGroup();
  if (trackGroup)
    for (const child of trackGroup.children) child.visible = child.userData.ptGev >= thrTrackGev;
  if (photonGroup)
    for (const child of photonGroup.children) child.visible = child.userData.ptGev >= thrTrackGev;
  if (electronGroup)
    for (const child of electronGroup.children) child.visible = child.userData.ptGev >= thrTrackGev;
  _updateTrackAtlasIntersections?.();
  // Track visibility just changed — soft tracks getting hidden could free up
  // the closest-track slot for an electron, or vice-versa. Re-run the ΔR match
  // and rebuild "e±" labels (gated to L3 — at other levels it's a no-op).
  // Same goes for "μ±" labels.
  if (getViewLevel() === 3) {
    syncElectronTrackMatch(getLastElectrons());
    syncMuonTrackMatch(getLastMuons());
  }
  markDirty();
}

// ── Cluster threshold ─────────────────────────────────────────────────────────
export function applyClusterThreshold() {
  const clusterGroup = getClusterGroup();
  if (clusterGroup)
    for (const child of clusterGroup.children)
      child.visible = child.userData.etGev >= thrClusterEtGev;
  rebuildActiveClusterCellIds();
  applyThreshold();
  applyFcalThreshold();
  applyTrackThreshold();
}

// ── Jet threshold ─────────────────────────────────────────────────────────────
// Mirrors applyClusterThreshold: hides jet lines below thrJetEtGev AND rebuilds
// the cell-membership filter so cells outside the passing jets disappear at
// level 3 (same behaviour as the cluster view at level 2). Also refreshes the
// jet→track highlight (orange) for tracks belonging to passing jets.
export function applyJetThreshold() {
  const jetGroup = getJetGroup();
  if (jetGroup)
    for (const child of jetGroup.children) child.visible = child.userData.etGev >= thrJetEtGev;
  // τ lines share the same L3 ET slider — hadronic τs *are* narrow jets, so
  // letting them pass while real jets are cut would visually dominate the
  // L3 view. <TauJet> publishes pT (not ET); for the cone of objects we're
  // dealing with the two are close enough to compare against a single
  // threshold.
  applyTauPtThreshold();
  rebuildActiveClusterCellIds();
  applyThreshold();
  applyFcalThreshold();
  applyTrackThreshold();
  // Highlight tracks of passing jets (orange) — only meaningful on level 3.
  const lvl = getViewLevel();
  recomputeJetTrackMatch(lvl === 3 ? getActiveJetCollection() : null, thrJetEtGev);
}

// Hides τ lines whose pT falls below the L3 ET slider. Called from
// applyJetThreshold when the slider moves and from drawTaus on fresh load.
// Standalone (not folded into applyJetThreshold) so drawTaus can reuse it
// without dragging the cell-filter / track-recolour passes along.
export function applyTauPtThreshold() {
  const tauGroup = getTauGroup();
  if (!tauGroup) return;
  for (const child of tauGroup.children) child.visible = child.userData.ptGev >= thrJetEtGev;
}

// ── Non-active cells in show-all mode ────────────────────────────────────────
// Sweeps every cell absent from `active` and makes it visible (painted with
// the minimum-palette colour) unless the slicer wedge covers its centre.
// Appends newly-visible handles to visHandles so outlines and raycasting include them.
function _syncNonActiveShowAll() {
  if (!_slicer?.isShowAllCells()) return;
  const slicerMask = _slicer.getMaskState();
  // Each handle resolves its own visibility flag via h.subDet, so the sweep
  // doesn't need to be split per sub-region — just per top-level detector for
  // the minimum-palette colour.
  const sweep = (list, minColor) => {
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (active.has(h)) continue;
      if (!_detOnFor(h)) {
        _setHandleVisible(h, false);
        continue;
      }
      let vis = true;
      if (slicerMask.active) {
        const c = _cellCenter(h);
        if (_slicer.isPointInsideWedge(c.x, c.y, c.z, slicerMask)) vis = false;
      }
      if (vis) {
        h.iMesh.setColorAt(h.instId, minColor);
        _markIMDirty(h.iMesh);
        visHandles.push(h);
      }
      _setHandleVisible(h, vis);
    }
  };
  sweep(cellMeshesByDet.TILE, PAL_TILE_COLOR[0]);
  sweep(cellMeshesByDet.LAR, PAL_LAR_COLOR[0]);
  sweep(cellMeshesByDet.HEC, PAL_HEC_COLOR[0]);
}

// ── Main threshold application (Tile / LAr EM / HEC) ─────────────────────────
export function applyThreshold() {
  if (_slicer?.isActive()) {
    _applySlicerMask();
    return;
  }
  visHandles = [];
  for (const [h, { energyMev, det, cellId, mbtsLabel }] of active) {
    const thr = det === 'LAR' ? thrLArMev : det === 'HEC' ? thrHecMev : thrTileMev;
    const detOn = _detOnFor(h);
    let inCluster;
    if (activeClusterCellIds === null) {
      inCluster = true;
    } else if (mbtsLabel != null) {
      inCluster = activeMbtsLabels !== null && activeMbtsLabels.has(mbtsLabel);
    } else if (cellId != null) {
      inCluster = activeClusterCellIds.has(cellId);
    } else {
      inCluster = true;
    }
    const passThr = _slicer?.isShowAllCells() || !isFinite(thr) || energyMev >= thr;
    const passCl = _slicer?.isShowAllCells() || inCluster;
    const vis = detOn && passThr && passCl;
    _setHandleVisible(h, vis);
    if (vis) visHandles.push(h);
  }
  _syncNonActiveShowAll();
  _flushIMDirty();
  _rebuildRayIMeshes();
  _rebuildAllOutlines?.();
  markDirty();
}

// ── Slicer-masked threshold (called by applyThreshold when slicer is active) ──
function _applySlicerMask() {
  visHandles = [];
  const slicerMask = _slicer.getMaskState();
  for (const [h, { energyMev, det, cellId, mbtsLabel }] of active) {
    const thr = det === 'LAR' ? thrLArMev : det === 'HEC' ? thrHecMev : thrTileMev;
    const detOn = _detOnFor(h);
    let inCluster;
    if (activeClusterCellIds === null) {
      inCluster = true;
    } else if (mbtsLabel != null) {
      inCluster = activeMbtsLabels !== null && activeMbtsLabels.has(mbtsLabel);
    } else if (cellId != null) {
      inCluster = activeClusterCellIds.has(cellId);
    } else {
      inCluster = true;
    }
    const passThr = _slicer.isShowAllCells() || !isFinite(thr) || energyMev >= thr;
    const passCl = _slicer.isShowAllCells() || inCluster;
    const passFilter = detOn && passThr && passCl;
    let vis = passFilter;
    if (vis) {
      const c = _cellCenter(h);
      if (_slicer.isPointInsideWedge(c.x, c.y, c.z, slicerMask)) vis = false;
    }
    _setHandleVisible(h, vis);
    if (vis) visHandles.push(h);
  }
  _syncNonActiveShowAll();
  _flushIMDirty();
  _rebuildRayIMeshes();
  _rebuildAllOutlines?.();
  applyFcalThreshold();
  markDirty();
}

// ── High-level entry point ────────────────────────────────────────────────────
// Avoids double FCAL rebuild when slicer is active (_applySlicerMask already
// calls applyFcalThreshold internally).
export function refreshSceneVisibility() {
  applyThreshold();
  if (!_slicer?.isActive()) applyFcalThreshold();
}
