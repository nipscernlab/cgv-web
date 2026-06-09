import * as THREE from 'three';
import { canvas, camera, controls, scene, markDirty } from './renderer.js';
import { active, rayTargets } from './state.js';
import {
  fcalGroup,
  fcalVisibleMap,
  getTrackGroup,
  getPhotonGroup,
  getClusterGroup,
  getJetGroup,
  getTauGroup,
  getMetGroup,
  getVertexGroup,
} from './visibility.js';
import {
  showOutline,
  showFcalOutline,
  clearOutline,
  makePinnedOutline,
  makePinnedFcalOutline,
  removePinnedOutline,
} from './outlines.js';
import { showTrackHits, hideTrackHits, getHitsEnabled } from './overlays/hitsOverlay.js';
import { buildExtrasHtml } from './tooltipRows.js';
import { getMuonChamberMeshes, showChamberHoverOutline } from './trackAtlasIntersections.js';
import { getMuonAliasForMesh, getStationMeshes } from './visibility/muonAliases.js';
import { leptonSymbol, tauSymbolFromCharge } from './particleSymbols.js';
import { getCellMetric, etMevFromE } from './cellMetric.js';

export const tooltip = document.getElementById('tip');
export const tipCellEl = document.getElementById('tip-cell');
const tipCoordEl = document.getElementById('tip-coords');
export const tipEEl = document.getElementById('tip-e');
const tipEKeyEl = document.querySelector('#tip .tkey');
const tipExtraEl = document.getElementById('tip-extra');

// ── Pinned tooltips ──────────────────────────────────────────────────────────
// A left-click pins the current hover tooltip as a standalone card, anchored to
// the 3D world point under the cursor (hit.point). updatePins() (driven once
// per frame from the render loop) reprojects each card so it tracks its object
// while you orbit AND prunes any card whose object has disappeared (detector
// toggled off, threshold filtered it out, view-level change, slicer, new
// event). Clearing a card: click it; clear all: Esc (see viewerShortcuts.js).
// Each pin: { el, key, anchor: THREE.Vector3, alive: () => boolean }.
const _pins = [];
const _lastHoverAnchor = new THREE.Vector3(); // world point of the live hover hit
let _lastHoverKey = ''; // stable identity of the live hover hit (drives pin toggle)
let _lastHoverAlive = () => false; // predicate: is the live hover's object still shown?
// Outline descriptor for the live hover hit so a pin can keep its cell outlined:
// { kind: 'cell', handle } | { kind: 'fcal', iid } | null (non-outlineable hit).
let _lastHoverOutline = null;
let _hasHoverAnchor = false; // is the live hover valid (a tooltip is showing)?

// Renders the extra-rows block. Builder is in tooltipRows.js so the
// escaping contract (key=raw, value=escaped) can be tested in pure Node.
function _setExtras(rows) {
  if (!tipExtraEl) return;
  tipExtraEl.innerHTML = buildExtrasHtml(rows);
}

function _fmtEta(eta) {
  return Number.isFinite(eta) ? eta.toFixed(3) : '—';
}

// `.tkey` applies text-transform:uppercase, which would morph the lowercase
// Greek letter η (U+03B7) into uppercase Η (U+0397) — visually identical to a
// Latin H. Wrap Greek letters in a span that opts out of the transform.
const _ETA_LABEL = '<span style="text-transform:none">η</span>';

export function hideTooltip() {
  tooltip.hidden = true;
  _hasHoverAnchor = false; // hover hit is gone; nothing to pin from
}

// Hides every hover-driven visual: tooltip, cell / FCAL outline, track hit
// spheres. Used by the doRaycast early-return paths (cinema mode, cursor
// over UI, no scene to hover) and the function tail (no branch matched).
function _dismissAll() {
  hideTooltip();
  clearOutline();
  hideTrackHits();
}

