// ── η × φ energy-heatmap minimap ─────────────────────────────────────────────
// 2D canvas in the top-left. Shows the standard ATLAS calorimetry grid
// (Δη = Δφ = 0.1) coloured by summed cell energies. Fed by the visibility
// pipeline AFTER every per-cell filter but BEFORE the η×φ rectangles — so
// the user always sees the full event and can decide where to place rects.
//
// Interaction:
//   • hover empty plot  → cursor: crosshair
//   • hover over rect   → cursor: grab (grabbing while dragging)
//   • mousedown + drag on empty area → draw a new rectangle (appended to list)
//   • mousedown + drag on existing rect → translate that rectangle
//   • click on existing rect (no drag) → delete that rectangle
//   • click on empty area (no drag) → no-op
//   • multiple rects may overlap; visibility uses the UNION of all rects
//
// φ seam slider (left pane):
//   • drag up/down → rotate where the cylinder cut falls on the φ axis
//   • clusters split across the ±π seam can be centred by sliding the seam away
//   • dbl-click → reset seam to default (−π)

const ETA_MIN = -4.9;
const ETA_MAX = 4.9;
const PHI_MIN = -Math.PI;
const PHI_MAX = Math.PI;
const TWO_PI  = PHI_MAX - PHI_MIN;   // 2π

const BIN_ETA = 0.1;
const BIN_PHI = 0.1;
const NBINS_ETA = Math.ceil((ETA_MAX - ETA_MIN) / BIN_ETA);
const NBINS_PHI = Math.ceil((PHI_MAX - PHI_MIN) / BIN_PHI);

const W = 342;
const H = 220;

const INSET_L = 26;
// Right inset only has to clear the legend colour bar now (no value labels) —
// LEGEND_GAP + LEGEND_W + a 4px margin to the canvas edge.
const INSET_R = 20;
const INSET_T = 10;
const INSET_B = 20;

const LEGEND_W = 10;
const LEGEND_GAP = 6;

// Vivid physics-style heat ramp: near-black → deep blue → bright cyan →
// pure yellow → pure red. High saturation and strong contrast so hot bins
// stand out clearly against cold ones on any display.
const RAMP = [
  [8, 8, 20],
  [10, 30, 210],
  [0, 215, 255],
  [255, 245, 0],
  [255, 20, 0],
];

let _canvas  = null;
let _ctx     = null;
let _enabled = false;
let _wrapEl  = null;   // outer wrapper div (#minimap-wrap)

/** @type {Array<{eta:number, phi:number, energyMev:number}>} */
let _cellEntries = [];
/** @type {Array<{eta:number, phi:number, energyMev:number}>} */
let _fcalEntries = [];

let _binCache = null;

// Array of active η×φ rectangles. Each element: {etaMin, etaMax, phiMin, phiMax}.
/** @type {Array<{etaMin:number, etaMax:number, phiMin:number, phiMax:number}>} */
let _rects = [];

// Mouse state machine.
//   'idle'       — no gesture
//   'maybe-draw' — mousedown on empty area; release = no-op, drag = new rect
//   'maybe-pan'  — mousedown on existing rect; release = delete, drag = move
//   'drawing'    — sweeping out a new rect (already pushed to _rects)
//   'panning'    — translating an existing rect
let _mouseState    = 'idle';
let _dragAnchor    = null;
let _activeRectIdx = -1;
const DRAG_THRESHOLD_PX = 3;
const MIN_RECT_ETA = 0.05;
const MIN_RECT_PHI = 0.05;

let _regionListener = null;

// ── φ seam (cylinder-cut) state ─────────────────────────────────────────────
// The display always spans a full 2π of φ. _phiSeam is the φ value placed at
// the BOTTOM of the minimap (the "cut"). Default −π is the ATLAS convention.
// Drag the left-side slider to rotate the cut away from a cluster of interest.
let _phiSeam      = PHI_MIN;   // radians, range [−π, +π)
let _seamTrackEl  = null;
let _seamThumbEl  = null;
let _seamDragging = false;

