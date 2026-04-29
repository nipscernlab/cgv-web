// Detector layer toggles, the Layers popover panel, and the Tracks/Clusters
// toggle buttons.
//
// The layer hierarchy is generated from PANEL_TREE and rendered into
// #layers-tree at startup. Each node is bound to a path into visibility.js's
// `layerVis` object — leaf clicks flip a single boolean, parent clicks set
// the whole sub-tree.
//
// Owns layersPanelOpen state. Returns { closeLayersPanel, isOpen } so the
// keyboard-shortcut module can close the popover and inspect its state.

import {
  layerVis,
  setLayerLeaf,
  setLayerSubtree,
  anyLayerLeafOn,
  applyThreshold,
  applyFcalThreshold,
  applyMuonVisibility,
  applyTrackThreshold,
  refreshSceneVisibility,
  getMuonAtlasTrees,
  onMuonTreesChange,
  getTracksVisible,
  getClustersVisible,
  getJetsVisible,
  getPhotonsVisible,
  getMetVisible,
  getElectronTracksVisible,
  getMuonTracksVisible,
  getTauTracksVisible,
  getUnmatchedTracksVisible,
  setTracksVisible,
  setClustersVisible,
  setJetsVisible,
  setPhotonsVisible,
  setMetVisible,
  setElectronTracksVisible,
  setMuonTracksVisible,
  setTauTracksVisible,
  setUnmatchedTracksVisible,
} from '../visibility.js';
import { updateTrackAtlasIntersections } from '../trackAtlasIntersections.js';
import { getHitsEnabled, setHitsEnabled, hideTrackHits } from '../overlays/hitsOverlay.js';
import { markDirty } from '../renderer.js';
import { getViewLevel, onViewLevelChange } from '../viewLevel.js';

// Hex colours match the current palette family per top-level detector.
const C_TILE = '#c87c18';
const C_MBTS = '#e8c548';
const C_LAR = '#27b568';
const C_HEC = '#66e0f6';
const C_FCAL = '#b87333';
const C_MUON = '#4a90d9';

