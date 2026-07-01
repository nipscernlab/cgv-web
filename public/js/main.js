import * as THREE from 'three';
import { initLanguage, setupLanguagePicker, t } from './i18n/index.js';
import { setupSidebarControls } from './sidebarControls.js';
import { createSlicerController } from './slicer.js';
import { getActiveJetCollection, onJetStateChange } from './jets.js';
import { registerViewerShortcuts } from './viewerShortcuts.js';
import { TILE_SCALE, HEC_SCALE, LAR_SCALE, FCAL_SCALE } from './palette.js';
import { markDirty, canvas, renderer, scene, camera, controls } from './renderer.js';
import { toggleAllGhosts, anyGhostOn } from './ghost.js';
import { setupColorPicker } from './colorpicker.js';
// Side-effect: binds renderer.toneMapping to the quality preset (A4).
import './toneMapping.js';
import { setupCinemaControls } from './cinema.js';
import { getViewLevel, onViewLevelChange } from './viewLevel.js';
import { setupScreenshotControls } from './screenshot.js';
import { setupVideoRecorder } from './videoRecorder.js';
import { setupDetectorPanels } from './detectorPanels.js';
import {
  initVisibility,
  thrTileMev,
  thrLArMev,
  thrHecMev,
  thrFcalMev,
  thrTrackGev,
  trackPtMinGev,
  trackPtMaxGev,
  thrClusterEtGev,
  clusterEtMinGev,
  clusterEtMaxGev,
  thrJetEtGev,
  jetEtMinGev,
  jetEtMaxGev,
  setThrTileMev,
  setThrLArMev,
  setThrHecMev,
  setThrFcalMev,
  setThrTrackGev,
  setTrackPtMinGev,
  setTrackPtMaxGev,
  setThrClusterEtGev,
  setClusterEtMinGev,
  setClusterEtMaxGev,
  setThrJetEtGev,
  setJetEtMinGev,
  setJetEtMaxGev,
  hideNonActiveCells,
  applyThreshold,
  applyFcalThreshold,
  applyTrackThreshold,
  applyClusterThreshold,
  applyJetThreshold,
  refreshSceneVisibility,
  setEtaPhiRegion,
  setHeatmapListener,
  getTrackGroup,
} from './visibility.js';
import { createDownloadProgressController } from './downloadProgress.js';
import {
  initTrackAtlasIntersections,
  updateTrackAtlasIntersections,
} from './trackAtlasIntersections.js';
import { isAnyMuonVisible, onMuonVisibilityChange } from './visibility/muonVisibility.js';
import { clearOutline } from './outlines.js';
import { initHoverTooltip, hideTooltip, updatePins } from './hoverTooltip.js';
import { initRenderLoop } from './renderLoop.js';
import { setupPanelResize } from './panelResize.js';
import { setupButtonTooltips } from './buttonTooltips.js';
import { setupMobileToolbar } from './mobileToolbar.js';
import { processXml, setProcessXmlDeps } from './processXml.js';
import {
  initMinimap,
  setMinimapVisible,
  setMinimapRegionListener,
  updateMinimap,
} from './minimap.js';
import {
  initStatusHud,
  setStatus,
  updateCollisionHud,
  getLastEventInfo,
  setCollisionHudEnabled,
  setCollisionHudSuppressed,
} from './statusHud.js';
import { setupTopToolbar } from './bootstrap/topToolbar.js';
import { setupLayersPanel } from './bootstrap/layersPanel.js';
import { setupHelpersPanel } from './bootstrap/helpersPanel.js';
import { setupModeWiring } from './bootstrap/modeWiring.js';
import { setupSceneInit } from './bootstrap/sceneInit.js';
import { setupRowToggle } from './bootstrap/rowToggle.js';

let LivePoller = null;
try {
  ({ LivePoller } = await import('../live_atlas/live_cern/live_poller.js'));
} catch (_) {}

