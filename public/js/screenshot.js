import { createFrameRenderer, drawPinnedCards, drawCollisionInfo } from './frameCompositor.js';

export function setupScreenshotControls({
  camera,
  markDirty,
  renderer,
  scene,
  slicer,
  t,
  getLastEventInfo,
}) {
  const shotOverlay = document.getElementById('shot-overlay');
  const shotSaveBtn = document.getElementById('btn-shot-save');
  const shotProgress = document.getElementById('shot-progress');
  const shotProgTxt = document.getElementById('shot-progress-txt');
  let shotW = 0;
  let shotH = 0;

  function pickDefaultShotRes() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const small =
      window.matchMedia('(orientation: landscape) and (max-height: 520px)').matches ||
      window.innerWidth < 900;
    return coarse || small ? { w: 2560, h: 1440 } : { w: 10240, h: 5760 };
  }

  function applyDefaultShotRes() {
    const { w, h } = pickDefaultShotRes();
    const target = document.querySelector(`.shot-res[data-w="${w}"][data-h="${h}"]`);
    if (!target) return;
    document.querySelectorAll('.shot-res').forEach((btn) => btn.classList.remove('active'));
    target.classList.add('active');
    shotW = w;
    shotH = h;
    shotSaveBtn.disabled = false;
  }

  function openShotDialog() {
    shotOverlay.classList.add('open');
    applyDefaultShotRes();
  }

  function closeShotDialog() {
    shotOverlay.classList.remove('open');
    document.querySelectorAll('.shot-res').forEach((btn) => btn.classList.remove('active'));
    shotSaveBtn.disabled = true;
    shotProgress.classList.remove('running');
    shotProgTxt.textContent = '';
    shotW = 0;
    shotH = 0;
  }

  async function renderAndDownload(targetW, targetH) {
    const origW = renderer.domElement.width;
    const origPR = renderer.getPixelRatio();
    const origAspect = camera.aspect;
    const origFov = camera.fov;

    // Reframe the (vertical) FOV so the on-screen content stays in-frame when
    // the shot aspect differs from the viewport's — never cropping, only ever
    // widening the view to fit the new aspect.
    const targetAspect = targetW / targetH;
    const origTanHalf = Math.tan((origFov * Math.PI) / 180 / 2);
    const newTanHalf = origTanHalf * Math.max(1, origAspect / targetAspect);
    const newFov = (2 * Math.atan(newTanHalf) * 180) / Math.PI;
    camera.aspect = targetAspect;
    camera.fov = newFov;
    camera.updateProjectionMatrix();

    const transparentBg = !!document.getElementById('shot-transparent')?.checked;
    const savedBg = scene.background;
    if (transparentBg) scene.background = null;

    // The slicer's editor gizmo is a screen-space helper — keep it out of shots.
    const slicerGroup = slicer.getGroup();
    const slicerVisSaved = slicerGroup ? slicerGroup.visible : null;
    if (slicerGroup) slicerGroup.visible = false;

    const frame = createFrameRenderer({ renderer, width: targetW, height: targetH });
    const ctx = frame.renderScene(scene, camera, { transparent: transparentBg });

    if (slicerGroup && slicerVisSaved !== null) slicerGroup.visible = slicerVisSaved;

    // Pinned tooltip cards (click a cell to pin one) are reprojected through the
    // shot camera and redrawn so they appear over their cells. `scale` is
    // shot-px per CSS-px, so CSS metrics multiply straight in.
    const scale = (targetW / origW) * origPR;
    drawPinnedCards(ctx, camera, targetW, targetH, scale);

    const showCollision = !!document.getElementById('shot-show-collision')?.checked;
    if (showCollision) drawCollisionInfo(ctx, getLastEventInfo(), scale);

    if (transparentBg) scene.background = savedBg;
    camera.aspect = origAspect;
    camera.fov = origFov;
    camera.updateProjectionMatrix();
    markDirty();

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const link = document.createElement('a');
    link.download = `CGVWEB_${targetW}x${targetH}_${ts}.png`;
    link.href = frame.canvas.toDataURL('image/png');
    link.click();
    frame.dispose();
  }

  document.querySelectorAll('.shot-res').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.shot-res').forEach((node) => node.classList.remove('active'));
      btn.classList.add('active');
      shotW = parseInt(btn.dataset.w, 10);
      shotH = parseInt(btn.dataset.h, 10);
      shotSaveBtn.disabled = false;
    });
  });

  document.getElementById('btn-shot').addEventListener('click', openShotDialog);
  document.getElementById('btn-shot-cancel').addEventListener('click', closeShotDialog);
  shotOverlay.addEventListener('click', (e) => {
    if (e.target === shotOverlay) closeShotDialog();
  });

  shotSaveBtn.addEventListener('click', async () => {
    if (!shotW || !shotH) return;
    shotSaveBtn.disabled = true;
    shotProgTxt.textContent = t('shot-rendering').replace('{w}', shotW).replace('{h}', shotH);
    shotProgress.classList.add('running');
    await new Promise((resolve) => setTimeout(resolve, 80));

    try {
      await renderAndDownload(shotW, shotH);
      shotProgTxt.textContent = t('shot-done');
      await new Promise((resolve) => setTimeout(resolve, 900));
      closeShotDialog();
    } catch (err) {
      shotProgTxt.textContent = t('shot-error').replace('{msg}', err.message);
      shotSaveBtn.disabled = false;
    }
  });

  return { openShotDialog, closeShotDialog };
}
