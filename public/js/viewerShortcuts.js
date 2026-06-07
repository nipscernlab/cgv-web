// @ts-check
import { clearPins } from './hoverTooltip.js';

/**
 * @typedef {Object} ViewerState
 * @property {boolean} cinemaMode
 * @property {boolean} settingsPanelOpen
 * @property {boolean} layersPanelOpen
 * @property {boolean} rpanelPinned
 * @property {boolean} panelPinned
 */

/**
 * Wire the global single-key viewer shortcuts (camera, panels, scene toggles,
 * and the overloaded Esc dismiss chain).
 *
 * @param {{
 *   aboutOverlay: HTMLElement,
 *   closeLayersPanel: () => void,
 *   closeSettingsPanel: () => void,
 *   enterCinema: () => void,
 *   exitCinema: () => void,
 *   getState: () => ViewerState,
 *   openSettingsPanel: () => void,
 *   resetCamera: () => void,
 *   setPinned: (on: boolean) => void,
 *   setPinnedR: (on: boolean) => void,
 *   slicer: { toggle: () => void, isActive: () => boolean, disable: () => void },
 *   toggleAllGhosts: () => void,
 *   toggleMinimap?: () => void,
 * }} deps
 */
export function registerViewerShortcuts({
  aboutOverlay,
  closeLayersPanel,
  closeSettingsPanel,
  enterCinema,
  exitCinema,
  getState,
  openSettingsPanel,
  resetCamera,
  setPinned,
  setPinnedR,
  slicer,
  toggleAllGhosts,
  toggleMinimap,
}) {
  document.addEventListener('keydown', (e) => {
    const tgt = /** @type {HTMLElement | null} */ (e.target);
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.shiftKey) {
      switch (e.key.toUpperCase()) {
        case 'B':
          /** @type {any} */ (window).__cgvToggleBgPicker?.();
          return;
        case 'S':
          slicer.toggle();
          return;
        case 'M':
          toggleMinimap?.();
          return;
      }
      return;
    }

    const state = getState();
    switch (e.key.toUpperCase()) {
      case 'G':
        toggleAllGhosts();
        break;
      case 'R':
        resetCamera();
        break;
      case 'I':
        document.getElementById('hbtn-info')?.click();
        break;
      case 'C':
        state.cinemaMode ? exitCinema() : enterCinema();
        break;
      case 'M':
        document.getElementById('btn-panel')?.click();
        break;
      case 'E':
        setPinnedR(!state.rpanelPinned);
        break;
      case 'P':
        document.getElementById('btn-shot')?.click();
        break;
      case 'S':
        state.settingsPanelOpen ? closeSettingsPanel() : openSettingsPanel();
        break;
      case 'T':
        document.getElementById('ltog-tile')?.click();
        break;
      case 'L':
      case 'A':
        document.getElementById('ltog-lar')?.click();
        break;
      case 'H':
        document.getElementById('ltog-hec')?.click();
        break;
      case 'F':
        document.getElementById('ltog-fcal')?.click();
        break;
      case 'J':
        document.getElementById('btn-tracks')?.click();
        break;
      case 'K':
        document.getElementById('btn-cluster')?.click();
        break;
      case 'ESCAPE':
        // Clear pinned tooltips first, but consume Esc only when some existed —
        // otherwise fall through to the panel / cinema / slicer dismiss chain.
        if (clearPins()) return;
        if (slicer.isActive()) {
          slicer.disable();
          return;
        }
        if (state.cinemaMode) {
          exitCinema();
          return;
        }
        if (state.settingsPanelOpen) {
          closeSettingsPanel();
          return;
        }
        if (state.layersPanelOpen) {
          closeLayersPanel();
          return;
        }
        if (state.rpanelPinned) {
          setPinnedR(false);
          return;
        }
        if (document.getElementById('shot-overlay')?.classList.contains('open')) {
          document.getElementById('btn-shot-cancel')?.click();
          return;
        }
        if (state.panelPinned) {
          setPinned(false);
          return;
        }
        aboutOverlay.classList.remove('open');
        break;
    }
  });
}