initLanguage();
setupLanguagePicker();
initMinimap();
// Minimap rectangle changes feed BOTH the 3D-scene gate (setEtaPhiRegion)
// AND the cinema tour (so a user-defined area of interest narrows the path).
// cinema is declared further below; the closure captures the const binding
// and only fires once the user has actually drawn or moved a rect.
setMinimapRegionListener((regions) => {
  setEtaPhiRegion(regions);
  cinema.notifyMinimapChanged(regions);
});
// Visibility pipeline pushes pre-rectangle visible cells into the minimap
// heatmap every time a filter changes (threshold sliders, detector toggles,
// view-level switch, slicer move). The cinema reuses the same data feed to
// rebuild its event-driven tour path — debounced + fingerprint-gated inside
// cinema so slider drags don't churn the curve. cinema is declared further
// below but the closure only fires after the first visibility refresh, well
// past cinema's initialisation.
setHeatmapListener((cells, fcal) => {
  updateMinimap({ cells, fcal });
  cinema.updateTourFromEvent({ cells, fcal });
});

let sidebarControls = null;

const sceneInit = setupSceneInit({ t });

// Tooltip + dirty on camera drag.
let _ctrlActive = false;
controls.addEventListener('start', () => {
  _ctrlActive = true;
});
controls.addEventListener('end', () => {
  _ctrlActive = false;
});
controls.addEventListener('change', () => {
  markDirty();
  if (!cinema.isCinemaMode() && _ctrlActive) {
    hideTooltip();
    clearOutline();
  }
});

// Assigned once the recorder is wired below; the render loop is hard-paused
// during a capture, but the guard is belt-and-suspenders against any in-flight
// frame advancing the tour with wall-clock time mid-capture.
let videoRecorder = null;
initRenderLoop({
  onFrameStart: () => {
    if (!videoRecorder?.isCapturing() && cinema.isAnimating()) cinema.tick();
    // Reproject pinned tooltips and drop any whose object has disappeared.
    updatePins();
  },
});

let tileSlider = null;
let larSlider = null;
let fcalSlider = null;
let hecSlider = null;
let trackPtSlider = null;
let clusterEtSlider = null;
let initDetPanel = null;
let syncCellMetric = null;
const { startProgress, advanceProgress, endProgress } = createDownloadProgressController();

const cinema = setupCinemaControls({
  camera,
  canvas,
  controls,
  markDirty,
  clearOutline,
  hideTooltip,
  updateCollisionHud,
  // The slicer rotates the scene to face its wedge opening at +X; the tour
  // path is world-space, so the cinema folds this angle into every bake.
  getSceneRotationZ: () => scene.rotation.z,
});
// Seed the cinema's view-level cache with the starting level and refresh it
// on every transition between modes 1/2/3 — the fingerprint includes the
// level so the adaptive tour rebuilds even when the underlying cell set
// happens to be identical between two modes.
cinema.notifyViewLevelChanged(getViewLevel());
onViewLevelChange((level) => cinema.notifyViewLevelChanged(level));
const enterCinema = () => cinema.enterCinema();
const exitCinema = () => cinema.exitCinema();
// Reset-camera button: when the slicer is active, re-snap to the slicer's
// own wedge-front view (with scene rotation and +X camera placement) rather
// than the project-default top-down view. The slicer instance is created
// further below; the closure looks it up at click time, never at module
// init, so the const-before-let ordering is fine.
const resetCamera = () => {
  if (slicer?.isActive?.()) slicer.resetCamera();
  else cinema.resetCamera();
};

const topToolbar = setupTopToolbar({ resetCamera });

const layersPanel = setupLayersPanel();

// Helpers popover wires Ghost / Cell Info / Unmatched / Jet-Cluster Lines.
// It owns the showInfo state that hoverTooltip reads via getShowInfo.
// Mutual exclusivity with the other toolbar popovers is automatic — see the
// shared registry in js/bootstrap/anchoredPopover.js.
const helpersPanel = setupHelpersPanel({
  toggleAllGhosts,
  anyGhostOn,
  clearOutline,
  hideTooltip,
});

initHoverTooltip({
  getShowInfo: helpersPanel.getShowInfo,
  getCinemaMode: () => cinema.isCinemaMode(),
  getDragging: () => _ctrlActive,
  t,
});

