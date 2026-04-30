import * as THREE from 'three';
import { scene } from './renderer.js';
import {
  getTrackGroup,
  getPhotonGroup,
  getElectronGroup,
  getMuonGroup,
  getTauLabelGroup,
  getMetGroup,
  getClusterGroup,
  getJetGroup,
  getTauGroup,
  getUnmatchedTausVisible,
  getParticleLabelsVisible,
  setTrackGroup,
  setPhotonGroup,
  setElectronGroup,
  setMuonGroup,
  setTauLabelGroup,
  setClusterGroup,
  setJetGroup,
  setTauGroup,
  applyClusterThreshold,
  applyJetThreshold,
  applyTauPtThreshold,
} from './visibility.js';
import {
  TRACK_MAT,
  updateTrackAtlasIntersections,
  recomputeElectronTrackMatch,
  recomputeTauTrackMatch,
  recomputeMuonTrackMatch,
} from './trackAtlasIntersections.js';
import { getViewLevel } from './viewLevel.js';
import { makeLabelSprite } from './labelSprite.js';
import { leptonSymbol, tauSymbolFromCharge, isLeptonNegative } from './particleSymbols.js';

// ── Cluster line rendering ────────────────────────────────────────────────────
// Lines are drawn from the origin in the η/φ direction, 5 m = 5000 mm long.
// Coordinate convention matches tracks: Three.js X = −ATLAS x, Y = −ATLAS y.
const CLUSTER_MAT = new THREE.LineDashedMaterial({
  color: 0xff4400,
  transparent: true,
  opacity: 0.2,
  dashSize: 40,
  gapSize: 60,
  depthWrite: false,
});
const PHOTON_MAT = new THREE.LineBasicMaterial({
  color: 0xffcc00,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
});

const PHOTON_PRE_INNER_MM = 400; // spring spans the last 40 cm of the photon path
const PHOTON_SPRING_R = 20; // helix radius in mm
const PHOTON_SPRING_TURNS_PER_MM = 0.014; // coils per mm of track length
const PHOTON_SPRING_PTS = 22; // points sampled per coil (smoothness)

// Lepton labels (e±, μ±). Only the floating sprite is rendered now — the
// matched track itself plays the role of the old colour-coded arrow:
//   e±: red / green via recomputeElectronTrackMatch's _applyTrackMaterials.
//   μ±: blue via the muon-chamber-hit raycast (TRACK_HIT_MAT).
// Charge for muons is read from the label text (μ- / μ+), so one colour is
// enough; splitting like the e± red/green would clash with the blue line.
const ELECTRON_NEG_COLOR = 0xff3030;
const ELECTRON_POS_COLOR = 0x33dd55;
const MUON_LABEL_COLOR = 0x4a90d9;
// τ label colour matches TAU_MAT and TRACK_TAU_MAT — same purple the daughter
// track is already painted in, so the eye links the floating label with the
// line it labels.
const TAU_LABEL_COLOR = 0xb366ff;
// Push the sprite slightly outward (radially in xy) so it doesn't sit on
// top of the line at the calorimeter face. Same for both species.
const LEPTON_LABEL_RADIAL_OFFSET_MM = 120;
// renderOrder for label groups — above tracks (5) and clusters/jets (6) so
// labels stay legible against any underlying line / dashed line.
const LEPTON_LABEL_RENDER_ORDER = 7;

// Inner cylinder (start): r = 1.4 m, h = 6.4 m
const CLUSTER_CYL_IN_R = 1421.73;
const CLUSTER_CYL_IN_HALF_H = 3680.75;
// Outer cylinder (end):   r = 4.25 m, h = 12 m
const CLUSTER_CYL_OUT_R = 3820;
const CLUSTER_CYL_OUT_HALF_H = 6000;

// Returns t at which the unit-direction ray (dx,dy,dz) from the origin hits
// the surface of a cylinder with given radius and half-height.
function _cylIntersect(dx, dy, dz, r, halfH) {
  const rT = Math.sqrt(dx * dx + dy * dy);
  if (rT > 1e-9) {
    const tBarrel = r / rT;
    if (Math.abs(dz * tBarrel) <= halfH) return tBarrel;
  }
  return halfH / Math.abs(dz);
}

// ── Tracks ────────────────────────────────────────────────────────────────────
export function clearTracks() {
  _disposeGroup(getTrackGroup, setTrackGroup);
  updateTrackAtlasIntersections();
}

