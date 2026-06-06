export function setupSidebarControls({
  canvas,
  getTourMode,
  onDisableTourMode,
  onEnableTourMode,
  onToggleCollisionHud,
  t,
  updateCollisionHud,
}) {
  const panelEl = document.getElementById('panel');
  const panelEdge = document.getElementById('panel-edge');
  const rpanelWrap = document.getElementById('rpanel-wrap');
  const rpanelEdge = document.getElementById('rpanel-edge');
  const btnRpanel = document.getElementById('btn-rpanel');
  const settingsPanel = document.getElementById('settings-panel');
  const btnSettings = document.getElementById('btn-settings');
  const btnPin = document.getElementById('btn-pin');
  const btnPanel = document.getElementById('btn-panel');
  const hintsToggle = document.getElementById('stog-hints');
  const autoOpenToggle = document.getElementById('stog-autopen');
  const tourToggle = document.getElementById('stog-tour');
  const collisionToggle = document.getElementById('stog-collision-hud');
  const btnTip = document.getElementById('btn-tip');
  const mobileMQ = window.matchMedia('(orientation: landscape) and (max-height: 520px)');

  let panelPinned = true;
  let panelHovered = false;
  let rpanelPinned = true;
  let rpanelHovered = false;
  let settingsPanelOpen = false;
  let hintsEnabled = true;
  let autoOpenEnabled = true;

  function syncLeftPanel() {
    document.body.classList.toggle('panel-unpinned', !panelPinned);
    panelEl.classList.toggle('collapsed', !panelPinned);
    btnPin.classList.toggle('on', panelPinned);
    document
      .querySelector('#pin-icon use')
      .setAttribute('href', panelPinned ? '#i-pin' : '#i-pin-off');
    btnPin.dataset.tip = t(panelPinned ? 'tip-pin' : 'tip-panel');
    btnPanel.classList.toggle('on', panelPinned);
    updateCollisionHud();
  }

  function syncRightPanel() {
    const open = rpanelPinned || rpanelHovered;
    rpanelWrap.classList.toggle('collapsed', !open);
    btnRpanel.classList.toggle('on', rpanelPinned);
    document.body.classList.toggle('rpanel-unpinned', !rpanelPinned);
  }

  function setPinned(value) {
    panelPinned = value;
    syncLeftPanel();
  }

  function setPinnedR(value) {
    rpanelPinned = value;
    if (value) rpanelHovered = false;
    syncRightPanel();
  }

  function openSettingsPanel() {
    settingsPanelOpen = true;
    settingsPanel.classList.add('open');
    btnSettings.classList.add('on');
    const br = btnSettings.getBoundingClientRect();
    requestAnimationFrame(() => {
      const pw = settingsPanel.offsetWidth || 304;
      const ph = settingsPanel.offsetHeight || 320;
      const tb = document.getElementById('toolbar');
      const tbr = tb ? tb.getBoundingClientRect() : { left: 0, height: 0, width: 0 };
      const isVerticalDock = tbr.left < 8 && tbr.height > tbr.width;

      if (isVerticalDock) {
        // Right-of activity bar. Settings sits at the bottom of the bar
        // so anchor near the button, clamped to the viewport.
        const left = Math.min(window.innerWidth - pw - 8, br.right + 8);
        let top = br.top + br.height / 2 - ph / 2;
        top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
        settingsPanel.style.left = `${Math.max(8, left)}px`;
        settingsPanel.style.top = `${top}px`;
        settingsPanel.style.bottom = '';
      } else {
        // Above-anchor (mobile horizontal dock).
        let left = br.left + br.width / 2 - pw / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
        settingsPanel.style.left = `${left}px`;
        settingsPanel.style.top = '';
        settingsPanel.style.bottom = `${window.innerHeight - br.top + 10}px`;
      }
    });
  }

  function closeSettingsPanel() {
    settingsPanelOpen = false;
    settingsPanel.classList.remove('open');
    btnSettings.classList.remove('on');
  }

  function syncAutoOpenUi() {
    autoOpenToggle.classList.toggle('on', autoOpenEnabled);
    autoOpenToggle.setAttribute('aria-checked', autoOpenEnabled);
    panelEdge.style.pointerEvents = autoOpenEnabled ? '' : 'none';
    rpanelEdge.style.pointerEvents = autoOpenEnabled ? '' : 'none';
  }

  function syncHintsUi() {
    hintsToggle.classList.toggle('on', hintsEnabled);
    hintsToggle.setAttribute('aria-checked', hintsEnabled);
    btnTip.style.display = hintsEnabled ? '' : 'none';
  }

  function syncTourUi() {
    if (!tourToggle) return;
    const tourMode = getTourMode();
    tourToggle.classList.toggle('on', tourMode);
    tourToggle.setAttribute('aria-checked', tourMode ? 'true' : 'false');
  }

  btnPin.addEventListener('click', () => setPinned(!panelPinned));
  panelEdge.addEventListener('mouseenter', () => {
    if (!panelPinned && autoOpenEnabled) {
      panelEl.classList.remove('collapsed');
      panelHovered = true;
    }
  });
  panelEl.addEventListener('mouseleave', () => {
    if (!panelPinned && panelHovered) {
      panelEl.classList.add('collapsed');
      panelHovered = false;
    }
  });
  canvas.addEventListener('click', () => {
    if (!panelPinned && panelHovered) {
      panelEl.classList.add('collapsed');
      panelHovered = false;
    }
    if (!rpanelPinned && rpanelHovered) {
      rpanelHovered = false;
      syncRightPanel();
    }
  });
  btnPanel.addEventListener('click', () => {
    if (!panelPinned && panelHovered) {
      panelHovered = false;
      setPinned(true);
      return;
    }
    setPinned(!panelPinned);
  });

  rpanelEdge.addEventListener('mouseenter', () => {
    if (!rpanelPinned && autoOpenEnabled) {
      rpanelHovered = true;
      syncRightPanel();
    }
  });
  rpanelWrap.addEventListener('mouseleave', () => {
    if (!rpanelPinned && rpanelHovered) {
      rpanelHovered = false;
      syncRightPanel();
    }
  });
  btnRpanel.addEventListener('click', (e) => {
    e.stopPropagation();
    setPinnedR(!rpanelPinned);
  });

  (function setupEdgeTaps() {
    function tapOpener(el, openFn) {
      let sx = 0;
      let sy = 0;
      let st = 0;
      let tracking = false;
      el.addEventListener(
        'touchstart',
        (e) => {
          if (!mobileMQ.matches) return;
          const touch = e.touches[0];
          sx = touch.clientX;
          sy = touch.clientY;
          st = Date.now();
          tracking = true;
        },
        { passive: true },
      );
      el.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const touch = e.changedTouches[0];
        const dx = Math.abs(touch.clientX - sx);
        const dy = Math.abs(touch.clientY - sy);
        const dt = Date.now() - st;
        if (dt <= 350 && dx <= 12 && dy <= 12) {
          openFn();
          e.preventDefault();
        }
      });
      el.addEventListener('click', () => {
        if (mobileMQ.matches) openFn();
      });
    }
    tapOpener(panelEdge, () => setPinned(true));
    tapOpener(rpanelEdge, () => setPinnedR(true));
  })();

  // ── Swipe-to-collapse / swipe-to-open the left sidebar (mobile) ─────────
  // A finger drawer: the panel follows the finger 1:1 (transition off) and
  // snaps open or closed on release based on travel + fling velocity. Two
  // entry points — drag left on the open panel to close it, drag right from
  // the left edge strip to open it. Vertical-dominant gestures fall through
  // so the panel's own content keeps scrolling.
  (function setupPanelSwipe() {
    const SWIPE_AXIS_PX = 8; // movement before we commit to an axis
    const SNAP_FRACTION = 0.35; // travel past this fraction of width = snap
    const FLING_PX_PER_MS = 0.45; // velocity that snaps regardless of travel

    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastT = 0;
    let vx = 0;
    let active = false; // a touch is being tracked
    let decided = false; // axis committed
    let dragging = false; // committed to a horizontal drawer drag
    let fromOpen = false; // started on the open panel (close) vs the edge (open)

    const panelW = () => panelEl.getBoundingClientRect().width || 240;

    function onStart(e, openStart) {
      if (!mobileMQ.matches || e.touches.length !== 1) return;
      const t0 = e.touches[0];
      startX = lastX = t0.clientX;
      startY = t0.clientY;
      lastT = performance.now();
      vx = 0;
      active = true;
      decided = false;
      dragging = false;
      fromOpen = openStart;
    }

    function onMove(e) {
      if (!active) return;
      const t0 = e.touches[0];
      const dx = t0.clientX - startX;
      const dy = t0.clientY - startY;
      const now = performance.now();
      if (now > lastT) vx = (t0.clientX - lastX) / (now - lastT);
      lastX = t0.clientX;
      lastT = now;

      if (!decided) {
        if (Math.abs(dx) < SWIPE_AXIS_PX && Math.abs(dy) < SWIPE_AXIS_PX) return;
        decided = true;
        const horizontal = Math.abs(dx) > Math.abs(dy);
        const rightDir = fromOpen ? dx < 0 : dx > 0; // expected direction
        if (!horizontal || !rightDir) {
          active = false; // vertical / wrong-way → let the content scroll
          return;
        }
        dragging = true;
        panelEl.style.transition = 'none';
      }
      if (!dragging) return;
      e.preventDefault(); // own the gesture; block page/content scroll
      const w = panelW();
      const off = fromOpen
        ? Math.max(-w, Math.min(0, dx)) // open(0) → closed(-w)
        : Math.max(-w, Math.min(0, -w + dx)); // closed(-w) → open(0)
      panelEl.style.transform = `translateX(${off}px)`;
    }

    function onEnd() {
      if (!active) return;
      active = false;
      if (!dragging) return;
      dragging = false;

      const w = panelW();
      const dx = lastX - startX;
      const flung = Math.abs(vx) > FLING_PX_PER_MS;
      const open = fromOpen
        ? !(dx < -w * SNAP_FRACTION || (flung && vx < 0))
        : dx > w * SNAP_FRACTION || (flung && vx > 0);

      // Restore the CSS transition, commit the dragged position as the
      // animation start (reflow), then let the class transform take over so
      // the snap animates smoothly from where the finger left it.
      panelEl.style.transition = '';
      void panelEl.offsetWidth;
      setPinned(open);
      panelEl.style.transform = '';

      // A horizontal drag across the panel content (e.g. the event list) would
      // otherwise emit a synthesized click on release and load an event by
      // accident. Swallow the next click in the capture phase, before any row
      // handler sees it.
      const swallow = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      document.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 400);
    }

    panelEl.addEventListener(
      'touchstart',
      (e) => {
        if (panelPinned) onStart(e, true);
      },
      {
        passive: true,
      },
    );
    panelEdge.addEventListener(
      'touchstart',
      (e) => {
        if (!panelPinned) onStart(e, false);
      },
      {
        passive: true,
      },
    );
    for (const el of [panelEl, panelEdge]) {
      el.addEventListener('touchmove', onMove, { passive: false });
      el.addEventListener('touchend', onEnd);
      el.addEventListener('touchcancel', onEnd);
    }
  })();

  btnSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanelOpen ? closeSettingsPanel() : openSettingsPanel();
  });
  document.addEventListener('click', () => {
    if (settingsPanelOpen) closeSettingsPanel();
  });
  settingsPanel.addEventListener('click', (e) => e.stopPropagation());

  hintsToggle.addEventListener('click', () => {
    hintsEnabled = !hintsEnabled;
    syncHintsUi();
  });

  autoOpenToggle.addEventListener('click', () => {
    autoOpenEnabled = !autoOpenEnabled;
    syncAutoOpenUi();
  });

  if (tourToggle) {
    syncTourUi();
    tourToggle.addEventListener('click', () => {
      const next = !getTourMode();
      try {
        localStorage.setItem('cgv-tour-mode', next ? '1' : '0');
      } catch (_) {}
      if (next) onEnableTourMode();
      else onDisableTourMode();
      syncTourUi();
    });
  }

  // Collision-info overlay toggle (top-left HUD with run/event/LB/timestamp).
  // Persists in localStorage; defaults to ON.
  let collisionHudEnabled = true;
  function syncCollisionUi() {
    if (!collisionToggle) return;
    collisionToggle.classList.toggle('on', collisionHudEnabled);
    collisionToggle.setAttribute('aria-checked', collisionHudEnabled ? 'true' : 'false');
  }
  if (collisionToggle) {
    try {
      const saved = localStorage.getItem('cgv-collision-hud');
      if (saved !== null) collisionHudEnabled = saved === '1';
    } catch (_) {}
    if (onToggleCollisionHud) onToggleCollisionHud(collisionHudEnabled);
    syncCollisionUi();
    collisionToggle.addEventListener('click', () => {
      collisionHudEnabled = !collisionHudEnabled;
      try {
        localStorage.setItem('cgv-collision-hud', collisionHudEnabled ? '1' : '0');
      } catch (_) {}
      if (onToggleCollisionHud) onToggleCollisionHud(collisionHudEnabled);
      syncCollisionUi();
    });
  }

  setPinnedR(false);
  if (window.innerWidth < 640 || mobileMQ.matches) setPinned(false);
  syncHintsUi();
  syncAutoOpenUi();

  return {
    closeSettingsPanel,
    getState() {
      return {
        collisionHudEnabled,
        hintsEnabled,
        mobileMQ,
        panelPinned,
        rpanelPinned,
        settingsPanelOpen,
      };
    },
    isCollisionHudEnabled() {
      return collisionHudEnabled;
    },
    isHintsEnabled() {
      return hintsEnabled;
    },
    openSettingsPanel,
    setPinned,
    setPinnedR,
  };
}
