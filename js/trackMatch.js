// @ts-check
// Per-particle "which track is which" passes.
//
// Four functions, one per particle class, each stamps a userData flag (and
// sometimes a sign / charge) on every line in trackGroup, then calls
// applyTrackMaterials so the priority chain repaints. Any of them can be
// re-run independently when its source state changes (jet collection /
// threshold, τ list, electron list, muon list).
//
// Two matching styles, kept distinct because the source XML publishes
// different links:
//   - Direct (key, index) lookup for jet→track and τ→track. JiveXML's
//     <Jet> / <TauJet> blocks carry explicit <trackKey> / <trackIndex>
//     pairs; the only translation is xAOD → AOD via XAOD_TO_AOD_TRACK_KEY.
//   - Heuristic ΔR for electron→track and muon→track. JiveXML doesn't
//     publish the egamma → track or muon → track link, so we approximate
//     by η/φ proximity. The thresholds differ (electron 0.05, muon 0.10)
//     and so do the eligible track collections (electrons restricted to
//     ID-only, muons to CombinedMuonTracks).

import { markDirty } from './renderer.js';
import { applyTrackMaterials, XAOD_TO_AOD_TRACK_KEY } from './trackMaterials.js';

// Late-injected accessor for the rendered track group. Set by initTrackMatch
// once the visibility module has booted (chicken-and-egg between this module
// and the group registration).
let _getTrackGroup = () => null;

/** @param {{ getTrackGroup: () => any }} deps */
export function initTrackMatch({ getTrackGroup }) {
  _getTrackGroup = getTrackGroup;
}

// ── Jet → track ──────────────────────────────────────────────────────────────
// Direct lookup. Recompute is cheap (single Set membership per line) so we
// re-run on every jet-collection or threshold change — handles the case where
// a jet just dropped below threshold and its tracks should revert to yellow.
//
// Independent of updateTrackAtlasIntersections (which can early-return before
// atlasRoot loads), so jet/track colour stays consistent even on the very
// first event before the atlas geometry is parsed.
/**
 * @param {{ jets: Array<{ etGev: number, tracks: Array<{ key: string, index: number }> }> } | null} activeJetCollection
 * @param {number} thrJetEtGev
 */
export function recomputeJetTrackMatch(activeJetCollection, thrJetEtGev) {
  const trackGroup = _getTrackGroup();
  if (!trackGroup) return;
  // Build the matched key set: "<aod_collection>#<index>".
  /** @type {Set<string>} */
  const matched = new Set();
  if (activeJetCollection) {
    for (const j of activeJetCollection.jets) {
      if (j.etGev < thrJetEtGev) continue;
      for (const t of j.tracks) {
        const aod = XAOD_TO_AOD_TRACK_KEY[t.key];
        if (!aod) continue;
        matched.add(`${aod}#${t.index}`);
      }
    }
  }
  for (const line of trackGroup.children) {
    const k = line.userData.storeGateKey;
    const i = line.userData.indexInCollection;
    line.userData.isJetMatched = k != null && i != null && matched.has(`${k}#${i}`);
  }
  applyTrackMaterials(trackGroup);
  markDirty();
}

// ── τ → track ────────────────────────────────────────────────────────────────
// Direct (key, index) lookup. Stamps `isTauMatched` plus `matchedTauCharge`
// so the τ-label sprite renderer can pick the right sign symbol (τ⁻ / τ⁺ /
// τ for unmatched). matchedTauCharge inherits from the parent τ — for a
// 3-prong all daughters get the τ's charge, even though individual π charges
// in a 3-prong sum to but don't equal the τ charge. The label means "this
// track belongs to a τ⁻", not "this single track has charge -1".
//
// Conflict rule: if the same track is daughter of two τ candidates (rare but
// possible), prefer the one with charge ±1 — keeps the "Unmatched Tau" gate
// from accidentally hiding a real-τ daughter just because some other junk
// candidate also claimed it.
/**
 * @param {Array<{ tracks: Array<{ key: string, index: number }>, charge?: number }> | null} taus
 */
export function recomputeTauTrackMatch(taus) {
  const trackGroup = _getTrackGroup();
  if (!trackGroup) return;
  /** @type {Map<string, number>} */
  const matched = new Map();
  if (taus && taus.length) {
    for (const t of taus) {
      for (const trk of t.tracks) {
        const aod = XAOD_TO_AOD_TRACK_KEY[trk.key];
        if (!aod) continue;
        const k = `${aod}#${trk.index}`;
        const existing = matched.get(k);
        if (existing === -1 || existing === 1) continue;
        matched.set(k, t.charge ?? 0);
      }
    }
  }
  for (const line of trackGroup.children) {
    const k = line.userData.storeGateKey;
    const i = line.userData.indexInCollection;
    const key = k != null && i != null ? `${k}#${i}` : null;
    const has = key != null && matched.has(key);
    line.userData.isTauMatched = has;
    line.userData.matchedTauCharge = has ? matched.get(key) : null;
  }
  applyTrackMaterials(trackGroup);
  markDirty();
}