// Tree config — order here is the order shown in the panel. Each node:
//   path:    address into visibility.layerVis (string array)
//   label:   display text (i18n key falls back to this)
//   sub:     subtitle (optional)
//   color:   dot / switch accent
//   children: nested nodes (leaf if absent)
// Display order is outside-in (Muon spectrometer first, MBTS last) so the
// panel mirrors the user's mental walk through ATLAS layers from the muon
// chambers down toward the beam pipe. The Inner overlay group lives outside
// PANEL_TREE — it's appended after #layers-tree in index.html.
const PANEL_TREE = [
  // The muon node is rebuilt dynamically once the atlas tree is available —
  // see _rebuildMuonNode below. Initial placeholder has no children so the
  // toggle ON state stays meaningful (false until atlas loads).
  {
    path: ['muon'],
    label: 'Muon',
    sub: 'Muon spectrometer (loading…)',
    subKey: 'layer-sub-muon',
    color: C_MUON,
    children: [],
  },
  {
    path: ['tile'],
    label: 'TILE',
    labelKey: null,
    sub: 'TileCal barrel, extended & ITC',
    subKey: 'layer-sub-tile',
    color: C_TILE,
    children: [
      {
        path: ['tile', 'barrel'],
        label: 'Barrel (LB)',
        labelKey: 'layer-name-tile-barrel',
        sub: 'Long barrel A/BC/D',
        subKey: 'layer-sub-tile-barrel',
        color: C_TILE,
        children: [
          { path: ['tile', 'barrel', 'A'], label: 'A', sub: 'Sampling A', color: C_TILE },
          { path: ['tile', 'barrel', 'BC'], label: 'BC', sub: 'Sampling BC', color: C_TILE },
          { path: ['tile', 'barrel', 'D'], label: 'D', sub: 'Sampling D', color: C_TILE },
        ],
      },
      {
        path: ['tile', 'extended'],
        label: 'Extended (EB)',
        labelKey: 'layer-name-tile-ext',
        sub: 'Extended barrel A/B/D',
        subKey: 'layer-sub-tile-ext',
        color: C_TILE,
        children: [
          { path: ['tile', 'extended', 'A'], label: 'A', sub: 'Sampling A', color: C_TILE },
          { path: ['tile', 'extended', 'B'], label: 'B', sub: 'Sampling B', color: C_TILE },
          { path: ['tile', 'extended', 'D'], label: 'D', sub: 'Sampling D', color: C_TILE },
        ],
      },
      {
        path: ['tile', 'itc'],
        label: 'ITC',
        labelKey: 'layer-name-tile-itc',
        sub: 'Gap scintillators E1-E4',
        subKey: 'layer-sub-tile-itc',
        color: C_TILE,
        children: [
          { path: ['tile', 'itc', 'E'], label: 'E1-E4', sub: 'Gap scintillators', color: C_TILE },
        ],
      },
    ],
  },
  {
    path: ['lar'],
    label: 'LAr',
    sub: 'EM calorimeter',
    subKey: 'layer-sub-lar',
    color: C_LAR,
    children: [
      {
        path: ['lar', 'barrel'],
        label: 'Barrel (EMB)',
        labelKey: 'layer-name-lar-barrel',
        sub: 'EM barrel',
        subKey: 'layer-sub-lar-barrel',
        color: C_LAR,
        children: [
          { path: ['lar', 'barrel', 0], label: 'Presampler', sub: 'Sampling 0', color: C_LAR },
          { path: ['lar', 'barrel', 1], label: 'Strips', sub: 'Sampling 1', color: C_LAR },
          { path: ['lar', 'barrel', 2], label: 'Middle', sub: 'Sampling 2', color: C_LAR },
          { path: ['lar', 'barrel', 3], label: 'Back', sub: 'Sampling 3', color: C_LAR },
        ],
      },
      {
        path: ['lar', 'ec'],
        label: 'End-cap (EMEC)',
        labelKey: 'layer-name-lar-ec',
        sub: 'EM end-cap',
        subKey: 'layer-sub-lar-ec',
        color: C_LAR,
        children: [
          { path: ['lar', 'ec', 0], label: 'Presampler', sub: 'Sampling 0', color: C_LAR },
          { path: ['lar', 'ec', 1], label: 'Strips', sub: 'Sampling 1', color: C_LAR },
          { path: ['lar', 'ec', 2], label: 'Middle', sub: 'Sampling 2', color: C_LAR },
          { path: ['lar', 'ec', 3], label: 'Back', sub: 'Sampling 3', color: C_LAR },
        ],
      },
    ],
  },
  {
    path: ['hec'],
    label: 'HEC',
    sub: 'Hadronic end-cap',
    subKey: 'layer-sub-hec',
    color: C_HEC,
    children: [
      { path: ['hec', 0], label: 'HEC1', sub: 'Sampling 0', color: C_HEC },
      { path: ['hec', 1], label: 'HEC2', sub: 'Sampling 1', color: C_HEC },
      { path: ['hec', 2], label: 'HEC3', sub: 'Sampling 2', color: C_HEC },
      { path: ['hec', 3], label: 'HEC4', sub: 'Sampling 3', color: C_HEC },
    ],
  },
  {
    path: ['fcal'],
    label: 'FCAL',
    sub: 'Forward calorimeter',
    subKey: 'layer-sub-fcal',
    color: C_FCAL,
    children: [
      { path: ['fcal', 1], label: 'FCAL1', sub: 'EM (copper)', color: C_FCAL },
      { path: ['fcal', 2], label: 'FCAL2', sub: 'Hadronic (tungsten)', color: C_FCAL },
      { path: ['fcal', 3], label: 'FCAL3', sub: 'Hadronic (tungsten)', color: C_FCAL },
    ],
  },
  {
    path: ['mbts'],
    label: 'MBTS',
    sub: 'Minimum-bias trigger scintillators',
    subKey: 'layer-sub-mbts',
    color: C_MBTS,
    children: [
      {
        path: ['mbts', 'inner'],
        label: 'Inner',
        labelKey: 'layer-name-mbts-inner',
        sub: '|η| ≈ 3.84',
        color: C_MBTS,
      },
      {
        path: ['mbts', 'outer'],
        label: 'Outer',
        labelKey: 'layer-name-mbts-outer',
        sub: '|η| ≈ 2.76',
        color: C_MBTS,
      },
    ],
  },
];

