// ============================================================
//  CGV-WEB v2.0 — main.js
//  Three.js · Bloom · Raycasting · Clipping · Focus Mode
//  Compatible with existing Rust/WASM process_xml_data API
// ============================================================
import * as THREE from 'three';
import { OrbitControls }   from 'three/addons/controls/OrbitControls.js';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass }        from 'three/addons/postprocessing/SMAAPass.js';
import init, { process_xml_data } from './pkg/cgv_web.js';

await init();

// ──────────────────────────────────────────────────────────
//  Layer → Sub-detector mapping
//  0 = TileCal (layers 0–13)
//  1 = HEC     (layers 14–17)
//  2 = LAr EM  (layers 18–25)
// ──────────────────────────────────────────────────────────
const LAYER_DET = new Uint8Array(26);
for (let i = 0;  i <= 13; i++) LAYER_DET[i] = 0;
for (let i = 14; i <= 17; i++) LAYER_DET[i] = 1;
for (let i = 18; i <= 25; i++) LAYER_DET[i] = 2;

const DET_NAMES  = ['TileCal', 'HEC', 'LAr EM'];
const DET_KEYS   = ['tile', 'hec', 'lar'];  // must match data-det attrs

// ──────────────────────────────────────────────────────────
//  DOM refs
// ──────────────────────────────────────────────────────────
const canvas        = document.getElementById('gl-canvas');
const dropZone      = document.getElementById('drop-zone');
const fileInput     = document.getElementById('file-input');
const toastEl       = document.getElementById('toast');
const toastPip      = document.getElementById('toast-pip');
const toastTextEl   = document.getElementById('toast-text');
const cellCountEl   = document.getElementById('cell-count');
const energyRangeEl = document.getElementById('energy-range');
const energyPanel   = document.getElementById('energy-panel');
const epMax         = document.getElementById('ep-max');
const epMin         = document.getElementById('ep-min');
const threshDisp    = document.getElementById('threshold-display');
const gradTrack     = document.getElementById('grad-track');
const trackHandle   = document.getElementById('track-handle');
const trackDim      = document.getElementById('track-dim');
const sliderTip     = document.getElementById('slider-tip');
const tipVal        = document.getElementById('tip-val');
const tipPct        = document.getElementById('tip-pct');
const btnReset      = document.getElementById('btn-reset');
const btnSnap       = document.getElementById('btn-snapshot');
const btnHelp       = document.getElementById('btn-help');
const modalOv       = document.getElementById('modal-overlay');
const modalCloseBtn = document.getElementById('modal-close-btn');
const ghostLbl      = document.getElementById('ghost-lbl');
const cellTooltip   = document.getElementById('cell-tooltip');
const ctEnergy      = document.getElementById('ct-energy');
const ctLayer       = document.getElementById('ct-layer');
const ctEta         = document.getElementById('ct-eta');
const ctPhi         = document.getElementById('ct-phi');
const clipSlider    = document.getElementById('clip-slider');
const clipFill      = document.getElementById('clip-fill');
const clipValDisp   = document.getElementById('clip-val-display');
const gpToggleBtn   = document.getElementById('gp-toggle-btn');
const gpBody        = document.getElementById('gp-body');
const btnFocus      = document.getElementById('btn-focus');
const focusOverlay  = document.getElementById('focus-overlay');
const btnExitFocus  = document.getElementById('btn-exit-focus');
const detChecks     = [...document.querySelectorAll('.det-check')];

// ──────────────────────────────────────────────────────────
//  Renderer
// ──────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,           // SMAA handles AA via post-processing
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000d16);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.localClippingEnabled = true;

// ──────────────────────────────────────────────────────────
//  Scene & Camera
// ──────────────────────────────────────────────────────────
const scene  = new THREE.Scene();
scene.fog    = new THREE.FogExp2(0x000d16, 0.007);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.01, 300);
camera.position.set(10, 5, 16);
camera.lookAt(0, 0, 0);

