// Mobile toolbar toggle (landscape-only).
// The toggle pill acts as both opener and closer:
//  • toolbar hidden → pill sits at the bottom, click slides toolbar up.
//  • toolbar open  → pill slides above the toolbar (.tb-open), click hides it.
// Portrait triggers the "rotate your device" overlay in CSS, so no JS there.
export function setupMobileToolbar() {
  const tb = document.getElementById('toolbar');
  const btn = document.getElementById('btn-toolbar-toggle');
  const closeBtn = document.getElementById('btn-toolbar-close');

  // Switch on the SAME media query the CSS uses to turn the toolbar into a
  // bottom dock and reveal the pill. Deriving the JS state from a separate
  // innerWidth/innerHeight test let the two desync (e.g. while the iOS address
  // bar resizes the viewport): the CSS would show the dock while the JS kept
  // tb-visible set without tb-open, so the pill rendered on top of the dock
  // instead of below it. matchMedia keeps JS and CSS in lockstep.
  const dockMode = window.matchMedia('(orientation: landscape) and (max-height: 520px)');
  const isLandscapeMobile = () => dockMode.matches;
  let tbVisible = !isLandscapeMobile();

  function apply() {
    tb.classList.toggle('tb-visible', tbVisible);
    btn.classList.toggle('tb-open', tbVisible && isLandscapeMobile());
  }
  // Apply initial state without animation — suppress both elements so the
  // browser commits bottom:12px for the button before transitions are live.
  tb.style.transition = 'none';
  btn.style.transition = 'none';
  apply();
  void btn.offsetHeight; // force reflow to commit initial bottom value
  setTimeout(() => {
    tb.style.transition = '';
    btn.style.transition = '';
  }, 50);

  btn.addEventListener('click', () => {
    if (isLandscapeMobile()) {
      tbVisible = !tbVisible;
      apply();
    } else {
      tbVisible = true;
      apply();
    }
  });
  // Legacy in-toolbar close button (hidden by CSS on mobile, but keep a handler
  // in case it's exposed elsewhere or on non-mobile widths).
  if (closeBtn)
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isLandscapeMobile()) {
        tbVisible = false;
        apply();
      }
    });

  // Re-establish the clean default whenever we cross the dock-mode boundary
  // (rotation, or the viewport height crossing 520 as the iOS bars show/hide):
  // dock starts hidden in landscape-mobile (pill alone at the bottom), toolbar
  // stays visible everywhere else. This fires on entering AND leaving the mode,
  // so the dock and the pill can never get stuck half-open and overlapping.
  const onModeChange = () => {
    tbVisible = !isLandscapeMobile();
    apply();
  };
  if (dockMode.addEventListener) dockMode.addEventListener('change', onModeChange);
  else dockMode.addListener(onModeChange); // Safari < 14
}
