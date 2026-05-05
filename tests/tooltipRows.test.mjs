// Tests for js/tooltipRows.js — the HTML builder for the hover-tooltip
// extra-rows block. Pure module; the security contract is enforced here:
// keys are raw HTML (callers must keep them constant), values are always
// HTML-escaped before insertion.

import { describe, it, expect } from 'vitest';
import { buildExtrasHtml } from '../public/js/tooltipRows.js';

describe('buildExtrasHtml — empty inputs', () => {
  it('returns empty string for null', () => {
    expect(buildExtrasHtml(null)).toBe('');
  });
  it('returns empty string for undefined', () => {
    expect(buildExtrasHtml(undefined)).toBe('');
  });
  it('returns empty string for empty array', () => {
    expect(buildExtrasHtml([])).toBe('');
  });
});

describe('buildExtrasHtml — basic rendering', () => {
  it('produces one .trow per entry with the right element shape', () => {
    const html = buildExtrasHtml([['key', 'value']]);
    expect(html).toBe(
      '<div class="trow"><span class="tkey">key</span><span class="tval">value</span></div>',
    );
  });

  it('joins multiple rows in order without separators', () => {
    const html = buildExtrasHtml([
      ['k1', 'v1'],
      ['k2', 'v2'],
    ]);
    expect(html).toBe(
      '<div class="trow"><span class="tkey">k1</span><span class="tval">v1</span></div>' +
        '<div class="trow"><span class="tkey">k2</span><span class="tval">v2</span></div>',
    );
  });

  it('passes numeric values through (coerced via esc)', () => {
    const html = buildExtrasHtml([['n', 42]]);
    expect(html).toContain('<span class="tval">42</span>');
  });
});

describe('buildExtrasHtml — value escaping (XSS guard)', () => {
  // Values come from JiveXML / event data and must NEVER inject markup. The
  // builder always escapes them via utils.esc.
  it('escapes < > & in values', () => {
    const html = buildExtrasHtml([['k', '<script>alert(1)</script>']]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes ampersand independently', () => {
    const html = buildExtrasHtml([['k', 'Tom & Jerry']]);
    expect(html).toContain('Tom &amp; Jerry');
  });

  it('escapes the closing-tag escape attempt', () => {
    const html = buildExtrasHtml([['k', '</span><img onerror=alert(1)>']]);
    expect(html).not.toContain('</span><img');
    expect(html).toContain('&lt;/span&gt;&lt;img onerror=alert(1)&gt;');
  });

  it('null / undefined value coerces to empty string (no "null" leak)', () => {
    expect(buildExtrasHtml([['k', /** @type {any} */ (null)]])).toContain(
      '<span class="tval"></span>',
    );
    expect(buildExtrasHtml([['k', /** @type {any} */ (undefined)]])).toContain(
      '<span class="tval"></span>',
    );
  });
});

describe('buildExtrasHtml — key is raw HTML by design', () => {
  // Keys carry physics labels with <sub>/<sup> markup. They are NEVER fed
  // external input — every caller in hoverTooltip.js passes a literal
  // constant or a curated _ETA_LABEL. Tests document this contract.
  it('preserves <sub>/<sup> markup in keys', () => {
    const html = buildExtrasHtml([['p<sub>T</sub>', '5.0 GeV']]);
    expect(html).toContain('<span class="tkey">p<sub>T</sub></span>');
  });

  it('preserves the η non-transform wrapper used as _ETA_LABEL', () => {
    const ETA = '<span style="text-transform:none">η</span>';
    const html = buildExtrasHtml([[ETA, '0.273']]);
    expect(html).toContain(`<span class="tkey">${ETA}</span>`);
  });
});

describe('buildExtrasHtml — realistic call sites', () => {
  // Snapshot the actual row shapes that hoverTooltip.js passes today, so a
  // future tweak to the builder doesn't silently break tooltip rendering.
  it('vertex tooltip row', () => {
    const xyzMm = '(1.23, -4.56, 78.90) mm';
    expect(buildExtrasHtml([['x, y, z', xyzMm]])).toContain(
      '<span class="tval">(1.23, -4.56, 78.90) mm</span>',
    );
  });

  it('jet large-R tooltip rows (η + mass)', () => {
    const ETA = '<span style="text-transform:none">η</span>';
    const html = buildExtrasHtml([
      [ETA, '0.273'],
      ['mass', '12.500 GeV'],
    ]);
    expect(html).toContain('<span class="tkey">mass</span>');
    expect(html).toContain('<span class="tval">12.500 GeV</span>');
  });
});