// Friendly names for the inner / middle / outer muon-station subtrees. Once
// the panel reaches one of these nodes it shows their direct children as
// leaves and stops recursing — chamber-level toggles below would be too noisy
// for the deploy panel.
const MUON_STATION_RENAMES = {
  // C side (MUCH_1)
  BARh_1: 'BIS',
  BARi_2: 'BIL',
  BARj_3: 'BML',
  BARk_4: 'BMS',
  BARl_5: 'BOL',
  BARm_6: 'BOS',
  BARn_7: 'BIR',
  BARo_8: 'BEE',
  BARr_11: 'EES',
  BARs_12: 'EEL',
  BARt_13: 'EMS',
  BARu_14: 'EML',
  BARv_15: 'EOL',
  BARw_16: 'EOS',
  // A side (MUC1_2) — same sequence, different node-name pattern
  BARI_1: 'BIS',
  BAR1_2: 'BIL',
  BAR2_3: 'BML',
  BAR3_4: 'BMS',
  BAR4_5: 'BOL',
  BAR5_6: 'BOS',
  BAR6_7: 'BIR',
  BAR7_8: 'BEE',
  BAR0_11: 'EES',
  BARa_12: 'EEL',
  BARb_13: 'EMS',
  BARc_14: 'EML',
  BARd_15: 'EOL',
  BARe_16: 'EOS',
};

// Atlas nodes that are merged into a single panel entry: clicking the entry
// toggles every leaf mesh under both atlas subtrees at once.
const MUON_MERGED_GROUPS = [
  {
    label: 'NSW',
    members: [
      // C side (MUCH_1)
      'BARp_9',
      'BARq_10',
      'BARy_18',
      // A side (MUC1_2)
      'BAR8_9',
      'BAR9_10',
      'BARg_18',
    ],
  },
];
const _muonMergedMembers = new Set(MUON_MERGED_GROUPS.flatMap((g) => g.members));

// Atlas nodes that are hidden from the panel entirely. Their meshes still
// follow the layerVis default (true), so any track-hit visibility keeps
// working — they just don't get a switch.
const MUON_HIDDEN_NODES = new Set(['BARx_17', 'BARf_17']);

// Builds the muon panel sub-tree from the atlas A/C subtrees. Recursion stops
// at renamed station nodes (BIS/BIL/...) — they become leaves whose toggle
// controls every mesh in their atlas subtree via allMeshes. Atlas pairs in
// MUON_MERGED_GROUPS are collapsed into a synthetic leaf (e.g. NSW) whose
// toggle drives all members at once.
function _buildMuonPanelChildren(atlasNode, parentPath) {
  if (!atlasNode || atlasNode.children.size === 0) return [];
  const out = [];
  for (const [name, child] of atlasNode.children) {
    if (_muonMergedMembers.has(name)) continue; // handled below
    if (MUON_HIDDEN_NODES.has(name)) continue;
    const path = [...parentPath, name];
    const renamed = MUON_STATION_RENAMES[name];
    const label = renamed ?? name;
    const children = renamed ? null : _buildMuonPanelChildren(child, path);
    out.push({
      path,
      label,
      color: C_MUON,
      children: children && children.length ? children : null,
    });
  }
  for (const group of MUON_MERGED_GROUPS) {
    const members = group.members.map((m) => atlasNode.children.get(m)).filter(Boolean);
    if (!members.length) continue;
    out.push({
      path: [...parentPath, group.label],
      label: group.label,
      color: C_MUON,
      mergePaths: group.members
        .filter((m) => atlasNode.children.has(m))
        .map((m) => [...parentPath, m]),
    });
  }
  return out;
}

