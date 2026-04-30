// @ts-check
// Track-line materials + the priority chain that picks one per line.
//
// This file owns:
//   - The 6 LineBasicMaterial constants every rendered track may switch to.
//   - The fixed xAOD → AOD storeGateKey bridge (tau / jet retrievers reference
//     tracks by xAOD names; the rendered polylines live under the AOD names).
//   - applyTrackMaterials(trackGroup): the single place that knows the
//     priority ordering between the per-line userData flags.
//
// Consumers (trackMatch.js for the recompute*Match functions, trackAtlas-
// Intersections.js for the chamber-hit pass) read each line's userData flags
// and then call applyTrackMaterials to repaint. Centralising the priority
// keeps "which colour wins when both apply?" in one diff-friendly place.

import * as THREE from 'three';
import { isLeptonNegative } from './particleSymbols.js';

// Default unmatched track colour. Exported because drawTracks initially
// assigns this to every Line (the recompute*Match passes restyle later).
export const TRACK_MAT = new THREE.LineBasicMaterial({ color: 0xffea00, linewidth: 2 });
const TRACK_HIT_MAT = new THREE.LineBasicMaterial({ color: 0x4a90d9, linewidth: 2 });
// Tracks belonging to a jet in the active jet collection: paint them in the
// jet's own colour (orange) so visually associating "this track came out of
// that jet" is immediate.
const TRACK_JET_MAT = new THREE.LineBasicMaterial({ color: 0xff8800, linewidth: 2 });
// Tracks attached to a hadronic τ candidate: purple, same hue as the τ line.
const TRACK_TAU_MAT = new THREE.LineBasicMaterial({ color: 0xb366ff, linewidth: 2 });
// Tracks matched to a reconstructed electron / positron by ΔR — coloured to
// match the electron arrow so the eye links the track with the e±.
const TRACK_ELECTRON_NEG_MAT = new THREE.LineBasicMaterial({ color: 0xff3030, linewidth: 2 });
const TRACK_ELECTRON_POS_MAT = new THREE.LineBasicMaterial({ color: 0x33dd55, linewidth: 2 });

// Maps the xAOD track-collection names that jets / taus reference to the
// legacy (old-AOD) collection names that JiveXML actually publishes the
// polylines under. By convention the two run parallel — element i of one
// matches element i of the other — which is the bridge for jet→track and
// τ→track highlighting. Only collections we actually render are listed;
// mappings for skipped ones (GSFTracks, MS-only-extrapolated, etc.) would
// never resolve to a line.
export const XAOD_TO_AOD_TRACK_KEY = {
  InDetTrackParticles_xAOD: 'CombinedInDetTracks',
  CombinedMuonTrackParticles_xAOD: 'CombinedMuonTracks',
};

/**
 * Applies the priority chain to every track line:
 *   electron / positron match (red / green) > muon match (blue) >
 *   jet-match (orange) > τ-match (purple) > muon-chamber hit (blue) >
 *   default (yellow).
 *
 * Rationale (top-down):
 *   1. Electron and Muon win first — both are official lepton-ID matches
 *      (ΔR against the reconstructed <Electron> / <Muon> objects). Most
 *      specific identification a track can carry.
 *   2. Jet beats τ: in this JiveXML's data every <TauJet> carries
 *      isTauString = "xAOD_tauJet_withoutQuality", i.e. they are the τ
 *      algorithm's INPUT list, not τs that passed any ID. Jet is the more
 *      reliable established object; if both claim the same track, paint it
 *      as a jet's. (If a future XML exposes τ-with-quality we can promote
 *      τ above jet again.)
 *   3. Muon-chamber hit (geometric, the track passes through MUC1/MUCH)
 *      sits last because it doesn't claim ownership — it just notes that
 *      the track reaches the chambers. Painted blue, the same as a real
 *      muon match: muon-hit tracks are virtually always real muons that
 *      happen to lack an explicit <Muon> object reference.
 *
 * Each source flag lives on userData; this loop is the single place that
 * knows about the priority ordering.
 *
 * @param {{ children: Array<{ userData: any, material: any }> }} trackGroup
 */
export function applyTrackMaterials(trackGroup) {
  for (const line of trackGroup.children) {
    const ePdg = line.userData.matchedElectronPdgId;
    if (ePdg != null) {
      line.material = isLeptonNegative(ePdg) ? TRACK_ELECTRON_NEG_MAT : TRACK_ELECTRON_POS_MAT;
    } else if (line.userData.isMuonMatched) {
      line.material = TRACK_HIT_MAT;
    } else if (line.userData.isJetMatched) {
      line.material = TRACK_JET_MAT;
    } else if (line.userData.isTauMatched) {
      line.material = TRACK_TAU_MAT;
    } else if (line.userData.isHitTrack) {
      line.material = TRACK_HIT_MAT;
    } else {
      line.material = TRACK_MAT;
    }
  }
}
