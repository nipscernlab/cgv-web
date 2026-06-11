import { fmtMev } from './utils.js';
import { getViewLevel, onViewLevelChange } from './viewLevel.js';
import { getActiveJetCollection, onJetStateChange } from './jets.js';
import { getActiveClusterDrawList, onClusterStateChange } from './clusterCollections.js';
import { getLastTaus } from './particles.js';
import { t } from './i18n/index.js';
import { getCellMetric, setCellMetric, onCellMetricChange } from './cellMetric.js';
import { recolorActiveCells } from './visibility.js';
import { computeFcalMetricRange } from './visibility/fcalRenderer.js';

function fmtGev(v) {
  return v.toFixed(2) + ' GeV';
}

function parseMevInput(s) {
  s = s.trim().toLowerCase();
  if (!s || s === 'all') return -Infinity;
  const g = s.match(/^([\d.]+)\s*gev$/i);
  if (g) return parseFloat(g[1]) * 1000;
  const m = s.match(/^([\d.]+)\s*(mev)?$/i);
  if (m) return parseFloat(m[1]);
  return null;
}

// Box display: drop floating-point noise + trailing zeros but keep up to 3
// decimals, so a value the user typed (e.g. 250.96) round-trips back into the
// field unchanged instead of snapping to a coarser label like "251.0 MeV".
function fmtBoxNum(v) {
  return String(Number(v.toFixed(3)));
}

/**
 * Coalesce a (potentially expensive) apply function to at most one call per
 * animation frame. Slider pointermove events can fire faster than the frame
 * rate, and each apply re-runs a full visibility sweep — running it more
 * than once per rendered frame is pure waste and is what made the threshold
 * sliders stutter (worst with the slicer active, where the sweep covers
 * every cell). The trailing call always runs, so the final value of a drag
 * is never skipped.
 *
 * @param {() => void} fn
 * @returns {() => void}
 */
function rafCoalesce(fn) {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn();
    });
  };
}

/**
 * Wire the persistent numeric input that sits below a slider. The box mirrors
 * the slider's current value (precise — see fmtBoxNum) and commits a typed
 * value through the SAME parse path the dblclick popup uses, so dragging the
 * thumb and typing a number are interchangeable. Mobile-friendly: inputmode
 * brings up the numeric keypad and the box swallows pointerdown so a tap on it
 * never starts a slider drag or a sidebar swipe underneath.
 *
 * @param {string} boxId            id of the <input class="sbox">
 * @param {() => number} read       current value in the box's unit (non-finite → empty)
 * @param {(raw: string) => void} commit  parse + apply the typed string
 * @returns {{ sync: () => void, el: HTMLInputElement | null }}
 */
function wireSliderBox(boxId, read, commit) {
  const box = /** @type {HTMLInputElement|null} */ (document.getElementById(boxId));
  if (!box) return { sync: () => {}, el: null };
  const render = () => {
    const v = read();
    box.value = isFinite(v) ? fmtBoxNum(v) : '';
  };
  // External value changes (drag, level switch, reload) re-render the box —
  // but never while the user is mid-edit, or we'd clobber their keystrokes.
  const sync = () => {
    if (document.activeElement !== box) render();
  };
  box.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      box.blur();
    } else if (e.key === 'Escape') {
      render();
      box.blur();
    }
  });
  // `change` fires on Enter-driven blur and on focus loss with an edited value.
  box.addEventListener('change', () => {
    commit(box.value);
    render();
  });
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  render();
  return { sync, el: box };
}

function ratioFromPtr(e, trackEl) {
  const rect = trackEl.getBoundingClientRect();
  return (
    1 -
    Math.max(0, Math.min(1, ((e.clientY ?? e.touches?.[0]?.clientY ?? 0) - rect.top) / rect.height))
  );
}

