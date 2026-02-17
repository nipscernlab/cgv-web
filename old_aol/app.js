// app.js — complete, robust image pipeline (accepts PNG/JPG/SVG inputs and emblem types)
// emblem is './assets/atlas_emblem.jpg'
import init, { composite_rgba } from './pkg/image_compositor.js';
await init();

const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const origPreview = document.getElementById('origPreview');
const previewImg = document.getElementById('preview');
const downloadBtn = document.getElementById('downloadBtn');

let dragCounter = 0;
function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }
['dragenter','dragover','dragleave','drop'].forEach(evt => window.addEventListener(evt, preventDefaults, false));
window.addEventListener('dragover', e => { if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });

// UI drag state
drop.addEventListener('dragenter', () => { dragCounter++; drop.classList.add('drag-over'); });
drop.addEventListener('dragleave', () => { dragCounter = Math.max(0, dragCounter - 1); if (dragCounter === 0) drop.classList.remove('drag-over'); });
drop.addEventListener('drop', async (e) => {
  dragCounter = 0;
  drop.classList.remove('drag-over');
  const dt = e.dataTransfer;
  if (!dt) return;
  const file = dt.files && dt.files.length ? dt.files[0] : getFileFromItems(dt.items);
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('Please drop an image (PNG, JPEG or SVG).'); return; }
  await processImageFile(file);
});

drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  await processImageFile(f);
  fileInput.value = '';
});

function getFileFromItems(items){
  if (!items || !items.length) return null;
  for (const it of items) {
    if (it.kind === 'file') {
      const file = it.getAsFile();
      if (file && file.type && file.type.startsWith('image/')) return file;
    }
  }
  return null;
}

// Try createImageBitmap, fallback to <img> approach
async function bitmapFromBlob(blob) {
  try {
    return await createImageBitmap(blob);
  } catch (err) {
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        // draw to temporary canvas
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width || 256;
        c.height = img.naturalHeight || img.height || 256;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        // try to produce ImageBitmap from canvas blob
        c.toBlob(async (b) => {
          try {
            const bmp = await createImageBitmap(b);
            resolve(bmp);
          } catch (e) {
            // final fallback: resolve with HTMLImageElement so caller can draw it
            resolve(img);
          }
        }, 'image/png');
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }
}

async function bitmapFromFile(file) {
  // file is a Blob; reuse bitmapFromBlob but keep HTMLImage fallback
  return await bitmapFromBlob(file);
}

// Main processing function
async function processImageFile(file) {
  try {
    // load base image (supports PNG/JPEG/SVG)
    const baseBitmap = await bitmapFromFile(file);

    const baseW = baseBitmap.width ?? baseBitmap.naturalWidth;
    const baseH = baseBitmap.height ?? baseBitmap.naturalHeight;
    if (!baseW || !baseH) throw new Error('Cannot determine base image dimensions');

    // draw base to offscreen canvas
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = baseW;
    baseCanvas.height = baseH;
    const bctx = baseCanvas.getContext('2d');
    bctx.clearRect(0,0,baseW,baseH);
    bctx.drawImage(baseBitmap, 0, 0, baseW, baseH);

    // show original preview (CSS limits its display size)
    baseCanvas.toBlob((b) => {
      if (!b) return;
      origPreview.src = URL.createObjectURL(b);
    }, 'image/png');

    // emblem parameters
    const scale = 0.44;         // emblem width relative to base width
    
    // fetch emblem (accepts svg/png/jpg/webp)
    const emblemPath = './assets/atlas_emblem_bg.png';
    const res = await fetch(emblemPath, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Emblem fetch failed: ' + res.status);
    const emblemBlob = await res.blob();

    // convert emblem blob to bitmap or img
    const emblemBitmapOrImg = await bitmapFromBlob(emblemBlob);

    // compute overlay size preserving aspect ratio
    const ovW = Math.max(64, Math.round(baseW * scale));
    const intrinsicW = emblemBitmapOrImg.width ?? emblemBitmapOrImg.naturalWidth ?? ovW;
    const intrinsicH = emblemBitmapOrImg.height ?? emblemBitmapOrImg.naturalHeight ?? ovW;
    const ovH = Math.max(64, Math.round(ovW * (intrinsicH / intrinsicW)));

    // draw emblem into overlay canvas
    const ovCanvas = document.createElement('canvas');
    ovCanvas.width = ovW;
    ovCanvas.height = ovH;
    const ovCtx = ovCanvas.getContext('2d');
    ovCtx.clearRect(0,0,ovW,ovH);
    ovCtx.drawImage(emblemBitmapOrImg, 0, 0, ovW, ovH);

    // get overlay pixel data
    const overlayImageData = ovCtx.getImageData(0,0,ovW,ovH);

    // compute position (centered horizontally, lower-center vertically)
    const posX = Math.round((baseW - ovW) / 2);
    const bottomMarginPercent = 0.01;
    const posY = Math.round(baseH - ovH - baseH * bottomMarginPercent);
    const clampedX = Math.max(0, Math.min(posX, baseW - ovW));
    const clampedY = Math.max(0, Math.min(posY, baseH - ovH));

    // get base pixel data
    const baseImageData = bctx.getImageData(0,0,baseW,baseH);

    // call wasm compositor
    const resultArr = composite_rgba(
      baseImageData.data, baseW, baseH,
      overlayImageData.data, ovW, ovH,
      clampedX, clampedY
    );

    if (!resultArr || resultArr.length !== baseW * baseH * 4) {
      console.error('Invalid result from wasm composite', resultArr && resultArr.length);
      alert('Processing failed. See console.');
      return;
    }

    const resultImgData = new ImageData(new Uint8ClampedArray(resultArr), baseW, baseH);

    // export final image via offscreen canvas
    const destCanvas = document.createElement('canvas');
    destCanvas.width = baseW;
    destCanvas.height = baseH;
    const dctx = destCanvas.getContext('2d');
    dctx.putImageData(resultImgData, 0, 0);

    destCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      // revoke previous object URLs to avoid leaks (optional)
      const prevOrig = origPreview.dataset._url;
      if (prevOrig) URL.revokeObjectURL(prevOrig);
      const prevResult = previewImg.dataset._url;
      if (prevResult) URL.revokeObjectURL(prevResult);

      previewImg.src = url;
      previewImg.dataset._url = url;
      downloadBtn.href = url;
      downloadBtn.style.display = 'inline-flex';
      downloadBtn.setAttribute('aria-hidden', 'false');
    }, 'image/png');

  } catch (err) {
    console.error('processImageFile error', err);
    alert('Failed to process image. See console.');
  }
}
