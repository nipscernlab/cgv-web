// @ts-check
// Muon / anti-muon labels.
//
// Mirrors the electron pipeline: the matched track is already coloured blue
// by the muon-chamber-hit raycast (TRACK_HIT_MAT), so we don't repaint it —
// we just add a "μ⁻" / "μ⁺" sprite floating beside it. Sprite is anchored on
// the OUTER end of the CombinedMuonTrack polyline (~9-10 m), where the muon
// exits the spectrometer and the line is most distinctly visible.
//
// Charge for muons is read from the label text (μ⁻ / μ⁺), so one colour is
// enough; splitting like the e± red/green would clash with the blue line.

import { getMuonGroup, setMuonGroup } from '../visibility.js';
import { recomputeMuonTrackMatch } from '../trackMatch.js';
import { getViewLevel } from '../viewLevel.js';
import { makeLabelSprite } from '../labelSprite.js';
import { leptonSymbol } from '../particleSymbols.js';
import { _disposeGroup, _buildAnchoredLabelGroup } from './_internal.js';

const MUON_LABEL_COLOR = 0x4a90d9;

let _lastMuons = [];
export function getLastMuons() {
  return _lastMuons;
}

export function clearMuons() {
  _lastMuons = [];
  _disposeGroup(getMuonGroup, setMuonGroup);
}

export function drawMuons(muons) {
  clearMuons();
  _lastMuons = Array.isArray(muons) ? muons : [];
  if (!_lastMuons.length) return;
  recomputeMuonTrackMatch(_lastMuons);
  _buildAnchoredLabelGroup({
    // Last polyline point — out at the muon-chamber edge (~9-10 m radius),
    // outside every other detector envelope. Keeps the label readable at any
    // zoom and makes the "this blue line is a muon" mapping immediate.
    //
    // Real muon = <Muon> match AND geometric chamber reach. Tracks that have
    // only one of those flags fall to the "unmatched μ" bucket (label-less,
    // gated by the K-popover toggle); see _applyTrackMaterials.
    predicate: (line) => !!line.userData.isMuonMatched && !!line.userData.isHitTrack,
    anchorIdx: (count) => count - 1,
    makeSprite: (line) => {
      // pdg null → plain "μ" (parser couldn't pin the charge — older XMLs
      // may strip the field). leptonSymbol handles the null fallback.
      const pdg = line.userData.matchedMuonPdgId;
      const sprite = makeLabelSprite(leptonSymbol('μ', pdg), MUON_LABEL_COLOR);
      sprite.userData.pdgId = pdg;
      sprite.userData.isParticleLabel = true;
      return sprite;
    },
    setter: setMuonGroup,
  });
  if (getViewLevel() !== 3) recomputeMuonTrackMatch(null);
}

// Mirrors syncElectronTrackMatch — only re-runs the ΔR colour match.
export function syncMuonTrackMatch(muons) {
  recomputeMuonTrackMatch(muons);
}