// Last drawn electrons cached so view-level changes can re-run the
// ΔR matching against the current track set.
let _lastElectrons = [];
export function getLastElectrons() {
  return _lastElectrons;
}

// JiveXML emits multiple track collections that are alternative fits of the
// same physical particles (GSFTracks duplicates electrons; the four muon
// variants — MSOnlyExtrapolated / Extrapolated / MuonSpectrometer /
// CombinedMuon — cover the same muon at different stages of reconstruction).
// Rendering all of them produces visually overlapping lines. Pick the two
// collections that show each particle in its most complete form:
//   CombinedInDetTracks  — every ID track (vertex → r ≈ 1 m).
//   CombinedMuonTracks   — combined fit for muons; polyline runs from the
//                          vertex out through the muon chambers (r ≈ 9.7 m),
//                          which makes the track-vs-muon-chamber raycast
//                          fire and turns the muon blue end-to-end.
// The muon's ID portion appears in both collections (r ≈ 0-1 m), but having
// the full muon trajectory drawn as one continuous line outweighs that
// duplication for the user.
const _PRIMARY_TRACK_COLLECTIONS = new Set(['CombinedInDetTracks', 'CombinedMuonTracks']);

export function drawTracks(tracks) {
  clearTracks();
  if (!tracks.length) return;
  const g = new THREE.Group();
  g.renderOrder = 5;
  // Per-collection sequential index. JiveXML jets reference tracks via
  // (storeGateKey, trackIndex) where the index is the position within the
  // original Track block — matching that here lets jet→track highlighting
  // resolve `(InDetTrackParticles_xAOD, 39)` to a rendered line.
  const idxByKey = new Map();
  for (const { pts, ptGev, hitIds, storeGateKey } of tracks) {
    if (!_PRIMARY_TRACK_COLLECTIONS.has(storeGateKey)) continue;
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, TRACK_MAT);
    line.userData.ptGev = ptGev;
    line.userData.hitIds = hitIds;
    line.userData.storeGateKey = storeGateKey;
    const idx = idxByKey.get(storeGateKey) ?? 0;
    idxByKey.set(storeGateKey, idx + 1);
    line.userData.indexInCollection = idx;
    // Geometric η/φ computed from origin → last polyline point. Tracks curve
    // in B-field so this is the angle at the calorimeter face, not at the
    // vertex; for high-pT tracks the difference is tiny. φ is reverted from
    // Three.js's negated convention back to ATLAS sign so it matches the
    // electron/photon η/φ in their XML form (used by ΔR matching).
    if (pts && pts.length) {
      const p = pts[pts.length - 1];
      const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      if (r > 1e-6) {
        const cosTheta = Math.max(-1, Math.min(1, p.z / r));
        const theta = Math.acos(cosTheta);
        line.userData.eta = -Math.log(Math.tan(theta / 2));
        line.userData.phi = Math.atan2(-p.y, -p.x);
      }
    }
    g.add(line);
  }
  scene.add(g);
  setTrackGroup(g); // stores ref + applies _tracksVisible
  // No applyTrackThreshold here — its filter stage needs every matchedXxx
  // flag set, and electrons/muons/taus/jets haven't been drawn yet. The
  // tail of processXml runs the full pipeline via applyJetThreshold once
  // every match flag is in place. See the pipeline doc above
  // applyTrackThreshold in visibility.js.
  updateTrackAtlasIntersections();
}