// ──────────────────────────────────────────────────────────
//  Post-processing: Bloom + SMAA + Output
// ──────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.60,   // strength  — warm but not overblown
  0.50,   // radius
  0.34,   // threshold — only high-luminance hot cells bloom; blue/dim cells stay matte
);
composer.addPass(bloomPass);

// SMAA antialiasing
const smaaPass = new SMAAPass(
  window.innerWidth  * renderer.getPixelRatio(),
  window.innerHeight * renderer.getPixelRatio(),
);
composer.addPass(smaaPass);
composer.addPass(new OutputPass());

// ──────────────────────────────────────────────────────────
//  Controls — cinematic damping
// ──────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping   = true;
controls.dampingFactor   = 0.048;
controls.minDistance     = 0.5;
controls.maxDistance     = 90;
controls.autoRotate      = true;
controls.autoRotateSpeed = 0.22;

// ──────────────────────────────────────────────────────────
//  Lighting — dark blue ambient + white/gold directionals
// ──────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x001828, 1.25));

const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(8, 18, 10);
scene.add(sun);

const goldRim = new THREE.DirectionalLight(0xffc107, 0.38);
goldRim.position.set(-14, -2, 9);
scene.add(goldRim);

const fill = new THREE.DirectionalLight(0x1a3050, 0.42);
fill.position.set(-14, -4, -8);
scene.add(fill);

// ──────────────────────────────────────────────────────────
//  Clipping plane (Z-axis slicer)
// ──────────────────────────────────────────────────────────
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), Infinity);
renderer.clippingPlanes = [];   // off by default

clipSlider.addEventListener('input', () => {
  const pct  = parseInt(clipSlider.value, 10) / 100;   // 0 → 1
  const fill = pct * 100;
  clipFill.style.width = `${fill}%`;

  if (pct >= 0.999) {
    renderer.clippingPlanes = [];
    clipValDisp.textContent  = 'OFF';
  } else {
    const MAX_Z = 8.5;   // metres — slightly beyond detector extent
    const z = pct * MAX_Z;
    clipPlane.constant       = z;
    renderer.clippingPlanes  = [clipPlane];
    clipValDisp.textContent  = `${(z * 1000).toFixed(0)}\u00a0mm`;
  }
});

// ──────────────────────────────────────────────────────────
//  Ghost calorimeter (visible before data loads)
// ──────────────────────────────────────────────────────────
let ghostGrp = null;

