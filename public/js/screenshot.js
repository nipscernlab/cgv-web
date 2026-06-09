import * as THREE from 'three';
import { getPinnedCards } from './hoverTooltip.js';

// Scratch vectors reused for projecting pinned-card anchors into the off-screen
// shot (see _drawPinnedCards). Module-scope so repeated shots don't re-allocate.
const _shotAnchorView = new THREE.Vector3();
const _shotAnchorNdc = new THREE.Vector3();

// Split a card's `.tkey` element into draw segments, preserving <sub>/<sup> so
// E_T / p_T / E_T^miss render with real sub/superscripts. Base text is
// uppercased to mirror the tooltip's text-transform; the η opt-out <span>
// (CSS text-transform:none) keeps its lowercase.
function _keySegments(keyEl) {
  const segs = [];
  for (const node of keyEl.childNodes) {
    const text = node.textContent ?? '';
    if (!text) continue;
    const name = node.nodeName;
    if (name === 'SUB') segs.push({ text: text.toUpperCase(), kind: 'sub' });
    else if (name === 'SUP') segs.push({ text: text.toUpperCase(), kind: 'sup' });
    else if (name === 'SPAN')
      segs.push({ text, kind: 'base' }); // η opt-out: keep case
    else segs.push({ text: text.toUpperCase(), kind: 'base' });
  }
  return segs;
}

// Read one pinned card's on-screen text (title, η/φ coords, key/value rows) so
// it can be redrawn into the shot. Pulled straight from the live DOM clone, so
// the E / E_T metric and any extra rows are exactly what the viewer shows.
function _readCard(el) {
  const title = el.querySelector('.tip-cell')?.textContent?.trim() ?? '';
  const coords = el.querySelector('.tip-coords')?.textContent?.trim() ?? '';
  const rows = [];
  for (const trow of el.querySelectorAll('.trow')) {
    const keyEl = trow.querySelector('.tkey');
    const valEl = trow.querySelector('.tval');
    if (!keyEl || !valEl) continue;
    rows.push({ keySegs: _keySegments(keyEl), value: valEl.textContent?.trim() ?? '' });
  }
  return { title, coords, rows };
}