// Reproject one pinned card from its world anchor to screen space, hiding it
// when the anchor falls behind the camera (project() wraps such points to the
// wrong side of the viewport). Clamped to stay inside the canvas like the live
// tooltip in showHit(). `rect` is the canvas rect, read once per updatePins()
// pass so repositioning many cards doesn't thrash layout.
const _csPoint = new THREE.Vector3();
const _ndc = new THREE.Vector3();
function _positionPin(pin, rect) {
  // View-space z >= 0 means the point is behind the camera (camera looks down -z).
  _csPoint.copy(pin.anchor).applyMatrix4(camera.matrixWorldInverse);
  if (_csPoint.z >= 0) {
    pin.el.style.display = 'none';
    return;
  }
  pin.el.style.display = '';
  _ndc.copy(pin.anchor).project(camera);
  const sx = rect.left + (_ndc.x * 0.5 + 0.5) * rect.width;
  const sy = rect.top + (-_ndc.y * 0.5 + 0.5) * rect.height;
  pin.el.style.left = Math.min(Math.max(sx + 14, rect.left + 4), rect.right - 210) + 'px';
  pin.el.style.top = Math.min(Math.max(sy + 14, rect.top + 4), rect.bottom - 90) + 'px';
}

// True while `o` is attached to the scene with no `.visible = false` anywhere up
// its parent chain — i.e. the object is actually being rendered. Detector
// toggles flip a group's .visible, threshold filters flip a line's .visible,
// and rebuilding an event detaches old objects — all caught here.
function _objVisible(o) {
  for (let n = o; n; n = n.parent) {
    if (n.visible === false) return false;
    if (n === scene) return true;
  }
  return false; // walked to a detached root without reaching the scene
}

// Per-frame pin maintenance (called from the render loop): drop any card whose
// object has disappeared, then reproject the survivors. Cheap and a no-op when
// there are no pins.
export function updatePins() {
  if (!_pins.length) return;
  camera.updateMatrixWorld();
  const rect = canvas.getBoundingClientRect();
  for (let i = _pins.length - 1; i >= 0; i--) {
    const pin = _pins[i];
    if (!pin.alive()) {
      pin.el.remove();
      removePinnedOutline(pin.outlineMesh);
      _pins.splice(i, 1);
      continue;
    }
    _positionPin(pin, rect);
  }
}

// Clear all pinned cards. Returns true if any existed, so the Esc handler can
// consume the keypress only when it actually dismissed something.
export function clearPins() {
  if (!_pins.length) return false;
  for (const pin of _pins) {
    pin.el.remove();
    removePinnedOutline(pin.outlineMesh);
  }
  _pins.length = 0;
  return true;
}

// Read-only snapshot of the pinned cards for the screenshot renderer: each
// card's world anchor + its live DOM element. Text is read straight from the
// element so the E / E_T metric, η/φ coords and any extra rows match the viewer
// exactly. See js/screenshot.js.
export function getPinnedCards() {
  return _pins.map((p) => ({ anchor: p.anchor, el: p.el }));
}

// Strip the duplicate ids from a cloned #tip (the clone is static, so the ids
// serve no purpose) and re-tag the two id-styled children with the classes the
// .tip-pinned CSS targets.
function _stripPinIds(el) {
  for (const node of el.querySelectorAll('[id]')) {
    if (node.id === 'tip-cell') node.classList.add('tip-cell');
    else if (node.id === 'tip-coords') node.classList.add('tip-coords');
    node.removeAttribute('id');
  }
}

// Click on an object: if it already has a card, MOVE that card to the new hit
// point (and refresh its text); otherwise create a new card. Identity is the
// per-hit `key` (cell handle / FCAL instance / object uuid), not the click
// point, so clicking anywhere on the same object re-targets its existing card.
// Removal is not done here — clicking the card itself dismisses it (_addPin).
function _pinObject(key, anchor, alive, outline) {
  const existing = _pins.find((p) => p.key === key);
  if (existing) {
    existing.anchor.copy(anchor);
    existing.alive = alive;
    _refreshPinContent(existing);
    _positionPin(existing, canvas.getBoundingClientRect());
    return;
  }
  _addPin(key, anchor, alive, outline);
}

// Remove the pin whose card element is `el`. Each card's own click handler
// calls this, so clicking a pinned card dismisses it — which also drops its
// persistent white outline.
function _removePinEl(el) {
  const i = _pins.findIndex((p) => p.el === el);
  if (i !== -1) {
    _pins[i].el.remove();
    removePinnedOutline(_pins[i].outlineMesh);
    _pins.splice(i, 1);
  }
}

// Re-sync a moved card's text with the live #tip. Same object → same content,
// but this also picks up a metric switch (e.g. E ↔ E_T) made between clicks.
function _refreshPinContent(pin) {
  const fresh = tooltip.cloneNode(true);
  _stripPinIds(fresh);
  pin.el.innerHTML = fresh.innerHTML;
}

