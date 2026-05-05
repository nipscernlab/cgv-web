// Unit tests for the ATLAS cell integer-key encoders in js/state.js.
// The encoders must produce collision-free keys within each detector AND
// never collide across detectors (bits [1:0] are the detector tag).

import { describe, it, expect } from 'vitest';
import { _tileKey, _larEmKey, _hecKey } from '../public/js/state.js';

describe('_tileKey — TILE cell encoder', () => {
  it('places detector tag (TILE = 0b00) in bits [1:0]', () => {
    expect(_tileKey(0, 0, 0, 0) & 0b11).toBe(0b00);
  });

  it('packs layer (5 bits) into bits [6:2]', () => {
    expect(_tileKey(0b11111, 0, 0, 0)).toBe(0b11111 << 2);
  });

  it('packs pn (1 bit) into bit [7]', () => {
    expect(_tileKey(0, 1, 0, 0)).toBe(1 << 7);
  });

  it('packs ieta (4 bits) into bits [11:8]', () => {
    expect(_tileKey(0, 0, 0b1111, 0)).toBe(0b1111 << 8);
  });

  it('packs module (6 bits) into bits [17:12]', () => {
    expect(_tileKey(0, 0, 0, 0b111111)).toBe(0b111111 << 12);
  });

  it('combines fields without overlap', () => {
    const k = _tileKey(3, 1, 7, 42);
    expect(k).toBe((3 << 2) | (1 << 7) | (7 << 8) | (42 << 12));
  });

  it('distinct inputs produce distinct keys', () => {
    const keys = new Set([
      _tileKey(0, 0, 0, 0),
      _tileKey(1, 0, 0, 0),
      _tileKey(0, 1, 0, 0),
      _tileKey(0, 0, 1, 0),
      _tileKey(0, 0, 0, 1),
    ]);
    expect(keys.size).toBe(5);
  });
});

describe('_larEmKey — LAr EM cell encoder', () => {
  it('places detector tag (LAr EM = 0b01) in bits [1:0]', () => {
    expect(_larEmKey(1, 0, 0, 0, 0, 0) & 0b11).toBe(0b01);
  });

  it('packs (eb - 1) (2 bits) into bits [3:2]', () => {
    expect(_larEmKey(3, 0, 0, 0, 0, 0)).toBe(1 | ((3 - 1) << 2));
  });

  it('packs sampling (2 bits) into bits [5:4]', () => {
    expect(_larEmKey(1, 0b11, 0, 0, 0, 0)).toBe(1 | (0b11 << 4));
  });

  it('packs region (3 bits) into bits [8:6]', () => {
    expect(_larEmKey(1, 0, 0b111, 0, 0, 0)).toBe(1 | (0b111 << 6));
  });

  it('packs pn (1 bit) into bit [9]', () => {
    expect(_larEmKey(1, 0, 0, 1, 0, 0)).toBe(1 | (1 << 9));
  });

  it('packs eta (9 bits) into bits [18:10]', () => {
    expect(_larEmKey(1, 0, 0, 0, 0b111111111, 0)).toBe(1 | (0b111111111 << 10));
  });

  it('packs phi (8 bits) into bits [26:19]', () => {
    expect(_larEmKey(1, 0, 0, 0, 0, 0b11111111)).toBe(1 | (0b11111111 << 19));
  });

  it('distinct inputs produce distinct keys', () => {
    const keys = new Set([
      _larEmKey(1, 0, 0, 0, 0, 0),
      _larEmKey(2, 0, 0, 0, 0, 0),
      _larEmKey(1, 1, 0, 0, 0, 0),
      _larEmKey(1, 0, 1, 0, 0, 0),
      _larEmKey(1, 0, 0, 1, 0, 0),
      _larEmKey(1, 0, 0, 0, 1, 0),
      _larEmKey(1, 0, 0, 0, 0, 1),
    ]);
    expect(keys.size).toBe(7);
  });
});

describe('_hecKey — LAr HEC cell encoder', () => {
  it('places detector tag (HEC = 0b10) in bits [1:0]', () => {
    expect(_hecKey(0, 0, 0, 0, 0) & 0b11).toBe(0b10);
  });

  it('packs group (2 bits) into bits [3:2]', () => {
    expect(_hecKey(0b11, 0, 0, 0, 0)).toBe(0b10 | (0b11 << 2));
  });

  it('packs region (1 bit) into bit [4]', () => {
    expect(_hecKey(0, 1, 0, 0, 0)).toBe(0b10 | (1 << 4));
  });

  it('packs pn (1 bit) into bit [5]', () => {
    expect(_hecKey(0, 0, 1, 0, 0)).toBe(0b10 | (1 << 5));
  });

  it('packs eta (5 bits) into bits [10:6]', () => {
    expect(_hecKey(0, 0, 0, 0b11111, 0)).toBe(0b10 | (0b11111 << 6));
  });

  it('packs phi (6 bits) into bits [16:11]', () => {
    expect(_hecKey(0, 0, 0, 0, 0b111111)).toBe(0b10 | (0b111111 << 11));
  });

  it('distinct inputs produce distinct keys', () => {
    const keys = new Set([
      _hecKey(0, 0, 0, 0, 0),
      _hecKey(1, 0, 0, 0, 0),
      _hecKey(0, 1, 0, 0, 0),
      _hecKey(0, 0, 1, 0, 0),
      _hecKey(0, 0, 0, 1, 0),
      _hecKey(0, 0, 0, 0, 1),
    ]);
    expect(keys.size).toBe(6);
  });
});

describe('cross-detector tag uniqueness', () => {
  it('TILE, LAr EM, HEC have distinct tag bits', () => {
    const tags = new Set([
      _tileKey(0, 0, 0, 0) & 0b11,
      _larEmKey(1, 0, 0, 0, 0, 0) & 0b11,
      _hecKey(0, 0, 0, 0, 0) & 0b11,
    ]);
    expect(tags).toEqual(new Set([0b00, 0b01, 0b10]));
  });

  it('keys from different detectors never collide on zero fields', () => {
    const tile = _tileKey(0, 0, 0, 0);
    const larEm = _larEmKey(1, 0, 0, 0, 0, 0);
    const hec = _hecKey(0, 0, 0, 0, 0);
    expect(new Set([tile, larEm, hec]).size).toBe(3);
  });
});
