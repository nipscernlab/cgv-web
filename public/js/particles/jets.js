// @ts-check
// Jet η/φ lines, same cylinder span as clusters but orange + dashed.
// Orange is reserved for jets so it doesn't collide with the muon-track blue;
// dashes mirror the cluster style and visually distinguish jets from tracks.

import * as THREE from 'three';
import { getJetGroup, setJetGroup, applyJetThreshold } from '../visibility.js';
import {
  _disposeGroup,
  _buildEtaPhiLineGroup,
  _refreshEtaPhiLineGroupGeometry,
} from './_internal.js';

const JET_MAT = new THREE.LineDashedMaterial({
  color: 0xff8800,
  dashSize: 40,
  gapSize: 60,
});

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
  }
  applyJetThreshold();
}

// Visibility-driven refresh: rewrites the existing jet-line position
// attributes in place rather than rebuilding the group.
export function refreshJetsGeometry() {
  _refreshEtaPhiLineGroupGeometry(getJetGroup(), true);
}
