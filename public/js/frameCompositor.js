// ── Frame compositor ─────────────────────────────────────────────────────────
// Shared offscreen-render + 2D-overlay pipeline used by both the still
// screenshot (screenshot.js) and the cinema video recorder (videoRecorder.js).
//
// The 3D scene is rendered into an offscreen MSAA WebGLRenderTarget (4x AA, real
// alpha, sRGB) at an arbitrary resolution — decoupled from the on-screen canvas,
// which stays alpha:false / preserveDrawingBuffer:false for cheaper live frames.
// The pixels are read back and flipped into a 2D canvas, onto which the DOM-side
// overlays (pinned tooltip cards, collision metadata, minimap) are redrawn so
// they survive into the exported still/video regardless of the live UI state
// (cinema mode hides all chrome via CSS, but the compositor draws it anyway when
// the caller opts in).
import * as THREE from 'three';
import { getPinnedCards } from './hoverTooltip.js';

// Scratch vectors reused for projecting pinned-card anchors into the off-screen
// frame (see drawPinnedCards). Module-scope so repeated frames don't re-allocate.
const _anchorView = new THREE.Vector3();
const _anchorNdc = new THREE.Vector3();

// ── Offscreen scene renderer ────────────────────────────────────────────────
// Allocates one MSAA render target + pixel buffer + 2D canvas, sized once, and
// reuses them across renders. The recorder builds one per capture (thousands of
// frames); the screenshot builds one per shot and disposes it. Callers configure
// camera.aspect/fov for the target dimensions before calling renderScene().
export function createFrameRenderer({ renderer, width, height, samples = 4 }) {
  const rt = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
    samples,
  });
  rt.texture.colorSpace = THREE.SRGBColorSpace;

  const pixels = new Uint8Array(width * height * 4);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const imgData = ctx.createImageData(width, height);
  const rowBytes = width * 4;

  // Render the scene into the RT and blit (Y-flipped) into the 2D canvas. The
  // caller manages scene.background; `transparent` only toggles the GL clear
  // alpha so an alpha export gets a real hole instead of the clear colour.
  function renderScene(scene, camera, { transparent = false } = {}) {
    const prevTarget = renderer.getRenderTarget();
    if (transparent) renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, width, height, pixels);
    renderer.setRenderTarget(prevTarget);
    if (transparent) renderer.setClearColor(0x000000, 1);

    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * rowBytes;
      imgData.data.set(pixels.subarray(src, src + rowBytes), y * rowBytes);
    }
    ctx.putImageData(imgData, 0, 0);
    return ctx;
  }

  return { canvas, ctx, renderScene, dispose: () => rt.dispose() };
}

// ── Pinned tooltip cards ─────────────────────────────────────────────────────
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
// it can be redrawn into the frame. Pulled straight from the live DOM, so the
// E / E_T metric and any extra rows are exactly what the viewer shows.
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

// Redraw every pinned tooltip card into the frame canvas. Each card's world
// anchor is projected through the (already configured) camera so the card lands
// over its cell regardless of the frame's aspect/fov reframing, then the card is
// reconstructed with canvas 2D to mirror the .tip-pinned styling in hud.css.
// `scale` is frame-px per CSS-px, so CSS metrics multiply straight in.
export function drawPinnedCards(ctx, camera, targetW, targetH, scale) {
  const cards = getPinnedCards();
  if (!cards.length) return;

  // CSS-px metrics from hud.css .tip-pinned, scaled into frame pixels.
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
    _anchorView.copy(card.anchor).applyMatrix4(camera.matrixWorldInverse);
    if (_anchorView.z >= 0) continue;
    _anchorNdc.copy(card.anchor).project(camera);
    const ax = (_anchorNdc.x * 0.5 + 0.5) * targetW;
    const ay = (-_anchorNdc.y * 0.5 + 0.5) * targetH;

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

// ── Collision metadata overlay ───────────────────────────────────────────────
// Top-left run/event/lumi block, mirroring the on-screen collision HUD styling.
export function drawCollisionInfo(ctx, lastEventInfo, scale) {
  if (!lastEventInfo) return;
  const fields = [
    ['Date/Time', lastEventInfo.dateTime],
    ['Run', lastEventInfo.runNumber],
    ['Event', lastEventInfo.eventNumber],
    ['Lumi Block', lastEventInfo.lumiBlock],
    ['Version', lastEventInfo.version],
  ].filter(([, value]) => value);
  if (!fields.length) return;

  const fs = 13 * scale;
  const lh = 18 * scale;
  const colGap = 8 * scale;
  const margin = 10 * scale;

  ctx.save();
  ctx.fillStyle = '#66ccff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
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

// ── Minimap ──────────────────────────────────────────────────────────────────
// Composite the η×φ heatmap canvas (#minimap) at its on-screen position, scaled
// into frame pixels. Cinema mode hides the minimap via CSS (opacity:0), but the
// canvas backing store still holds the last-drawn heatmap, so we place it from
// its layout rect (taken once, before any cinema chrome-hide) when given, or
// fall back to a top-left margin. Drawn rounded to match the live widget.
export function drawMinimap(ctx, targetW, targetH, scale, rect) {
  const mm = document.getElementById('minimap');
  if (!mm || !mm.width || !mm.height) return;

  // Placement in frame pixels. Prefer the supplied layout rect (CSS px); else
  // sit it at a small top-left margin sized to the canvas backing aspect.
  let dx, dy, dw, dh;
  if (rect && rect.width > 0 && rect.height > 0) {
    dx = rect.left * scale;
    dy = rect.top * scale;
    dw = rect.width * scale;
    dh = rect.height * scale;
  } else {
    const margin = 12 * scale;
    dw = Math.min(342 * scale, targetW * 0.26);
    dh = dw * (mm.height / mm.width);
    dx = margin;
    dy = margin;
  }

  const radius = 8 * scale;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(dx, dy, dw, dh, radius);
  ctx.clip();
  ctx.drawImage(mm, dx, dy, dw, dh);
  ctx.restore();
}