setupPanelResize();

// ── About overlay ─────────────────────────────────────────────────────────────
sidebarControls = setupSidebarControls({
  canvas,
  getTourMode: () => cinema.isTourMode(),
  onDisableTourMode: () => cinema.disableTourMode(),
  onEnableTourMode: () => cinema.enableTourMode(),
  onToggleCollisionHud: (enabled) => setCollisionHudEnabled(enabled),
  t,
  updateCollisionHud,
});

initStatusHud({
  t,
  isCollisionHudEnabled: () => sidebarControls.isCollisionHudEnabled(),
  getPanelPinned: () => sidebarControls.getState().panelPinned,
});

({
  tileSlider,
  larSlider,
  fcalSlider,
  hecSlider,
  trackPtSlider,
  clusterEtSlider,
  initDetPanel,
  syncCellMetric,
} = setupDetectorPanels({
  TILE_SCALE,
  LAR_SCALE,
  FCAL_SCALE,
  HEC_SCALE,
  applyThreshold,
  applyFcalThreshold,
  applyTrackThreshold,
  applyClusterThreshold,
  applyJetThreshold,
  sidebarControls,
  state: {
    getThrTileMev: () => thrTileMev,
    setThrTileMev,
    getThrLArMev: () => thrLArMev,
    setThrLArMev,
    getThrFcalMev: () => thrFcalMev,
    setThrFcalMev,
    getThrHecMev: () => thrHecMev,
    setThrHecMev,
    getThrTrackGev: () => thrTrackGev,
    setThrTrackGev,
    getTrackPtMinGev: () => trackPtMinGev,
    setTrackPtMinGev,
    getTrackPtMaxGev: () => trackPtMaxGev,
    setTrackPtMaxGev,
    getThrClusterEtGev: () => thrClusterEtGev,
    setThrClusterEtGev,
    getClusterEtMinGev: () => clusterEtMinGev,
    setClusterEtMinGev,
    getClusterEtMaxGev: () => clusterEtMaxGev,
    setClusterEtMaxGev,
    getThrJetEtGev: () => thrJetEtGev,
    setThrJetEtGev,
    getJetEtMinGev: () => jetEtMinGev,
    setJetEtMinGev,
    getJetEtMaxGev: () => jetEtMaxGev,
    setJetEtMaxGev,
  },
}));

setProcessXmlDeps({
  getWasmOk: sceneInit.isWasmOk,
  tileSlider,
  larSlider,
  fcalSlider,
  hecSlider,
  trackPtSlider,
  clusterEtSlider,
  initDetPanel,
  syncCellMetric,
});

setupButtonTooltips();
setupRowToggle();

const modeWiring = setupModeWiring({
  LivePoller,
  processXml,
  setStatus,
  startProgress,
  advanceProgress,
  endProgress,
  t,
});
sceneInit.setOnReady(() => modeWiring.onSceneAndWasmReady());

setupColorPicker();

// ── Download progress bar ─────────────────────────────────────────────────────

// ── Settings panel ────────────────────────────────────────────────────────────

setupMobileToolbar();

// ── Slicer gizmo ──────────────────────────────────────────────────────────────
// _cellCenter, _applySlicerMask, and all visibility logic live in visibility.js.

// Slicer state changes (enable / disable / drag / muon-driven resize) need to
// recompute BOTH calo-cell visibility (refreshSceneVisibility → applyThreshold)
// AND muon-chamber visibility (updateTrackAtlasIntersections — owns the
// show-all-chambers + wedge-mask pass). refreshSceneVisibility doesn't cascade
// into the chamber pass because cell vs chamber pipelines are otherwise
// independent; coupling them at the slicer hook keeps the rest decoupled.
// Every slicer transition (enable / disable / mask drag) needs to notify
// the cinema so the adaptive tour drops POIs in the cut wedge. Done in a
// shared helper so all three callbacks share the same notification path.
// slicer is the variable captured below; this fn only runs from user
// interaction, well past slicer's initialisation.
const _notifyCinemaSlicer = () => {
  cinema.notifySlicerChanged(slicer.getMaskState(), slicer.isPointInsideWedge);
};