// ── Photons (Feynman-diagram wavy-line helix from the origin) ────────────────
function _makeSpringPoints(dx, dy, dz, totalLen, radius, nTurns, ptsPerTurn) {
  const fwd = new THREE.Vector3(dx, dy, dz).normalize();
  const ref = Math.abs(fwd.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(fwd, ref).normalize();
  const up = new THREE.Vector3().crossVectors(fwd, right).normalize();
  const startOffset = Math.max(0, totalLen - PHOTON_PRE_INNER_MM);
  const visibleLen = Math.max(0, totalLen - startOffset);
  const nTotal = nTurns * ptsPerTurn + 1;
  const pts = [];
  for (let i = 0; i < nTotal; i++) {
    const t = i / (nTotal - 1);
    const angle = t * nTurns * 2 * Math.PI;
    const along = startOffset + t * visibleLen;
    const cx = Math.cos(angle) * radius;
    const cy = Math.sin(angle) * radius;
    pts.push(
      new THREE.Vector3(
        fwd.x * along + right.x * cx + up.x * cy,
        fwd.y * along + right.y * cx + up.y * cy,
        fwd.z * along + right.z * cx + up.z * cy,
      ),
    );
  }
  return pts;
}

export function clearPhotons() {
  _disposeGroup(getPhotonGroup, setPhotonGroup);
}

export function drawPhotons(photons) {
  clearPhotons();
  if (!photons.length) return;
  const g = new THREE.Group();
  g.renderOrder = 7;
  for (const { eta, phi, ptGev } of photons) {
    const theta = 2 * Math.atan(Math.exp(-eta));
    const sinT = Math.sin(theta);
    const dx = -sinT * Math.cos(phi);
    const dy = -sinT * Math.sin(phi);
    const dz = Math.cos(theta);
    const tEnd = _cylIntersect(dx, dy, dz, CLUSTER_CYL_IN_R, CLUSTER_CYL_IN_HALF_H);
    const nTurns = Math.round(PHOTON_SPRING_TURNS_PER_MM * Math.min(PHOTON_PRE_INNER_MM, tEnd));
    const pts = _makeSpringPoints(dx, dy, dz, tEnd, PHOTON_SPRING_R, nTurns, PHOTON_SPRING_PTS);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, PHOTON_MAT);
    line.userData.ptGev = ptGev;
    line.userData.eta = eta;
    line.userData.phi = phi;
    g.add(line);
  }
  scene.add(g);
  setPhotonGroup(g);
  // Same deferral as drawTracks — see comment there.
}

// ── Electrons / Positrons ─────────────────────────────────────────────────────
// The arrow into the inner cylinder is gone — the matched track itself (red
// for e-, green for e+, set by recomputeElectronTrackMatch) plays that role.
// Only the floating "e-" / "e+" sprite label remains, anchored to the matched
// track's outermost point and pushed slightly outward so it doesn't sit on
// top of the line.

// Sprite-creation helper lives in labelSprite.js — shared with metOverlay's
// ν label. Default world-h / screen-px values match the old electron tuning.

// Full electron reset: drops the cached parser list and removes the label
// group. Called by resetScene before a new XML loads.
export function clearElectrons() {
  _lastElectrons = [];
  _disposeGroup(getElectronGroup, setElectronGroup);
}

// ── Per-event group lifecycle helpers ─────────────────────────────────────────
// All draws follow the same shape: clear → build → setter → (optional apply
// pipeline). The two helpers below capture the per-event resource ownership:
// _disposeGroup releases what the previous event's group owns, and the build
// helpers (_buildAnchoredLabelGroup for sprites, _buildEtaPhiLineGroup for
// η/φ lines) construct the new group + register it via setter.

// Removes a per-event group from the scene and frees its owned GPU resources:
//   - Line geometries (per-event BufferGeometry) → dispose.
//   - Sprite textures (per-sprite CanvasTexture) → dispose. The sprite's
//     geometry is Three.js's shared built-in plane and must NOT be disposed.
//   - Materials are typically shared singletons (TRACK_MAT, JET_MAT, …) and
//     are also left alone.
/**
 * @param {() => { traverse: (cb: (o: any) => void) => void } | null} getter
 * @param {(g: any) => void} setter
 */
function _disposeGroup(getter, setter) {
  const g = getter();
  if (!g) return;
  g.traverse((o) => {
    if (o.isSprite) {
      if (o.material?.map) o.material.map.dispose();
    } else if (o.geometry) {
      o.geometry.dispose();
    }
  });
  scene.remove(g);
  setter(null);
}

// Builds a Group of sprite labels — one per matched track that `predicate`
// accepts — anchored at the polyline point selected by `anchorIdx`, pushed
// radially outward by LEPTON_LABEL_RADIAL_OFFSET_MM. Each sprite stashes its
// matched line on userData.anchorLine so syncParticleLabelVisibility can keep
// per-sprite visibility in lockstep with the line. Sprite identity (text +
// colour + extra userData) is delegated to `makeSprite`; if it returns null,
// that line is skipped. On success attaches via `setter`; on no matches no-ops.
/**
 * @param {{
 *   predicate: (line: any) => boolean,
 *   anchorIdx: (count: number) => number,
 *   makeSprite: (line: any) => any,
 *   setter: (g: any) => void,
 * }} cfg
 */