function _rebuildMuonNode() {
  const trees = getMuonAtlasTrees();
  const muonNode = PANEL_TREE.find((n) => n.path[0] === 'muon');
  if (!muonNode) return;
  muonNode.sub = 'Muon spectrometer';
  muonNode.children = [
    {
      path: ['muon', 'aSide'],
      label: 'A Side',
      labelKey: 'layer-name-muon-aside',
      color: C_MUON,
      children: trees.aSide ? _buildMuonPanelChildren(trees.aSide, ['muon', 'aSide']) : null,
    },
    {
      path: ['muon', 'cSide'],
      label: 'C Side',
      labelKey: 'layer-name-muon-cside',
      color: C_MUON,
      children: trees.cSide ? _buildMuonPanelChildren(trees.cSide, ['muon', 'cSide']) : null,
    },
  ];
}

const CHEVRON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
  'stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';

const _nodeByPath = new Map();
function _indexTree(nodes) {
  for (const n of nodes) {
    _nodeByPath.set(n.path.join('/'), n);
    if (n.children) _indexTree(n.children);
  }
}
function _reindexTree() {
  _nodeByPath.clear();
  _indexTree(PANEL_TREE);
}
_indexTree(PANEL_TREE);

function _leafValue(path) {
  let node = layerVis;
  for (const k of path) node = node[k];
  return !!node;
}
function _nodeOn(node) {
  if (node.mergePaths) return node.mergePaths.some((p) => anyLayerLeafOn(p));
  return node.children ? anyLayerLeafOn(node.path) : _leafValue(node.path);
}
function _esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function _idFromPath(pathStr) {
  // Sanitise to a valid HTML id — atlas mesh names can contain dots / spaces.
  return 'ltog-' + pathStr.replace(/[^A-Za-z0-9_-]/g, '_');
}

function _renderNode(node, depth) {
  const hasChildren = !!(node.children && node.children.length);
  const indentCls = depth === 1 ? ' layer-row-child' : depth >= 2 ? ' layer-row-grandchild' : '';
  // For nesting deeper than the static CSS classes handle, scale padding-left
  // inline so each level is still visually offset.
  const inlinePad = depth >= 3 ? ` style="padding-left:${4 + depth * 16}px"` : '';
  const parentCls = hasChildren ? ' layer-row-parent' : '';
  const pathStr = node.path.join('/');
  const id = _idFromPath(pathStr);
  const twist = hasChildren ? `<span class="layer-twist">${CHEVRON_SVG}</span>` : '';
  const labelAttr = node.labelKey ? ` data-i18n="${node.labelKey}"` : '';
  const subAttr = node.subKey ? ` data-i18n="${node.subKey}"` : '';
  const subDiv = node.sub ? `<div class="layer-sub"${subAttr}>${_esc(node.sub)}</div>` : '';
  const row =
    `<div class="layer-row${indentCls}${parentCls}"${inlinePad} data-path="${_esc(pathStr)}">` +
    twist +
    `<span class="layer-dot" style="background:${node.color}"></span>` +
    `<div class="layer-info">` +
    `<div class="layer-name"${labelAttr}>${_esc(node.label)}</div>` +
    subDiv +
    `</div>` +
    `<button class="gswitch on" id="${id}" role="switch" aria-checked="true"` +
    ` style="--gswitch-col:${node.color}" data-path="${_esc(pathStr)}"></button>` +
    `</div>`;
  if (!hasChildren) return row;
  return (
    `<div class="layer-group">` +
    row +
    node.children.map((c) => _renderNode(c, depth + 1)).join('') +
    `</div>`
  );
}