let _slicerDragSeen = false;
const onSlicerStateChanged = () => {
  // Live drag: the slicer already pushed the wedge mask into the shared GPU
  // uniforms (wedgeClip.js) — cells, outlines, FCAL and chambers carve
  // themselves in their shaders, so a frame request is all that's needed.
  markDirty();
  if (slicer?.isDragging?.()) {
    _slicerDragSeen = true;
    // Track the moving cut LIVE: the cinema rebake is debounced and
    // sub-millisecond, and each (small) path change lands as a C2 morph —
    // a chain of gentle nudges while the ball moves, instead of one large
    // glide on release.
    _notifyCinemaSlicer();
    return;
  }
  const wasDragEnd = _slicerDragSeen;
  _slicerDragSeen = false;
  if (wasDragEnd) {
    // A gizmo drag just ended. The mask MOVED but nothing CPU-side depends
    // on its position: the carve lives in GPU uniforms, cell visibility is
    // mask-independent while show-all is on, and the chamber gate keys off
    // track hits, not the wedge. Re-running the full refresh here would
    // recompute an identical scene and hitch the frame — felt hardest when
    // the cinema tour is running. Only the cinema cares about the new cut
    // (its POI filter + pendulum arc); its rebuild is debounced,
    // sub-millisecond, and lands as a smooth C2 path morph.
    _notifyCinemaSlicer();
    return;
  }
  // Discrete state change (enable / disable / muon-driven resize): run the
  // full CPU refresh — visibility sweep, FCAL instance rebuild, chamber
  // pass, cinema tour.
  refreshSceneVisibility();
  updateTrackAtlasIntersections();
  _notifyCinemaSlicer();
};

const slicer = createSlicerController({
  THREE,
  camera,
  canvas,
  controls,
  scene,
  slicerButton: document.getElementById('btn-slicer'),
  onMaskChange: onSlicerStateChanged,
  onDisable: onSlicerStateChanged,
  // Enabling the slicer carves the 3D scene; the minimap heatmap doesn't
  // share that affordance and the two can confuse each other if both are
  // on, so they're mutually exclusive — turning the slicer on disables the
  // minimap (and vice versa via the toolbar button below). Also notify the
  // cinema so the tour drops POIs in the cut wedge.
  onEnable: () => {
    setMinimapEnabled(false);
    _notifyCinemaSlicer();
  },
  onHideNonActiveShowAll: hideNonActiveCells,
  markDirty,
  getActiveJetCollection,
  isMuonOn: isAnyMuonVisible,
});

// Wire the muon-chamber pass to the slicer so show-all-cells mode drops the
// track-hit gate on chambers and the wedge cut carves through them. Late
// binding via getSlicer because slicer was just created above; the pass is
// only invoked from applyMuonVisibility after the GLB has loaded, well past
// the synchronous reach of this file.
initTrackAtlasIntersections({ getTrackGroup, getSlicer: () => slicer });

// User toggled a muon station (or the initial GLB load fired the first
// applyMuonVisibility). Tell the slicer to grow/shrink its mask cylinder
// and recenter — the chamber envelope dwarfs the calo when muon is on.
onMuonVisibilityChange(() => slicer.refreshSize());

// New event lands or user picks a different jet collection — if the slicer
// is active, snap its walls to the new top-2 jets. No-op when slicer is
// inactive or fewer than 2 usable jets are present.
onJetStateChange(() => slicer.refreshFromActiveJets());

