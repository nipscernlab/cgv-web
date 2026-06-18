// ── Cinema video recorder ────────────────────────────────────────────────────
// Renders ONE full cinema-tour loop offline and encodes it to an MP4 (H.264) via
// WebCodecs. Offline = the render is decoupled from the wall clock: each frame is
// rendered into the shared MSAA offscreen target (frameCompositor.js) at the
// chosen resolution, composited with the same overlays as the screenshot, fed to
// a VideoEncoder, and the output is a perfect fixed-fps loop no matter how long
// each frame takes to render. The camera is driven by cinema.createCaptureDriver
// with a synthetic fixed-dt clock; the follower is warmed up for one loop first
// so the periodic steady state makes the first and last frames match (seamless
// loop). The user configures the scene (slicer cut / view level / visibility)
// BEFORE recording — that's what the tour bakes in — and cannot interact during.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { pauseRenderLoop, resumeRenderLoop } from './renderLoop.js';
import {
  createFrameRenderer,
  drawPinnedCards,
  drawCollisionInfo,
  drawMinimap,
} from './frameCompositor.js';

// Output bits-per-pixel-per-second heuristic per quality tier. Synthetic scene
// content (flat background, geometry) compresses far better than camera footage,
// so these look essentially lossless while keeping a 75 s 2K loop well under
// ~150 MB. bitrate = bpp · width · height · fps, capped so nothing runs away.
const BPP = { high: 0.07, medium: 0.04 };
const BITRATE_CAP = 28_000_000;

// High → Main → Baseline profile candidates, descending level, so 2K@60
// (needs level 5.1+) is tried first but 1080p@30 still finds a match.
const AVC_CANDIDATES = [
  'avc1.640034', // High@5.2
  'avc1.640033', // High@5.1
  'avc1.640032', // High@5.0
  'avc1.64002a', // High@4.2
  'avc1.4d4034', // Main@5.2
  'avc1.42e02a', // Baseline@4.2
];

async function pickAvcConfig({ width, height, fps, bitrate }) {
  for (const codec of AVC_CANDIDATES) {
    const config = {
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
      latencyMode: 'quality',
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support?.supported) return config;
    } catch (_) {
      // Unknown codec string on this browser — try the next.
    }
  }
  return null;
}