function buildGhost() {
  if (ghostGrp) { scene.remove(ghostGrp); ghostGrp = null; }
  const g = new THREE.Group();

  const shell = (r, hl, zc, op, col) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, hl * 2, 80, 1, true),
      new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: op,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    m.rotation.x = Math.PI / 2;
    m.position.z = zc;
    g.add(m);
  };

  const ring = (rI, rO, z, op, col) => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(rI, rO, 80),
      new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: op,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    m.rotation.x = Math.PI / 2;
    m.position.z = z;
    g.add(m);
  };

  const G = 0.048, E = 0.12;
  const EM = 0x0d3a4a, TI = 0x0a2038, HC = 0x06121c;

  // EM Barrel
  shell(1.42, 3.17,  0,  G,       EM);
  shell(1.98, 3.17,  0,  G * 0.6, EM);
  for (const z of [3.17, -3.17]) ring(1.42, 1.98, z, E * 0.5, EM);

  // Tile Barrel
  shell(2.30, 3.82, 0, G * 0.85, TI);
  shell(3.82, 3.82, 0, G * 0.42, TI);
  for (const z of [3.82, -3.82]) ring(2.30, 3.82, z, E * 0.28, TI);

  // EM Endcap (±Z)
  for (const s of [1, -1]) {
    const zc = s * 3.745;
    shell(0.33, 0.065, zc, G * 1.1, EM);
    shell(2.10, 0.065, zc, G * 1.1, EM);
    ring(0.33, 2.10, s * 3.68, E * 0.48, EM);
    ring(0.33, 2.10, s * 3.81, E * 0.36, EM);
  }

  // Tile Extended Barrel (±Z)
  for (const s of [1, -1]) {
    const z0 = s * 3.20, z1 = s * 5.20;
    const zc = (z0 + z1) / 2, hl = Math.abs(z1 - z0) / 2;
    shell(2.30, hl, zc, G,        TI);
    shell(3.82, hl, zc, G * 0.40, TI);
    ring(2.30, 3.82, z0, E * 0.26, TI);
    ring(2.30, 3.82, z1, E * 0.26, TI);
  }

  // HEC (±Z)
  for (const s of [1, -1]) {
    const z0 = s * 4.35, z1 = s * 6.05;
    const zc = (z0 + z1) / 2, hl = Math.abs(z1 - z0) / 2;
    shell(0.37, hl, zc, G * 0.62, HC);
    shell(2.00, hl, zc, G * 0.62, HC);
    ring(0.37, 2.00, z0, E * 0.22, HC);
    ring(0.37, 2.00, z1, E * 0.22, HC);
  }

  // FCal (±Z)
  for (const s of [1, -1]) {
    const z0 = s * 4.60, z1 = s * 5.60;
    const zc = (z0 + z1) / 2, hl = Math.abs(z1 - z0) / 2;
    shell(0.05, hl, zc, G * 0.82, HC);
    shell(0.45, hl, zc, G * 0.82, HC);
    ring(0.05, 0.45, z0, E * 0.32, HC);
    ring(0.05, 0.45, z1, E * 0.32, HC);
  }

  // Beam axis
  g.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -9.5),
      new THREE.Vector3(0, 0,  9.5),
    ]),
    new THREE.LineBasicMaterial({ color: 0x0a2030, transparent: true, opacity: 0.45 }),
  ));

  // Equatorial ring
  const eqRing = new THREE.Mesh(
    new THREE.RingGeometry(4.68, 4.72, 96),
    new THREE.MeshBasicMaterial({
      color: 0x0a2a3a, side: THREE.DoubleSide,
      transparent: true, opacity: 0.16, depthWrite: false,
    }),
  );
  eqRing.rotation.x = Math.PI / 2;
  g.add(eqRing);

  // Side-A / Side-C cone markers (no text labels per spec)
  const coneGeo = new THREE.ConeGeometry(0.065, 0.28, 8);
  const mk = (col, z, rx) => {
    const m = new THREE.Mesh(coneGeo,
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.65 }));
    m.position.z = z; m.rotation.x = rx; return m;
  };
  g.add(mk(0x70c8b0,  9.0, -Math.PI / 2));   // Side A — teal
  g.add(mk(0xc87860, -9.0,  Math.PI / 2));   // Side C — coral

  scene.add(g);
  ghostGrp = g;
}
buildGhost();

// ──────────────────────────────────────────────────────────
//  Custom ShaderMaterial
//  — Instanced: energy, active mask, instance ID
//  — Bloom-aware: boosts luminance for high-energy cells
//  — Highlight: specific instance goes gold/white on hover
// ──────────────────────────────────────────────────────────
const shaderUniforms = {
  u_threshold: { value: 0.0 },
  u_time:      { value: 0.0 },
  u_highlight: { value: -1.0 },
};

