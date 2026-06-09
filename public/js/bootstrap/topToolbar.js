// Wires the bottom-floating button row (view-level segmented control,
// cluster-collection dropdown at L2, jet-collection dropdown at L3, About
// overlay). The Ghost / Cell Info / Unmatched Tracks / Jet Lines toggles
// previously here moved to the Helpers popover — see js/bootstrap/helpersPanel.js.

import { getViewLevel, setViewLevel, onViewLevelChange } from '../viewLevel.js';
import { getJetCollections, getActiveJetKey, setActiveJetKey, onJetStateChange } from '../jets.js';
import {
  getClusterCollections,
  getActiveClusterKey,
  setActiveClusterKey,
  onClusterStateChange,
  ALL_CLUSTERS_KEY,
} from '../clusterCollections.js';
import { setupCollectionDropdown } from './collectionDropdown.js';

export function setupTopToolbar({ resetCamera }) {
  document.getElementById('btn-reset').addEventListener('click', resetCamera);

  // View-level segmented control (1/2/3). Sync .on highlight on every click;
  // visibility logic for each level lives in visibility.js (cells, cluster lines)
  // and here (right-side panel header colour, label, visibility).
  const viewLevelEl = document.getElementById('view-level');
  const rpanel2 = document.getElementById('rpanel2');
  const tabLabel = document.getElementById('cluster-tab-label');
  const strak = document.getElementById('cluster-strak');

  // Cluster (L2) + jet (L3) collection pickers share one dropdown skin; each is
  // shown only at its own view level (see syncRightPanelSkin). The cluster
  // picker carries a leading "All collections" row (the historical merge-every-
  // collection behaviour); the jet picker shows one collection at a time.
  // onStateChange re-renders the rows AND re-runs syncRightPanelSkin so the
  // trigger appears/disappears as a new event gains/loses collections.
  const clusterDropdown = setupCollectionDropdown({
    trigger: document.getElementById('cluster-coll-trigger'),
    label: document.getElementById('cluster-coll-label'),
    menu: document.getElementById('cluster-coll-menu'),
    optClass: 'jet-coll-opt',
    getCollections: getClusterCollections,
    getActiveKey: getActiveClusterKey,
    setActiveKey: setActiveClusterKey,
    onStateChange: (cb) =>
      onClusterStateChange(() => {
        cb();
        syncRightPanelSkin();
      }),
    countOf: (c) => c.clusters.length,
    includeAll: true,
    allKey: ALL_CLUSTERS_KEY,
    allLabelKey: 'cluster-coll-all',
  });
  const jetDropdown = setupCollectionDropdown({
    trigger: document.getElementById('jet-coll-trigger'),
    label: document.getElementById('jet-coll-label'),
    menu: document.getElementById('jet-coll-menu'),
    optClass: 'jet-coll-opt',
    getCollections: getJetCollections,
    getActiveKey: getActiveJetKey,
    setActiveKey: setActiveJetKey,
    onStateChange: (cb) =>
      onJetStateChange(() => {
        cb();
        syncRightPanelSkin();
      }),
    countOf: (c) => c.jets.length,
  });

  // Panel skin per level: cluster (red) at L2, jet (cyan) at L3, hidden at L1.
  const PANEL_SKIN = {
    1: null,
    2: { label: 'Cluster', color: '#ff4400', gradFrom: '#661a00', gradTo: '#ff4400' },
    3: { label: 'Jet', color: '#ff8800', gradFrom: '#4a2900', gradTo: '#ff8800' },
  };
  function syncRightPanelSkin() {
    const lvl = getViewLevel();
    const skin = PANEL_SKIN[lvl];
    if (!skin) {
      if (rpanel2) rpanel2.style.display = 'none';
      clusterDropdown.setVisible(false);
      jetDropdown.setVisible(false);
      return;
    }
    if (rpanel2) rpanel2.style.display = '';
    if (tabLabel) {
      tabLabel.textContent = skin.label;
      tabLabel.style.setProperty('--tab-col', skin.color);
    }
    if (strak)
      strak.style.background = `linear-gradient(to top, ${skin.gradFrom} 0%, ${skin.gradTo} 100%)`;
    // Each picker shows only at its level, and only when the current event has
    // at least one collection.
    clusterDropdown.setVisible(lvl === 2 && getClusterCollections().length > 0);
    jetDropdown.setVisible(lvl === 3 && getJetCollections().length > 0);
  }

  if (viewLevelEl) {
    const segBtns = viewLevelEl.querySelectorAll('.tseg-btn');
    const syncSeg = () => {
      const cur = getViewLevel();
      for (const b of segBtns) b.classList.toggle('on', Number(b.dataset.level) === cur);
    };
    for (const b of segBtns) {
      b.addEventListener('click', () => {
        setViewLevel(Number(b.dataset.level));
        syncSeg();
      });
    }
    syncSeg();
  }
  onViewLevelChange(syncRightPanelSkin);
  syncRightPanelSkin();

  const aboutOverlay = document.getElementById('about-overlay');
  document.getElementById('btn-about').addEventListener('click', () => {
    aboutOverlay.classList.add('open');
  });
  document
    .getElementById('btn-about-close')
    .addEventListener('click', () => aboutOverlay.classList.remove('open'));
  aboutOverlay.addEventListener('click', (e) => {
    if (e.target === aboutOverlay) aboutOverlay.classList.remove('open');
  });

  return { aboutOverlay };
}