// ── Electron → track (heuristic ΔR) ──────────────────────────────────────────
// Pre-matching filters:
//   • Electron pT ≥ 3 GeV: cuts out the very softest egamma candidates while
//     still catching most physics electrons.
//   • Track must be visible (passes the user's track pT slider): hidden soft
//     tracks won't steal the match from the real electron track.
//   • Track must come from the inner-detector-only collection: muons that
//     happen to fall close in η/φ to an egamma cluster (rare but not zero —
//     e.g. an EM cluster shadow next to a real muon) would otherwise grab
//     the slot, and CombinedMuonTracks polylines extend all the way to the
//     muon chambers, so colouring them red would visually suggest "electron
//     exiting through the muon system" — physically impossible.
const _ELECTRON_TRACK_DR_MAX = 0.05;
const _ELECTRON_PT_MIN_GEV = 3;
const _ELECTRON_TRACK_COLLECTION = 'CombinedInDetTracks';
/**
 * @param {Array<{ eta: number, phi: number, ptGev?: number, pdgId: number }> | null} electrons
 */
export function recomputeElectronTrackMatch(electrons) {
  const trackGroup = _getTrackGroup();
  if (!trackGroup) return;
  // Reset previous matches.
  for (const line of trackGroup.children) line.userData.matchedElectronPdgId = null;

  if (electrons && electrons.length) {
    for (const e of electrons) {
      if (!Number.isFinite(e.eta) || !Number.isFinite(e.phi)) continue;
      if (Number.isFinite(e.ptGev) && (e.ptGev ?? 0) < _ELECTRON_PT_MIN_GEV) continue;
      let best = null;
      let bestDR = _ELECTRON_TRACK_DR_MAX;
      for (const line of trackGroup.children) {
        // Only ID-only tracks are eligible — see comment block above.
        if (line.userData.storeGateKey !== _ELECTRON_TRACK_COLLECTION) continue;
        if (!line.visible) continue;
        const tEta = line.userData.eta;
        const tPhi = line.userData.phi;
        if (!Number.isFinite(tEta) || !Number.isFinite(tPhi)) continue;
        // Skip already-claimed tracks so two electrons can't grab the same one.
        if (line.userData.matchedElectronPdgId != null) continue;
        const dEta = e.eta - tEta;
        let dPhi = e.phi - tPhi;
        if (dPhi > Math.PI) dPhi -= 2 * Math.PI;
        else if (dPhi < -Math.PI) dPhi += 2 * Math.PI;
        const dR = Math.sqrt(dEta * dEta + dPhi * dPhi);
        if (dR < bestDR) {
          bestDR = dR;
          best = line;
        }
      }
      if (best) best.userData.matchedElectronPdgId = e.pdgId;
    }
  }
  applyTrackMaterials(trackGroup);
  markDirty();
}

// ── Muon → track (heuristic ΔR) ──────────────────────────────────────────────
// Analogous to electron matching but tuned for muons:
//   • Match against CombinedMuonTracks only: those polylines run all the way
//     through the toroid to the muon chambers (~10 m), which is the trajectory
//     that physically belongs to a Muon object. ID-only tracks would also be
//     close in η/φ for a high-pT muon, but anchoring the μ± sprite there
//     would put the label inside the inner detector instead of out on the
//     blue line that uniquely identifies the muon.
//   • Wider ΔR cap (0.10) than electrons (0.05): the toroid bends the muon
//     significantly between the IP and the chambers, so the track endpoint
//     direction can drift from the muon's IP-pointing (eta, phi) by ~0.05.
//   • No pT pre-cut: the Muon collection is small (typically 0-3 per event)
//     and already curated; even a few-GeV muon is interesting to label.
const _MUON_TRACK_DR_MAX = 0.1;
const _MUON_TRACK_COLLECTION = 'CombinedMuonTracks';
/**
 * @param {Array<{ eta: number, phi: number, pdgId: number | null }> | null} muons
 */
export function recomputeMuonTrackMatch(muons) {
  const trackGroup = _getTrackGroup();
  if (!trackGroup) return;
  // Two flags: `isMuonMatched` is the binary "this track has a Muon attached"
  // signal, `matchedMuonPdgId` carries the sign when known. Splitting them
  // lets the renderer distinguish "no match" from "matched but charge-less"
  // (parser returns pdgId=null when the XML field is missing or zero).
  for (const line of trackGroup.children) {
    line.userData.isMuonMatched = false;
    line.userData.matchedMuonPdgId = null;
  }

  if (muons && muons.length) {
    for (const mu of muons) {
      if (!Number.isFinite(mu.eta) || !Number.isFinite(mu.phi)) continue;
      let best = null;
      let bestDR = _MUON_TRACK_DR_MAX;
      for (const line of trackGroup.children) {
        if (line.userData.storeGateKey !== _MUON_TRACK_COLLECTION) continue;
        if (!line.visible) continue;
        const tEta = line.userData.eta;
        const tPhi = line.userData.phi;
        if (!Number.isFinite(tEta) || !Number.isFinite(tPhi)) continue;
        if (line.userData.isMuonMatched) continue;
        const dEta = mu.eta - tEta;
        let dPhi = mu.phi - tPhi;
        if (dPhi > Math.PI) dPhi -= 2 * Math.PI;
        else if (dPhi < -Math.PI) dPhi += 2 * Math.PI;
        const dR = Math.sqrt(dEta * dEta + dPhi * dPhi);
        if (dR < bestDR) {
          bestDR = dR;
          best = line;
        }
      }
      if (best) {
        best.userData.isMuonMatched = true;
        best.userData.matchedMuonPdgId = mu.pdgId;
      }
    }
  }
  // Re-apply materials: muon match now sits in the priority chain *above*
  // jet and τ (a track that's both a muon and in a jet should read as a
  // muon, not a jet). The colour is still the same blue as TRACK_HIT_MAT —
  // muon tracks virtually always also pass through the chambers — but the
  // priority guarantees it wins over orange / purple when both apply.
  applyTrackMaterials(trackGroup);
  markDirty();
}