// ── Coordinate helpers ──────────────────────────────────────────────────────
function _plotArea() {
  return { x0: INSET_L, y0: INSET_T, x1: W - INSET_R, y1: H - INSET_B };
}
function _etaToX(eta, area) {
  const t = (eta - ETA_MIN) / (ETA_MAX - ETA_MIN);
  return area.x0 + t * (area.x1 - area.x0);
}
// Maps a physical φ to a canvas y, respecting the current seam offset.
// φ = _phiSeam → y = area.y1 (bottom / cut edge)
// φ = _phiSeam + π → y = midpoint
// φ → _phiSeam (from above) → y = area.y0 (top / same cut edge)
function _phiToY(phi, area) {
  const normalized = ((phi - _phiSeam) % TWO_PI + TWO_PI) % TWO_PI;
  const t = normalized / TWO_PI;
  return area.y1 - t * (area.y1 - area.y0);
}
function _xToEta(x, area) {
  const t = (x - area.x0) / (area.x1 - area.x0);
  return ETA_MIN + t * (ETA_MAX - ETA_MIN);
}
// Inverse of _phiToY — wraps result to [−π, +π].
function _yToPhi(y, area) {
  const t   = (area.y1 - y) / (area.y1 - area.y0);
  const phi = _phiSeam + t * TWO_PI;
  return ((phi + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
}
function _clientToCanvas(ev) {
  const r = _canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

function _ramp(t) {
  t = Math.max(0, Math.min(1, t));
  const seg = t * (RAMP.length - 1);
  const i   = Math.min(RAMP.length - 2, Math.floor(seg));
  const f   = seg - i;
  const a   = RAMP[i];
  const b   = RAMP[i + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

// Formats a φ value (radians) as a compact π-fraction string.
function _phiLabel(phi) {
  phi = ((phi + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  if (Math.abs(phi) < 0.02)                         return '0';
  if (Math.abs(Math.abs(phi) - Math.PI) < 0.02)     return phi > 0 ? '+π' : '-π';
  if (Math.abs(Math.abs(phi) - Math.PI / 2) < 0.02) return phi > 0 ? '+π/2' : '-π/2';
  const sign = phi > 0 ? '+' : '-';
  return sign + (Math.abs(phi) / Math.PI).toFixed(2) + 'π';
}

function _normalizeRect(r) {
  return {
    etaMin: Math.min(r.etaMin, r.etaMax),
    etaMax: Math.max(r.etaMin, r.etaMax),
    phiMin: Math.min(r.phiMin, r.phiMax),
    phiMax: Math.max(r.phiMin, r.phiMax),
  };
}

// ── Binning ─────────────────────────────────────────────────────────────────
function _buildBins() {
  if (_binCache) return _binCache;
  const grid = new Float32Array(NBINS_ETA * NBINS_PHI);
  let max = 0;
  let min = Infinity;
  const add = (eta, phi, eMev) => {
    if (eMev <= 0) return;
    if (!Number.isFinite(eta) || !Number.isFinite(phi)) return;
    if (eta < ETA_MIN || eta > ETA_MAX) return;
    const ix = Math.min(NBINS_ETA - 1, Math.max(0, Math.floor((eta - ETA_MIN) / BIN_ETA)));
    const iy = Math.min(NBINS_PHI - 1, Math.max(0, Math.floor((phi - PHI_MIN) / BIN_PHI)));
    grid[iy * NBINS_ETA + ix] += eMev;
  };
  for (const e of _cellEntries) add(e.eta, e.phi, Math.abs(e.energyMev || 0));
  for (const e of _fcalEntries) add(e.eta, e.phi, Math.abs(e.energyMev || 0));
  for (let k = 0; k < grid.length; k++) {
    const v = grid[k];
    if (v > 0) {
      if (v > max) max = v;
      if (v < min) min = v;
    }
  }
  if (!Number.isFinite(min)) min = 0;
  _binCache = { grid, min, max };
  return _binCache;
}

// ── Drawing ─────────────────────────────────────────────────────────────────
function _drawFrame() {
  const ctx = _ctx;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(8, 14, 28, 0.82)';
  ctx.fillRect(0, 0, W, H);
  const area = _plotArea();
  ctx.strokeStyle = 'rgba(120, 150, 190, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(area.x0 + 0.5, area.y0 + 0.5, area.x1 - area.x0, area.y1 - area.y0);
}

function _drawAxes() {
  const ctx  = _ctx;
  const area = _plotArea();

  // Vertical η grid lines
  ctx.strokeStyle = 'rgba(150, 180, 220, 0.18)';
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  for (const eta of [-3.2, -1.5, 0, 1.5, 3.2]) {
    const x = _etaToX(eta, area);
    ctx.beginPath();
    ctx.moveTo(x, area.y0);
    ctx.lineTo(x, area.y1);
    ctx.stroke();
  }

  // Horizontal φ reference lines for the 4 notable values.
  // Skip any that land within a few pixels of the seam boundary edges.
  const EDGE_PX  = 5;
  const phiRefs  = [Math.PI / 2, 0, -Math.PI / 2, -Math.PI];
  const phiRefLb = ['+π/2',     '0', '-π/2',       '-π'   ];
  for (const phi of phiRefs) {
    const y = _phiToY(phi, area);
    if (y <= area.y0 + EDGE_PX || y >= area.y1 - EDGE_PX) continue;
    ctx.beginPath();
    ctx.moveTo(area.x0, y);
    ctx.lineTo(area.x1, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── Labels ────────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(170, 195, 225, 0.78)';
  ctx.font      = '9px ui-monospace, monospace';

  // η axis labels (bottom)
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'center';
  ctx.fillText('η', (area.x0 + area.x1) / 2, area.y1 + 3);
  ctx.textAlign = 'left';
  ctx.fillText('-4', area.x0, area.y1 + 3);
  ctx.textAlign = 'center';
  ctx.fillText('0', (area.x0 + area.x1) / 2 + 12, area.y1 + 3);
  ctx.textAlign = 'right';
  ctx.fillText('+4', area.x1, area.y1 + 3);

  // φ notable-value labels (left side, interior)
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'right';
  for (let i = 0; i < phiRefs.length; i++) {
    const y = _phiToY(phiRefs[i], area);
    if (y <= area.y0 + EDGE_PX || y >= area.y1 - EDGE_PX) continue;
    ctx.fillText(phiRefLb[i], area.x0 - 2, y);
  }

  // Seam boundary labels at top and bottom edges (dimmer — same physical φ)
  ctx.fillStyle    = 'rgba(170, 195, 225, 0.45)';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(_phiLabel(_phiSeam), area.x0 - 2, area.y0 + 2);
  ctx.textBaseline = 'bottom';
  ctx.fillText(_phiLabel(_phiSeam), area.x0 - 2, area.y1 - 2);

  // φ axis title (rotated)
  ctx.fillStyle    = 'rgba(170, 195, 225, 0.78)';
  ctx.save();
  ctx.translate(8, (area.y0 + area.y1) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('φ', 0, 0);
  ctx.restore();
}

function _drawHeatmap() {
  const ctx  = _ctx;
  const area = _plotArea();
  const { grid, min, max } = _buildBins();
  if (max <= 0) return;
  const logMin = Math.log10(Math.max(min, 1e-3));
  const logMax = Math.log10(Math.max(max, logMin + 1e-3));
  const denom  = Math.max(1e-6, logMax - logMin);

  const plotW = area.x1 - area.x0;
  const plotH = area.y1 - area.y0;

  const xEdges = new Int16Array(NBINS_ETA + 1);
  for (let i = 0; i <= NBINS_ETA; i++) xEdges[i] = Math.round(area.x0 + (i * plotW) / NBINS_ETA);
  const yEdges = new Int16Array(NBINS_PHI + 1);
  for (let i = 0; i <= NBINS_PHI; i++) yEdges[i] = Math.round(area.y0 + (i * plotH) / NBINS_PHI);

  // Which φ bin sits at the bottom of the display (the seam)?
  // Round to nearest bin so the visual shift snaps cleanly.
  const seamBin =
    ((Math.round((_phiSeam - PHI_MIN) / BIN_PHI) % NBINS_PHI) + NBINS_PHI) % NBINS_PHI;

  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x0, area.y0, plotW, plotH);
  ctx.clip();

  for (let iy = 0; iy < NBINS_PHI; iy++) {
    // Rotate bin index so that bin `seamBin` maps to display row 0 (bottom).
    const displayRow = (iy - seamBin + NBINS_PHI) % NBINS_PHI;
    const y  = yEdges[NBINS_PHI - 1 - displayRow];
    const yn = yEdges[NBINS_PHI     - displayRow];

    for (let ix = 0; ix < NBINS_ETA; ix++) {
      const v = grid[iy * NBINS_ETA + ix];
      if (v <= 0) continue;
      const t  = (Math.log10(v) - logMin) / denom;
      const x  = xEdges[ix];
      const xn = xEdges[ix + 1];
      ctx.fillStyle = _ramp(t);
      ctx.fillRect(x, y, xn - x, yn - y);
    }
  }
  ctx.restore();
}

// Bare colour bar — no min/max value labels, no title, no empty-state text.
// The bar conveys the relative scale; everything else was clutter, and
// dropping it lets the window hug the palette (see INSET_R).
function _drawLegend() {
  const ctx  = _ctx;
  const area = _plotArea();

  const xL   = area.x1 + LEGEND_GAP;
  const yTop = area.y0 + 4;
  const yBot = area.y1 - 4;
  const barH = yBot - yTop;

  for (let i = 0; i <= barH; i++) {
    const t = 1 - i / barH;
    ctx.fillStyle = _ramp(t);
    ctx.fillRect(xL, yTop + i, LEGEND_W, 1);
  }
  ctx.strokeStyle = 'rgba(120, 150, 190, 0.55)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(xL + 0.5, yTop + 0.5, LEGEND_W, barH);
}

// Draws all active rectangles. No per-rect label — with multiple rects the
// individual range labels become cluttered and misleading (overlapping rects
// share a union, not their individual bounds).
function _drawRects() {
  if (!_rects.length) return;
  const ctx  = _ctx;
  const area = _plotArea();
  for (const rect of _rects) {
    const x0 = _etaToX(rect.etaMin, area);
    const x1 = _etaToX(rect.etaMax, area);
    const yA = _phiToY(rect.phiMax, area);
    const yB = _phiToY(rect.phiMin, area);
    const x  = Math.min(x0, x1);
    const y  = Math.min(yA, yB);
    const w  = Math.abs(x1 - x0);
    const h  = Math.abs(yB - yA);

    // Vivid fill.
    ctx.fillStyle = 'rgba(255, 60, 200, 0.22)';
    ctx.fillRect(x, y, w, h);

    // Glowing border: thick dark halo first, then a bright magenta stroke on
    // top, then a thin white highlight. The three-layer approach ensures the
    // rect stays legible against every part of the heat ramp.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.lineWidth   = 5;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);

    ctx.save();
    ctx.shadowColor = 'rgba(255, 80, 220, 0.85)';
    ctx.shadowBlur  = 8;
    ctx.strokeStyle = 'rgba(255, 80, 220, 1)';
    ctx.lineWidth   = 2.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }
}

function _redraw() {
  if (!_ctx || !_enabled) return;
  _drawFrame();
  _drawHeatmap();
  _drawAxes();
  _drawLegend();
  _drawRects();
}

// ── Region API ──────────────────────────────────────────────────────────────
let _regionRafQueued = false;
function _notifyRegion() {
  if (!_regionListener || _regionRafQueued) return;
  _regionRafQueued = true;
  requestAnimationFrame(() => {
    _regionRafQueued = false;
    if (_regionListener) _regionListener(_rects.length > 0 ? [..._rects] : null);
  });
}

function _pointInRect(eta, phi, r) {
  return eta >= r.etaMin && eta <= r.etaMax && phi >= r.phiMin && phi <= r.phiMax;
}

// Returns the index of the topmost rect containing (eta, phi), or -1.
function _hitRectAt(eta, phi) {
  for (let i = _rects.length - 1; i >= 0; i--) {
    if (_pointInRect(eta, phi, _rects[i])) return i;
  }
  return -1;
}

// ── φ seam slider ────────────────────────────────────────────────────────────
function _updateSeamThumb() {
  if (!_seamThumbEl) return;
  const ratio = (_phiSeam - PHI_MIN) / TWO_PI;   // 0 = −π (bottom), 1 = +π (top)
  _seamThumbEl.style.top = (1 - ratio) * 100 + '%';
}

function _applySeamFromPointer(ev) {
  const rect  = _seamTrackEl.getBoundingClientRect();
  const ratio = 1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
  _phiSeam    = PHI_MIN + ratio * TWO_PI;
  _updateSeamThumb();
  _redraw();
}

function _onSeamPointerDown(ev) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  _seamDragging = true;
  _seamTrackEl.setPointerCapture(ev.pointerId);
  _applySeamFromPointer(ev);
}

function _onSeamPointerMove(ev) {
  if (!_seamDragging) return;
  _applySeamFromPointer(ev);
}

function _onSeamPointerUp(ev) {
  if (!_seamDragging) return;
  _seamDragging = false;
  _seamTrackEl.releasePointerCapture(ev.pointerId);
}

function _onSeamDblClick() {
  _phiSeam = PHI_MIN;   // reset to default (−π)
  _updateSeamThumb();
  _redraw();
}

// ── Mouse handling ──────────────────────────────────────────────────────────
function _updateCursor(insidePlot, eta, phi) {
  if (!_canvas) return;
  if (_mouseState === 'panning') {
    _canvas.style.cursor = 'grabbing';
    return;
  }
  if (_mouseState === 'drawing' || _mouseState === 'maybe-draw') {
    _canvas.style.cursor = 'crosshair';
    return;
  }
  if (!insidePlot) {
    _canvas.style.cursor = 'default';
    return;
  }
  if (_hitRectAt(eta, phi) >= 0) _canvas.style.cursor = 'grab';
  else _canvas.style.cursor = 'crosshair';
}

function _onMouseDown(ev) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  const { x, y } = _clientToCanvas(ev);
  const area      = _plotArea();
  if (x < area.x0 || x > area.x1 || y < area.y0 || y > area.y1) return;
  const eta = _xToEta(x, area);
  const phi = _yToPhi(y, area);

  const hitIdx = _hitRectAt(eta, phi);
  if (hitIdx >= 0) {
    _mouseState    = 'maybe-pan';
    _activeRectIdx = hitIdx;
    const r  = _rects[hitIdx];
    const cx = (r.etaMin + r.etaMax) / 2;
    const cy = (r.phiMin + r.phiMax) / 2;
    _dragAnchor = { dEta: eta - cx, dPhi: phi - cy, x, y };
  } else {
    _mouseState = 'maybe-draw';
    _dragAnchor = { eta, phi, x, y };
  }
  _updateCursor(true, eta, phi);
  window.addEventListener('mousemove', _onMouseMove);
  window.addEventListener('mouseup', _onMouseUp);
}

function _onMouseMove(ev) {
  if (_mouseState === 'idle') return;
  const { x, y } = _clientToCanvas(ev);
  const area      = _plotArea();
  const cx        = Math.max(area.x0, Math.min(area.x1, x));
  const cy        = Math.max(area.y0, Math.min(area.y1, y));
  const eta       = _xToEta(cx, area);
  const phi       = _yToPhi(cy, area);

  if (_mouseState === 'maybe-draw') {
    const ddx = x - _dragAnchor.x;
    const ddy = y - _dragAnchor.y;
    if (Math.hypot(ddx, ddy) >= DRAG_THRESHOLD_PX) {
      _mouseState = 'drawing';
      _rects.push(
        _normalizeRect({
          etaMin: _dragAnchor.eta,
          etaMax: eta,
          phiMin: _dragAnchor.phi,
          phiMax: phi,
        }),
      );
      _notifyRegion();
      _redraw();
    }
    return;
  }

  if (_mouseState === 'drawing') {
    _rects[_rects.length - 1] = _normalizeRect({
      etaMin: _dragAnchor.eta,
      etaMax: eta,
      phiMin: _dragAnchor.phi,
      phiMax: phi,
    });
    _notifyRegion();
    _redraw();
    return;
  }

  // maybe-pan: check drag threshold, then fall through to panning
  if (_mouseState === 'maybe-pan') {
    const ddx = x - _dragAnchor.x;
    const ddy = y - _dragAnchor.y;
    if (Math.hypot(ddx, ddy) >= DRAG_THRESHOLD_PX) {
      _mouseState          = 'panning';
      _canvas.style.cursor = 'grabbing';
    }
  }

  if (_mouseState === 'panning') {
    const r     = _rects[_activeRectIdx];
    const halfE = (r.etaMax - r.etaMin) / 2;
    const halfP = (r.phiMax - r.phiMin) / 2;
    const ncx   = eta - _dragAnchor.dEta;
    const ncy   = phi - _dragAnchor.dPhi;
    const cE    = Math.max(ETA_MIN + halfE, Math.min(ETA_MAX - halfE, ncx));
    const cP    = Math.max(PHI_MIN + halfP, Math.min(PHI_MAX - halfP, ncy));
    _rects[_activeRectIdx] = {
      etaMin: cE - halfE,
      etaMax: cE + halfE,
      phiMin: cP - halfP,
      phiMax: cP + halfP,
    };
    _notifyRegion();
    _redraw();
  }
}

function _onMouseUp(ev) {
  if (ev.button !== 0) return;
  window.removeEventListener('mousemove', _onMouseMove);
  window.removeEventListener('mouseup', _onMouseUp);

  if (_mouseState === 'maybe-pan') {
    // Click (no drag) on a rect → delete it.
    _rects.splice(_activeRectIdx, 1);
    _notifyRegion();
    _redraw();
  } else if (_mouseState === 'drawing') {
    // Discard if too small (accidental micro-drag).
    const r = _rects[_rects.length - 1];
    if (r.etaMax - r.etaMin < MIN_RECT_ETA || r.phiMax - r.phiMin < MIN_RECT_PHI) {
      _rects.pop();
      _notifyRegion();
      _redraw();
    }
  }
  // 'maybe-draw' (click on empty space) → no-op, no rect added.

  _mouseState    = 'idle';
  _dragAnchor    = null;
  _activeRectIdx = -1;
  if (_canvas) _canvas.style.cursor = '';
}

function _onMouseMoveHover(ev) {
  if (_mouseState !== 'idle') return;
  const { x, y } = _clientToCanvas(ev);
  const area      = _plotArea();
  const insidePlot =
    x >= area.x0 && x <= area.x1 && y >= area.y0 && y <= area.y1;
  if (!insidePlot) {
    _canvas.style.cursor = 'default';
    return;
  }
  _updateCursor(true, _xToEta(x, area), _yToPhi(y, area));
}

// ── Public API ──────────────────────────────────────────────────────────────
export function initMinimap() {
  if (_canvas) return { redraw: _redraw };

  // ── Outer wrapper ──────────────────────────────────────────────────────────
  _wrapEl    = document.createElement('div');
  _wrapEl.id = 'minimap-wrap';

  // ── φ seam slider pane (left side) ────────────────────────────────────────
  const pane    = document.createElement('div');
  pane.id       = 'minimap-phi-pane';

  _seamTrackEl           = document.createElement('div');
  _seamTrackEl.id        = 'minimap-phi-track';
  _seamTrackEl.className = 'strak';
  _seamTrackEl.title     =
    'φ seam — drag to rotate the display cut (dbl-click to reset)';
  // Cyclic gradient: fades at both ends to hint at the wrap-around nature
  _seamTrackEl.style.background =
    'linear-gradient(to top, ' +
    'rgba(80,130,210,0.12) 0%, rgba(80,130,210,0.48) 50%, rgba(80,130,210,0.12) 100%)';

  _seamThumbEl           = document.createElement('div');
  _seamThumbEl.className = 'sthumb';
  _seamTrackEl.appendChild(_seamThumbEl);

  const lbl       = document.createElement('div');
  lbl.id          = 'minimap-phi-lbl';
  lbl.textContent = 'φ cut';

  pane.appendChild(_seamTrackEl);
  pane.appendChild(lbl);
  _wrapEl.appendChild(pane);

  // ── Canvas ────────────────────────────────────────────────────────────────
  _canvas    = document.createElement('canvas');
  _canvas.id = 'minimap';
  _canvas.setAttribute('aria-label', 'η × φ energy heatmap');
  const dpr        = Math.min(window.devicePixelRatio || 1, 2);
  _canvas.width    = W * dpr;
  _canvas.height   = H * dpr;
  _canvas.style.width  = W + 'px';
  _canvas.style.height = H + 'px';
  _ctx = _canvas.getContext('2d');
  _ctx.scale(dpr, dpr);

  _canvas.addEventListener('mousedown',    _onMouseDown);
  _canvas.addEventListener('mousemove',    _onMouseMoveHover);
  _canvas.addEventListener('mouseleave',   () => {
    if (_mouseState === 'idle') _canvas.style.cursor = '';
  });
  _wrapEl.appendChild(_canvas);

  // ── Slider events ─────────────────────────────────────────────────────────
  _seamTrackEl.addEventListener('pointerdown',   _onSeamPointerDown);
  _seamTrackEl.addEventListener('pointermove',   _onSeamPointerMove);
  _seamTrackEl.addEventListener('pointerup',     _onSeamPointerUp);
  _seamTrackEl.addEventListener('pointercancel', _onSeamPointerUp);
  _seamTrackEl.addEventListener('dblclick',      _onSeamDblClick);

  _updateSeamThumb();

  _wrapEl.style.display = 'none';
  document.body.appendChild(_wrapEl);

  _redraw();
  return { redraw: _redraw };
}

/**
 * @param {{ cells?: any[], fcal?: any[] }} data
 */
export function updateMinimap({ cells, fcal }) {
  let binsDirty = false;
  if (cells !== undefined) {
    _cellEntries = cells;
    binsDirty    = true;
  }
  if (fcal !== undefined) {
    _fcalEntries = fcal;
    binsDirty    = true;
  }
  if (binsDirty) _binCache = null;
  _redraw();
}

export function setMinimapVisible(visible) {
  _enabled = !!visible;
  if (_wrapEl) _wrapEl.style.display = _enabled ? '' : 'none';
  if (_enabled) {
    _redraw();
  }
  // Hiding drops all rectangle filters so the 3D scene is no longer gated.
  if (!_enabled && _rects.length > 0) {
    _rects = [];
    _notifyRegion();
  }
}

export function isMinimapVisible() {
  return _enabled;
}

/**
 * Returns the active rectangles (array), or null when none are set or the
 * minimap is hidden.
 * @returns {Array<{etaMin:number, etaMax:number, phiMin:number, phiMax:number}> | null}
 */
export function getMinimapRegion() {
  if (!_enabled || !_rects.length) return null;
  return [..._rects];
}

/**
 * @param {(regions: any) => void} cb
 */
export function setMinimapRegionListener(cb) {
  _regionListener = typeof cb === 'function' ? cb : null;
}