const vertexShader = /* glsl */`
  attribute float a_energy;   // normalised 0..1
  attribute float a_active;   // 1 = draw, 0 = hidden by filter
  attribute float a_iid;      // instance index (float)

  varying float v_energy;
  varying float v_active;
  varying float v_iid;
  varying vec3  v_col;
  varying vec3  v_normal;
  varying vec3  v_worldPos;

  void main() {
    v_energy   = a_energy;
    v_active   = a_active;
    v_iid      = a_iid;
    v_col      = instanceColor;
    v_normal   = normalize(normalMatrix * normal);
    vec4 wp    = modelMatrix * instanceMatrix * vec4(position, 1.0);
    v_worldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */`
  uniform float u_threshold;
  uniform float u_time;
  uniform float u_highlight;

  varying float v_energy;
  varying float v_active;
  varying float v_iid;
  varying vec3  v_col;
  varying vec3  v_normal;
  varying vec3  v_worldPos;

  void main() {
    // Cull by activity flag and energy threshold
    if (v_active   < 0.5)          discard;
    if (v_energy   < u_threshold)  discard;

    // Bidirectional diffuse lighting
    vec3 ld1 = normalize(vec3(0.55, 1.0, 0.50));
    vec3 ld2 = normalize(vec3(-0.8, -0.3, -0.6));
    float d1 = max(dot(v_normal, ld1), 0.0) * 0.72;
    float d2 = max(dot(v_normal, ld2), 0.0) * 0.18;

    // Rim light
    vec3 vd  = normalize(cameraPosition - v_worldPos);
    float rim = pow(1.0 - max(dot(vd, v_normal), 0.0), 3.5) * 0.24;

    vec3 lit = v_col * (0.26 + d1 + d2) + vec3(rim * 0.55);

    // Gold specular — stronger on hot cells
    float sp  = pow(max(dot(reflect(-ld1, v_normal), vd), 0.0), 28.0) * 0.14 * v_energy;
    lit      += vec3(0.95, 0.78, 0.30) * sp;

    // HDR boost: hot cells exceed 1.0 luminance → bloom kicks in
    // Low-energy cells stay sub-threshold → no bloom (matte/dark look)
    float boost = 1.0 + v_energy * v_energy * 3.2;
    lit *= boost;

    // Hover highlight: shift to gold-white
    float isHot = step(u_highlight - 0.5, v_iid) * step(v_iid, u_highlight + 0.5);
    lit = mix(lit, vec3(1.0, 0.88, 0.35) * max(boost, 3.0), isHot * 0.62);

    gl_FragColor = vec4(lit, 0.93);
  }