// Redraw every pinned tooltip card into the off-screen shot canvas. Each card's
// world anchor is projected through the (already shot-configured) camera so the
// card lands over its cell regardless of the shot's aspect/fov reframing, then
// the card is reconstructed with canvas 2D to mirror the .tip-pinned styling in
// hud.css. `scale` is shot-px per CSS-px, so CSS metrics multiply straight in.
function _drawPinnedCards(ctx, camera, targetW, targetH, scale) {
  const cards = getPinnedCards();
  if (!cards.length) return;

  // CSS-px metrics from hud.css .tip-pinned, scaled into shot pixels.
  const PAD_T = 10 * scale;
  const PAD_B = 10 * scale;
  const INSET_L = 12 * scale; // 2px accent + 10px padding
  const INSET_R = 12 * scale;
  const TITLE_FS = 12.5 * scale;
  const TITLE_ADV = 17 * scale;
  const COORD_FS = 10.5 * scale;
  const COORD_ADV = 15 * scale;
  const DIV_ADV = 13 * scale; // 6px margin + 1px line + 6px margin
  const KEY_FS = 9.5 * scale;
  const VAL_FS = 11.5 * scale;
  const ROW_ADV = 17 * scale;
  const ROW_GAP = 24 * scale;
  const MIN_W = 160 * scale;
  const RADIUS = 6 * scale;
  const ACCENT_W = 2 * scale;
  const EDGE = 4 * scale;

  const titleFont = (px) => `600 ${px}px Inter, system-ui, sans-serif`;
  const coordFont = (px) => `400 ${px}px "JetBrains Mono", ui-monospace, monospace`;
  const keyFont = (px) => `500 ${px}px Inter, system-ui, sans-serif`;
  const valFont = (px) => `500 ${px}px "JetBrains Mono", ui-monospace, monospace`;

  const keySegWidth = (segs) => {
    let w = 0;
    for (const s of segs) {
      ctx.font = keyFont(s.kind === 'base' ? KEY_FS : KEY_FS * 0.78);
      w += ctx.measureText(s.text).width;
    }
    return w;
  };

  for (const card of cards) {
    // Skip anchors behind the camera (project() wraps them to the wrong side).
    // Camera looks down -z in view space, so view-space z >= 0 is behind it.
    _shotAnchorView.copy(card.anchor).applyMatrix4(camera.matrixWorldInverse);
    if (_shotAnchorView.z >= 0) continue;
    _shotAnchorNdc.copy(card.anchor).project(camera);
    const ax = (_shotAnchorNdc.x * 0.5 + 0.5) * targetW;
    const ay = (-_shotAnchorNdc.y * 0.5 + 0.5) * targetH;

    const model = _readCard(card.el);

    // Measure content → box size.
    ctx.font = titleFont(TITLE_FS);
    let contentW = ctx.measureText(model.title).width;
    if (model.coords) {
      ctx.font = coordFont(COORD_FS);
      contentW = Math.max(contentW, ctx.measureText(model.coords).width);
    }
    for (const row of model.rows) {
      ctx.font = valFont(VAL_FS);
      const valW = ctx.measureText(row.value).width;
      contentW = Math.max(contentW, keySegWidth(row.keySegs) + ROW_GAP + valW);
    }
    const boxW = Math.max(contentW + INSET_L + INSET_R, MIN_W);
    const boxH =
      PAD_T +
      TITLE_ADV +
      (model.coords ? COORD_ADV : 0) +
      DIV_ADV +
      model.rows.length * ROW_ADV +
      PAD_B;

    // Offset from the anchor like _positionPin (+14 CSS px), clamped in-frame.
    const bx = Math.min(Math.max(ax + 14 * scale, EDGE), targetW - boxW - EDGE);
    const by = Math.min(Math.max(ay + 14 * scale, EDGE), targetH - boxH - EDGE);

    // Panel: drop shadow + rounded fill, hairline border, left accent bar.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, RADIUS);
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 24 * scale;
    ctx.shadowOffsetY = 8 * scale;
    ctx.fillStyle = '#1b2029';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = 1 * scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#f4f6fa';
    ctx.fillRect(bx, by, ACCENT_W, boxH);
    ctx.restore();

    const cx = bx + INSET_L;
    const rightX = bx + boxW - INSET_R;
    let y = by + PAD_T;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Title.
    ctx.font = titleFont(TITLE_FS);
    ctx.fillStyle = '#f4f6fa';
    ctx.fillText(model.title, cx, y + TITLE_FS);
    y += TITLE_ADV;

    // Coords (η = … φ = … rad).
    if (model.coords) {
      ctx.font = coordFont(COORD_FS);
      ctx.fillStyle = '#828a96';
      ctx.fillText(model.coords, cx, y + COORD_FS);
      y += COORD_ADV;
    }

    // Divider (sits after a 6px top margin).
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    ctx.moveTo(cx, y + 6 * scale);
    ctx.lineTo(rightX, y + 6 * scale);
    ctx.stroke();
    y += DIV_ADV;

    // Rows: uppercase key (left, with sub/sup) + value (right).
    for (const row of model.rows) {
      const baseline = y + VAL_FS;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#828a96';
      let kx = cx;
      for (const s of row.keySegs) {
        if (s.kind === 'sub') {
          ctx.font = keyFont(KEY_FS * 0.78);
          ctx.fillText(s.text, kx, baseline + KEY_FS * 0.16);
        } else if (s.kind === 'sup') {
          ctx.font = keyFont(KEY_FS * 0.78);
          ctx.fillText(s.text, kx, baseline - KEY_FS * 0.42);
        } else {
          ctx.font = keyFont(KEY_FS);
          ctx.fillText(s.text, kx, baseline);
        }
        kx += ctx.measureText(s.text).width;
      }
      ctx.font = valFont(VAL_FS);
      ctx.fillStyle = '#f4f6fa';
      ctx.textAlign = 'right';
      ctx.fillText(row.value, rightX, baseline);
      y += ROW_ADV;
    }
    ctx.restore();
  }
}

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
    const origH = renderer.domElement.height;
    const origPR = renderer.getPixelRatio();
    const origAspect = camera.aspect;
    const origFov = camera.fov;

    const targetAspect = targetW / targetH;
    const origTanHalf = Math.tan((origFov * Math.PI) / 180 / 2);
    const newTanHalf = origTanHalf * Math.max(1, origAspect / targetAspect);
    const newFov = (2 * Math.atan(newTanHalf) * 180) / Math.PI;
    renderer.setPixelRatio(1);
    renderer.setSize(targetW, targetH, false);
    camera.aspect = targetAspect;
    camera.fov = newFov;
    camera.updateProjectionMatrix();

    const transparentBg = !!document.getElementById('shot-transparent')?.checked;
    const savedBg = scene.background;
    if (transparentBg) {
      scene.background = null;
      renderer.setClearColor(0x000000, 0);
    }

    const slicerGroup = slicer.getGroup();
    const slicerVisSaved = slicerGroup ? slicerGroup.visible : null;
    if (slicerGroup) slicerGroup.visible = false;
    renderer.render(scene, camera);
    if (slicerGroup && slicerVisSaved !== null) slicerGroup.visible = slicerVisSaved;

    const gl = renderer.getContext();
    const pixels = new Uint8Array(targetW * targetH * 4);
    gl.readPixels(0, 0, targetW, targetH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const offscreen = document.createElement('canvas');
    offscreen.width = targetW;
    offscreen.height = targetH;
    const ctx = offscreen.getContext('2d');
    const imgData = ctx.createImageData(targetW, targetH);
    for (let y = 0; y < targetH; y++) {
      const srcRow = (targetH - 1 - y) * targetW * 4;
      imgData.data.set(pixels.subarray(srcRow, srcRow + targetW * 4), y * targetW * 4);
    }
    ctx.putImageData(imgData, 0, 0);

    // Pinned tooltip cards (click a cell to pin one) are reprojected through the
    // shot camera and redrawn so they appear in the saved image over their cells.
    _drawPinnedCards(ctx, camera, targetW, targetH, (targetW / origW) * origPR);

    const showCollision = !!document.getElementById('shot-show-collision')?.checked;
    const lastEventInfo = getLastEventInfo();
    if (showCollision && lastEventInfo) {
      const fields = [
        ['Date/Time', lastEventInfo.dateTime],
        ['Run', lastEventInfo.runNumber],
        ['Event', lastEventInfo.eventNumber],
        ['Lumi Block', lastEventInfo.lumiBlock],
        ['Version', lastEventInfo.version],
      ].filter(([, value]) => value);

      if (fields.length) {
        const scale = (targetW / origW) * origPR;
        const fs = 13 * scale;
        const lh = 18 * scale;
        const colGap = 8 * scale;
        const margin = 10 * scale;

        ctx.save();
        ctx.fillStyle = '#66ccff';
        ctx.font = `400 ${fs * 0.78}px monospace`;
        const keyW = Math.max(...fields.map(([k]) => ctx.measureText(k.toUpperCase()).width));

        const x = margin;
        let y = margin;
        for (const [k, v] of fields) {
          ctx.font = `400 ${fs * 0.78}px monospace`;
          ctx.globalAlpha = 0.25;
          ctx.fillText(k.toUpperCase(), x, y + lh * 0.82);
          ctx.font = `500 ${fs}px monospace`;
          ctx.globalAlpha = 0.45;
          ctx.fillText(v, x + keyW + colGap, y + lh * 0.82);
          y += lh;
        }
        ctx.restore();
      }
    }

    if (transparentBg) {
      scene.background = savedBg;
      renderer.setClearColor(0x000000, 1);
    }
    renderer.setPixelRatio(origPR);
    renderer.setSize(origW / origPR, origH / origPR, false);
    camera.aspect = origAspect;
    camera.fov = origFov;
    camera.updateProjectionMatrix();
    markDirty();

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const link = document.createElement('a');
    link.download = `CGVWEB_${targetW}x${targetH}_${ts}.png`;
    link.href = offscreen.toDataURL('image/png');
    link.click();
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