// Clone the live #tip into a standalone, screen-anchored pinned card. Pinned
// cards are interactive (pointer-events:auto): clicking one dismisses it. The
// trade-off is that hovering a card suppresses the transient hover tooltip and
// a drag started on a card won't orbit — both fine for these small cards.
function _addPin(key, anchor, alive, outline) {
  const el = tooltip.cloneNode(true);
  el.removeAttribute('id');
  el.classList.add('tip-pinned');
  el.hidden = false;
  _stripPinIds(el);
  el.addEventListener('click', () => _removePinEl(el));
  document.body.appendChild(el);
  // A pinned cell / FCAL cell keeps a persistent white outline for the card's
  // lifetime (other hit types have no cell outline). Stored on the pin so the
  // dismiss / prune / clear paths can drop it.
  let outlineMesh = null;
  if (outline?.kind === 'cell') outlineMesh = makePinnedOutline(outline.handle);
  else if (outline?.kind === 'fcal') outlineMesh = makePinnedFcalOutline(outline.iid);
  const pin = { el, key, anchor: anchor.clone(), alive, outlineMesh };
  _pins.push(pin);
  _positionPin(pin, canvas.getBoundingClientRect());
}

const raycast = new THREE.Raycaster();
raycast.firstHitOnly = true; // stop after first intersection (much faster)
raycast.params.Line = { threshold: 40 }; // 40 mm hit zone for ID tracks / photons
// Muon tracks live at much larger radii (~10 m) and are typically watched
// from further away, so they want a wider raycast threshold to be easy to
// hover over. Used by toggling raycast.params.Line.threshold around the
// muon-only intersect call below.
const _MUON_TRACK_THRESHOLD_MM = 80;
const _DEFAULT_TRACK_THRESHOLD_MM = 40;
const mxy = new THREE.Vector2();

let lastRay = 0;
const mousePos = { x: 0, y: 0 };

let _getShowInfo = () => true;
let _getCinemaMode = () => false;
let _getDragging = () => false;
let _t = (k) => k;

export function initHoverTooltip({ getShowInfo, getCinemaMode, getDragging, t }) {
  if (getShowInfo) _getShowInfo = getShowInfo;
  if (getCinemaMode) _getCinemaMode = getCinemaMode;
  if (getDragging) _getDragging = getDragging;
  if (t) _t = t;

  document.addEventListener('mousemove', (e) => {
    mousePos.x = e.clientX;
    mousePos.y = e.clientY;
    // Skip the raycast entirely while the user is orbiting — main.js
    // already hides tooltip + outline on the controls 'change' event,
    // and the raycast itself (cells + fcal + tracks + clusters + jets +
    // ...) would otherwise stall the drag at ~20 Hz on a 30 k-cell event.
    if (_getDragging()) return;
    const now = Date.now();
    if (now - lastRay < 50) return;
    lastRay = now;
    doRaycast(e.clientX, e.clientY);
  });
  canvas.addEventListener('mouseleave', () => {
    clearOutline();
    hideTooltip();
    hideTrackHits();
  });
  controls.addEventListener('end', () => {
    lastRay = 0;
    setTimeout(() => doRaycast(mousePos.x, mousePos.y), 50);
  });

  // ── Click to pin / move ───────────────────────────────────────────────────
  // Record the press position so the click that *ends* an orbit / pan drag
  // doesn't spawn a pin. A click landing within a few px of the press is a
  // genuine click; refresh the hover under the cursor and pin (or re-position
  // an existing card for the same object) if it hit. Dismissing a card is the
  // card's own job — see the click handler attached in _addPin.
  let downX = 0,
    downY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });
  canvas.addEventListener('click', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // was a drag
    doRaycast(e.clientX, e.clientY);
    if (!tooltip.hidden && _hasHoverAnchor) {
      _pinObject(_lastHoverKey, _lastHoverAnchor, _lastHoverAlive, _lastHoverOutline);
    }
  });
  // Repositioning + pruning of pins is driven once per frame by updatePins()
  // from the render loop, which covers camera moves, view mutations and resize.
}