// Builds a Group of η/φ lines stretching from the inner-detector cylinder
// (r ≈ 1.42 m) to the outer cylinder (r ≈ 3.82 m) — the visual band where
// clusters / jets / τ candidates live. Each line gets the supplied material
// (typically a LineDashedMaterial — computeLineDistances is called for you so
// the dashes show up), its endpoints derived from the item's (eta, phi), and
// its userData stamped via mapToUserData(item). On non-empty input attaches
// the group via setter; empty input is a no-op (caller is responsible for
// any pre-clear via _disposeGroup before calling).
/**
 * @param {{
 *   items: ReadonlyArray<{ eta: number, phi: number, [k: string]: any }>,
 *   mat: any,
 *   mapToUserData: (item: any) => Record<string, any>,
 *   setter: (g: any) => void,
 *   renderOrder?: number,
 * }} cfg
 */
function _buildEtaPhiLineGroup({ items, mat, mapToUserData, setter, renderOrder = 6 }) {
  if (!items.length) return;
  const g = new THREE.Group();
  g.renderOrder = renderOrder;
  for (const item of items) {
    const { eta, phi } = item;
    const theta = 2 * Math.atan(Math.exp(-eta));
    const sinT = Math.sin(theta);
    const dx = -sinT * Math.cos(phi);
    const dy = -sinT * Math.sin(phi);
    const dz = Math.cos(theta);
    const t0 = _cylIntersect(dx, dy, dz, CLUSTER_CYL_IN_R, CLUSTER_CYL_IN_HALF_H);
    const t1 = _cylIntersect(dx, dy, dz, CLUSTER_CYL_OUT_R, CLUSTER_CYL_OUT_HALF_H);
    const start = new THREE.Vector3(dx * t0, dy * t0, dz * t0);
    const end = new THREE.Vector3(dx * t1, dy * t1, dz * t1);
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geo, mat);
    // Required by LineDashedMaterial — without it, the line renders solid.
    line.computeLineDistances();
    Object.assign(line.userData, mapToUserData(item));
    g.add(line);
  }
  scene.add(g);
  setter(g);
}

function _buildAnchoredLabelGroup({ predicate, anchorIdx, makeSprite, setter }) {
  const trackGroup = getTrackGroup();
  if (!trackGroup) return;
  const g = new THREE.Group();
  g.renderOrder = LEPTON_LABEL_RENDER_ORDER;
  let added = false;
  for (const line of trackGroup.children) {
    if (!predicate(line)) continue;
    const pos = line.geometry?.getAttribute('position');
    if (!pos || pos.count < 1) continue;
    const idx = anchorIdx(pos.count);
    const x = pos.getX(idx);
    const y = pos.getY(idx);
    const z = pos.getZ(idx);
    const sprite = makeSprite(line);
    if (!sprite) continue;
    const rLen = Math.hypot(x, y);
    const radX = rLen > 1e-6 ? x / rLen : 1;
    const radY = rLen > 1e-6 ? y / rLen : 0;
    sprite.position.set(
      x + radX * LEPTON_LABEL_RADIAL_OFFSET_MM,
      y + radY * LEPTON_LABEL_RADIAL_OFFSET_MM,
      z,
    );
    sprite.userData.anchorLine = line;
    // Initial visibility honours the Track Labels toggle so a freshly-created
    // sprite doesn't flash for the frames between drawXxx and the
    // syncParticleLabelVisibility that runs at the tail of the event-load
    // pipeline. (Anchor-driven and τ-extras refinements are applied on the
    // next sync — see syncParticleLabelVisibility below.)
    sprite.visible = getParticleLabelsVisible();
    g.add(sprite);
    added = true;
  }
  if (!added) return;
  scene.add(g);
  setter(g);
}

// drawElectrons no longer renders a 3D arrow — the matched track itself stands
// in for that. We stash the electron list (level-gate hook re-runs the ΔR
// colour match later), run the match once to set userData.matchedElectronPdgId
// on tracks, then build the "e±" label sprites a SINGLE time. Subsequent
// visibility flips (level gate, K-popover, J button) only flip the group's
// .visible — sprites live until the next event load. Mirrors metOverlay's
// ν label: a freshly-created sprite skips the very next frame after scene.add
// (texture upload / shader-program timing); a long-lived sprite that just
// toggles .visible always renders.
export function drawElectrons(electrons) {
  clearElectrons();
  _lastElectrons = Array.isArray(electrons) ? electrons : [];
  if (!_lastElectrons.length) return;
  recomputeElectronTrackMatch(_lastElectrons);
  _buildAnchoredLabelGroup({
    // ½-way down the polyline — visually inside the inner detector, away from
    // the calorimeter face and the cell soup nearby.
    predicate: (line) => line.userData.matchedElectronPdgId != null,
    anchorIdx: (count) => Math.floor((count - 1) * 0.5),
    makeSprite: (line) => {
      const pdg = line.userData.matchedElectronPdgId;
      const sprite = makeLabelSprite(
        leptonSymbol('e', pdg),
        isLeptonNegative(pdg) ? ELECTRON_NEG_COLOR : ELECTRON_POS_COLOR,
      );
      sprite.userData.pdgId = pdg;
      sprite.userData.isParticleLabel = true;
      return sprite;
    },
    setter: setElectronGroup,
  });
  // The match also paints matched lines red / green via _applyTrackMaterials.
  // Outside L3 those colours would bleed into L1/L2 — clear them now (the
  // level gate restores them on entry to L3). Sprites already exist, hidden
  // via setElectronGroup's visibility predicate.
  if (getViewLevel() !== 3) recomputeElectronTrackMatch(null);
}

