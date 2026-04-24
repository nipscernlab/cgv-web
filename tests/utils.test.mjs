// Unit tests for the pure helpers in js/utils.js.

import { describe, it, expect } from 'vitest';
import { fmtMev, esc, makeRelTime } from '../js/utils.js';

describe('fmtMev', () => {
  it('returns "ALL" for non-finite values', () => {
    expect(fmtMev(Infinity)).toBe('ALL');
    expect(fmtMev(-Infinity)).toBe('ALL');
    expect(fmtMev(NaN)).toBe('ALL');
  });

  it('formats sub-MeV values with 3 decimals', () => {
    expect(fmtMev(0.5)).toBe('0.500 MeV');
    expect(fmtMev(0.001)).toBe('0.001 MeV');
  });

  it('formats MeV range with 1 decimal', () => {
    expect(fmtMev(5)).toBe('5.0 MeV');
    expect(fmtMev(999)).toBe('999.0 MeV');
  });

  it('converts to GeV at >= 1000 MeV', () => {
    expect(fmtMev(1000)).toBe('1.00 GeV');
    expect(fmtMev(1500)).toBe('1.50 GeV');
    expect(fmtMev(25000)).toBe('25.0 GeV');
  });
});

describe('esc', () => {
  it('escapes <, >, and &', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('coerces null and undefined to empty string', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('passes plain strings unchanged', () => {
    expect(esc('hello world')).toBe('hello world');
  });

  it('coerces non-string values via String()', () => {
    expect(esc(42)).toBe('42');
    expect(esc(true)).toBe('true');
  });

  it('escapes & first so that other escapes are not double-encoded', () => {
    expect(esc('<&>')).toBe('&lt;&amp;&gt;');
  });
});

describe('makeRelTime', () => {
  const t = (key) =>
    ({
      'just-now': 'just now',
      's-ago':    's ago',
      'm-ago':    'm ago',
      'h-ago':    'h ago',
    }[key] ?? key);

  it('returns a function', () => {
    expect(typeof makeRelTime(t)).toBe('function');
  });

  it('reports "just now" for timestamps under 10 seconds old', () => {
    const rel = makeRelTime(t);
    expect(rel(Date.now() - 5_000)).toBe('just now');
  });

  it('reports seconds for timestamps under 1 minute old', () => {
    const rel = makeRelTime(t);
    expect(rel(Date.now() - 30_000)).toBe('30s ago');
  });

  it('reports minutes for timestamps under 1 hour old', () => {
    const rel = makeRelTime(t);
    expect(rel(Date.now() - 5 * 60_000)).toBe('5m ago');
  });

  it('reports hours for timestamps at or above 1 hour old', () => {
    const rel = makeRelTime(t);
    expect(rel(Date.now() - 3 * 3_600_000)).toBe('3h ago');
  });
});
