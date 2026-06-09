// @ts-check
// Cluster collection state + selector (mirrors jets.js).
//
// Holds the parsed cluster collections for the current event and which one is
// currently displayed. Unlike jets, a special ALL_CLUSTERS_KEY pseudo-key
// merges every collection — the historical "draw everything" behaviour, kept
// as an explicit dropdown option. A fresh event elects the first non-empty
// collection (NOT "All"), so the η/φ cluster view isn't drowned by the same
// physical cluster reconstructed in many HLT collections at once.
//
// Subscribers (drawing code, cluster-cell filter, dropdown UI, ET slider)
// listen for changes via onClusterStateChange and re-read the active list.

/** Sentinel active key meaning "draw every collection merged". */
export const ALL_CLUSTERS_KEY = '__all__';

/** @typedef {{ eta: number, phi: number, etGev: number, cells: any }} CollCluster */
/** @typedef {{ key: string, clusters: CollCluster[] }} ClusterCollection */

/** @type {ClusterCollection[]} */
let _collections = [];
/** @type {string | null} */
let _activeKey = null;
/** @type {Set<() => void>} */
const _listeners = new Set();

function _notify() {
  for (const cb of _listeners) cb();
}

export function getClusterCollections() {
  return _collections;
}

export function getActiveClusterKey() {
  return _activeKey;
}

// Called from processXml when a new event lands. Replaces collections and
// elects the first non-empty one as active (null when the event has none).
/** @param {any} list */
export function setClusterCollections(list) {
  _collections = Array.isArray(list) ? list : [];
  const firstNonEmpty = _collections.find((c) => c.clusters.length);
  _activeKey = firstNonEmpty ? firstNonEmpty.key : null;
  _notify();
}

/** @param {string} key  A collection key or ALL_CLUSTERS_KEY. */
export function setActiveClusterKey(key) {
  if (key === _activeKey) return;
  if (key !== ALL_CLUSTERS_KEY && !_collections.some((c) => c.key === key)) return;
  _activeKey = key;
  _notify();
}

export function clearClusterState() {
  _collections = [];
  _activeKey = null;
  _notify();
}

/** @param {() => void} cb */
export function onClusterStateChange(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

// Collections feeding the current view: all of them for ALL_CLUSTERS_KEY,
// otherwise just the selected one. Used by the cluster-cell membership filter.
/** @returns {ClusterCollection[]} */
export function getActiveClusterCollections() {
  if (!_activeKey) return [];
  if (_activeKey === ALL_CLUSTERS_KEY) return _collections;
  const c = _collections.find((x) => x.key === _activeKey);
  return c ? [c] : [];
}

// Flat cluster list to draw as η/φ lines, each tagged with its source
// storeGateKey so the tooltip can show provenance. Equivalent to the old flat
// `clusters` array when ALL is selected, a single collection otherwise.
/** @returns {Array<{ eta: number, phi: number, etGev: number, storeGateKey: string }>} */
export function getActiveClusterDrawList() {
  /** @type {Array<{ eta: number, phi: number, etGev: number, storeGateKey: string }>} */
  const out = [];
  for (const coll of getActiveClusterCollections()) {
    for (const c of coll.clusters) {
      out.push({ eta: c.eta, phi: c.phi, etGev: c.etGev, storeGateKey: coll.key });
    }
  }
  return out;
}
