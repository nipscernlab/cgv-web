// JS-side parser for inner-detector hits keyed by ATLAS Identifier.
//
// The Rust WASM parser doesn't extract hit positions today, so we do a light
// second pass over the same XML text after the worker returns. Cost is
// modest: one regex match per collection, then a string-split for the value
// arrays. Keys returned are the same 64-bit-integer-as-string format that
// <Track><hits> uses, which means tracks → hits matching is a straight Map
// lookup with zero conversions.
//
// Covers Pixel (cluster centroid), SCT (strip midpoint), and TRT (delegated:
// sub + rhoz are kept so the overlay can interpolate the actual position
// against the hovered track's polyline — straws don't expose a 3D point
// directly, but their (r, phi) [barrel] or (z, phi) [endcap] are enough when
// we know the track passed through them).

import * as THREE from 'three';

// Convert XML coordinate (cm in ATLAS convention) to a THREE.Vector3 in the
// scene's coords (mm, with x and y negated to match the existing track
// rendering). Same transform applied to track polylines in the Rust parser.
function _toScene(xCm, yCm, zCm) {
  return new THREE.Vector3(-xCm * 10, -yCm * 10, zCm * 10);
}

function _readStrings(body, tag) {
  const re = new RegExp(`<${tag}(?:\\s+multiple="[^"]+")?>([\\s\\S]*?)</${tag}>`);
  const m = body.match(re);
  if (!m) return null;
  const trimmed = m[1].trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/);
}
function _readNums(body, tag) {
  const s = _readStrings(body, tag);
  return s ? s.map(Number) : null;
}

// Returns:
//   { positions: Map<id, THREE.Vector3>,           // Pixel + SCT, fully resolved
//     trtParams: Map<id, { sub, rhoz_mm }> }       // TRT, needs polyline interp
// Both maps are empty if the XML doesn't contain those collections.
//
// `sub` semantics in JiveXML TRT:
//   0 = endcap C (z<0), rhoz is z in cm
//   1 = barrel A (z>0), rhoz is r in cm
//   2 = barrel C (z<0), rhoz is r in cm
//   3 = endcap A (z>0), rhoz is z in cm
// We store `rhoz` already converted to mm (× 10) so the overlay doesn't have
// to remember the unit; `sub` stays as the raw integer for the interpretation
// switch.
export function parseHits(xmlText) {
  const positionsById = new Map();
  const trtParams = new Map();
  if (!xmlText) return { positions: positionsById, trtParams };

  // Pixel clusters — one position per hit (cluster centroid stored as x0/y0/z0).
  const pix = xmlText.match(/<PixCluster\s+count="\d+"[^>]*>([\s\S]*?)<\/PixCluster>/);
  if (pix) {
    const body = pix[1];
    const ids = _readStrings(body, 'id');
    const xs = _readNums(body, 'x0');
    const ys = _readNums(body, 'y0');
    const zs = _readNums(body, 'z0');
    if (ids && xs && ys && zs) {
      const n = Math.min(ids.length, xs.length, ys.length, zs.length);
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i]) || !Number.isFinite(zs[i])) continue;
        positionsById.set(ids[i], _toScene(xs[i], ys[i], zs[i]));
      }
    }
  }

  // SCT — each hit is a strip with two endpoints (x0/y0/z0) and (x1/y1/z1).
  // We render the strip as a single point at its midpoint; the strip is only
  // ~6 cm long, the marker is just a few pixels, so showing it as a segment
  // wouldn't add visual information at this scale.
  const sct = xmlText.match(/<SCTRDO\s+count="\d+"[^>]*>([\s\S]*?)<\/SCTRDO>/);
  if (sct) {
    const body = sct[1];
    const ids = _readStrings(body, 'id');
    const x0 = _readNums(body, 'x0');
    const y0 = _readNums(body, 'y0');
    const z0 = _readNums(body, 'z0');
    const x1 = _readNums(body, 'x1');
    const y1 = _readNums(body, 'y1');
    const z1 = _readNums(body, 'z1');
    if (ids && x0 && y0 && z0 && x1 && y1 && z1) {
      const n = Math.min(
        ids.length,
        x0.length,
        y0.length,
        z0.length,
        x1.length,
        y1.length,
        z1.length,
      );
      for (let i = 0; i < n; i++) {
        const ax = x0[i],
          ay = y0[i],
          az = z0[i];
        const bx = x1[i],
          by = y1[i],
          bz = z1[i];
        if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) continue;
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) continue;
        positionsById.set(ids[i], _toScene((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5));
      }
    }
  }

  // TRT — straws expose (sub, rhoz, phi). We don't compute a position here;
  // the overlay does it lazily by interpolating the hovered track's polyline.
  const trt = xmlText.match(/<TRT\s+count="\d+"[^>]*>([\s\S]*?)<\/TRT>/);
  if (trt) {
    const body = trt[1];
    const ids = _readStrings(body, 'id');
    const subs = _readNums(body, 'sub');
    const rhozs = _readNums(body, 'rhoz');
    if (ids && subs && rhozs) {
      const n = Math.min(ids.length, subs.length, rhozs.length);
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(subs[i]) || !Number.isFinite(rhozs[i])) continue;
        trtParams.set(ids[i], { sub: subs[i] | 0, rhoz_mm: rhozs[i] * 10 });
      }
    }
  }

  return { positions: positionsById, trtParams };
}
