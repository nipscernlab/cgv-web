// @ts-check
// "Helpers" toolbar popover (#btn-helpers, #helpers-panel). Bundles the
// previously-scattered toggles that aren't tied to a specific particle type:
//   - Ghost      (sub-detector envelopes)
//   - Cell Info  (hover tooltip + outline)
//   - Vertices   (primary / pile-up / b-tag dots)
//   - Jet Lines / Cluster Lines  (L2: cluster, L3: jet — label adapts)
// The unmatched-tracks / unmatched-photons filters live in the K-popover
// (Particles panel) since they're per-particle filters, not generic helpers.
//
// Owns the `showInfo` state because the only consumer outside this module
// is hoverTooltip, which we expose via getShowInfo().

import {
  getJetsVisible,
  setJetsVisible,
  getClustersVisible,
  setClustersVisible,
  getVerticesVisible,
  setVerticesVisible,
  getParticleLabelsVisible,
  setParticleLabelsVisible,
  syncParticleLabelVisibility,
} from '../visibility.js';
import { getViewLevel, onViewLevelChange } from '../viewLevel.js';
import { markDirty } from '../renderer.js';
import { setClusterLineOpacity } from '../particles/clusters.js';
import { setJetLineOpacity } from '../particles/jets.js';
import { setupAnchoredPopover } from './anchoredPopover.js';

/**
 * @param {{
 *   toggleAllGhosts: () => void,
 *   anyGhostOn: () => boolean,
 *   clearOutline: () => void,
 *   hideTooltip: () => void,
 * }} cfg
 * @returns {{
 *   open: () => void,
 *   close: () => void,
 *   isOpen: () => boolean,
 *   getShowInfo: () => boolean,
 * }}
 */
export function setupHelpersPanel({ toggleAllGhosts, anyGhostOn, clearOutline, hideTooltip }) {
  let showInfo = true;

  // Each row's gswitch lives in #helpers-panel — see index.html.
  const hbtnGhost = document.getElementById('hbtn-ghost');
  const hbtnInfo = document.getElementById('hbtn-info');
  const hbtnVertices = document.getElementById('hbtn-vertices');
  const hbtnLabels = document.getElementById('hbtn-labels');
  const hbtnLines = document.getElementById('hbtn-lines');
  const hrowLines = document.getElementById('hrow-lines');
  const linesNameEl = hrowLines?.querySelector('.layer-name') ?? null;
  const linesSubEl = hrowLines?.querySelector('.layer-sub') ?? null;
  const hrowLineOpacity = document.getElementById('hrow-line-opacity');
  const hLineOpacity = /** @type {HTMLInputElement | null} */ (
    document.getElementById('h-line-opacity')
  );
  const hLineOpacityVal = document.getElementById('h-line-opacity-val');

  /**
   * @param {HTMLElement | null} el
   * @param {boolean} on
   */
  function setSwitch(el, on) {
    if (!el) return;
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', String(on));
  }

  // Lines row is level-aware:
  //   L1: hidden (no clusters / jets at the Hits view).
  //   L2: shown as "Cluster Lines" — toggles cluster lines.
  //   L3: shown as "Jet Lines"     — toggles jet lines (which also drives
  //                                  τ-jet lines via the shared toggle in
  //                                  detectorGroups.setJetsVisible).
  function syncLinesRow() {
    if (!hrowLines) return;
    const lvl = getViewLevel();
    // L1 (Hits view) has no clusters / jets — hide the toggle and its slider.
    const show = lvl !== 1;
    hrowLines.style.display = show ? '' : 'none';
    if (hrowLineOpacity) hrowLineOpacity.style.display = show ? '' : 'none';
    if (!show) return;
    if (lvl === 2) {
      if (linesNameEl) linesNameEl.textContent = 'Cluster Lines';
      if (linesNameEl) linesNameEl.setAttribute('data-i18n', 'helpers-cluster-lines');
      if (linesSubEl) linesSubEl.textContent = 'η/φ centerlines';
      if (linesSubEl) linesSubEl.setAttribute('data-i18n', 'helpers-cluster-lines-sub');
      setSwitch(hbtnLines, getClustersVisible());
    } else {
      if (linesNameEl) linesNameEl.textContent = 'Jet Lines';
      if (linesNameEl) linesNameEl.setAttribute('data-i18n', 'helpers-jet-lines');
      if (linesSubEl) linesSubEl.textContent = 'η/φ centerlines (jets + τ)';
      if (linesSubEl) linesSubEl.setAttribute('data-i18n', 'helpers-jet-lines-sub');
      setSwitch(hbtnLines, getJetsVisible());
    }
  }

  function syncAllRows() {
    setSwitch(hbtnGhost, anyGhostOn());
    setSwitch(hbtnInfo, showInfo);
    setSwitch(hbtnVertices, getVerticesVisible());
    setSwitch(hbtnLabels, getParticleLabelsVisible());
    syncLinesRow();
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────
  hbtnGhost?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAllGhosts();
    setSwitch(hbtnGhost, anyGhostOn());
  });
  hbtnInfo?.addEventListener('click', (e) => {
    e.stopPropagation();
    showInfo = !showInfo;
    setSwitch(hbtnInfo, showInfo);
    if (!showInfo) {
      clearOutline();
      hideTooltip();
    }
  });
  hbtnVertices?.addEventListener('click', (e) => {
    e.stopPropagation();
    setVerticesVisible(!getVerticesVisible());
    setSwitch(hbtnVertices, getVerticesVisible());
    markDirty();
  });
  hbtnLabels?.addEventListener('click', (e) => {
    e.stopPropagation();
    setParticleLabelsVisible(!getParticleLabelsVisible());
    setSwitch(hbtnLabels, getParticleLabelsVisible());
    // The setter is state-only — drive the actual sprite-visibility flip
    // through the central sync, which handles all four label-bearing groups
    // (electron / muon / tau-label / met) uniformly via the isParticleLabel
    // tag rather than per-group special cases.
    syncParticleLabelVisibility();
    markDirty();
  });
  hbtnLines?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (getViewLevel() === 2) {
      setClustersVisible(!getClustersVisible());
      setSwitch(hbtnLines, getClustersVisible());
      markDirty();
    } else if (getViewLevel() === 3) {
      setJetsVisible(!getJetsVisible());
      setSwitch(hbtnLines, getJetsVisible());
      markDirty();
    }
  });

  // Line-opacity slider drives both cluster and jet line materials (the lines
  // row toggles whichever is active for the current view level, but the slider
  // applies to both so its value persists across an L2 ↔ L3 switch).
  hLineOpacity?.addEventListener('input', () => {
    const pct = Number(hLineOpacity?.value ?? '100');
    const o = pct / 100;
    setClusterLineOpacity(o);
    setJetLineOpacity(o);
    if (hLineOpacityVal) hLineOpacityVal.textContent = `${pct}%`;
    markDirty();
  });

  const popover = setupAnchoredPopover({
    panelId: 'helpers-panel',
    anchorId: 'btn-helpers',
    defaultWidth: 220,
    onOpen: syncAllRows,
  });
  document.getElementById('btn-helpers')?.addEventListener('click', (e) => {
    e.stopPropagation();
    popover.isOpen() ? popover.close() : popover.open();
  });

  onViewLevelChange(() => {
    if (popover.isOpen()) syncAllRows();
    else syncLinesRow();
  });
  syncAllRows();

  return {
    open: popover.open,
    close: popover.close,
    isOpen: popover.isOpen,
    getShowInfo: () => showInfo,
  };
}