function doRaycast(clientX, clientY) {
  // Tooltip ("show info") and Hits ("Detector Layers > Inner Detector > Hits")
  // are independent toggles — see js/overlays/hitsOverlay.js for the hits
  // state. We can short-circuit when both are off (or cinema mode is on, which
  // overrides everything), or when there's literally nothing in the scene to
  // hover over. Otherwise we keep going so the track raycast can still drive
  // hits even when the tooltip is silenced.
  const wantTooltip = _getShowInfo() && !_getCinemaMode();
  const wantHits = getHitsEnabled() && !_getCinemaMode();
  // Electron group only carries sprite labels (not raycastable), so it doesn't
  // participate in the early-return "anything to hover" check below.
  const trackGroup = getTrackGroup();
  const photonGroup = getPhotonGroup();
  const clusterGroup = getClusterGroup();
  const jetGroup = getJetGroup();
  const tauGroup = getTauGroup();
  const metGroup = getMetGroup();
  const vertexGroup = getVertexGroup();
  // Tracks are raycastable even when the J button is off, so the user can
  // hover invisible tracks and still see the hit spheres (Hits toggle ON,
  // Tracks toggle OFF). Per-line .visible (pT slider) is still respected
  // inside the actual raycast filter below.
  const hasTrackLines =
    trackGroup && trackGroup.children.length > 0 && (trackGroup.visible || wantHits);
  const hasPhotonLines = photonGroup && photonGroup.visible && photonGroup.children.length > 0;
  const hasClusterLines = clusterGroup && clusterGroup.visible && clusterGroup.children.length > 0;
  const hasJetLines = jetGroup && jetGroup.visible && jetGroup.children.length > 0;
  const hasTauLines = tauGroup && tauGroup.visible && tauGroup.children.length > 0;
  const hasMetArrow = metGroup && metGroup.visible && metGroup.children.length > 0;
  const hasVertexMarkers = vertexGroup && vertexGroup.visible && vertexGroup.children.length > 0;
  const hasFcalTubes =
    fcalGroup && fcalGroup.children.some((c) => c.isInstancedMesh) && fcalVisibleMap.length > 0;
  // Muon chambers: only the meshes currently lit by tracks (or force-shown
  // via the panel) are .visible — see updateTrackAtlasIntersections. We
  // raycast against just those so hover doesn't pierce phantom invisible
  // chambers nearby.
  const muonChamberMeshes = getMuonChamberMeshes();
  const visibleChambers = muonChamberMeshes.filter((m) => m.visible);
  const hasMuonChambers = visibleChambers.length > 0;
  if (
    (!wantTooltip && !wantHits) ||
    (!active.size &&
      !hasTrackLines &&
      !hasPhotonLines &&
      !hasClusterLines &&
      !hasJetLines &&
      !hasTauLines &&
      !hasMetArrow &&
      !hasVertexMarkers &&
      !hasFcalTubes &&
      !hasMuonChambers)
  ) {
    _dismissAll();
    return;
  }
  // Don't show cell info when the pointer is over any UI element (panels, toolbar, overlays)
  const topEl = document.elementFromPoint(clientX, clientY);
  if (topEl && topEl !== canvas) {
    _dismissAll();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    _dismissAll();
    return;
  }
  mxy.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  camera.updateMatrixWorld();
  raycast.setFromCamera(mxy, camera);

  // Per-hit display helper (closes over rect, clientX, clientY, wantTooltip).
  // The pT / energy unit-key field accepts EITHER a plain text key (i18n
  // string) OR pre-formatted HTML (e.g. 'p<sub>T</sub>'). Visual setup
  // (showOutline / showTrackHits / clearOutline) stays in each branch since
  // the choice is hit-type-specific and reads clearer inline.
  /**
   * @param {{
   *   label: string,
   *   coord?: string,
   *   valueText: string,
   *   keyText?: string,
   *   keyHtml?: string,
   *   extras?: Array<[string, string]> | null,
   * }} params
   */
  function showHit({ label, coord, valueText, keyText, keyHtml, extras }) {
    tipCellEl.textContent = label;
    tipCoordEl.textContent = coord ?? '';
    tipEEl.textContent = valueText;
    if (tipEKeyEl) {
      if (keyHtml != null) tipEKeyEl.innerHTML = keyHtml;
      else tipEKeyEl.textContent = keyText ?? '';
    }
    _setExtras(extras ?? null);
    tooltip.style.left = Math.min(clientX + 18, rect.right - 210) + 'px';
    tooltip.style.top = Math.min(clientY + 18, rect.bottom - 90) + 'px';
    tooltip.hidden = !wantTooltip;
    markDirty();
  }
  // Common end-of-branch resolver. Every hit branch below sets up its data
  // and calls this with `showHitArgs` (passed through to showHit). Default
  // `outlineAction` and `trackHitsAction` cover the 5 simple branches
  // (vertex, cluster, tau, jet, MET); cell / FCAL / chamber / track-photon
  // pass overrides because their outline / hit-spheres behaviour differs.
  //
  // Centralising the cleanup here means a future per-branch flush (the kind
  // of "I'd need to remember 9 places" change that the SecVtx-highlight
  // experiment ran into) only touches this one function — branches stay
  // about *what* the hit is, not *what to clean up before showing it*.
  /**
   * @param {{
   *   showHitArgs: Parameters<typeof showHit>[0],
   *   outlineAction?: () => void,
   *   trackHitsAction?: () => void,
   *   anchor?: THREE.Vector3,
   *   key?: string,
   *   alive?: () => boolean,
   *   outline?: {kind:'cell',handle:any}|{kind:'fcal',iid:number}|null,
   * }} opts
   */
  function _finishHit({
    showHitArgs,
    outlineAction,
    trackHitsAction,
    anchor,
    key,
    alive,
    outline,
  }) {
    (outlineAction ?? clearOutline)();
    (trackHitsAction ?? hideTrackHits)();
    showHit(showHitArgs);
    // Remember the world hit point + identity + liveness + outline so a click
    // can pin this tooltip (keeping its cell outlined) and updatePins() can
    // later prune it (see _pinObject / _addPin).
    if (anchor && !tooltip.hidden) {
      _lastHoverAnchor.copy(anchor);
      _lastHoverKey = key ?? '';
      _lastHoverAlive = alive ?? (() => true);
      _lastHoverOutline = outline ?? null;
      _hasHoverAnchor = true;
    }
  }
  // ── Cell + FCAL hit (same priority — pick closest) ────────────────────────
  {
    let cellHit = null,
      cellHandle = null,
      cellDist = Infinity;
    if (active.size && rayTargets.length) {
      const hits = raycast.intersectObjects(rayTargets, false);
      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const iid = hit.instanceId;
        if (iid == null) continue;
        const h = hit.object.userData.handles?.[iid];
        if (!h || !active.has(h)) continue;
        cellHit = hit;
        cellHandle = h;
        cellDist = hit.distance;
        break; // hits are sorted; first active match is closest
      }
    }
    let fcalHit = null,
      fcalDist = Infinity;
    if (hasFcalTubes) {
      const iMesh = fcalGroup.children.find((c) => c.isInstancedMesh);
      if (iMesh) {
        const hits = raycast.intersectObject(iMesh, false);
        if (hits.length && hits[0].instanceId != null && fcalVisibleMap[hits[0].instanceId]) {
          fcalHit = hits[0];
          fcalDist = hits[0].distance;
        }
      }
    }
    // E_T mode swaps the tooltip's energy row for transverse energy
    // (E_T = E / cosh η). The cell metric is a global toggle in #rpanel.
    const isET = getCellMetric() === 'ET';
    if (cellHit && cellDist <= fcalDist) {
      const data = active.get(cellHandle);
      const valGev = isET ? data.etMev / 1000 : data.energyGev;
      _finishHit({
        anchor: cellHit.point,
        key: `cell:${cellHandle.iMesh.uuid}:${cellHandle.instId}`,
        alive: () => active.has(cellHandle) && cellHandle.visible,
        outline: { kind: 'cell', handle: cellHandle },
        outlineAction: () => (wantTooltip ? showOutline(cellHandle) : clearOutline()),
        showHitArgs: {
          label: data.cellName,
          coord: data.coords,
          valueText: `${valGev.toFixed(4)} GeV`,
          // E_T renders with a real subscript T; energy stays a plain word.
          ...(isET ? { keyHtml: 'E<sub>T</sub>' } : { keyText: _t('tip-energy-key') }),
        },
      });
      return;
    }
    if (fcalHit) {
      const iid = fcalHit.instanceId;
      const cell = fcalVisibleMap[iid];
      // Derive η/φ from the cell's JiveXML geometry, NOT the parser's
      // cell.eta/cell.phi — those come from the compact-ID index (φ
      // quantised to 16 sectors, range [0,2π)). Physics φ = atan2(y,x) on
      // the RAW x/y ∈ [-π,π] — same as the renderer's heatmap/region φ.
      const r = Math.hypot(cell.x, cell.y);
      const eta = -Math.log(Math.tan(Math.atan2(r, cell.z) / 2));
      const phi = Math.atan2(cell.y, cell.x);
      const side = eta >= 0 ? 'A' : 'C';
      let valGev = cell.energy;
      if (isET) valGev = etMevFromE(cell.energy * 1000, eta) / 1000;
      _finishHit({
        anchor: fcalHit.point,
        key: `fcal:${iid}`,
        alive: () => _objVisible(fcalGroup) && !!fcalVisibleMap[iid],
        outline: { kind: 'fcal', iid },
        outlineAction: () => (wantTooltip ? showFcalOutline(iid) : clearOutline()),
        showHitArgs: {
          label: `FCAL${cell.module} (${side}-side)`,
          coord: `η = ${eta.toFixed(3)}   φ = ${phi.toFixed(3)} rad`,
          valueText: `${valGev.toFixed(4)} GeV`,
          ...(isET ? { keyHtml: 'E<sub>T</sub>' } : { keyText: _t('tip-energy-key') }),
        },
      });
      return;
    }
  }
  // ── Vertex marker hit (priority over tracks) ─────────────────────────────
  // Tracks emanate from the primary vertex, so they cluster densely around
  // it. If we tested tracks first, the cursor on a vertex marker would
  // almost always hit a nearby track and the user would never see the
  // vertex tooltip. Vertex markers are small but distinct dots, so testing
  // them first matches user intent ("I'm pointing at the dot").
  if (hasVertexMarkers) {
    const vHits = raycast.intersectObject(vertexGroup, true);
    if (vHits.length) {
      const v = vHits[0].object;
      const kind = v.userData.vertexKind ?? 'primary';
      const label =
        kind === 'primary'
          ? 'Primary Vertex'
          : kind === 'pileup'
            ? 'Pile-up Vertex'
            : 'B-tag Vertex';
      const p = v.userData.position;
      const xyzMm = p ? `(${(-p.x).toFixed(2)}, ${(-p.y).toFixed(2)}, ${p.z.toFixed(2)}) mm` : '';
      _finishHit({
        anchor: vHits[0].point,
        key: `obj:${v.uuid}`,
        alive: () => _objVisible(v),
        showHitArgs: {
          label,
          coord: v.userData.vertexKey,
          valueText: `${v.userData.numTracks ?? 0}`,
          keyText: 'tracks',
          extras: [['x, y, z', xyzMm]],
        },
      });
      return;
    }
  }
  // ── Track / Photon hit (pick closest) ────────────────────────────────────
  // Electron group now contains only sprites (the "e±" labels), which aren't
  // raycasted — the electron identity comes from the matched track instead.
  // Two raycasts with different Line thresholds: ID tracks / photons get the
  // narrow 40 mm hit zone (so neighbouring tracks don't bleed into each
  // other), muon tracks get the wider 80 mm zone since they're typically
  // viewed from far away.
  if (hasTrackLines || hasPhotonLines) {
    const idCandidates = [];
    const muonCandidates = [];
    if (hasTrackLines) {
      for (const c of trackGroup.children) {
        if (!c.visible) continue;
        if (c.userData.storeGateKey === 'CombinedMuonTracks') muonCandidates.push(c);
        else idCandidates.push(c);
      }
    }
    if (hasPhotonLines) {
      for (const c of photonGroup.children) if (c.visible) idCandidates.push(c);
    }
    raycast.params.Line.threshold = _DEFAULT_TRACK_THRESHOLD_MM;
    const idHits = idCandidates.length ? raycast.intersectObjects(idCandidates, false) : [];
    raycast.params.Line.threshold = _MUON_TRACK_THRESHOLD_MM;
    const muonHits = muonCandidates.length ? raycast.intersectObjects(muonCandidates, false) : [];
    raycast.params.Line.threshold = _DEFAULT_TRACK_THRESHOLD_MM; // restore
    // Closest of the two passes wins.
    const bestId = idHits.length ? idHits[0] : null;
    const bestMu = muonHits.length ? muonHits[0] : null;
    let hits;
    if (bestId && bestMu) hits = bestId.distance <= bestMu.distance ? [bestId] : [bestMu];
    else if (bestId) hits = [bestId];
    else if (bestMu) hits = [bestMu];
    else hits = [];
    if (hits.length) {
      const line = hits[0].object;
      const ptGev = line.userData.ptGev ?? 0;
      const storeGateKey = line.userData.storeGateKey ?? '';
      const isPhoton = line.parent === photonGroup;
      // Tracks-invisible mode (J off + Hits on): we found a track via raycast
      // only because the parent .visible gate was relaxed up top. Show the
      // hit spheres and stop — no tooltip / outline, since the user can't
      // see the track itself and a "Track → Electron" tooltip floating above
      // empty space is misleading.
      if (!isPhoton && trackGroup && !trackGroup.visible) {
        showTrackHits(line);
        clearOutline();
        hideTooltip();
        markDirty();
        return;
      }
      let label;
      if (isPhoton) label = 'γ';
      else {
        // Track label mirrors the colour priority chain in
        // _applyTrackMaterials: electron > muon > jet > τ > muon-hit >
        // default. Lepton IDs (electron / muon) are official ΔR matches to
        // <Electron> / <Muon> objects, so they win first. Jet beats τ
        // because every τ in this XML carries withoutQuality — they are τ
        // algorithm INPUT, not τ-ID output. Sign helpers in particleSymbols.js
        // keep the PDG convention captured in one place — see that module
        // for the +pdg=lepton / -pdg=anti-lepton mapping.
        const ePdg = line.userData.matchedElectronPdgId;
        if (ePdg != null) label = `Track → ${leptonSymbol('e', ePdg)}`;
        else if (line.userData.isMuonMatched) {
          label = `Track → ${leptonSymbol('μ', line.userData.matchedMuonPdgId)}`;
        } else if (line.userData.isJetMatched) label = 'Track → Jet';
        else if (line.userData.isTauMatched) {
          label = `Track → ${tauSymbolFromCharge(line.userData.matchedTauCharge)}`;
        } else label = 'Track';
      }
      // Show pixel-hit markers for the hovered track; clear them for photons.
      _finishHit({
        anchor: hits[0].point,
        key: `obj:${line.uuid}`,
        alive: () => _objVisible(line),
        trackHitsAction: () => (isPhoton ? hideTrackHits() : showTrackHits(line)),
        showHitArgs: {
          label,
          coord: storeGateKey,
          valueText: `${ptGev.toFixed(3)} GeV`,
          keyHtml: 'p<sub>T</sub>',
          extras: [[_ETA_LABEL, _fmtEta(line.userData.eta)]],
        },
      });
      return;
    }
  }
  // ── Cluster hit ───────────────────────────────────────────────────────────
  if (hasClusterLines) {
    const visibleClusters = clusterGroup.children.filter((c) => c.visible);
    const clusterHits = raycast.intersectObjects(visibleClusters, false);
    if (clusterHits.length) {
      const line = clusterHits[0].object;
      const etGev = line.userData.etGev ?? 0;
      _finishHit({
        anchor: clusterHits[0].point,
        key: `obj:${line.uuid}`,
        alive: () => _objVisible(line),
        showHitArgs: {
          label: 'Cluster',
          coord: line.userData.storeGateKey ?? '',
          valueText: `${etGev.toFixed(3)} GeV`,
          keyHtml: 'E<sub>T</sub>',
          extras: [[_ETA_LABEL, _fmtEta(line.userData.eta)]],
        },
      });
      return;
    }
  }
  // ── Tau hit ───────────────────────────────────────────────────────────────
  // Tested before jets because τ candidates often share a direction with a jet
  // (the hadronic τ decay products *form* a narrow jet) — the τ classification
  // is the more specific identification, so it wins the hover.
  if (hasTauLines) {
    const visibleTaus = tauGroup.children.filter((c) => c.visible);
    const tauHits = raycast.intersectObjects(visibleTaus, false);
    if (tauHits.length) {
      const line = tauHits[0].object;
      const ptGev = line.userData.ptGev ?? 0;
      _finishHit({
        anchor: tauHits[0].point,
        key: `obj:${line.uuid}`,
        alive: () => _objVisible(line),
        showHitArgs: {
          label: tauSymbolFromCharge(line.userData.charge),
          coord: line.userData.storeGateKey ?? '',
          valueText: `${ptGev.toFixed(3)} GeV`,
          keyHtml: 'p<sub>T</sub>',
          extras: [
            [_ETA_LABEL, _fmtEta(line.userData.eta)],
            ['tracks', `${line.userData.numTracks ?? 0}`],
          ],
        },
      });
      return;
    }
  }
  // ── Jet hit ───────────────────────────────────────────────────────────────
  if (hasJetLines) {
    const visibleJets = jetGroup.children.filter((c) => c.visible);
    const jetHits = raycast.intersectObjects(visibleJets, false);
    if (jetHits.length) {
      const line = jetHits[0].object;
      const ptGev = line.userData.ptGev ?? line.userData.etGev ?? 0;
      const storeGateKey = line.userData.storeGateKey ?? '';
      const massGev = line.userData.massGev ?? 0;
      // η is the canonical companion to pT. Mass is only meaningful for
      // large-R (R = 1.0) collections — boosted W/Z/top/H tagging — so we
      // include it for AntiKt10* and skip it otherwise. (The "mass" label is
      // Latin-only so the default uppercase styling is fine.)
      const extras = [[_ETA_LABEL, _fmtEta(line.userData.eta)]];
      if (storeGateKey.includes('AntiKt10')) {
        extras.push(['mass', `${massGev.toFixed(3)} GeV`]);
      }
      _finishHit({
        anchor: jetHits[0].point,
        key: `obj:${line.uuid}`,
        alive: () => _objVisible(line),
        showHitArgs: {
          label: 'Jet',
          coord: storeGateKey,
          valueText: `${ptGev.toFixed(3)} GeV`,
          keyHtml: 'p<sub>T</sub>',
          extras,
        },
      });
      return;
    }
  }
  // ── MET arrow hit ─────────────────────────────────────────────────────────
  // The shaft is a real-length Line and the head is a Mesh; raycast against
  // the whole group catches both at the default track threshold (40 mm).
  if (hasMetArrow) {
    const metHits = raycast.intersectObject(metGroup, true);
    if (metHits.length) {
      // Walk up to the ArrowHelper (where the metadata lives on userData).
      let arrow = metHits[0].object;
      while (arrow && arrow.userData.magnitude == null && arrow.parent) arrow = arrow.parent;
      const magnitude = arrow?.userData.magnitude ?? 0;
      const sumEt = arrow?.userData.sumEt ?? 0;
      _finishHit({
        anchor: metHits[0].point,
        key: `obj:${arrow?.uuid}`,
        alive: () => _objVisible(arrow),
        showHitArgs: {
          label: 'ν',
          coord: arrow?.userData.metKey ?? '',
          valueText: `${magnitude.toFixed(2)} GeV`,
          keyHtml: 'E<sub>T</sub><sup>miss</sup>',
          extras: [['Sum E', `${sumEt.toFixed(1)} GeV`]],
        },
      });
      return;
    }
  }
  // ── Muon chamber hit ────────────────────────────────────────────────────
  // Lowest priority — only checked after every event-overlay branch missed.
  // Chamber alias (BIS / BIL / NSW / …) + full station name + readout
  // technology come from getMuonAliasForMesh, which mirrors the renaming
  // the Detector Layers panel applies plus the MUON_STATION_TECH table.
  if (hasMuonChambers) {
    const chamberHits = raycast.intersectObjects(visibleChambers, false);
    if (chamberHits.length) {
      const mesh = chamberHits[0].object;
      const info = getMuonAliasForMesh(mesh);
      // No alias = chamber not in MUON_STATION_RENAMES / MUON_MERGED_GROUPS,
      // or a descendant of a MUON_HIDDEN_NODES subtree. These only surface in
      // slicer show-all mode (the depth-trim filter still includes them) and
      // would show a generic "Muon chamber" tooltip with no useful station /
      // tech info. Better to dismiss silently — the user gets the visual but
      // no half-empty tooltip.
      if (!info) {
        _dismissAll();
        return;
      }
      const alias = info.alias;
      const sideLabel = info.side ? ` (${info.side} side)` : '';
      const coord = info.full ? `${info.full}${sideLabel}` : sideLabel.trim() || '—';
      // Outline every chamber of the same station — getStationMeshes returns
      // every mesh sharing the (side, alias) of the hovered one, so the user
      // sees the full BIS / NSW / … ring, not just the single chamber under
      // the cursor. clearOutline first to drop any stale outline state, then
      // re-apply on the same call.
      const stationMeshes = getStationMeshes(mesh);
      _finishHit({
        anchor: chamberHits[0].point,
        key: `obj:${mesh.uuid}`,
        alive: () => _objVisible(mesh),
        outlineAction: () => {
          clearOutline();
          showChamberHoverOutline(stationMeshes.length ? stationMeshes : [mesh]);
        },
        showHitArgs: {
          label: `Muon chamber — ${alias}`,
          coord,
          valueText: info.tech ?? '—',
          keyText: 'tech',
        },
      });
      return;
    }
  }
  _dismissAll();
}