// ── Detector-layer tree (the static geometry side of the panel) ─────────────
// Owns the tree DOM (#layers-tree), the gswitch click handlers, the All / None
// quick buttons, and the muon sub-tree rebuild on atlas load. Returns the
// `syncLayerToggles` helper so other widgets can refresh the layer-button
// "on" indicator after they manipulate layer state.
function _setupLayerTree() {
  const tree = document.getElementById('layers-tree');
  function renderTree() {
    tree.innerHTML = PANEL_TREE.map((n) => _renderNode(n, 0)).join('');
  }
  function syncLayerToggles() {
    for (const btn of tree.querySelectorAll('.gswitch')) {
      const node = _nodeByPath.get(btn.dataset.path);
      if (!node) continue;
      const on = _nodeOn(node);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-checked', on);
    }
    document.getElementById('btn-layers').classList.toggle(
      'on',
      PANEL_TREE.some((n) => _nodeOn(n)),
    );
  }
  function applyForPath(path) {
    if (path[0] === 'muon') applyMuonVisibility();
    else if (path[0] === 'fcal') applyFcalThreshold();
    else applyThreshold();
  }
  // Atlas may already be loaded, or arrive later. Either way, regenerate the
  // muon sub-tree once it's available so every chamber gets a toggle.
  function refreshMuonTree() {
    _rebuildMuonNode();
    _reindexTree();
    renderTree();
    syncLayerToggles();
  }

  renderTree();
  if (getMuonAtlasTrees().aSide || getMuonAtlasTrees().cSide) refreshMuonTree();
  onMuonTreesChange(refreshMuonTree);

  // Switch click: leaf toggles its boolean; parent flips the whole sub-tree
  // to the inverse of its aggregate ON state.
  tree.addEventListener('click', (e) => {
    const btn = e.target.closest('.gswitch');
    if (btn && tree.contains(btn)) {
      e.stopPropagation();
      const node = _nodeByPath.get(btn.dataset.path);
      if (!node) return;
      const wasOn = _nodeOn(node);
      if (node.mergePaths) {
        for (const p of node.mergePaths) setLayerSubtree(p, !wasOn);
      } else if (node.children) {
        setLayerSubtree(node.path, !wasOn);
      } else {
        setLayerLeaf(node.path, !wasOn);
      }
      syncLayerToggles();
      applyForPath(node.path);
      return;
    }
    // Click anywhere else on a parent row toggles its expand state.
    const row = e.target.closest('.layer-row-parent');
    if (row && tree.contains(row)) {
      row.parentElement.classList.toggle('expanded');
    }
  });

  document.getElementById('lbtn-all').addEventListener('click', () => {
    for (const n of PANEL_TREE) setLayerSubtree(n.path, true);
    syncLayerToggles();
    refreshSceneVisibility();
    applyMuonVisibility();
  });
  document.getElementById('lbtn-none').addEventListener('click', () => {
    for (const n of PANEL_TREE) setLayerSubtree(n.path, false);
    syncLayerToggles();
    refreshSceneVisibility();
    applyMuonVisibility();
  });

  syncLayerToggles();
  return { syncLayerToggles };
}

// ── Anchored toolbar popover ────────────────────────────────────────────────
// Shared open/close + position logic for the two toolbar popovers (#layers-
// panel anchored to #btn-layers, #particles-panel anchored to #btn-cluster).
// Both popovers are mutually exclusive — opening one closes the other — so
// each setup call gets a `closeOther` callback to invoke first.
/**
 * @param {{
 *   panelId: string,
 *   anchorId: string,
 *   defaultWidth: number,
 *   onOpen?: () => void,
 *   onClose?: () => void,
 *   closeOther: () => void,
 * }} cfg
 */
function _setupAnchoredPopover({ panelId, anchorId, defaultWidth, onOpen, onClose, closeOther }) {
  const panel = document.getElementById(panelId);
  let isOpen = false;

  function open() {
    if (!panel) return;
    closeOther();
    isOpen = true;
    panel.classList.add('open');
    if (onOpen) onOpen();
    const br = document.getElementById(anchorId).getBoundingClientRect();
    requestAnimationFrame(() => {
      const pw = panel.offsetWidth || defaultWidth;
      let left = br.left + br.width / 2 - pw / 2;
      left = Math.max(6, Math.min(left, window.innerWidth - pw - 6));
      // Anchor the panel's bottom 10px above the button's top so expanding a
      // sub-tree grows the panel upward instead of pushing it past the
      // toolbar. Cap max-height to the available space so internal scrolling
      // kicks in when content overflows the viewport.
      panel.style.left = `${left}px`;
      panel.style.top = '';
      panel.style.bottom = `${window.innerHeight - br.top + 10}px`;
      panel.style.maxHeight = `${Math.max(120, br.top - 16)}px`;
    });
  }

  function close() {
    if (!panel) return;
    isOpen = false;
    panel.classList.remove('open');
    if (onClose) onClose();
  }

  // Click outside the popover closes it; clicks INSIDE are stopped from
  // bubbling so they don't trigger the document-level close.
  document.addEventListener('click', () => {
    if (isOpen) close();
  });
  if (panel) panel.addEventListener('click', (e) => e.stopPropagation());

  return { open, close, isOpen: () => isOpen };
}

