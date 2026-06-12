// @ts-check
import { setAllOutlineColor, setHoverOutlineColor } from './outlines.js';
import { setBackdropBaseColor } from './sceneBackdrop.js';
import { t } from './i18n/index.js';

// ── Tabbed colour picker (2D SV rectangle + vertical hue strip) ───────────────
// The palette popover edits one of several targets, chosen via tabs. Each
// channel owns its default, its localStorage key, its preset swatches and the
// apply() that pushes a hex onto the live scene / DOM. The picker body (SV
// square + hue strip + hex + presets) is shared; switching tabs just rebinds it
// to a different channel and reloads that channel's saved colour.

const DEFAULT_BG_HEX = '#020d1c';
const TAB_KEY = 'cgv-color-tab';

/**
 * @typedef {Object} Channel
 * @property {string} id
 * @property {string} titleI18n   data-i18n key for the popover title
 * @property {string} def         default hex
 * @property {string} key         localStorage key
 * @property {string[]} presets   preset hex swatches
 * @property {(hex: string) => void} apply
 */

/** @type {Channel[]} */
const CHANNELS = [
  {
    id: 'bg',
    titleI18n: 'bgcp-title',
    def: DEFAULT_BG_HEX,
    key: 'cgv-bg-color',
    presets: ['#0e1014', '#000000', '#1a1a1a', '#0b1f3a', '#020d1c', '#1f2a44', '#ffffff'],
    // sceneBackdrop owns scene.background/fog: the active quality preset
    // decides whether this base colour renders flat or as a radial gradient.
    apply: (hex) => setBackdropBaseColor(hex),
  },
  {
    id: 'outline',
    titleI18n: 'bgcp-title-outline',
    def: '#000000',
    key: 'cgv-outline-all-color',
    presets: ['#000000', '#ffffff', '#808080', '#0b1f3a', '#6398ff', '#ff4d4d'],
    apply: (hex) => setAllOutlineColor(hex),
  },
  {
    id: 'hover',
    titleI18n: 'bgcp-title-hover',
    def: '#ffffff',
    key: 'cgv-outline-hover-color',
    presets: ['#ffffff', '#ffe600', '#00e5ff', '#7cff00', '#ff8a00', '#ff00e5'],
    apply: (hex) => setHoverOutlineColor(hex),
  },
  {
    id: 'tooltip',
    titleI18n: 'bgcp-title-tooltip',
    def: '#1b2029', // --surface-2
    key: 'cgv-tooltip-color',
    presets: ['#1b2029', '#000000', '#0e1014', '#0b1f3a', '#1f2a44', '#2a2030'],
    // Drive a CSS variable read by both #tip and every .tip-pinned card, so the
    // hover tooltip and any already-open pinned cards recolour together.
    apply: (hex) => document.documentElement.style.setProperty('--tip-bg', hex),
  },
];

