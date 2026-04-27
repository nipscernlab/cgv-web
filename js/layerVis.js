// Layers-panel visibility state — pure, no DOM / Three.js / scene deps so it
// can be exercised in node-only tests. The full visibility module
// (visibility.js) re-exports these so existing consumers keep their import
// path.
//
// `layerVis` is a tree mirroring the layout of the floating Layers panel.
// Each leaf is a boolean; aggregate ON/OFF for parent rows is derived (any
// leaf on). The threshold loop in visibility.js dispatches per-cell handle
// through `_detOnFor(h)` which walks this tree.
//
//   tile.barrel    — A, BC, D                 (LB samplings)
//   tile.extended  — A, B, D                  (EB samplings; D4→D, C10→B)
//   tile.itc       — E                        (E1-E4 gap scintillators)
//   mbts           — inner, outer
//   lar.barrel     — 0, 1, 2, 3               (EMB samplings)
//   lar.ec         — 0, 1, 2, 3               (EMEC samplings)
//   hec            — 0, 1, 2, 3               (HEC1-HEC4)
//   fcal           — 1, 2, 3                  (FCAL1 EM, FCAL2/3 hadronic)
//   muon           — aSide, cSide             (replaced by atlas-tree mirror
//                                              in setMuonTrees; default ON so
//                                              hit-driven chamber visibility
//                                              keeps working out of the box)
export const layerVis = {
  tile: {
    barrel: { A: true, BC: true, D: true },
    extended: { A: true, B: true, D: true },
    itc: { E: true },
  },
  mbts: { inner: true, outer: true },
  lar: {
    barrel: { 0: true, 1: true, 2: true, 3: true },
    ec: { 0: true, 1: true, 2: true, 3: true },
  },
  hec: { 0: true, 1: true, 2: true, 3: true },
  fcal: { 1: true, 2: true, 3: true },
  muon: { aSide: true, cSide: true },
};

// Sets a single leaf at the given path. Last path segment must already exist
// as a boolean (or a value that gets coerced). Walks but does not create
// missing nodes — paths are expected to match the tree shape.
export function setLayerLeaf(path, on) {
  let node = layerVis;
  for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
  node[path[path.length - 1]] = !!on;
}

// Bulk-set every leaf under a sub-tree to `on`. If `path` points to a leaf
// boolean, behaves like setLayerLeaf.
export function setLayerSubtree(path, on) {
  let node = layerVis;
  for (const k of path) node = node[k];
  if (typeof node !== 'object' || node === null) {
    // Leaf reached by direct path: rewrite the parent's slot.
    setLayerLeaf(path, on);
    return;
  }
  for (const k of Object.keys(node)) {
    if (typeof node[k] === 'object' && node[k] !== null) setLayerSubtree([...path, k], on);
    else node[k] = !!on;
  }
}

// True if any leaf under the sub-tree is on. Treats a direct boolean leaf
// path the same as that leaf's value.
export function anyLayerLeafOn(path) {
  let node = layerVis;
  for (const k of path) node = node[k];
  if (typeof node !== 'object' || node === null) return !!node;
  for (const k of Object.keys(node)) {
    if (typeof node[k] === 'object' && node[k] !== null) {
      if (anyLayerLeafOn([...path, k])) return true;
    } else if (node[k]) {
      return true;
    }
  }
  return false;
}

// Replaces the muon sub-tree wholesale. Used by setMuonTrees in visibility.js
// once the loader has parsed the atlas geometry — it builds an object mirror
// of the atlas-tree subtrees so each chamber gets its own boolean leaf.
export function replaceMuonState(state) {
  layerVis.muon = state;
}