// ── Minimap toggle controller ────────────────────────────────────────────────
// Single source of truth for "is the minimap on": owns the toolbar button's
// .on class, the persisted preference, suppressing the collision HUD while
// active, and the mutual exclusion with the slicer (turning the minimap on
// disables the slicer; the slicer's onEnable callback turns the minimap off
// in the opposite direction). Function declaration so it's hoisted into the
// slicer's onEnable closure above.
const btnMinimap = document.getElementById('btn-minimap');
let _minimapOn = false;
function setMinimapEnabled(on) {
  on = !!on;
  if (on === _minimapOn) return;
  _minimapOn = on;
  if (on && slicer.isActive()) slicer.disable();
  setMinimapVisible(on);
  setCollisionHudSuppressed(on);
  btnMinimap?.classList.toggle('on', on);
  btnMinimap?.setAttribute('aria-pressed', on ? 'true' : 'false');
  try {
    localStorage.setItem('cgv-minimap', on ? '1' : '0');
  } catch (_) {}
}
function toggleMinimap() {
  setMinimapEnabled(!_minimapOn);
}
btnMinimap?.addEventListener('click', toggleMinimap);
// Restore last session's preference. Defaults to off — heatmap stays out of
// the way until the user asks for it.
try {
  if (localStorage.getItem('cgv-minimap') === '1') setMinimapEnabled(true);
} catch (_) {}

initVisibility({ slicer });

setupScreenshotControls({
  camera,
  markDirty,
  renderer,
  scene,
  slicer,
  t,
  getLastEventInfo,
});

videoRecorder = setupVideoRecorder({
  renderer,
  scene,
  camera,
  cinema,
  slicer,
  getLastEventInfo,
  t,
});

registerViewerShortcuts({
  aboutOverlay: topToolbar.aboutOverlay,
  closeLayersPanel: layersPanel.closeLayersPanel,
  closeSettingsPanel: sidebarControls.closeSettingsPanel,
  enterCinema,
  exitCinema,
  getState: () => ({
    cinemaMode: cinema.isCinemaMode(),
    layersPanelOpen: layersPanel.isOpen(),
    panelPinned: sidebarControls.getState().panelPinned,
    rpanelPinned: sidebarControls.getState().rpanelPinned,
    settingsPanelOpen: sidebarControls.getState().settingsPanelOpen,
  }),
  openSettingsPanel: sidebarControls.openSettingsPanel,
  resetCamera,
  setPinned: sidebarControls.setPinned,
  setPinnedR: sidebarControls.setPinnedR,
  slicer,
  toggleAllGhosts,
  toggleMinimap,
});

