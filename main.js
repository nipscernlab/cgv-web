// ============================================================
//  CGV-WEB  –  main.js
//  Three.js renderer + WASM bridge
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import init, { process_xml_data } from './pkg/cgv_web.js';

// ---- WASM bootstrap ----------------------------------------
await init();

// ---- DOM refs -----------------------------------------------
const dropZone   = document.getElementById('drop-zone');
const canvas     = document.getElementById('gl-canvas');
const overlay    = document.getElementById('overlay');
const statusEl   = document.getElementById('status');
const countEl    = document.getElementById('cell-count');
const energyEl   = document.getElementById('energy-range');
const legendEl   = document.getElementById('legend');
const btnDl      = document.getElementById('btn-download');
const btnReset   = document.getElementById('btn-reset');
const fileInput  = document.getElementById('file-input');

// ---- Three.js scene -----------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x05090f);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene  = new THREE.Scene();
scene.fog    = new THREE.FogExp2(0x05090f, 0.018);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 300);
camera.position.set(10, 6, 14);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance   = 0.5;
controls.maxDistance   = 80;
controls.autoRotate    = true;
controls.autoRotateSpeed = 0.3;

// Ambient + directional lighting
const ambient = new THREE.AmbientLight(0x0d1a2a, 1.0);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0x9ed8ff, 2.5);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);
const rimLight = new THREE.DirectionalLight(0x00ffaa, 0.8);
rimLight.position.set(-15, -5, -10);
scene.add(rimLight);

// ---- Axis helpers (North/South markers) ---------------------
function buildAxisLabels() {
    const group = new THREE.Group();

    // North (+Z, Side A)
    const northGeo = new THREE.ConeGeometry(0.15, 0.6, 8);
    const northMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
    const northCone = new THREE.Mesh(northGeo, northMat);
    northCone.position.set(0, 0, 7.5);
    northCone.rotation.x = -Math.PI / 2;
    group.add(northCone);

    // South (-Z, Side C)
    const southMat = new THREE.MeshBasicMaterial({ color: 0xff6644 });
    const southCone = new THREE.Mesh(northGeo.clone(), southMat);
    southCone.position.set(0, 0, -7.5);
    southCone.rotation.x = Math.PI / 2;
    group.add(southCone);

    // Beam axis line
    const pts = [new THREE.Vector3(0,0,-8), new THREE.Vector3(0,0,8)];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x334455, linewidth: 1 });
    group.add(new THREE.Line(lineGeo, lineMat));

    // Ring at origin (transverse plane)
    const ringGeo = new THREE.RingGeometry(3.9, 4.0, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x223344, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    scene.add(group);
    return group;
}
buildAxisLabels();

// Add floating text sprites for N/S labels using canvas
function makeSprite(text, color) {
    const size = 128;
    const cv   = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'transparent';
    ctx.clearRect(0, 0, size, size);
    ctx.font = 'bold 56px "Orbitron", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sp  = new THREE.Sprite(mat);
    sp.scale.set(0.8, 0.8, 1);
    return sp;
}
const northSprite = makeSprite('N', '#00ffcc');
northSprite.position.set(0, 0.6, 8.2);
scene.add(northSprite);
const southSprite = makeSprite('S', '#ff6644');
southSprite.position.set(0, 0.6, -8.2);
scene.add(southSprite);

// ---- InstancedMesh state ------------------------------------
let activeMesh = null;

function buildInstancedMesh(result) {
    if (activeMesh) {
        scene.remove(activeMesh);
        activeMesh.geometry.dispose();
        activeMesh.material.dispose();
        activeMesh = null;
    }

    const count = result.count;
    if (count === 0) return;

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: false,
        roughness:  0.35,
        metalness:  0.05,
        transparent: true,
        opacity: 0.92,
        // per-instance colour is set via instanceColor
    });

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.usage = THREE.DynamicDrawUsage;
    mesh.instanceColor         = new THREE.InstancedBufferAttribute(result.colors, 3);

    // Copy matrices into Three.js
    const m4 = new THREE.Matrix4();
    const matArr = result.matrices;
    for (let i = 0; i < count; i++) {
        const off = i * 16;
        // Three.js Matrix4.elements is column-major; our buffer is already col-major
        m4.fromArray(matArr, off);
        mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;

    scene.add(mesh);
    activeMesh = mesh;

    // Update UI
    countEl.textContent = `Cells: ${count.toLocaleString()}`;
    energyEl.textContent =
        `E: ${result.minEnergy.toFixed(2)} – ${result.maxEnergy.toFixed(2)} GeV`;
    legendEl.style.display = 'flex';

    // Stop auto-rotate once data loaded
    controls.autoRotate = false;
}

// ---- File processing ----------------------------------------
async function processFile(file) {
    setStatus('loading', `Reading ${file.name}…`);
    dropZone.classList.add('hidden');
    overlay.classList.remove('hidden');

    try {
        const buffer = await file.arrayBuffer();
        const bytes  = new Uint8Array(buffer);

        setStatus('processing', 'Computing geometry…');
        await new Promise(r => setTimeout(r, 30)); // yield to repaint

        const result = process_xml_data(bytes);
        buildInstancedMesh(result);
        setStatus('done', `Loaded ${file.name}`);
    } catch (err) {
        setStatus('error', `Error: ${err.message || err}`);
        dropZone.classList.remove('hidden');
    }
}

function setStatus(type, msg) {
    statusEl.className = `status ${type}`;
    statusEl.textContent = msg;
}

// ---- Drag-and-drop ------------------------------------------
['dragenter','dragover'].forEach(ev =>
    dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('drag-over'); })
);
['dragleave','drop'].forEach(ev =>
    dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('drag-over'); })
);
dropZone.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
    if (e.target.files[0]) processFile(e.target.files[0]);
});

// ---- Screenshot download ------------------------------------
btnDl.addEventListener('click', () => {
    renderer.render(scene, camera); // ensure latest frame
    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a   = Object.assign(document.createElement('a'),
            { href: url, download: `cgv-snapshot-${Date.now()}.png` });
        a.click();
        URL.revokeObjectURL(url);
    }, 'image/png');
});

// ---- Reset --------------------------------------------------
btnReset.addEventListener('click', () => {
    if (activeMesh) {
        scene.remove(activeMesh);
        activeMesh.geometry.dispose();
        activeMesh.material.dispose();
        activeMesh = null;
    }
    legendEl.style.display = 'none';
    countEl.textContent    = '';
    energyEl.textContent   = '';
    dropZone.classList.remove('hidden');
    overlay.classList.add('hidden');
    controls.autoRotate = true;
    fileInput.value = '';
});

// ---- Resize -------------------------------------------------
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Render loop --------------------------------------------
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    controls.update(dt);
    renderer.render(scene, camera);
}
animate();
