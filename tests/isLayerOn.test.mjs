// Tests for isLayerOn(h) in js/layerVis.js — the per-cell-handle dispatcher
// that the threshold loop uses to decide whether a cell may currently be
// shown. Pure function over layerVis, so each spec sets up a tiny handle
// shape and pokes a leaf to assert the routing.

import { describe, it, expect, beforeEach } from 'vitest';
import { layerVis, setLayerLeaf, setLayerSubtree, isLayerOn } from '../public/js/visibility/layerVis.js';

const _snapshot = JSON.parse(JSON.stringify(layerVis));
function resetLayerVis() {
  for (const k of Object.keys(layerVis)) delete layerVis[k];
  Object.assign(layerVis, JSON.parse(JSON.stringify(_snapshot)));
}

beforeEach(resetLayerVis);

// Convenience constructors: only the tags isLayerOn reads are populated.
const tile = (subDet, sampling) => ({ det: 'TILE', subDet, sampling });
const lar = (subDet, sampling) => ({ det: 'LAR', subDet, sampling });
const hec = (sampling) => ({ det: 'HEC', subDet: 'ec', sampling });
const mbts = (sampling) => ({ det: 'TILE', subDet: 'mbts', sampling });

describe('isLayerOn — TILE routing', () => {
  it('barrel/A reads layerVis.tile.barrel.A', () => {
    expect(isLayerOn(tile('barrel', 'A'))).toBe(true);
    setLayerLeaf(['tile', 'barrel', 'A'], false);
    expect(isLayerOn(tile('barrel', 'A'))).toBe(false);
    expect(isLayerOn(tile('barrel', 'BC'))).toBe(true); // sibling unaffected
  });

  it('barrel/BC and barrel/D each route to their own leaf', () => {
    setLayerLeaf(['tile', 'barrel', 'BC'], false);
    expect(isLayerOn(tile('barrel', 'BC'))).toBe(false);
    expect(isLayerOn(tile('barrel', 'D'))).toBe(true);
  });

  it('extended/A, extended/B, extended/D each route independently', () => {
    setLayerLeaf(['tile', 'extended', 'B'], false);
    expect(isLayerOn(tile('extended', 'A'))).toBe(true);
    expect(isLayerOn(tile('extended', 'B'))).toBe(false);
    expect(isLayerOn(tile('extended', 'D'))).toBe(true);
  });

  it('itc/E routes to layerVis.tile.itc.E', () => {
    expect(isLayerOn(tile('itc', 'E'))).toBe(true);
    setLayerLeaf(['tile', 'itc', 'E'], false);
    expect(isLayerOn(tile('itc', 'E'))).toBe(false);
  });

  it('turning the whole tile sub-tree off hides every TILE handle', () => {
    setLayerSubtree(['tile'], false);
    expect(isLayerOn(tile('barrel', 'A'))).toBe(false);
    expect(isLayerOn(tile('extended', 'D'))).toBe(false);
    expect(isLayerOn(tile('itc', 'E'))).toBe(false);
  });

  it('unknown subDet/sampling combo returns false (defensive)', () => {
    expect(isLayerOn(tile('barrel', 'Z'))).toBe(false);
    expect(isLayerOn(tile('phantom', 'A'))).toBe(false);
  });
});

describe('isLayerOn — MBTS routing', () => {
  // Regression — MBTS lives on TILE handles (subDet='mbts'), but its toggle
  // tree is layerVis.mbts, NOT layerVis.tile. The dispatcher must not fall
  // through to the regular TILE branch.
  it('subDet "mbts" reads layerVis.mbts (not layerVis.tile)', () => {
    expect(isLayerOn(mbts('inner'))).toBe(true);
    setLayerSubtree(['tile'], false); // would falsely hide MBTS if branch fell through
    expect(isLayerOn(mbts('inner'))).toBe(true);
    expect(isLayerOn(mbts('outer'))).toBe(true);
  });

  it('inner and outer route to independent leaves', () => {
    setLayerLeaf(['mbts', 'inner'], false);
    expect(isLayerOn(mbts('inner'))).toBe(false);
    expect(isLayerOn(mbts('outer'))).toBe(true);
  });

  it('turning MBTS off does not touch regular TILE handles', () => {
    setLayerSubtree(['mbts'], false);
    expect(isLayerOn(mbts('inner'))).toBe(false);
    expect(isLayerOn(mbts('outer'))).toBe(false);
    expect(isLayerOn(tile('barrel', 'A'))).toBe(true);
  });
});

