// CGV Web — WASM parser Web Worker
// -----------------------------------------------------------------------------
// Offloads both the XML parsing and the per-event ATLAS ID bulk decode off the
// main thread so the UI stays 60fps even on huge events.
//
// Protocol (main -> worker):
//   { type: 'init' }
//       → { type: 'ready' }
//   { type: 'parse', rid, tile, lar, hec }
//       tile/lar/hec: whitespace-joined decimal ID strings (may be empty).
//       → { type: 'result', rid, tile, lar, hec }  (Int32Array | null each)
//   { type: 'parseXmlAndDecode', rid, xmlText }
//       → { type: 'parseXmlResult', rid, error? }
//         or { type: 'parseXmlResult', rid,
//              eventInfo, tileCells, larCells, hecCells, mbtsCells, fcalCells,
//              tracks, photons, clusters, clusterCollections,
//              tilePacked, larPacked, hecPacked }
//         tilePacked/larPacked/hecPacked: Int32Array (transferred zero-copy) | null
//         tracks[i].pts: [{x,y,z}] plain objects (no THREE.Vector3)

import wasmInit, { parse_atlas_ids_bulk, parse_jivexml } from '../parser/pkg/atlas_id_parser.js';

let _ready = false;
let _readyPromise = null;

async function ensureReady() {
  if (_ready) return;
  if (!_readyPromise) _readyPromise = wasmInit().then(() => { _ready = true; });
  await _readyPromise;
}

function runBulk(idStr) {
  if (!idStr || !idStr.length) return null;
  const packed = parse_atlas_ids_bulk(idStr);
  return packed instanceof Int32Array ? packed : new Int32Array(packed);
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === 'init') {
      await ensureReady();
      self.postMessage({ type: 'ready' });
      return;
    }

    if (msg.type === 'parse') {
      await ensureReady();
      const { rid, tile, lar, hec } = msg;
      const tilePk = runBulk(tile);
      const larPk  = runBulk(lar);
      const hecPk  = runBulk(hec);

      const transfer = [];
      if (tilePk && tilePk.buffer) transfer.push(tilePk.buffer);
      if (larPk  && larPk.buffer)  transfer.push(larPk.buffer);
      if (hecPk  && hecPk.buffer)  transfer.push(hecPk.buffer);

      self.postMessage(
        { type: 'result', rid, tile: tilePk, lar: larPk, hec: hecPk },
        transfer
      );
      return;
    }

    if (msg.type === 'parseXmlAndDecode') {
      await ensureReady();
      const { rid, xmlText } = msg;
      // Delegate entirely to the Rust WASM parser — no DOMParser, no JS iteration.
      const result = parse_jivexml(xmlText);
      self.postMessage({ type: 'parseXmlResult', rid, ...result });
      return;
    }
  } catch (e) {
    self.postMessage({
      type: 'error',
      rid: msg && msg.rid,
      message: e && e.message ? e.message : String(e),
    });
  }
};