export function setupDetectorPanels({
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
  state,
}) {
  const TAB_IDS = ['tile', 'lar', 'fcal', 'hec', 'track'];
  const rpanelWrap = document.getElementById('rpanel-wrap');

  // Shared floating popup for "type the threshold" — opens on dblclick over
  // any slider track. The per-slider input element is gone (HTML is leaner;
  // the slider thumb + sval-min/max labels still encode the value's position
  // within its range). Each slider passes its own commit-from-string + a
  // pre-fill string (current value formatted) + placeholder.
  /** @type {((raw: string) => void) | null} */
  let _popupCommit = null;
  let _popupCancelled = false;
  const _popup = document.createElement('div');
  _popup.id = 'thr-popup';
  _popup.hidden = true;
  _popup.innerHTML = '<input type="text" autocomplete="off" spellcheck="false">';
  document.body.appendChild(_popup);
  const _popupInput = /** @type {HTMLInputElement} */ (_popup.querySelector('input'));
  function _closePopup(commit) {
    if (commit && _popupCommit && !_popupCancelled) _popupCommit(_popupInput.value);
    _popupCommit = null;
    _popupCancelled = false;
    _popup.hidden = true;
  }
  _popupInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      _popupInput.blur();
    } else if (e.key === 'Escape') {
      _popupCancelled = true;
      _popupInput.blur();
    }
  });
  _popupInput.addEventListener('blur', () => _closePopup(true));

  // ── Floating value tooltip (hover + drag) ───────────────────────────────
  // Single element shared across all sliders. Each slider's hover / pointer
  // handlers feed _showValTip with the pre-formatted current threshold.
  const _valTip = document.createElement('div');
  _valTip.id = 'thr-val-tip';
  _valTip.hidden = true;
  document.body.appendChild(_valTip);
  /** @param {MouseEvent|PointerEvent} e  @param {string} text */
  function _showValTip(e, text) {
    _valTip.textContent = text;
    _valTip.style.left = e.clientX + 12 + 'px';
    _valTip.style.top = e.clientY - 22 + 'px';
    _valTip.hidden = false;
  }
  function _hideValTip() {
    _valTip.hidden = true;
  }
  /**
   * @param {HTMLElement} anchor       slider track to position the popup against
   * @param {string} currentValue      pre-fill (current threshold formatted)
   * @param {(raw: string) => void} commit  parse + apply the typed string
   * @param {string} placeholder       hint text for the empty input
   */
  function openThrPopup(anchor, currentValue, commit, placeholder) {
    _popupCommit = commit;
    _popupCancelled = false;
    _popupInput.value = currentValue ?? '';
    _popupInput.placeholder = placeholder ?? '';
    const r = anchor.getBoundingClientRect();
    // Position to the LEFT of the slider — sliders live on the right edge of
    // the viewport (rpanel), so floating left keeps the popup on-screen and
    // doesn't cover the slider track itself.
    _popup.style.right = window.innerWidth - r.left + 8 + 'px';
    _popup.style.left = 'auto';
    _popup.style.top = r.top + r.height / 2 - 14 + 'px';
    _popup.hidden = false;
    requestAnimationFrame(() => {
      _popupInput.focus();
      _popupInput.select();
    });
  }

  function switchTab(det) {
    const tabs = [...TAB_IDS];
    const pc = document.getElementById('pane-cluster');
    if (pc && pc.parentElement && pc.parentElement.id === 'rpanel') tabs.push('cluster');
    tabs.forEach((id) => {
      const pane = document.getElementById('pane-' + id);
      const tab = document.getElementById('tab-' + id);
      if (pane) pane.style.display = id === det ? 'flex' : 'none';
      if (tab) tab.classList.toggle('on', id === det);
    });
  }

  function makeDetSlider(
    trackId,
    thumbId,
    getThr,
    setThr,
    maxMev,
    maxLblId,
    minLblId,
    onApply = applyThreshold,
    boxId,
  ) {
    const track = document.getElementById(trackId);
    const thumb = document.getElementById(thumbId);
    const maxLbl = maxLblId ? document.getElementById(maxLblId) : null;
    const minLbl = minLblId ? document.getElementById(minLblId) : null;
    let minMev = 0;
    let drag = false;
    /** @type {{ sync: () => void, el: HTMLInputElement | null } | null} */
    let box = null;

    // Slider semantics: bottom (ratio=0) snaps to -Infinity = "show all";
    // anywhere above the bottom maps linearly to [minMev, maxMev].
    const fromRatio = (r) => (r <= 0 ? -Infinity : minMev + (maxMev - minMev) * r);

    function updateUI(mev) {
      const span = maxMev - minMev;
      const ratio =
        isFinite(mev) && span > 0 && mev > minMev
          ? Math.max(0, Math.min(1, (mev - minMev) / span))
          : 0;
      thumb.style.top = (1 - ratio) * 100 + '%';
      box?.sync();
    }

    // Pre-formatted threshold for the floating value tooltip — MeV with
    // 'all' fallback for the bottom-snap (-Infinity) state.
    const fmtVal = () => {
      const v = getThr();
      return isFinite(v) ? fmtMev(v) : 'all';
    };
    let hover = false;
    track.addEventListener('mouseenter', (e) => {
      hover = true;
      _showValTip(e, fmtVal());
    });
    track.addEventListener('mousemove', (e) => {
      if (hover || drag) _showValTip(e, fmtVal());
    });
    track.addEventListener('mouseleave', () => {
      hover = false;
      if (!drag) _hideValTip();
    });

    // Per-frame coalescing for the drag path: UI (thumb + tooltip) updates on
    // every pointer event so the slider feels glued to the cursor; the heavy
    // visibility apply runs at most once per frame.
    const onApplyCoalesced = rafCoalesce(onApply);
    track.addEventListener('pointerdown', (e) => {
      drag = true;
      rpanelWrap.classList.add('dragging');
      track.setPointerCapture(e.pointerId);
      setThr(fromRatio(ratioFromPtr(e, track)));
      updateUI(getThr());
      onApply();
      _showValTip(e, fmtVal());
    });
    track.addEventListener('pointermove', (e) => {
      if (!drag) return;
      setThr(fromRatio(ratioFromPtr(e, track)));
      updateUI(getThr());
      onApplyCoalesced();
      _showValTip(e, fmtVal());
    });
    ['pointerup', 'pointercancel'].forEach((eventName) => {
      track.addEventListener(eventName, () => {
        drag = false;
        rpanelWrap.classList.remove('dragging');
        if (!hover) _hideValTip();
      });
    });
    // Shared by the dblclick popup and the persistent box below the slider.
    function commitFromString(raw) {
      const value = parseMevInput(raw);
      if (value !== null) {
        const clamped = value === -Infinity ? value : Math.max(minMev, Math.min(maxMev, value));
        setThr(clamped);
        onApply();
        updateUI(getThr());
      }
    }

    // Double-click → open the shared float popup so the user can type the
    // threshold instead of dragging the slider for fine values.
    track.addEventListener('dblclick', () => {
      const cur = getThr();
      const display = isFinite(cur) && cur > minMev ? fmtMev(cur) : '';
      openThrPopup(track, display, commitFromString, t('thr-placeholder'));
    });

    box = wireSliderBox(boxId, getThr, commitFromString);

    function update(newMinMev, newMaxMev) {
      minMev = newMinMev;
      maxMev = newMaxMev;
      if (maxLbl) maxLbl.textContent = fmtMev(newMaxMev);
      if (minLbl) minLbl.textContent = fmtMev(newMinMev);
      updateUI(getThr());
    }

    return { updateUI, update };
  }

  function makeTrackPtSlider(trackId, thumbId, maxLblId, minLblId, boxId) {
    const trackEl = document.getElementById(trackId);
    const thumbEl = document.getElementById(thumbId);
    const maxLblEl = document.getElementById(maxLblId);
    const minLblEl = document.getElementById(minLblId);
    let drag = false;
    /** @type {{ sync: () => void, el: HTMLInputElement | null } | null} */
    let box = null;

    function updateUI() {
      const span = state.getTrackPtMaxGev() - state.getTrackPtMinGev();
      const ratio =
        span > 0
          ? Math.max(0, Math.min(1, (state.getThrTrackGev() - state.getTrackPtMinGev()) / span))
          : 0;
      thumbEl.style.top = (1 - ratio) * 100 + '%';
      box?.sync();
    }

    const applyCoalesced = rafCoalesce(applyTrackThreshold);
    function setFromRatio(ratio, coalesce = false) {
      const span = state.getTrackPtMaxGev() - state.getTrackPtMinGev();
      state.setThrTrackGev(
        ratio <= 0 ? state.getTrackPtMinGev() : state.getTrackPtMinGev() + span * ratio,
      );
      updateUI();
      (coalesce ? applyCoalesced : applyTrackThreshold)();
    }

    // Floating value tooltip — same hover + drag pattern as the cell sliders.
    let hover = false;
    const fmtVal = () => fmtGev(state.getThrTrackGev());
    trackEl.addEventListener('mouseenter', (e) => {
      hover = true;
      _showValTip(e, fmtVal());
    });
    trackEl.addEventListener('mousemove', (e) => {
      if (hover || drag) _showValTip(e, fmtVal());
    });
    trackEl.addEventListener('mouseleave', () => {
      hover = false;
      if (!drag) _hideValTip();
    });

    trackEl.addEventListener('pointerdown', (e) => {
      drag = true;
      rpanelWrap.classList.add('dragging');
      trackEl.setPointerCapture(e.pointerId);
      setFromRatio(ratioFromPtr(e, trackEl));
      _showValTip(e, fmtVal());
    });
    trackEl.addEventListener('pointermove', (e) => {
      if (drag) {
        setFromRatio(ratioFromPtr(e, trackEl), true);
        _showValTip(e, fmtVal());
      }
    });
    ['pointerup', 'pointercancel'].forEach((eventName) => {
      trackEl.addEventListener(eventName, () => {
        drag = false;
        rpanelWrap.classList.remove('dragging');
        if (!hover) _hideValTip();
      });
    });
    // Shared by the dblclick popup and the persistent box below the slider.
    function commitFromString(raw) {
      const value = raw.trim().toLowerCase();
      if (!value || value === 'all') {
        state.setThrTrackGev(state.getTrackPtMinGev());
      } else {
        const gev = value.match(/^([\d.]+)\s*gev$/i);
        const parsed = gev ? parseFloat(gev[1]) : parseFloat(value);
        if (isFinite(parsed)) {
          state.setThrTrackGev(
            Math.max(state.getTrackPtMinGev(), Math.min(state.getTrackPtMaxGev(), parsed)),
          );
        }
      }
      updateUI();
      applyTrackThreshold();
    }

    trackEl.addEventListener('dblclick', () => {
      const cur = state.getThrTrackGev();
      const display = cur > state.getTrackPtMinGev() + 1e-9 ? fmtGev(cur) : '';
      openThrPopup(trackEl, display, commitFromString, t('thr-placeholder-gev'));
    });

    box = wireSliderBox(boxId, state.getThrTrackGev, commitFromString);

    function update(minGev, maxGev) {
      state.setTrackPtMinGev(minGev);
      state.setTrackPtMaxGev(maxGev);
      if (maxLblEl) maxLblEl.textContent = fmtGev(maxGev);
      if (minLblEl) minLblEl.textContent = fmtGev(minGev);
      updateUI();
    }

    return { updateUI, update };
  }

  function makeClusterEtSlider(trackId, thumbId, maxLblId, minLblId, boxId) {
    const trackEl = document.getElementById(trackId);
    const thumbEl = document.getElementById(thumbId);
    const maxLblEl = document.getElementById(maxLblId);
    const minLblEl = document.getElementById(minLblId);
    let drag = false;
    /** @type {{ sync: () => void, el: HTMLInputElement | null } | null} */
    let box = null;

    // Polymorphic ops bundle: cluster mode at level 2, jet mode at level 3.
    // Returns the same shape so updateUI / setFromRatio / blur logic works
    // unchanged. Outside levels 2 and 3 the slider is hidden anyway.
    const CLUSTER_OPS = {
      getMin: () => state.getClusterEtMinGev(),
      getMax: () => state.getClusterEtMaxGev(),
      getThr: () => state.getThrClusterEtGev(),
      setThr: (v) => state.setThrClusterEtGev(v),
      apply: applyClusterThreshold,
      applyCoalesced: rafCoalesce(applyClusterThreshold),
    };
    const JET_OPS = {
      getMin: () => state.getJetEtMinGev(),
      getMax: () => state.getJetEtMaxGev(),
      getThr: () => state.getThrJetEtGev(),
      setThr: (v) => state.setThrJetEtGev(v),
      apply: applyJetThreshold,
      applyCoalesced: rafCoalesce(applyJetThreshold),
    };
    function currentOps() {
      return getViewLevel() === 3 ? JET_OPS : CLUSTER_OPS;
    }

    function updateUI() {
      const ops = currentOps();
      const min = ops.getMin();
      const max = ops.getMax();
      const span = max - min;
      const ratio = span > 0 ? Math.max(0, Math.min(1, (ops.getThr() - min) / span)) : 0;
      thumbEl.style.top = (1 - ratio) * 100 + '%';
      if (maxLblEl) maxLblEl.textContent = fmtGev(max);
      if (minLblEl) minLblEl.textContent = fmtGev(min);
      box?.sync();
    }

    function setFromRatio(ratio, coalesce = false) {
      const ops = currentOps();
      const min = ops.getMin();
      const span = ops.getMax() - min;
      ops.setThr(ratio <= 0 ? min : min + span * ratio);
      updateUI();
      (coalesce ? ops.applyCoalesced : ops.apply)();
    }

    // Floating value tooltip — same hover + drag pattern as the cell sliders.
    let hover = false;
    const fmtVal = () => fmtGev(currentOps().getThr());
    trackEl.addEventListener('mouseenter', (e) => {
      hover = true;
      _showValTip(e, fmtVal());
    });
    trackEl.addEventListener('mousemove', (e) => {
      if (hover || drag) _showValTip(e, fmtVal());
    });
    trackEl.addEventListener('mouseleave', () => {
      hover = false;
      if (!drag) _hideValTip();
    });

    trackEl.addEventListener('pointerdown', (e) => {
      drag = true;
      rpanelWrap.classList.add('dragging');
      trackEl.setPointerCapture(e.pointerId);
      setFromRatio(ratioFromPtr(e, trackEl));
      _showValTip(e, fmtVal());
    });
    trackEl.addEventListener('pointermove', (e) => {
      if (drag) {
        setFromRatio(ratioFromPtr(e, trackEl), true);
        _showValTip(e, fmtVal());
      }
    });
    ['pointerup', 'pointercancel'].forEach((eventName) => {
      trackEl.addEventListener(eventName, () => {
        drag = false;
        rpanelWrap.classList.remove('dragging');
        if (!hover) _hideValTip();
      });
    });
    // Shared by the dblclick popup and the persistent box below the slider.
    // Reads currentOps() live so it always targets the active mode (cluster at
    // L2, jet at L3) — though the box itself is hidden in jet mode (see below).
    function commitFromString(raw) {
      const opsLive = currentOps();
      const value = raw.trim().toLowerCase();
      if (!value || value === 'all') {
        opsLive.setThr(opsLive.getMin());
      } else {
        const gev = value.match(/^([\d.]+)\s*gev$/i);
        const parsed = gev ? parseFloat(gev[1]) : parseFloat(value);
        if (isFinite(parsed)) {
          opsLive.setThr(Math.max(opsLive.getMin(), Math.min(opsLive.getMax(), parsed)));
        }
      }
      updateUI();
      opsLive.apply();
    }

    trackEl.addEventListener('dblclick', () => {
      const ops = currentOps();
      const cur = ops.getThr();
      const display = cur > ops.getMin() + 1e-9 ? fmtGev(cur) : '';
      openThrPopup(trackEl, display, commitFromString, t('thr-placeholder-gev'));
    });

    box = wireSliderBox(boxId, () => currentOps().getThr(), commitFromString);
    // The jet slider deliberately has no typed box — it shares this element
    // with the cluster slider, so hide the box whenever we're in jet mode (L3).
    function syncBoxVisibility() {
      const row = box?.el?.closest('.sbox-row');
      if (row) row.style.display = getViewLevel() === 3 ? 'none' : '';
    }
    syncBoxVisibility();

    // Level switch: redraw the slider against the new mode's bounds + value.
    onViewLevelChange(() => {
      updateUI();
      syncBoxVisibility();
    });
    // Active jet collection changed (new event or user picked another from the
    // dropdown): recompute jet ET min/max from the active list AND from τ
    // candidates (they share this slider — see applyTauPtThreshold), then
    // refresh. processXml.js draws τs *before* setJetCollections so that
    // getLastTaus is already populated by the time this listener fires.
    onJetStateChange(() => {
      const c = getActiveJetCollection();
      let min = Infinity;
      let max = -Infinity;
      if (c) {
        for (const j of c.jets) {
          if (j.etGev < min) min = j.etGev;
          if (j.etGev > max) max = j.etGev;
        }
      }
      for (const t of getLastTaus()) {
        if (!Number.isFinite(t.ptGev)) continue;
        if (t.ptGev < min) min = t.ptGev;
        if (t.ptGev > max) max = t.ptGev;
      }
      if (!isFinite(min)) {
        min = 0;
        max = 1;
      }
      state.setJetEtMinGev(Math.max(0, min));
      state.setJetEtMaxGev(max);
      if (getViewLevel() === 3) updateUI();
    });

    // Active cluster collection changed (new event or user picked another from
    // the rpanel2 dropdown): recompute cluster ET min/max from the active draw
    // list so the L2 slider bounds track the selected collection. Mirrors the
    // onJetStateChange hook above.
    onClusterStateChange(() => {
      let min = Infinity;
      let max = -Infinity;
      for (const c of getActiveClusterDrawList()) {
        if (c.etGev < min) min = c.etGev;
        if (c.etGev > max) max = c.etGev;
      }
      if (!isFinite(min)) {
        min = 0;
        max = 1;
      }
      update(Math.max(0, min), max);
    });

    // Cluster ET bounds flow through the onClusterStateChange hook above; jet
    // bounds through onJetStateChange. Both converge on updateUI for the active
    // mode (cluster at L2, jet at L3).
    function update(minGev, maxGev) {
      state.setClusterEtMinGev(minGev);
      state.setClusterEtMaxGev(maxGev);
      if (getViewLevel() !== 3) updateUI();
    }

    return { updateUI, update };
  }

  const tileSlider = makeDetSlider(
    'tile-strak',
    'tile-sthumb',
    state.getThrTileMev,
    state.setThrTileMev,
    TILE_SCALE,
    'tile-sval-max',
    'tile-sval-min',
    applyThreshold,
    'tile-sbox',
  );
  const larSlider = makeDetSlider(
    'lar-strak',
    'lar-sthumb',
    state.getThrLArMev,
    state.setThrLArMev,
    LAR_SCALE,
    'lar-sval-max',
    'lar-sval-min',
    applyThreshold,
    'lar-sbox',
  );
  const fcalSlider = makeDetSlider(
    'fcal-strak',
    'fcal-sthumb',
    state.getThrFcalMev,
    state.setThrFcalMev,
    FCAL_SCALE,
    'fcal-sval-max',
    'fcal-sval-min',
    applyFcalThreshold,
    'fcal-sbox',
  );
  const hecSlider = makeDetSlider(
    'hec-strak',
    'hec-sthumb',
    state.getThrHecMev,
    state.setThrHecMev,
    HEC_SCALE,
    'hec-sval-max',
    'hec-sval-min',
    applyThreshold,
    'hec-sbox',
  );
  const trackPtSlider = makeTrackPtSlider(
    'track-strak',
    'track-sthumb',
    'track-sval-max',
    'track-sval-min',
    'track-sbox',
  );
  const clusterEtSlider = makeClusterEtSlider(
    'cluster-strak',
    'cluster-sthumb',
    'cluster-sval-max',
    'cluster-sval-min',
    'cluster-sbox',
  );

  // ── Cell-metric (E vs E_T) ───────────────────────────────────────────────
  // Recolours every calo cell + FCAL for the current metric and re-derives the
  // per-detector percentile ranges that feed the colour palette + the slider
  // min/max labels. The threshold *values* are deliberately left untouched —
  // the user keeps whatever cut they had; only the slider's range relabels, so
  // the thumb just lands at a new position within the rescaled track.
  // processXml calls this on load when the panel sits in E_T mode; the
  // select-change handler below calls it on every flip.
  function syncCellMetric() {
    const { tile, lar, hec } = recolorActiveCells();
    const fcal = computeFcalMetricRange();
    tileSlider.update(tile[0], tile[1]);
    larSlider.update(lar[0], lar[1]);
    hecSlider.update(hec[0], hec[1]);
    fcalSlider.update(fcal[0], fcal[1]);
    // FCAL fully rebuilds on applyFcalThreshold → repaints with the new
    // palette + metric. Calo cell colours were already rewritten by
    // recolorActiveCells; the caller runs applyThreshold for cell visibility.
    applyFcalThreshold();
  }

  // Custom listbox dropdown (mirrors the jet-collection one in topToolbar.js)
  // rather than a native <select> so the E_T option can carry a real <sub>.
  // Two static options — no repopulation, just open/close/position + select.
  const metricTrigger = document.getElementById('cell-metric-trigger');
  const metricMenu = document.getElementById('cell-metric-menu');
  const metricLabelEl = document.getElementById('cell-metric-label');
  /** @type {Record<string, string>} */
  const METRIC_HTML = { E: 'Energy', ET: 'E<sub>T</sub>' };

  function syncMetricUI() {
    const m = getCellMetric();
    if (metricLabelEl) metricLabelEl.innerHTML = METRIC_HTML[m] ?? METRIC_HTML.E;
    if (metricMenu)
      for (const opt of metricMenu.querySelectorAll('.cell-metric-opt')) {
        const on = opt.getAttribute('data-metric') === m;
        opt.classList.toggle('on', on);
        opt.setAttribute('aria-selected', on ? 'true' : 'false');
      }
  }
  function closeMetricMenu() {
    if (!metricMenu) return;
    metricMenu.classList.remove('open');
    metricTrigger?.setAttribute('aria-expanded', 'false');
  }
  function positionMetricMenu() {
    if (!metricMenu || !metricTrigger) return;
    const br = metricTrigger.getBoundingClientRect();
    const left = Math.max(6, Math.min(br.left, window.innerWidth - metricMenu.offsetWidth - 6));
    metricMenu.style.left = `${left}px`;
    metricMenu.style.top = `${br.bottom + 6}px`;
  }
  function openMetricMenu() {
    if (!metricMenu || !metricTrigger) return;
    metricMenu.style.display = 'flex';
    metricMenu.style.visibility = 'hidden';
    positionMetricMenu();
    metricMenu.style.visibility = '';
    requestAnimationFrame(() => {
      metricMenu.classList.add('open');
      metricTrigger.setAttribute('aria-expanded', 'true');
    });
  }
  if (metricTrigger && metricMenu) {
    metricTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (metricMenu.classList.contains('open')) closeMetricMenu();
      else openMetricMenu();
    });
    for (const opt of metricMenu.querySelectorAll('.cell-metric-opt')) {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        setCellMetric(opt.getAttribute('data-metric') === 'ET' ? 'ET' : 'E');
        closeMetricMenu();
      });
    }
    document.addEventListener('click', (e) => {
      if (!metricMenu.classList.contains('open')) return;
      if (e.target === metricMenu || metricMenu.contains(/** @type {Node} */ (e.target))) return;
      closeMetricMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && metricMenu.classList.contains('open')) closeMetricMenu();
    });
    window.addEventListener('resize', () => {
      if (metricMenu.classList.contains('open')) positionMetricMenu();
    });
  }
  syncMetricUI();

  // Metric flip: update the dropdown UI, recolour + re-range (threshold
  // values stay fixed), then re-run the cell-visibility pass.
  onCellMetricChange(() => {
    syncMetricUI();
    syncCellMetric();
    applyThreshold();
  });

  function initDetPanel(hasTile, hasLAr, hasHec, hasTracks, hasFcal) {
    tileSlider.updateUI(state.getThrTileMev());
    larSlider.updateUI(state.getThrLArMev());
    fcalSlider.updateUI(state.getThrFcalMev());
    hecSlider.updateUI(state.getThrHecMev());
    clusterEtSlider.updateUI();
    sidebarControls.setPinnedR(true);
    // Preserve whichever tab the user is on across new XML loads. Only auto-pick
    // a tab when nothing is currently selected (e.g. a fresh session).
    const hasActive = !!document.querySelector('#rpanel .det-tab.on');
    if (hasActive) return;
    if (hasTile) switchTab('tile');
    else if (hasLAr) switchTab('lar');
    else if (hasFcal) switchTab('fcal');
    else if (hasHec) switchTab('hec');
    else if (hasTracks) switchTab('track');
  }

  TAB_IDS.forEach((id) => {
    document.getElementById('tab-' + id).addEventListener('click', () => switchTab(id));
  });
  document.getElementById('tab-cluster').addEventListener('click', () => switchTab('cluster'));

  switchTab('tile');
  tileSlider.updateUI(state.getThrTileMev());
  larSlider.updateUI(state.getThrLArMev());
  fcalSlider.updateUI(state.getThrFcalMev());
  hecSlider.updateUI(state.getThrHecMev());

  return {
    switchTab,
    initDetPanel,
    syncCellMetric,
    tileSlider,
    larSlider,
    fcalSlider,
    hecSlider,
    trackPtSlider,
    clusterEtSlider,
  };
}