export function setupColorPicker() {
  const btn = /** @type {HTMLElement} */ (document.getElementById('btn-bgcolor'));
  const pop = /** @type {HTMLElement} */ (document.getElementById('bgcolor-popover'));
  const titleEl = /** @type {HTMLElement} */ (document.getElementById('bgcp-title'));
  const sv = /** @type {HTMLElement} */ (document.getElementById('bgcp-sv'));
  const svCursor = /** @type {HTMLElement} */ (document.getElementById('bgcp-sv-cursor'));
  const hueStrip = /** @type {HTMLElement} */ (document.getElementById('bgcp-hue-strip'));
  const hueCursor = /** @type {HTMLElement} */ (document.getElementById('bgcp-hue-cursor'));
  const hexInput = /** @type {HTMLInputElement} */ (document.getElementById('bgcp-hex'));
  const swatch = /** @type {HTMLElement} */ (document.getElementById('bgcp-swatch'));
  const closeBtn = /** @type {HTMLElement} */ (document.getElementById('bgcp-close'));
  const resetBtn = /** @type {HTMLElement} */ (document.getElementById('bgcp-reset'));
  const presetsWrap = /** @type {HTMLElement} */ (document.getElementById('bgcp-presets'));
  const tabEls = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('.bgcp-tab')));
  if (!btn || !pop) return;

  // ── Color math helpers ─────────────────────────────────────────────
  /** @param {number} n @param {number} a @param {number} b */
  function _clamp(n, a, b) {
    return n < a ? a : n > b ? b : n;
  }
  /** @param {string} hex @returns {{ r: number, g: number, b: number } | null} */
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return null;
    const v = parseInt(m[1], 16);
    return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
  }
  /** @param {number} r @param {number} g @param {number} b */
  function rgbToHex(r, g, b) {
    /** @param {number} n */
    const h = (n) => _clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
  }
  /** @param {number} r @param {number} g @param {number} b */
  function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h *= 60;
    }
    const s = max === 0 ? 0 : d / max;
    return { h, s: s * 100, v: max * 100 };
  }
  /** @param {number} h @param {number} s @param {number} v */
  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    s /= 100;
    v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0,
      g = 0,
      b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  // ── State (one HSV cursor + last hex per channel) ──────────────────
  /** @type {Record<string, { h: number, s: number, v: number, hex: string }>} */
  const state = {};
  let activeId = CHANNELS[0].id;
  let open = false;
  /** @type {HTMLElement[]} */
  let presetEls = [];

  /** @param {string} id */
  const channelById = (id) => CHANNELS.find((c) => c.id === id) ?? CHANNELS[0];
  const active = () => channelById(activeId);

  /** @param {Channel} ch @returns {string} */
  function loadSaved(ch) {
    let saved = null;
    try {
      saved = localStorage.getItem(ch.key);
    } catch (_) {}
    return saved && /^#[0-9a-f]{6}$/i.test(saved) ? saved.toLowerCase() : ch.def;
  }

  /** @param {string} hex @param {{ save?: boolean, syncCursors?: boolean }} [opts] */
  function applyColor(hex, { save = false, syncCursors = true } = {}) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const ch = active();
    const st = state[ch.id];
    ch.apply(hex);
    st.hex = hex;
    swatch.style.background = hex;
    if (document.activeElement !== hexInput) hexInput.value = hex.toUpperCase();
    if (syncCursors) {
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      st.h = hsv.h;
      st.s = hsv.s;
      st.v = hsv.v;
    }
    _paintSvBackground();
    _positionCursors();
    _markActivePreset(hex);
    if (save) {
      try {
        localStorage.setItem(ch.key, hex);
      } catch (_) {}
    }
  }

  function _paintSvBackground() {
    const st = state[activeId];
    const pure = hsvToRgb(st.h, 100, 100);
    sv.style.background =
      `linear-gradient(to top, #000 0%, rgba(0,0,0,0) 100%), ` +
      `linear-gradient(to right, #fff 0%, rgba(255,255,255,0) 100%), ` +
      `rgb(${pure.r}, ${pure.g}, ${pure.b})`;
  }
  function _positionCursors() {
    const st = state[activeId];
    svCursor.style.left = st.s + '%';
    svCursor.style.top = 100 - st.v + '%';
    hueCursor.style.top = (st.h / 360) * 100 + '%';
  }
  /** @param {string} hex */
  function _markActivePreset(hex) {
    presetEls.forEach((p) =>
      p.classList.toggle('active', (p.dataset.c ?? '').toLowerCase() === hex.toLowerCase()),
    );
  }
  function _updateFromHsv() {
    const st = state[activeId];
    const rgb = hsvToRgb(st.h, st.s, st.v);
    applyColor(rgbToHex(rgb.r, rgb.g, rgb.b), { save: true, syncCursors: false });
  }

  // ── Presets (rebuilt per active channel) ───────────────────────────
  /** @param {Channel} ch */
  function renderPresets(ch) {
    presetsWrap.innerHTML = '';
    presetEls = ch.presets.map((c) => {
      const b = document.createElement('button');
      b.className = 'bgcp-preset';
      b.dataset.c = c;
      b.dataset.tip = c.toUpperCase();
      b.style.background = c;
      b.addEventListener('click', () => applyColor(c, { save: true, syncCursors: true }));
      presetsWrap.appendChild(b);
      return b;
    });
  }

  // ── Tab switching ──────────────────────────────────────────────────
  /** @param {string} id */
  function switchTab(id) {
    activeId = id;
    const ch = active();
    tabEls.forEach((tb) => tb.classList.toggle('active', tb.dataset.tab === id));
    // Keep data-i18n in sync so a later language switch retranslates the title.
    titleEl.setAttribute('data-i18n', ch.titleI18n);
    titleEl.textContent = t(ch.titleI18n);
    renderPresets(ch);
    // Load this channel's current colour into the shared picker UI.
    applyColor(state[id].hex, { save: false, syncCursors: true });
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch (_) {}
  }

  tabEls.forEach((tb) => {
    tb.addEventListener('click', () => switchTab(tb.dataset.tab ?? CHANNELS[0].id));
  });

  // ── SV rectangle drag ──────────────────────────────────────────────
  /** @param {PointerEvent} e */
  function _svFromEvent(e) {
    const r = sv.getBoundingClientRect();
    const x = _clamp(e.clientX - r.left, 0, r.width);
    const y = _clamp(e.clientY - r.top, 0, r.height);
    const st = state[activeId];
    st.s = (x / r.width) * 100;
    st.v = (1 - y / r.height) * 100;
    _updateFromHsv();
  }
  let svDrag = false;
  sv.addEventListener('pointerdown', (e) => {
    svDrag = true;
    sv.setPointerCapture(e.pointerId);
    _svFromEvent(e);
  });
  sv.addEventListener('pointermove', (e) => {
    if (svDrag) _svFromEvent(e);
  });
  sv.addEventListener('pointerup', (e) => {
    svDrag = false;
    try {
      sv.releasePointerCapture(e.pointerId);
    } catch (_) {}
  });

  // ── Hue strip drag ─────────────────────────────────────────────────
  /** @param {PointerEvent} e */
  function _hueFromEvent(e) {
    const r = hueStrip.getBoundingClientRect();
    const y = _clamp(e.clientY - r.top, 0, r.height);
    state[activeId].h = (y / r.height) * 360;
    _updateFromHsv();
  }
  let hueDrag = false;
  hueStrip.addEventListener('pointerdown', (e) => {
    hueDrag = true;
    hueStrip.setPointerCapture(e.pointerId);
    _hueFromEvent(e);
  });
  hueStrip.addEventListener('pointermove', (e) => {
    if (hueDrag) _hueFromEvent(e);
  });
  hueStrip.addEventListener('pointerup', (e) => {
    hueDrag = false;
    try {
      hueStrip.releasePointerCapture(e.pointerId);
    } catch (_) {}
  });

  hexInput.addEventListener('input', () => {
    let v = hexInput.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-f]{6}$/i.test(v)) applyColor(v, { save: true, syncCursors: true });
  });

  resetBtn.addEventListener('click', () =>
    applyColor(active().def, { save: true, syncCursors: true }),
  );

  // ── Popover open/close/position ────────────────────────────────────
  function position() {
    const r = btn.getBoundingClientRect();
    const pw = pop.offsetWidth || 300;
    const ph = pop.offsetHeight || 340;
    const tb = document.getElementById('toolbar');
    const tbr = tb ? tb.getBoundingClientRect() : { left: 0, height: 0, width: 0 };
    const isVerticalDock = tbr.left < 8 && tbr.height > tbr.width;

    if (isVerticalDock) {
      // Anchor right of the activity bar.
      const left = Math.min(window.innerWidth - pw - 8, r.right + 8);
      let top = r.top + r.height / 2 - ph / 2;
      top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
      pop.style.left = `${Math.max(8, left)}px`;
      pop.style.top = `${top}px`;
      pop.style.bottom = '';
    } else {
      // Anchor above the horizontal dock.
      let left = r.left + r.width / 2 - pw / 2;
      let top = r.top - ph - 10;
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      if (top < 8) top = r.bottom + 10;
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      pop.style.bottom = '';
    }
  }
  function openPop() {
    open = true;
    position();
    pop.classList.add('open');
    btn.classList.add('on');
    requestAnimationFrame(position);
  }
  function closePop() {
    open = false;
    pop.classList.remove('open');
    btn.classList.remove('on');
  }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    open ? closePop() : openPop();
  });
  closeBtn.addEventListener('click', closePop);
  document.addEventListener('click', (e) => {
    if (!open) return;
    const tgt = /** @type {Node | null} */ (e.target);
    if (pop.contains(tgt) || btn.contains(tgt)) return;
    closePop();
  });
  window.addEventListener('resize', () => {
    if (open) position();
  });

  // Expose for the Shift+B keyboard shortcut.
  /** @type {any} */ (window).__cgvToggleBgPicker = () => (open ? closePop() : openPop());

  // ── Initial colours ────────────────────────────────────────────────
  // Seed every channel from storage (or its default) and push it live, so all
  // four targets reflect the saved colours from the first frame — not just once
  // the user opens the popover.
  CHANNELS.forEach((ch) => {
    const hex = loadSaved(ch);
    const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    state[ch.id] = { h: hsv.h, s: hsv.s, v: hsv.v, hex };
    ch.apply(hex);
  });

  // Open on the last-used tab.
  let savedTab = null;
  try {
    savedTab = localStorage.getItem(TAB_KEY);
  } catch (_) {}
  switchTab(
    CHANNELS.some((c) => c.id === savedTab) ? /** @type {string} */ (savedTab) : CHANNELS[0].id,
  );
}