// Called by the level gate and applyTrackThreshold (visibility.js) when the
// visible track set changes. Re-runs the ΔR match so red/green track colours
// stay accurate. Does NOT touch label sprites — those were built once in
// drawElectrons. K-popover, J button, and level-gate toggles flip the group's
// .visible directly through the setters in detectorGroups.js.
export function syncElectronTrackMatch(electrons) {
  recomputeElectronTrackMatch(electrons);
}

// Single pass over every group that holds particle-label sprites. Each label
// is identified by `userData.isParticleLabel` (set at sprite-creation time —
// see drawElectrons / drawMuons / drawTaus / metOverlay) so adding a new
// label-bearing overlay only needs the tag, not a new branch here.
//
// Visibility = (Track Labels toggle) AND (anchor track visible) AND
//              (sprite-specific extras — currently only τ has them).
//
// Anchor-driven hide keeps a label from floating in empty space when the
// pT slider drops the track underneath. ν has no anchor (anchor is null),
// so the optional-chain collapses to `true` and only the labels-toggle
// gates it.
//
// τ extras: hide when the anchor's been claimed by a higher-priority match
// (every hadronic τ IS a jet to anti-kt; the orange jet track shouldn't
// also wear a τ symbol — see _applyTrackMaterials' priority chain). And
// hide tauCharge=0 candidates unless the K-popover Unmatched Tau toggle
// is on (sum=0 is impossible for a real τ — always ±1).
//
// Called from applyTrackThreshold after the pT pass + filter pass have
// updated track visibility, and from setParticleLabelsVisible when the
// Track Labels toggle flips.
export function syncParticleLabelVisibility() {
  const labelsOn = getParticleLabelsVisible();
  const showUnmatchedTau = getUnmatchedTausVisible();
  const labelGroups = [getElectronGroup(), getMuonGroup(), getTauLabelGroup(), getMetGroup()];
  for (const g of labelGroups) {
    if (!g) continue;
    for (const sprite of g.children ?? []) {
      if (!sprite.userData?.isParticleLabel) continue;
      const anchor = sprite.userData.anchorLine;
      const anchorOk = !anchor || anchor.visible;
      // τ-only extras: presence of tauCharge in userData identifies a τ
      // sprite (other label sprites never set it).
      let tauOk = true;
      if (sprite.userData.tauCharge !== undefined && anchor) {
        const u = anchor.userData;
        if (u.matchedElectronPdgId != null || u.isMuonMatched || u.isJetMatched) {
          tauOk = false;
        } else {
          const c = sprite.userData.tauCharge;
          tauOk = c === -1 || c === 1 || showUnmatchedTau;
        }
      }
      sprite.visible = labelsOn && anchorOk && tauOk;
    }
  }
}

// ── Muons / Anti-muons ────────────────────────────────────────────────────────
// Mirrors the electron pipeline: the matched track is already coloured blue
// by the muon-chamber-hit raycast (TRACK_HIT_MAT), so we don't repaint it —
// we just add a "μ-" / "μ+" sprite floating beside it. Sprite is anchored on
// the OUTER end of the CombinedMuonTrack polyline (~9-10 m), where the muon
// exits the spectrometer and the line is most distinctly visible.

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
    predicate: (line) => !!line.userData.isMuonMatched,
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

// ── Clusters (η/φ lines between inner and outer cylinders) ───────────────────
export function clearClusters() {
  _disposeGroup(getClusterGroup, setClusterGroup);
}