`;

// ──────────────────────────────────────────────────────────
//  Cell data state (populated after file load)
// ──────────────────────────────────────────────────────────
let minE = 0, maxE = 1;

// Optional per-instance metadata — populated if WASM returns them
// Fallback: derive energy magnitude from color channels
let cellNormEnergies = null;  // Float32Array [0..1]
let cellLayerIds     = null;  // Int32Array
let cellEtaIds       = null;  // Int32Array
let cellPhiIds       = null;  // Int32Array

// Active filter mask
let activeAttr = null;

// Per-detector enable state
const detEnabled = { tile: true, hec: true, lar: true };

// ──────────────────────────────────────────────────────────
//  Build / tear down InstancedMesh
// ──────────────────────────────────────────────────────────
let activeMesh = null;

function buildMesh(result) {
  if (activeMesh) {
    scene.remove(activeMesh);
    activeMesh.geometry.dispose();
    activeMesh.material.dispose();
    activeMesh = null;
  }

  const n = result.count;
  if (!n) return;

  // ── Store optional metadata from WASM (if exposed) ──────
  // These are bonus fields; graceful fallback if absent
  cellNormEnergies = result.energies   ?? null;
  cellLayerIds     = result.layers     ?? null;
  cellEtaIds       = result.etas       ?? null;
  cellPhiIds       = result.phis       ?? null;

  // ── Derive normalised energy if not provided ─────────────
  // Use red channel as proxy: color scale goes blue(low)→red(high)
  if (!cellNormEnergies) {
    cellNormEnergies = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // colors is Float32Array with stride 3 (r, g, b)
      const r = result.colors[i * 3];
      const b = result.colors[i * 3 + 2];
      // Red dominant = high energy; blue dominant = low
      cellNormEnergies[i] = Math.max(0, Math.min(1, (r - b * 0.5 + 0.5) * 0.8));
    }
  }

  // ── Build geometry with instance attributes ───────────────
  const geo = new THREE.BoxGeometry(1, 1, 1);

  // Instance ID (float, used for highlight in shader)
  const iids = new Float32Array(n);
  for (let i = 0; i < n; i++) iids[i] = i;
  geo.setAttribute('a_iid',
    new THREE.InstancedBufferAttribute(iids, 1));

  // Normalised energy per instance
  geo.setAttribute('a_energy',
    new THREE.InstancedBufferAttribute(cellNormEnergies.slice(), 1));

  // Active mask (detector filter + future layer filter)
  activeAttr = new Float32Array(n).fill(1);
  geo.setAttribute('a_active',
    new THREE.InstancedBufferAttribute(activeAttr, 1));

  // ── Shader material ───────────────────────────────────────
  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms:    shaderUniforms,
    transparent: true,
    depthWrite:  true,
    clipping:    true,
  });

  // ── Instanced mesh ────────────────────────────────────────
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.instanceMatrix.usage = THREE.DynamicDrawUsage;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(
    result.colors.slice(), 3);

  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    m4.fromArray(result.matrices, i * 16);
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;

  scene.add(mesh);
  activeMesh = mesh;
}

// ──────────────────────────────────────────────────────────
//  Detector filter — updates a_active per instance
// ──────────────────────────────────────────────────────────
function applyDetectorFilter() {
  if (!activeMesh || !cellLayerIds) return;

  const n   = activeMesh.count;
  const att = activeMesh.geometry.getAttribute('a_active');

  for (let i = 0; i < n; i++) {
    const layer = cellLayerIds[i] ?? 0;
    const det   = LAYER_DET[Math.min(layer, 25)];
    const key   = DET_KEYS[det];
    att.array[i] = detEnabled[key] ? 1 : 0;
  }
  att.needsUpdate = true;
}

detChecks.forEach(cb => {
  cb.addEventListener('change', () => {
    const det = cb.dataset.det;
    if (det in detEnabled) {
      detEnabled[det] = cb.checked;
      applyDetectorFilter();
    }
  });
});

// ──────────────────────────────────────────────────────────
//  Toast
// ──────────────────────────────────────────────────────────
let toastTimer = null;

function toast(msg, live = true) {
  clearTimeout(toastTimer);
  toastTextEl.textContent = msg;
  toastPip.classList.toggle('live', live);
  toastEl.classList.add('on');
}

function hideToast() {
  toastEl.classList.remove('on');
}

// ──────────────────────────────────────────────────────────
//  Energy formatting
// ──────────────────────────────────────────────────────────
function fmtE(mev) {
  const abs = Math.abs(mev);
  if (abs >= 1e6)  return `${(mev / 1e6).toFixed(2)}\u00a0TeV`;
  if (abs >= 1000) return `${(mev / 1000).toFixed(2)}\u00a0GeV`;
  if (abs >= 1)    return `${mev.toFixed(1)}\u00a0MeV`;
  return `${mev.toFixed(2)}\u00a0MeV`;
}

// ──────────────────────────────────────────────────────────
//  Energy panel display
// ──────────────────────────────────────────────────────────
function setPanel(mn, mx) {
  minE = mn; maxE = mx;
  epMax.textContent = fmtE(mx);
  epMin.textContent = fmtE(mn);
  energyPanel.classList.add('on');
}

// ──────────────────────────────────────────────────────────
//  Energy threshold slider
// ──────────────────────────────────────────────────────────
let frac = 0, dragging = false;

function applyThreshold(f, tipX, tipY) {
  frac = Math.max(0, Math.min(1, f));

  const h  = gradTrack.clientHeight;
  const px = frac * h;
  trackHandle.style.bottom = `${px - 1}px`;
  trackDim.style.height    = `${px}px`;

  // Use (1 - frac) so slider top = max energy (don't discard highest cell)
  shaderUniforms.u_threshold.value = frac;

  const pct   = Math.round(frac * 100);
  const e     = minE + frac * (maxE - minE);
  const label = frac > 0 ? `\u2265\u00a0${fmtE(e)}` : 'All cells';

  threshDisp.textContent = frac > 0 ? fmtE(e) : 'All';
  tipVal.textContent     = label;
  tipPct.textContent     = `${pct}%`;

  if (tipX != null) {
    // Keep tip right of cursor, clamp to viewport
    let tx = tipX + 18;
    let ty = tipY - 22;
    const tipW = sliderTip.offsetWidth  || 120;
    const tipH = sliderTip.offsetHeight || 52;
    if (tx + tipW > window.innerWidth  - 8) tx = tipX - tipW - 10;
    if (ty + tipH > window.innerHeight - 8) ty = window.innerHeight - tipH - 8;
    sliderTip.style.left = `${tx}px`;
    sliderTip.style.top  = `${ty}px`;
  }
}

function fracFromY(clientY) {
  const rect = gradTrack.getBoundingClientRect();
  return 1 - (clientY - rect.top) / rect.height;
}

// Mouse drag
trackHandle.addEventListener('mousedown', e => {
  dragging = true;
  trackHandle.classList.add('dragging');
  energyPanel.classList.add('active');
  sliderTip.classList.add('on');
  e.preventDefault();
});
document.addEventListener('mousemove', e => {
  if (!dragging) return;
  applyThreshold(fracFromY(e.clientY), e.clientX, e.clientY);
});
document.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  trackHandle.classList.remove('dragging');
  energyPanel.classList.remove('active');
  sliderTip.classList.remove('on');
});
gradTrack.addEventListener('click', e => {
  applyThreshold(fracFromY(e.clientY));
});

// Touch drag
trackHandle.addEventListener('touchstart', e => {
  dragging = true;
  trackHandle.classList.add('dragging');
  energyPanel.classList.add('active');
  sliderTip.classList.add('on');
  e.preventDefault();
}, { passive: false });
document.addEventListener('touchmove', e => {
  if (!dragging || !e.touches[0]) return;
  const t = e.touches[0];
  applyThreshold(fracFromY(t.clientY), t.clientX, t.clientY);
}, { passive: true });
document.addEventListener('touchend', () => {
  if (!dragging) return;
  dragging = false;
  trackHandle.classList.remove('dragging');
  energyPanel.classList.remove('active');
  sliderTip.classList.remove('on');
});

// ──────────────────────────────────────────────────────────
//  Geometry panel collapse
// ──────────────────────────────────────────────────────────
let gpCollapsed = false;
gpToggleBtn.addEventListener('click', () => {
  gpCollapsed = !gpCollapsed;
  gpBody.classList.toggle('collapsed', gpCollapsed);
  gpToggleBtn.classList.toggle('collapsed', gpCollapsed);
});

// ──────────────────────────────────────────────────────────
//  Raycasting & Hover Tooltip
//  Throttled to every ~80 ms to maintain 60 fps
// ──────────────────────────────────────────────────────────
const raycaster   = new THREE.Raycaster();
const mouseNDC    = new THREE.Vector2();
let   lastRayMs   = 0;
const RAY_GAP_MS  = 80;
let   hoveredId   = -1;

function showTooltip(id, screenX, screenY) {
  if (id === hoveredId) {
    // Just reposition
    positionTooltip(screenX, screenY);
    return;
  }

  hoveredId = id;
  shaderUniforms.u_highlight.value = id;

  // ── Populate data fields ─────────────────────────────────
  if (cellNormEnergies && cellNormEnergies[id] != null) {
    const normE   = cellNormEnergies[id];
    const actualE = minE + normE * (maxE - minE);
    ctEnergy.textContent = fmtE(actualE);
  } else {
    ctEnergy.textContent = '—';
  }

  if (cellLayerIds && cellLayerIds[id] != null) {
    const layer   = cellLayerIds[id];
    const detIdx  = LAYER_DET[Math.min(layer, 25)];
    ctLayer.textContent = `${layer}\u00a0(${DET_NAMES[detIdx] ?? '?'})`;
  } else {
    ctLayer.textContent = '—';
  }

  ctEta.textContent = (cellEtaIds && cellEtaIds[id] != null)
    ? String(cellEtaIds[id]) : '—';

  ctPhi.textContent = (cellPhiIds && cellPhiIds[id] != null)
    ? String(cellPhiIds[id]) : '—';

  cellTooltip.classList.add('visible');
  positionTooltip(screenX, screenY);
}

function positionTooltip(sx, sy) {
  const w  = cellTooltip.offsetWidth  || 170;
  const h  = cellTooltip.offsetHeight || 112;
  let tx = sx + 22, ty = sy - 12;
  if (tx + w > window.innerWidth  - 8) tx = sx - w - 12;
  if (ty + h > window.innerHeight - 8) ty = sy - h - 4;
  cellTooltip.style.left = `${tx}px`;
  cellTooltip.style.top  = `${ty}px`;
}

function clearTooltip() {
  if (hoveredId === -1) return;
  hoveredId = -1;
  shaderUniforms.u_highlight.value = -1.0;
  cellTooltip.classList.remove('visible');
}

function onMouseMove(e) {
  // Skip raycasting in focus mode for cleanliness
  if (document.body.classList.contains('focus-mode')) {
    clearTooltip(); return;
  }

  const now = performance.now();
  if (now - lastRayMs < RAY_GAP_MS) return;
  lastRayMs = now;

  if (!activeMesh) { clearTooltip(); return; }

  mouseNDC.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  mouseNDC.y = -(e.clientY / window.innerHeight)  * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);

  const hits = raycaster.intersectObject(activeMesh);
  if (hits.length > 0 && hits[0].instanceId !== undefined) {
    showTooltip(hits[0].instanceId, e.clientX, e.clientY);
  } else {
    clearTooltip();
  }
}

document.addEventListener('mousemove', onMouseMove, { passive: true });
renderer.domElement.addEventListener('mouseleave', clearTooltip);

// ──────────────────────────────────────────────────────────
//  File loading
// ──────────────────────────────────────────────────────────
async function loadFile(file) {
  toast(`Reading ${file.name}…`);
  dropZone.classList.add('hidden');
  ghostLbl.classList.add('gone');

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    toast('Computing geometry…');
    // Yield to browser for a frame so the toast can paint
    await new Promise(r => setTimeout(r, 30));

    const result = process_xml_data(bytes);
    buildMesh(result);

    if (ghostGrp) ghostGrp.visible = false;

    const n = result.count;
    setPanel(result.minEnergy, result.maxEnergy);
    applyThreshold(0);

    // Update info panel
    cellCountEl.textContent  = n.toLocaleString();
    energyRangeEl.textContent = `${fmtE(result.minEnergy)}\u2013${fmtE(result.maxEnergy)}`;

    toast(`${n.toLocaleString()} cells loaded`, false);
    toastTimer = setTimeout(hideToast, 2800);

    controls.autoRotate = false;
  } catch (err) {
    toast(`Error: ${err?.message ?? err}`, false);
    dropZone.classList.remove('hidden');
    ghostLbl.classList.remove('gone');
  }
}

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer?.files[0];
  if (f) loadFile(f);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) loadFile(f);
});

// ──────────────────────────────────────────────────────────
//  Focus (Wallpaper) Mode
// ──────────────────────────────────────────────────────────
let focusActive = false;

function enterFocus() {
  focusActive = true;
  document.body.classList.add('focus-mode');
  focusOverlay.classList.add('active');
  controls.autoRotate      = true;
  controls.autoRotateSpeed = 0.45;   // faster cinematic spin
  clearTooltip();

  // Request fullscreen
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

function exitFocus() {
  focusActive = false;
  document.body.classList.remove('focus-mode');
  focusOverlay.classList.remove('active');
  controls.autoRotate      = !!activeMesh ? false : true;
  controls.autoRotateSpeed = 0.22;

  if (document.exitFullscreen && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
}

btnFocus.addEventListener('click', enterFocus);
btnExitFocus.addEventListener('click', exitFocus);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && focusActive) exitFocus();
  if (e.key === 'Escape' && modalOv.classList.contains('open')) closeModal();
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && focusActive) exitFocus();
});

// ──────────────────────────────────────────────────────────
//  Snapshot (4 K, off-screen)
// ──────────────────────────────────────────────────────────
btnSnap.addEventListener('click', async () => {
  const W = 3840, H = 2160;
  const oc = document.createElement('canvas');
  oc.width = W; oc.height = H;

  const or = new THREE.WebGLRenderer({
    canvas: oc, antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  or.setPixelRatio(1);
  or.setSize(W, H, false);
  or.setClearColor(0x000d16);
  or.toneMapping = renderer.toneMapping;
  or.toneMappingExposure = renderer.toneMappingExposure;
  or.localClippingEnabled = true;
  or.clippingPlanes = renderer.clippingPlanes.slice();

  const sc = camera.clone();
  sc.aspect = W / H;
  sc.updateProjectionMatrix();

  // Run composer on off-screen renderer
  const oc2 = new EffectComposer(or);
  oc2.addPass(new RenderPass(scene, sc));
  oc2.addPass(new UnrealBloomPass(
    new THREE.Vector2(W, H), 0.60, 0.50, 0.34));
  oc2.addPass(new OutputPass());
  oc2.render();

  const blob = await new Promise(res => oc.toBlob(res, 'image/png'));
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), {
    href: url, download: `cgv-${Date.now()}.png`,
  }).click();
  URL.revokeObjectURL(url);
  or.dispose();

  btnSnap.classList.add('flash');
  setTimeout(() => btnSnap.classList.remove('flash'), 700);
});

// ──────────────────────────────────────────────────────────
//  Reset
// ──────────────────────────────────────────────────────────
btnReset.addEventListener('click', () => {
  // Tear down mesh
  if (activeMesh) {
    scene.remove(activeMesh);
    activeMesh.geometry.dispose();
    activeMesh.material.dispose();
    activeMesh = null;
  }

  // Restore ghost
  if (ghostGrp) ghostGrp.visible = true;
  else buildGhost();

  // Reset metadata
  cellNormEnergies = null;
  cellLayerIds     = null;
  cellEtaIds       = null;
  cellPhiIds       = null;
  activeAttr       = null;

  // Reset UI state
  energyPanel.classList.remove('on');
  cellCountEl.textContent   = '—';
  energyRangeEl.textContent = '—';
  threshDisp.textContent    = 'All';
  epMax.textContent         = '—';
  epMin.textContent         = '—';
  applyThreshold(0);
  shaderUniforms.u_threshold.value = 0;
  shaderUniforms.u_highlight.value = -1.0;
  hoveredId = -1;

  // Reset clip
  clipSlider.value          = 100;
  clipFill.style.width      = '100%';
  clipValDisp.textContent   = 'OFF';
  renderer.clippingPlanes   = [];

  // Restore drop zone
  dropZone.classList.remove('hidden');
  ghostLbl.classList.remove('gone');
  fileInput.value = '';
  hideToast();
  clearTimeout(toastTimer);

  // Camera
  controls.autoRotate      = true;
  controls.autoRotateSpeed = 0.22;
  camera.position.set(10, 5, 16);
  camera.lookAt(0, 0, 0);
  controls.reset();

  if (focusActive) exitFocus();
});

// ──────────────────────────────────────────────────────────
//  Help modal
// ──────────────────────────────────────────────────────────
function openModal()  { modalOv.classList.add('open'); }
function closeModal() { modalOv.classList.remove('open'); }

btnHelp.addEventListener('click', openModal);
modalCloseBtn.addEventListener('click', closeModal);
modalOv.addEventListener('click', e => {
  if (e.target === modalOv) closeModal();
});

// ──────────────────────────────────────────────────────────
//  Resize
// ──────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
});

// ──────────────────────────────────────────────────────────
//  Render loop
// ──────────────────────────────────────────────────────────
const clock = new THREE.Clock();

(function loop() {
  requestAnimationFrame(loop);
  const dt = clock.getDelta();
  shaderUniforms.u_time.value += dt;
  controls.update(dt);

  // Use composer (bloom + SMAA) instead of raw renderer.render
  composer.render();
})();