// ── Inner Detector overlays (Tracks + Hits) ────────────────────────────────
// Self-contained: per-event toggles wired through the gswitches inside the
// #overlay-inner-detector-group block in index.html. The parent gswitch
// bulk-flips both children to the inverse of their aggregate ON state,
// mirroring the .layer-row-parent pattern used inside #layers-tree.
function _setupInnerOverlay() {
  const btnTracks = document.getElementById('btn-tracks');
  const btnHits = document.getElementById('btn-hits');
  const btnInnerDetector = document.getElementById('btn-inner-detector');
  const innerDetectorGroup = document.getElementById('overlay-inner-detector-group');
  const innerDetectorRow = document.getElementById('overlay-inner-detector-row');

  function syncOverlayBtns() {
    btnTracks.classList.toggle('on', getTracksVisible());
    btnTracks.setAttribute('aria-checked', String(getTracksVisible()));
    btnHits.classList.toggle('on', getHitsEnabled());
    btnHits.setAttribute('aria-checked', String(getHitsEnabled()));
    const anyOn = getTracksVisible() || getHitsEnabled();
    btnInnerDetector.classList.toggle('on', anyOn);
    btnInnerDetector.setAttribute('aria-checked', String(anyOn));
  }

  btnTracks.addEventListener('click', (e) => {
    e.stopPropagation();
    setTracksVisible(!getTracksVisible());
    updateTrackAtlasIntersections();
    syncOverlayBtns();
    markDirty();
  });
  btnHits.addEventListener('click', (e) => {
    e.stopPropagation();
    setHitsEnabled(!getHitsEnabled());
    syncOverlayBtns();
    markDirty();
  });
  btnInnerDetector.addEventListener('click', (e) => {
    e.stopPropagation();
    const anyOn = getTracksVisible() || getHitsEnabled();
    const next = !anyOn;
    setTracksVisible(next);
    setHitsEnabled(next);
    if (!next) hideTrackHits();
    updateTrackAtlasIntersections();
    syncOverlayBtns();
    markDirty();
  });
  // Parent row click (anywhere except the gswitch) toggles expand/collapse.
  innerDetectorRow.addEventListener('click', (e) => {
    if (e.target.closest('.gswitch')) return;
    innerDetectorGroup.classList.toggle('expanded');
  });
  syncOverlayBtns();
}

