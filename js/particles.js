// @ts-check
// Per-particle render barrel. Each particle class lives in its own file
// under js/particles/ — this module just re-exports the public API so the
// historical `from './particles.js'` imports stay working.
//
//   js/particles/_internal.js   shared infra (group disposers, η/φ-line +
//                               anchored-label builders, label-visibility
//                               sync, calo-cylinder constants).
//   js/particles/{tracks,photons,electrons,muons,clusters,jets,taus}.js
//                               one file per particle class — its draw* /
//                               clear* / sync* / get* functions and any
//                               class-private materials & constants.
//
// Adding a new particle class means a new file under js/particles/ and a
// re-export here; no other consumers need to change.

import { clearPhotons, drawPhotons, getLastPhotons } from './particles/photons.js';
import { clearClusters, drawClusters, getLastClusters } from './particles/clusters.js';
import { clearTaus, drawTaus, syncTauTrackMatch, getLastTaus } from './particles/taus.js';
import { clearJets, drawJets } from './particles/jets.js';
import { getActiveJetCollection } from './jets.js';

export { clearTracks, drawTracks } from './particles/tracks.js';
export { clearPhotons, drawPhotons, getLastPhotons };
export {
  clearElectrons,
  drawElectrons,
  syncElectronTrackMatch,
  getLastElectrons,
} from './particles/electrons.js';
export { clearMuons, drawMuons, syncMuonTrackMatch, getLastMuons } from './particles/muons.js';
export { clearClusters, drawClusters, getLastClusters };
export { clearJets, drawJets };
export { clearTaus, drawTaus, syncTauTrackMatch, getLastTaus };
export { syncParticleLabelVisibility } from './particles/_internal.js';

// ── Calo-bound particle refresh ──────────────────────────────────────────────
// γ springs and cluster / jet / τ η-φ lines terminate on the first VISIBLE
// calo cell (via _firstVisibleCellHit). When cell visibility changes — slider
// thresholds, layer toggles, slicer mask, jet collection switch — those
// endpoints go stale: the cached geometry still points where the now-hidden
// cells were. Callers in visibility.js invoke refreshCaloBoundParticles() at
// the tail of applyThreshold / _applySlicerMask / applyFcalThreshold to re-
// run drawXxx with the cached raw lists.
//
// The shared `_refreshSuppressed` flag guards against re-entry — drawClusters
// → applyClusterThreshold → applyThreshold would otherwise re-trigger the
// refresh while already inside it — and also lets bulk callers (processXml's
// initial event load) batch the four draws under withSuppressedCaloBoundRefresh
// so the internal applyThreshold/applyFcalThreshold calls don't each kick
// off another full refresh cycle.
let _refreshSuppressed = false;
export function isRefreshingCaloBoundParticles() {
  return _refreshSuppressed;
}
function _hasAnyCachedCaloParticle() {
  return (
    getLastPhotons().length > 0 ||
    getLastClusters().length > 0 ||
    getLastTaus().length > 0 ||
    getActiveJetCollection() != null
  );
}
function _drawAll() {
  const ph = getLastPhotons();
  if (ph.length) drawPhotons(ph);
  const cl = getLastClusters();
  if (cl.length) drawClusters(cl);
  const tau = getLastTaus();
  if (tau.length) drawTaus(tau);
  const jet = getActiveJetCollection();
  if (jet) drawJets(jet);
}
export function refreshCaloBoundParticles() {
  if (_refreshSuppressed) return;
  // Cheap guard for the early-event-load path (caches not yet populated by
  // processXml's explicit draws): skip the whole drawXxx → applyXxxThreshold
  // chain rather than firing it just to draw nothing.
  if (!_hasAnyCachedCaloParticle()) return;
  _refreshSuppressed = true;
  try {
    _drawAll();
  } finally {
    _refreshSuppressed = false;
  }
}
export function withSuppressedCaloBoundRefresh(fn) {
  if (_refreshSuppressed) {
    fn();
    return;
  }
  _refreshSuppressed = true;
  try {
    fn();
  } finally {
    _refreshSuppressed = false;
  }
}