// ══════════════════════════════════════════════════════════════════════════════
// BENCH INSTRUMENTATION HOOK — window.__cgvApp  (current branch)
// ------------------------------------------------------------------------------
// Same API the baseline branch exposes, so the external suite (js/bench.js) drives
// both versions identically. Installed ONLY under ?bench=1 → normal load unaffected.
//
// FAIRNESS CONTRACT (identical to baseline): the hook adds NOTHING to the render
// loop — no per-frame callback, no wrapping of renderer.render, no counter reset.
// draws/tris are read on demand from the native renderer.info (three.js keeps them
// every render regardless of ?perf). Here the render loop resets renderer.info per
// frame (autoReset=true / manual reset around the composer), so the counters are
// PER-FRAME (accumulates:false) — the runner samples them directly. The comparable
// metric is the runner's external rAF frame-time. No CPU timer is injected.
// ══════════════════════════════════════════════════════════════════════════════
if (new URLSearchParams(location.search).has('bench')) {
  const _benchCells = (xmlText) => {
    const c = { tile: 0, lar: 0, hec: 0, fcal: 0 };
    const re = /<(TILE|LAr|HEC|FCAL)\b[^>]*count="(\d+)"/g;
    let m;
    while ((m = re.exec(xmlText))) c[m[1].toLowerCase()] = +m[2];
    c.total = c.tile + c.lar + c.hec + c.fcal;
    return c;
  };

  window.__cgvApp = {
    apiVersion: 1,
    version: 'current', // authoritative — hard-coded per branch

    isReady: () => !!(/** @type {any} */ (window).__cgvReady),
    whenReady(timeoutMs = 60000) {
      return new Promise((resolve, reject) => {
        const t0 = performance.now();
        const tick = () => {
          if (/** @type {any} */ (window).__cgvReady) return resolve();
          if (performance.now() - t0 > timeoutMs) return reject(new Error('app not ready'));
          setTimeout(tick, 100);
        };
        tick();
      });
    },

    // Native structural counters — read-only, ZERO per-frame cost. On this branch
    // renderer.info resets each frame, so calls/triangles are PER-FRAME values.
    counters() {
      const info = /** @type {any} */ (renderer).info && /** @type {any} */ (renderer).info.render;
      if (!info) return null;
      const r = /** @type {any} */ (renderer);
      return {
        calls: info.calls,
        triangles: info.triangles,
        accumulates: false,
        dpr: r.getPixelRatio ? r.getPixelRatio() : window.devicePixelRatio,
      };
    },

    async samples() {
      const r = await fetch('./default_xml/index.json');
      return r.ok ? r.json() : [];
    },
    currentSample() {
      return (
        document
          .querySelector('.sample-item.cur .sample-item-name')
          ?.textContent.trim()
          .replace(/^test_/, '') || null
      );
    },
    // Mirror the sidebar loader, but awaitable. `name` is the raw filename from
    // index.json (the sidebar shows it as "test_<name>").
    async loadSample(name) {
      await this.whenReady();
      const res = await fetch('./default_xml/' + encodeURIComponent(name));
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + name);
      const txt = await res.text();
      const t0 = performance.now();
      await processXml(txt);
      const parseMs = +(performance.now() - t0).toFixed(1);
      document.querySelectorAll('.sample-item.cur').forEach((b) => b.classList.remove('cur'));
      [...document.querySelectorAll('.sample-item .sample-item-name')]
        .find((s) => s.textContent.trim().replace(/^test_/, '') === name)
        ?.closest('.sample-item')
        ?.classList.add('cur');
      return { name, cells: _benchCells(txt), parseMs, bytes: txt.length };
    },

    cinema: {
      isOn: () => cinema.isCinemaMode(),
      enter() {
        if (!cinema.isCinemaMode()) enterCinema();
      },
      exit() {
        if (cinema.isCinemaMode()) exitCinema();
      },
    },

    // Slicer is reimplemented on this branch (GPU wedge). The wedge angle is not
    // publicly settable (enable() resets to 90° then auto-fits the leading jets),
    // and show-all is intrinsic to the slicer here — so set() just enables/disables
    // and get() records the ACTUAL cut so the JSON stays transparent.
    slicer: {
      set(on /* , opts */) {
        if (on) {
          if (!slicer.isActive()) slicer.enable();
        } else if (slicer.isActive()) {
          slicer.disable();
        }
      },
      get() {
        const m = slicer.getMaskState ? slicer.getMaskState() : {};
        return {
          active: slicer.isActive(),
          wedgeDeg: m.thetaLen != null ? +((m.thetaLen * 180) / Math.PI).toFixed(1) : null,
          showAll: slicer.isShowAllCells ? slicer.isShowAllCells() : slicer.isActive(),
        };
      },
      // Axis-drag surface (see slicer.js benchAxes/benchDrag*). Free axes here:
      // theta (wedge opening), phi (azimuth), z (beam translation), height.
      axes() {
        try {
          return slicer.benchAxes ? slicer.benchAxes() : null;
        } catch {
          return null;
        }
      },
      dragBegin() {
        slicer.benchDragBegin?.();
      },
      dragSet(axis, v) {
        slicer.benchSetAxis?.(axis, v);
      },
      dragEnd() {
        slicer.benchDragEnd?.();
      },
    },

    event() {
      try {
        return getLastEventInfo() || null;
      } catch {
        return null;
      }
    },
    geometry() {
      try {
        const e = performance
          .getEntriesByType('resource')
          .find((r) => /CaloGeometry\.glb\.gz(?:$|\?)/.test(r.name) && r.transferSize > 0);
        if (!e) return { fromCache: true, loadMs: null, bytes: null };
        return {
          fromCache: e.transferSize === 0,
          loadMs: +e.duration.toFixed(1),
          bytes: e.encodedBodySize || null,
        };
      } catch {
        return null;
      }
    },
  };

  console.log('[cgv] bench hook installed — version=current, render-neutral (?bench=1)');
}