describe('isLayerOn — LAr routing', () => {
  it('barrel sampling 0..3 each route to layerVis.lar.barrel[n]', () => {
    for (const s of [0, 1, 2, 3]) expect(isLayerOn(lar('barrel', s))).toBe(true);
    setLayerLeaf(['lar', 'barrel', 2], false);
    expect(isLayerOn(lar('barrel', 2))).toBe(false);
    expect(isLayerOn(lar('barrel', 0))).toBe(true);
  });

  it('ec sampling 0..3 each route to layerVis.lar.ec[n]', () => {
    setLayerLeaf(['lar', 'ec', 1], false);
    expect(isLayerOn(lar('ec', 1))).toBe(false);
    expect(isLayerOn(lar('ec', 0))).toBe(true);
    expect(isLayerOn(lar('barrel', 1))).toBe(true); // barrel side unaffected
  });

  it('numeric vs string sampling keys are equivalent for object lookup', () => {
    // Mesh classifier may produce either +m[1] (number) or +m[2] etc. Verify
    // both forms hit the same leaf.
    setLayerLeaf(['lar', 'barrel', 2], false);
    expect(isLayerOn(lar('barrel', 2))).toBe(false);
    expect(isLayerOn(lar('barrel', '2'))).toBe(false);
  });

  it('unknown subDet returns false (no layerVis.lar.foo)', () => {
    expect(isLayerOn(lar('phantom', 0))).toBe(false);
  });

  it('missing sampling returns false', () => {
    expect(isLayerOn(lar('barrel', 99))).toBe(false);
    expect(isLayerOn(lar('barrel'))).toBe(false);
  });
});

describe('isLayerOn — HEC routing', () => {
  it('sampling 0..3 each route to layerVis.hec[n]', () => {
    for (const s of [0, 1, 2, 3]) expect(isLayerOn(hec(s))).toBe(true);
    setLayerLeaf(['hec', 0], false);
    expect(isLayerOn(hec(0))).toBe(false);
    expect(isLayerOn(hec(1))).toBe(true);
  });

  it('does not depend on subDet (HEC has only one region)', () => {
    expect(isLayerOn({ det: 'HEC', sampling: 1 })).toBe(true);
    expect(isLayerOn({ det: 'HEC', subDet: 'whatever', sampling: 1 })).toBe(true);
  });

  it('out-of-range sampling returns false', () => {
    expect(isLayerOn(hec(99))).toBe(false);
    expect(isLayerOn(hec(undefined))).toBe(false);
  });
});

describe('isLayerOn — defensive cases', () => {
  it('null / undefined handle returns false', () => {
    expect(isLayerOn(null)).toBe(false);
    expect(isLayerOn(undefined)).toBe(false);
  });

  it('handle with unknown det returns false', () => {
    expect(isLayerOn({ det: 'FCAL', sampling: 1 })).toBe(false); // FCAL not via dispatcher
    expect(isLayerOn({ det: 'XYZ', sampling: 1 })).toBe(false);
  });

  it('handle with no det returns false', () => {
    expect(isLayerOn({ subDet: 'barrel', sampling: 'A' })).toBe(false);
  });
});

describe('isLayerOn — independence between detectors', () => {
  it('killing TILE leaves LAr / HEC / MBTS visible', () => {
    setLayerSubtree(['tile'], false);
    expect(isLayerOn(lar('barrel', 0))).toBe(true);
    expect(isLayerOn(hec(0))).toBe(true);
    expect(isLayerOn(mbts('inner'))).toBe(true);
  });

  it('killing LAr barrel leaves LAr ec untouched', () => {
    setLayerSubtree(['lar', 'barrel'], false);
    expect(isLayerOn(lar('barrel', 0))).toBe(false);
    expect(isLayerOn(lar('ec', 0))).toBe(true);
  });

  it('All-off (every top-level subtree) hides everything', () => {
    for (const k of Object.keys(layerVis)) setLayerSubtree([k], false);
    expect(isLayerOn(tile('barrel', 'A'))).toBe(false);
    expect(isLayerOn(lar('barrel', 0))).toBe(false);
    expect(isLayerOn(lar('ec', 3))).toBe(false);
    expect(isLayerOn(hec(0))).toBe(false);
    expect(isLayerOn(mbts('inner'))).toBe(false);
  });
});