// ── Particles popover (#btn-cluster, level-aware) ───────────────────────────
//   L1 — disabled (no clusters / particles to show).
//   L2 — simple toggle of cluster lines (clusterGroup).
//   L3 — opens the Particles popover with per-particle-type checkboxes
//        (jet lines / photon springs / MET arrow / electron / muon / tau /
//        unmatched track filters). The button's "on" indicator reflects
//        whether any particle type is enabled.
function _setupParticlesPopover({ closeOther }) {
  const btnCluster = document.getElementById('btn-cluster');

  /** @returns {boolean} true if at least one particle type is enabled at L3 */
  function anyParticleOn() {
    return (
      getJetsVisible() ||
      getPhotonsVisible() ||
      getMetVisible() ||
      getElectronTracksVisible() ||
      getMuonTracksVisible() ||
      getTauTracksVisible() ||
      getUnmatchedTracksVisible()
    );
  }
  function syncParticlesPanel() {
    const set = (id, on) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('on', on);
      el.setAttribute('aria-checked', String(on));
    };
    set('ptog-jets', getJetsVisible());
    set('ptog-photons', getPhotonsVisible());
    set('ptog-met', getMetVisible());
    set('ptog-electrons', getElectronTracksVisible());
    set('ptog-muons', getMuonTracksVisible());
    set('ptog-taus', getTauTracksVisible());
    set('ptog-unmatched', getUnmatchedTracksVisible());
  }
  function syncClustersBtn() {
    const lvl = getViewLevel();
    if (lvl === 1) {
      btnCluster.classList.add('disabled');
      btnCluster.classList.remove('on');
    } else {
      btnCluster.classList.remove('disabled');
      const flag = lvl === 3 ? anyParticleOn() : getClustersVisible();
      btnCluster.classList.toggle('on', flag);
    }
  }

  const popover = _setupAnchoredPopover({
    panelId: 'particles-panel',
    anchorId: 'btn-cluster',
    defaultWidth: 220,
    onOpen: syncParticlesPanel,
    onClose: syncClustersBtn,
    closeOther,
  });

  btnCluster.addEventListener('click', (e) => {
    e.stopPropagation();
    const lvl = getViewLevel();
    if (lvl === 1) return;
    if (lvl === 3) {
      popover.isOpen() ? popover.close() : popover.open();
      return;
    }
    setClustersVisible(!getClustersVisible());
    syncClustersBtn();
    markDirty();
  });

  // Each toggle in the popover flips its setter, then re-runs the matching
  // apply: jets/photons/MET only need markDirty (group.visible flipped by the
  // setter); track filters need applyTrackThreshold (its filter-stage HIDES
  // only — to bring tracks back the pT pass at the head must reset visibility
  // first, then the now-updated filter applies on top).
  function bindParticleToggle(id, getter, setter, onApply) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      setter(!getter());
      syncParticlesPanel();
      syncClustersBtn();
      onApply();
    });
  }
  bindParticleToggle('ptog-jets', getJetsVisible, setJetsVisible, markDirty);
  bindParticleToggle('ptog-photons', getPhotonsVisible, setPhotonsVisible, markDirty);
  bindParticleToggle('ptog-met', getMetVisible, setMetVisible, markDirty);
  bindParticleToggle('ptog-electrons', getElectronTracksVisible, setElectronTracksVisible, () =>
    applyTrackThreshold(),
  );
  bindParticleToggle('ptog-muons', getMuonTracksVisible, setMuonTracksVisible, () =>
    applyTrackThreshold(),
  );
  bindParticleToggle('ptog-taus', getTauTracksVisible, setTauTracksVisible, () =>
    applyTrackThreshold(),
  );
  bindParticleToggle('ptog-unmatched', getUnmatchedTracksVisible, setUnmatchedTracksVisible, () =>
    applyTrackThreshold(),
  );

  onViewLevelChange((lvl) => {
    syncClustersBtn();
    if (lvl !== 3 && popover.isOpen()) popover.close();
  });
  syncClustersBtn();

  return popover;
}

// ── Layers popover (#btn-layers) ────────────────────────────────────────────
function _setupLayersPopover({ syncLayerToggles, closeOther }) {
  const popover = _setupAnchoredPopover({
    panelId: 'layers-panel',
    anchorId: 'btn-layers',
    defaultWidth: 210,
    onOpen: () => document.getElementById('btn-layers').classList.add('on'),
    // Close: btn-layers stays "on" iff at least one layer is on. syncLayerToggles
    // already encodes this rule; piggy-back on it instead of duplicating.
    onClose: syncLayerToggles,
    closeOther,
  });
  document.getElementById('btn-layers').addEventListener('click', (e) => {
    e.stopPropagation();
    popover.isOpen() ? popover.close() : popover.open();
  });
  return popover;
}

export function setupLayersPanel() {
  const { syncLayerToggles } = _setupLayerTree();
  _setupInnerOverlay();

  // Mutual exclusivity between the two toolbar popovers: each open() closes
  // the other if it's open. Both APIs are needed before either close handle
  // exists, so wire them in via closures that read the let-bindings — by
  // the time a click fires both are populated.
  /** @type {{ open: () => void, close: () => void, isOpen: () => boolean }} */
  let particles = /** @type {any} */ (null);
  /** @type {{ open: () => void, close: () => void, isOpen: () => boolean }} */
  let layers = /** @type {any} */ (null);
  layers = _setupLayersPopover({
    syncLayerToggles,
    closeOther: () => particles?.isOpen() && particles.close(),
  });
  particles = _setupParticlesPopover({
    closeOther: () => layers.isOpen() && layers.close(),
  });

  return {
    closeLayersPanel: layers.close,
    isOpen: layers.isOpen,
  };
}