export function setupVideoRecorder({
  renderer,
  scene,
  camera,
  cinema,
  slicer,
  getLastEventInfo,
  t,
}) {
  const overlay = document.getElementById('rec-overlay');
  const startBtn = document.getElementById('btn-rec-start');
  const cancelBtn = document.getElementById('btn-rec-cancel');
  const progress = document.getElementById('rec-progress');
  const bar = document.getElementById('rec-bar');
  const progTxt = document.getElementById('rec-progress-txt');
  const thumb = document.getElementById('rec-thumb');
  const thumbCtx = thumb?.getContext('2d') ?? null;

  let resW = 0;
  let resH = 0;
  let fps = 60;
  let quality = 'high';

  let capturing = false;
  let stopEarly = false; // "stop & keep" — finalize the partial clip
  let aborted = false; // discard

  const tr = (key, fallback) => {
    const s = t?.(key);
    return !s || s === key ? fallback : s;
  };

  function setActive(selector, el) {
    document.querySelectorAll(selector).forEach((n) => n.classList.remove('active'));
    el.classList.add('active');
  }

  function applyDefaults() {
    // 1080p / 60 / high by default — fluid and modestly sized.
    const def = document.querySelector('.rec-res[data-w="1920"]');
    if (def) {
      setActive('.rec-res', def);
      resW = 1920;
      resH = 1080;
    }
    const f60 = document.querySelector('.rec-fps[data-fps="60"]');
    if (f60) {
      setActive('.rec-fps', f60);
      fps = 60;
    }
    const qHigh = document.querySelector('.rec-q[data-q="high"]');
    if (qHigh) {
      setActive('.rec-q', qHigh);
      quality = 'high';
    }
  }

  function openDialog() {
    overlay.classList.add('open');
    applyDefaults();
    resetProgress();
    startBtn.disabled = false;
    startBtn.textContent = tr('rec-start', 'Record');
  }

  function closeDialog() {
    if (capturing) return; // can't close mid-capture; use Cancel to abort first
    overlay.classList.remove('open');
  }

  function resetProgress() {
    progress.classList.remove('running');
    if (bar) bar.style.width = '0%';
    if (progTxt) progTxt.textContent = '';
    if (thumbCtx) thumbCtx.clearRect(0, 0, thumb.width, thumb.height);
  }

  function setProgress(done, total, canvas, etaMs) {
    if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
    const eta = etaMs > 0 ? ` · ~${Math.ceil(etaMs / 1000)}s` : '';
    if (progTxt) progTxt.textContent = `${done} / ${total}${eta}`;
    // Thumbnail every few frames (drawImage of a 2K canvas isn't free).
    if (thumbCtx && canvas && done % 5 === 0) {
      const tw = thumb.width;
      const th = Math.round((tw * canvas.height) / canvas.width);
      if (thumb.height !== th) thumb.height = th;
      thumbCtx.drawImage(canvas, 0, 0, tw, th);
    }
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function record() {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      throw new Error(
        tr('rec-no-webcodecs', 'Video recording needs a Chromium browser (Chrome/Edge).'),
      );
    }

    const width = resW;
    const height = resH;
    const bitrate = Math.min(
      BITRATE_CAP,
      Math.round((BPP[quality] ?? BPP.high) * width * height * fps),
    );

    const config = await pickAvcConfig({ width, height, fps, bitrate });
    if (!config) throw new Error(tr('rec-no-codec', 'No supported H.264 encoder configuration.'));

    const includeCollision = !!document.getElementById('rec-collision')?.checked;
    const includeMinimap = !!document.getElementById('rec-minimap')?.checked;
    const includePins = !!document.getElementById('rec-pins')?.checked;

    // Layout rect for the minimap, read BEFORE we pause/drive anything (so it
    // reflects the live on-screen placement). overlay-px per CSS-px is the same
    // scale the screenshot uses: the scene fills innerWidth CSS px → `width`.
    const minimapRect = includeMinimap
      ? document.getElementById('minimap')?.getBoundingClientRect()
      : null;
    const scale = width / Math.max(1, window.innerWidth);

    pauseRenderLoop();

    const driver = cinema.createCaptureDriver(fps);
    const total = driver.framesPerLoop;

    // Warm the follower through one full loop so its periodic state makes the
    // captured first/last frames match. Pure math — no render.
    for (let i = 0; i < total; i++) driver.step();

    const frame = createFrameRenderer({ renderer, width, height });

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width, height },
      fastStart: 'in-memory',
    });
    let encodeError = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encodeError = e;
      },
    });
    encoder.configure(config);

    // Render at the output aspect (keep the tour's animated FOV) for the whole
    // capture; restored on finish.
    const savedAspect = camera.aspect;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Keep the slicer's editor gizmo out of the video.
    const slicerGroup = slicer?.getGroup?.();
    const slicerVisSaved = slicerGroup ? slicerGroup.visible : null;
    if (slicerGroup) slicerGroup.visible = false;

    const frameDurUs = 1e6 / fps;
    const gop = Math.max(1, Math.round(fps * 2)); // keyframe every ~2 s
    const startT = performance.now();
    let encoded = 0;

    try {
      for (let i = 0; i < total; i++) {
        if (aborted) break;
        driver.step();

        const ctx = frame.renderScene(scene, camera);
        if (includeMinimap) drawMinimap(ctx, width, height, scale, minimapRect);
        if (includePins) drawPinnedCards(ctx, camera, width, height, scale);
        if (includeCollision) drawCollisionInfo(ctx, getLastEventInfo(), scale);

        const vf = new VideoFrame(frame.canvas, {
          timestamp: Math.round(i * frameDurUs),
          duration: Math.round(frameDurUs),
        });
        encoder.encode(vf, { keyFrame: i % gop === 0 });
        vf.close();
        encoded = i + 1;

        const elapsed = performance.now() - startT;
        const eta = (elapsed / encoded) * (total - encoded);
        setProgress(encoded, total, frame.canvas, eta);

        if (encodeError) throw encodeError;
        if (stopEarly) break;

        // Yield to the UI (progress/cancel) and respect encoder backpressure.
        if (encoder.encodeQueueSize > 6 || (i & 7) === 0) {
          await new Promise((r) => setTimeout(r));
        }
      }

      if (!aborted) await encoder.flush();
    } finally {
      if (slicerGroup && slicerVisSaved !== null) slicerGroup.visible = slicerVisSaved;
      try {
        encoder.close();
      } catch (_) {}
      camera.aspect = savedAspect;
      camera.updateProjectionMatrix();
      driver.finish();
      frame.dispose();
      resumeRenderLoop();
    }

    if (aborted || encoded === 0) return null;
    if (encodeError) throw encodeError;

    muxer.finalize();
    const { buffer } = muxer.target;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    download(
      new Blob([buffer], { type: 'video/mp4' }),
      `CGVWEB_${width}x${height}_${fps}fps_${ts}.mp4`,
    );
    return { frames: encoded, total };
  }

  // ── Wiring ──────────────────────────────────────────────────────────────────
  document.querySelectorAll('.rec-res').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (capturing) return;
      setActive('.rec-res', btn);
      resW = parseInt(btn.dataset.w, 10);
      resH = parseInt(btn.dataset.h, 10);
    }),
  );
  document.querySelectorAll('.rec-fps').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (capturing) return;
      setActive('.rec-fps', btn);
      fps = parseInt(btn.dataset.fps, 10);
    }),
  );
  document.querySelectorAll('.rec-q').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (capturing) return;
      setActive('.rec-q', btn);
      quality = btn.dataset.q;
    }),
  );

  document.getElementById('btn-rec')?.addEventListener('click', openDialog);

  cancelBtn?.addEventListener('click', () => {
    if (capturing) {
      aborted = true; // discard the in-progress capture
    } else {
      closeDialog();
    }
  });
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay && !capturing) closeDialog();
  });

  startBtn?.addEventListener('click', async () => {
    if (capturing || !resW || !resH) return;
    capturing = true;
    stopEarly = false;
    aborted = false;
    overlay.classList.add('capturing');
    progress.classList.add('running');
    // Stays enabled during capture so it can act as "stop & save".
    startBtn.textContent = tr('rec-stop', 'Stop & save');
    cancelBtn.textContent = tr('rec-cancel', 'Cancel');

    // While capturing, the start button stops-early (keeps the partial clip).
    const stopHandler = () => {
      if (capturing) stopEarly = true;
    };
    startBtn.addEventListener('click', stopHandler);

    try {
      progTxt.textContent = tr('rec-preparing', 'Preparing…');
      await new Promise((r) => setTimeout(r, 60));
      const res = await record();
      progTxt.textContent = res ? tr('rec-done', 'Saved') : tr('rec-cancelled', 'Cancelled');
      await new Promise((r) => setTimeout(r, res ? 900 : 300));
    } catch (err) {
      progTxt.textContent = tr('rec-error', 'Error: {msg}').replace('{msg}', err.message);
      await new Promise((r) => setTimeout(r, 1800));
    } finally {
      startBtn.removeEventListener('click', stopHandler);
      capturing = false;
      overlay.classList.remove('capturing');
      resetProgress();
      startBtn.textContent = tr('rec-start', 'Record');
      startBtn.disabled = false;
      cancelBtn.textContent = tr('rec-close', 'Close');
      overlay.classList.remove('open');
    }
  });

  return { isCapturing: () => capturing, openDialog };
}