export function drawClusters(clusters) {
  clearClusters();
  _buildEtaPhiLineGroup({
    items: clusters,
    mat: CLUSTER_MAT,
    mapToUserData: (c) => ({
      etGev: c.etGev,
      eta: c.eta,
      phi: c.phi,
      storeGateKey: c.storeGateKey ?? '',
    }),
    setter: setClusterGroup,
  });
  applyClusterThreshold();
}

// ── Jets (η/φ lines, same cylinder span as clusters but orange + dashed).
// Orange is reserved for jets so it doesn't collide with the muon-track blue;
// dashes mirror the cluster style and visually distinguish jets from tracks.
const JET_MAT = new THREE.LineDashedMaterial({
  color: 0xff8800,
  transparent: true,
  opacity: 0.75,
  dashSize: 40,
  gapSize: 60,
  depthWrite: false,
});

export function clearJets() {
  _disposeGroup(getJetGroup, setJetGroup);
}

// Draws one line per jet in the given collection. `collection` is
// { key, jets: [...] } from jets.js (or null/empty). The collection key
// is stamped on each line so the hover tooltip can show it.
export function drawJets(collection) {
  clearJets();
  const jets = collection?.jets ?? [];
  // Always run applyJetThreshold so downstream effects (cell filter,
  // jet→track highlight) flush even when the collection is empty.
  if (jets.length) {
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
  }
  applyJetThreshold();
}

// ── Taus (η/φ lines, purple-dashed) ───────────────────────────────────────────
// Hadronic τ candidates. Same η/φ-line style as jets/clusters but a distinct
// purple to read against the orange jet lines, since taus and jets sometimes
// share the same direction (overlap removal isn't perfect in the XML).
const TAU_MAT = new THREE.LineDashedMaterial({
  color: 0xb366ff,
  transparent: true,
  opacity: 0.85,
  dashSize: 40,
  gapSize: 60,
  depthWrite: false,
});

// Cached tau list so the level gate can re-run the track match on re-entry to L3.
let _lastTaus = [];
export function getLastTaus() {
  return _lastTaus;
}

export function clearTaus() {
  _lastTaus = [];
  _disposeGroup(getTauGroup, setTauGroup);
  _disposeGroup(getTauLabelGroup, setTauLabelGroup);
}

// Draws one line per tau candidate. `taus` is the flat array out of
// tauParser. Stamps tooltip-relevant fields on each line's userData and runs
// the track-match sync so the τ's associated tracks pick up the purple colour.
export function drawTaus(taus) {
  clearTaus();
  _lastTaus = Array.isArray(taus) ? taus : [];
  _buildEtaPhiLineGroup({
    items: _lastTaus,
    mat: TAU_MAT,
    mapToUserData: (t) => ({
      ptGev: t.ptGev,
      eta: t.eta,
      phi: t.phi,
      isTau: t.isTau,
      numTracks: t.numTracks,
      // Daughter-charge sum from <TauJet><charge>; ±1 = physically possible
      // τ, anything else = "unmatched" candidate that the K-popover gate can
      // strip from the view (see applyTauPtThreshold's unmatched filter).
      charge: t.charge,
      storeGateKey: t.key,
    }),
    setter: setTauGroup,
  });
  // Honour the L3 ET slider on first draw — without this every τ would
  // render until the user nudges the slider.
  applyTauPtThreshold();
  syncTauTrackMatch(getViewLevel() === 3 && _lastTaus.length ? _lastTaus : null);
  // τ labels: one sprite per matched daughter track, anchored at the calo
  // face (last polyline point) — for 3-prong taus the daughters have
  // separated by then, so 3 close-but-readable τ symbols. The build pass
  // can't filter by priority — drawTaus runs before recomputeJetTrackMatch,
  // so isJetMatched is still stale here. syncParticleLabelVisibility runs
  // later (post applyJetThreshold) and hides τ sprites whose anchor was
  // claimed by a higher-priority match.
  _buildAnchoredLabelGroup({
    predicate: (line) => !!line.userData.isTauMatched,
    anchorIdx: (count) => count - 1,
    makeSprite: (line) => {
      const c = line.userData.matchedTauCharge;
      const sprite = makeLabelSprite(tauSymbolFromCharge(c), TAU_LABEL_COLOR);
      sprite.userData.tauCharge = c;
      sprite.userData.isParticleLabel = true;
      return sprite;
    },
    setter: setTauLabelGroup,
  });
}

// Single entry point for the τ→track colour update. Called by drawTaus on
// load and by the visibility level gate when entering / leaving L3.
export function syncTauTrackMatch(taus) {
  recomputeTauTrackMatch(taus);
}
