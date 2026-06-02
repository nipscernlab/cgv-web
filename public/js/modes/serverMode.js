import { dateGroup } from '../utils.js';

const MAX_ENTRIES = 100;
const REFRESH_MS = 5000;
// Resolve the /api/xml endpoint relative to where this module was actually
// loaded from, not relative to the page URL. This file lives at
// <app-root>/js/modes/serverMode.js, so two ".." steps land on <app-root>/
// (e.g. https://host/cgv-web/  ->  https://host/cgv-web/api/xml). This keeps
// the SERVER (live-folder) endpoints working whatever prefix the app is
// mounted under, and is robust to a missing trailing-slash redirect on the
// front-end host -- a plain "./api/xml" would resolve to the wrong place if
// the page is served as ".../cgv-web" without the trailing slash.
const REMOTE_API = new URL('../../api/xml', import.meta.url).href;
const HAS_FSA = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
// localStorage key for the per-origin remote folder choice. Each browser
// (each tab/PC) keeps its own; the backend no longer holds shared state.
const STORAGE_KEY = 'cgv-server-folder';
// Quick-set folder buttons (control-room one-tap stream switch). Defaults are
// the ATLAS P1 stream folders, which all live as siblings inside the same
// EventDisplayEvent directory as physics_Main — so a bare folder name is
// resolved against the parent of the current folder. The gear lets the
// operator rename buttons or paste full absolute paths; saved per-browser.
const QUICK_STORAGE_KEY = 'cgv-server-quickpaths';
const QUICK_SLOTS = 4;
const DEFAULT_QUICK_SLOTS = [
  { label: 'physics_Main', path: 'physics_Main' },
  { label: 'express_express', path: 'express_express' },
  { label: 'physics_CosmicMuons', path: 'physics_CosmicMuons' },
  { label: 'Public', path: 'Public' },
];

function cloneDefaultQuickSlots() {
  return DEFAULT_QUICK_SLOTS.map((s) => ({ ...s }));
}

function readQuickSlots() {
  try {
    const raw = localStorage.getItem(QUICK_STORAGE_KEY);
    if (!raw) return cloneDefaultQuickSlots();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return cloneDefaultQuickSlots();
    return Array.from({ length: QUICK_SLOTS }, (_, i) => {
      const s = arr[i] || {};
      const path = typeof s.path === 'string' ? s.path.trim() : '';
      const label =
        (typeof s.label === 'string' && s.label.trim()) ||
        path ||
        DEFAULT_QUICK_SLOTS[i]?.label ||
        `Folder ${i + 1}`;
      return { label, path };
    });
  } catch (_) {
    return cloneDefaultQuickSlots();
  }
}

function writeQuickSlots(slots) {
  try {
    localStorage.setItem(QUICK_STORAGE_KEY, JSON.stringify(slots));
  } catch (_) {}
}

// Path helpers that tolerate both POSIX ('/') and Windows ('\') separators —
// P1 is Linux but a dev laptop may not be.
function stripTrailingSep(p) {
  return String(p || '').replace(/[\\/]+$/, '');
}
function parentDir(p) {
  const s = stripTrailingSep(p);
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i >= 0 ? s.slice(0, i) : '';
}
function isAbsolutePath(p) {
  return /^([/\\]|[A-Za-z]:[\\/])/.test(p || '');
}
function joinPath(base, name) {
  if (!base) return name;
  const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  return stripTrailingSep(base) + sep + name;
}

function fmtTime(ts) {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function readSavedPath() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch (_) {
    return null;
  }
}

function writeSavedPath(path) {
  try {
    if (path) localStorage.setItem(STORAGE_KEY, path);
    else localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

async function walkDirectoryHandle(dirHandle, out, prefix = '') {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      if (!entry.name.toLowerCase().endsWith('.xml')) continue;
      try {
        const f = await entry.getFile();
        out.push({ file: f, rel: prefix + entry.name });
      } catch (_) {}
    } else if (entry.kind === 'directory') {
      await walkDirectoryHandle(entry, out, prefix + entry.name + '/');
    }
  }
}

async function walkDataTransferEntry(entry, out, prefix = '') {
  if (!entry) return;
  if (entry.isFile) {
    const f = await new Promise((res) => entry.file(res, () => res(null)));
    if (f && f.name.toLowerCase().endsWith('.xml')) {
      out.push({ file: f, rel: prefix + f.name });
    }
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((res) => reader.readEntries(res, () => res([])));
      for (const child of batch) {
        await walkDataTransferEntry(child, out, prefix + entry.name + '/');
      }
    } while (batch.length);
  }
}

export function setupServerMode({
  advanceProgress,
  endProgress,
  esc,
  processXml,
  setStatus,
  startProgress,
  t,
}) {
  let entries = [];
  let currentKey = null;
  let lastAutoLoadedKey = null;
  let folderHandle = null;
  let inputFiles = null;
  let refreshTimer = null;
  let isActive = false;
  let isPaused = false;
  let canPoll = false;
  let remoteMode = false;
  let remoteProbing = false;
  let remoteFolderPath = null;
  let remoteDefaultPath = null;
  let quickSlots = readQuickSlots();

  const sec = document.getElementById('live-server-sec');
  const listEl = document.getElementById('server-list');
  const emptyEl = document.getElementById('server-empty');
  const refreshBtn = document.getElementById('server-refresh-btn');
  const pickBtn = document.getElementById('btn-server-pick');
  const folderInput = document.getElementById('server-folder-in');
  const remoteBar = document.getElementById('server-remote-bar');
  const remoteFolderBtn = document.getElementById('server-folder-cur');
  const remoteFolderText = document.getElementById('server-folder-cur-text');
  const remoteEditRow = document.getElementById('server-folder-edit');
  const remoteEditInput = document.getElementById('server-folder-input');
  const remoteApplyBtn = document.getElementById('server-folder-apply');
  const remoteCancelBtn = document.getElementById('server-folder-cancel');
  const remoteErrorEl = document.getElementById('server-folder-error');
  const apiHintEl = document.getElementById('server-api-hint');
  const quickWrap = document.getElementById('server-quick');
  const quickBtnsEl = document.getElementById('server-quick-btns');
  const quickGearBtn = document.getElementById('server-quick-gear');
  const quickEditEl = document.getElementById('server-quick-edit');
  const quickRowsEl = document.getElementById('server-quick-rows');
  const quickSaveBtn = document.getElementById('server-quick-save');
  const quickResetBtn = document.getElementById('server-quick-reset');

  function keyFor(f, rel) {
    return `${rel || f.name}|${f.size}|${f.lastModified}`;
  }

  function syncRefreshBtn() {
    if (!refreshBtn) return;
    refreshBtn.classList.remove('state-active', 'state-paused');
    if (!canPoll) {
      refreshBtn.hidden = true;
      return;
    }
    // In remote mode the button is meaningful only when a folder is set;
    // otherwise polling has nothing to refresh.
    if (remoteMode && !remoteFolderPath) {
      refreshBtn.hidden = true;
      return;
    }
    refreshBtn.hidden = false;
    if (isPaused) {
      refreshBtn.classList.add('state-paused');
      refreshBtn.dataset.i18nTip = 'tip-poll-play';
      refreshBtn.dataset.tip = t('tip-poll-play');
    } else {
      refreshBtn.classList.add('state-active');
      refreshBtn.dataset.i18nTip = 'tip-poll-stop';
      refreshBtn.dataset.tip = t('tip-poll-stop');
    }
  }

  function flashRefresh() {
    if (!refreshBtn || !canPoll || isPaused) return;
    refreshBtn.classList.remove('spin');
    void refreshBtn.offsetWidth;
    refreshBtn.classList.add('spin');
    clearTimeout(flashRefresh._t);
    flashRefresh._t = setTimeout(() => {
      refreshBtn.classList.remove('spin');
    }, 750);
  }

  function renderList() {
    emptyEl.hidden = entries.length > 0;
    listEl.hidden = entries.length === 0;
    listEl.innerHTML = '';
    let lastGroupKey = null;
    entries.forEach((e, idx) => {
      const group = dateGroup(e.file.lastModified, t);
      if (group.key !== lastGroupKey) {
        lastGroupKey = group.key;
        const sep = document.createElement('div');
        sep.className = 'date-sep';
        sep.textContent = group.label;
        listEl.appendChild(sep);
      }
      const row = document.createElement('div');
      row.className = 'srow' + (e.key === currentKey ? ' cur' : '');
      const shortName = e.rel.split('/').pop();
      row.innerHTML = `
        <div class="srow-info">
          <div class="srow-name">${esc(shortName)}</div>
          <div class="srow-time">#${idx + 1} · ${fmtTime(e.file.lastModified)}</div>
        </div>
        <button class="srow-dl" data-tip="Download XML" data-i18n-tip="tip-server-dl">
          <svg class="ic" style="width:11px;height:11px"><use href="#i-dl"/></svg>
        </button>`;
      row.querySelector('.srow-info').addEventListener('click', async () => {
        currentKey = e.key;
        listEl.querySelectorAll('.srow.cur').forEach((r) => r.classList.remove('cur'));
        row.classList.add('cur');
        await readAndProcess(e.file);
      });
      row.querySelector('.srow-dl').addEventListener('click', (ev) => {
        ev.stopPropagation();
        downloadFile(e.file, shortName);
      });
      listEl.appendChild(row);
    });
  }

  async function readAndProcess(file) {
    setStatus('Reading file…');
    startProgress('local');
    advanceProgress('acquire');
    try {
      const text = await file.text();
      advanceProgress('load');
      processXml(text);
      endProgress();
    } catch (err) {
      endProgress();
      setStatus(`<span class="err">Read error: ${esc(err.message)}</span>`);
    }
  }

  function downloadFile(file, name) {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function updateEntries(rawItems) {
    const sorted = rawItems
      .slice()
      .sort((a, b) => {
        const dt = (b.file.lastModified || 0) - (a.file.lastModified || 0);
        if (dt !== 0) return dt;
        const ds = (b.file.size || 0) - (a.file.size || 0);
        if (ds !== 0) return ds;
        return (a.rel || '').localeCompare(b.rel || '');
      })
      .slice(0, MAX_ENTRIES)
      .map((it) => ({ ...it, key: keyFor(it.file, it.rel) }));
    const sameLen = sorted.length === entries.length;
    const sameKeys = sameLen && sorted.every((e, i) => e.key === entries[i].key);
    if (!sameKeys) {
      entries = sorted;
      renderList();
    }
    maybeAutoLoadTop();
  }

  function maybeAutoLoadTop() {
    if (!entries.length) return;
    const top = entries[0];
    if (top.key === lastAutoLoadedKey) return;
    lastAutoLoadedKey = top.key;
    currentKey = top.key;
    listEl.querySelectorAll('.srow.cur').forEach((r) => r.classList.remove('cur'));
    const firstRow = listEl.querySelector('.srow');
    if (firstRow) firstRow.classList.add('cur');
    readAndProcess(top.file);
  }

  async function reloadFromHandle() {
    if (!folderHandle) return;
    try {
      const out = [];
      await walkDirectoryHandle(folderHandle, out);
      updateEntries(out);
    } catch (err) {
      console.warn('[serverMode] reload failed:', err);
    }
  }

  function reloadFromInput() {
    if (!inputFiles) return;
    const out = [];
    for (const f of inputFiles) {
      if (f.name.toLowerCase().endsWith('.xml')) {
        out.push({ file: f, rel: f.webkitRelativePath || f.name });
      }
    }
    updateEntries(out);
  }

  function makeRemoteFile(meta, folder) {
    const url =
      `${REMOTE_API}/file?path=${encodeURIComponent(folder)}` +
      `&name=${encodeURIComponent(meta.name)}`;
    return {
      name: meta.name,
      size: meta.size,
      lastModified: meta.mtime,
      async text() {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      },
    };
  }

  async function reloadFromRemote() {
    if (!remoteFolderPath) return;
    const folder = remoteFolderPath;
    try {
      const r = await fetch(`${REMOTE_API}/list?path=${encodeURIComponent(folder)}`, {
        cache: 'no-store',
      });
      if (!r.ok) {
        // Folder went away, became unreadable, or any 4xx: clear the list
        // but keep the bar so the operator can fix the path.
        entries = [];
        renderList();
        return;
      }
      const list = await r.json();
      const out = list.map((it) => ({ file: makeRemoteFile(it, folder), rel: it.name }));
      updateEntries(out);
    } catch (err) {
      console.warn('[serverMode] remote reload failed:', err);
    }
  }

  async function refreshTick() {
    if (!isActive || isPaused) return;
    flashRefresh();
    if (remoteMode) {
      if (remoteFolderPath) await reloadFromRemote();
    } else if (folderHandle) {
      await reloadFromHandle();
    }
    scheduleRefresh();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (!isActive || isPaused) return;
    if (remoteMode) {
      if (!remoteFolderPath) return;
    } else if (!folderHandle) {
      return;
    }
    refreshTimer = setTimeout(refreshTick, REFRESH_MS);
  }

  function clearRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  function showFallbackWarning() {
    const main = esc(t('server-no-watch'));
    const tip = HAS_FSA ? '' : ` <span class="warn-tip">${esc(t('server-try-chromium'))}</span>`;
    setStatus(`<span class="warn">${main}${tip}</span>`);
  }

  async function pickFolder() {
    if (window.showDirectoryPicker) {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        folderHandle = handle;
        inputFiles = null;
        showApiHint(false);
        canPoll = true;
        isPaused = false;
        lastAutoLoadedKey = null;
        syncRefreshBtn();
        await reloadFromHandle();
        scheduleRefresh();
      } catch (err) {
        if (err && err.name !== 'AbortError') {
          console.warn('[serverMode] directory picker failed, falling back:', err);
          folderInput.click();
        }
      }
    } else {
      folderInput.click();
    }
  }

  pickBtn.addEventListener('click', pickFolder);

  folderInput.addEventListener('change', (e) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    folderHandle = null;
    inputFiles = files;
    showApiHint(false);
    canPoll = false;
    isPaused = false;
    lastAutoLoadedKey = null;
    syncRefreshBtn();
    reloadFromInput();
    clearRefresh();
    showFallbackWarning();
  });

  refreshBtn?.addEventListener('click', () => {
    if (!canPoll) return;
    if (isPaused) {
      isPaused = false;
      syncRefreshBtn();
      refreshTick();
    } else {
      isPaused = true;
      clearRefresh();
      syncRefreshBtn();
    }
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    sec.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      sec.classList.add('dragover');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    }),
  );
  ['dragleave', 'dragend'].forEach((ev) =>
    sec.addEventListener(ev, (e) => {
      if (e.target === sec) sec.classList.remove('dragover');
    }),
  );
  sec.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    sec.classList.remove('dragover');
    const items = e.dataTransfer?.items ? [...e.dataTransfer.items] : [];
    const out = [];

    const entriesList = items
      .filter((it) => it.kind === 'file')
      .map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null))
      .filter(Boolean);

    if (entriesList.length) {
      for (const en of entriesList) await walkDataTransferEntry(en, out);
    } else if (e.dataTransfer?.files?.length) {
      for (const f of e.dataTransfer.files) {
        if (f.name.toLowerCase().endsWith('.xml')) {
          out.push({ file: f, rel: f.webkitRelativePath || f.name });
        }
      }
    }

    if (!out.length) return;
    folderHandle = null;
    inputFiles = out.map((o) => o.file);
    showApiHint(false);
    canPoll = false;
    isPaused = false;
    lastAutoLoadedKey = null;
    syncRefreshBtn();
    updateEntries(out);
    clearRefresh();
    showFallbackWarning();
  });

  function setActive(b) {
    isActive = !!b;
    if (isActive) {
      // Re-probe each time the SERVER sub-tab is opened, so the remote bar
      // appears without a page reload once the reverse proxy is fixed (the
      // initial boot probe runs only once). No-op if already in remote mode.
      if (!remoteMode) tryEnterRemoteMode();
      scheduleRefresh();
    } else {
      clearRefresh();
    }
  }

  // ── Remote mode (server-side folder via /api/xml/*) ───────────────────
  // Only nudge the operator about a dead backend where one is actually
  // expected: localhost (dev) or a CERN host (the P1 deployment). On the
  // public static demo (nipscern.com, *.pages.dev, …) there is deliberately
  // no backend, so the SERVER mode is meant to be local-only and we stay
  // silent.
  function expectsBackend() {
    if (typeof location === 'undefined') return false;
    const h = location.hostname || '';
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.cern.ch');
  }

  function showApiHint(show) {
    if (apiHintEl) apiHintEl.hidden = !show;
  }

  function updateRemoteFolderDisplay() {
    if (!remoteFolderText) return;
    remoteFolderText.textContent = remoteFolderPath || t('server-folder-not-set');
    if (remoteFolderBtn) remoteFolderBtn.title = remoteFolderPath || '';
  }

  function showRemoteError(msg) {
    if (!remoteErrorEl) return;
    if (!msg) {
      remoteErrorEl.hidden = true;
      remoteErrorEl.textContent = '';
      return;
    }
    remoteErrorEl.hidden = false;
    remoteErrorEl.textContent = msg;
  }

  function openFolderEdit() {
    if (!remoteEditRow) return;
    showRemoteError('');
    remoteEditInput.value = remoteFolderPath || '';
    remoteEditRow.hidden = false;
    if (remoteBar) remoteBar.hidden = true;
    setTimeout(() => remoteEditInput.focus(), 0);
  }

  function closeFolderEdit() {
    if (!remoteEditRow) return;
    remoteEditRow.hidden = true;
    if (remoteBar) remoteBar.hidden = false;
    showRemoteError('');
  }

  // Core folder switch shared by the pencil edit and the quick-set buttons.
  // Validates by listing; on success it becomes the active folder and the
  // list/poll restart. Returns true on success, false on a (shown) error.
  async function applyFolder(rawPath) {
    const path = (rawPath || '').trim();
    if (!path) return false;
    showRemoteError('');
    try {
      // Validate by listing. The backend returns 4xx if the path is
      // missing/unreadable, with a JSON {"error": "..."} body we can show.
      const r = await fetch(`${REMOTE_API}/list?path=${encodeURIComponent(path)}`, {
        cache: 'no-store',
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${r.status}`);
      }
      const list = await r.json();
      remoteFolderPath = path;
      writeSavedPath(path);
      updateRemoteFolderDisplay();
      renderQuickButtons();
      lastAutoLoadedKey = null;
      currentKey = null;
      closeFolderEdit();
      const out = list.map((it) => ({ file: makeRemoteFile(it, path), rel: it.name }));
      updateEntries(out);
      syncRefreshBtn();
      scheduleRefresh();
      return true;
    } catch (err) {
      showRemoteError(err.message || String(err));
      return false;
    }
  }

  function applyFolderEdit() {
    return applyFolder(remoteEditInput?.value || '');
  }

  // ── Quick-set folder buttons (control-room one-tap stream switch) ───────
  // Base directory the bare folder names resolve against: the parent of the
  // folder the operator is currently on (or the backend default). For the P1
  // layout every stream is a sibling inside EventDisplayEvent, so the parent
  // of physics_Main resolves express_express, physics_CosmicMuons, Public too.
  // A slot whose value is an absolute path is used verbatim instead.
  function quickBase() {
    return parentDir(remoteFolderPath || remoteDefaultPath || '');
  }
  function resolveQuickPath(slotPath) {
    const p = (slotPath || '').trim();
    if (!p) return null;
    if (isAbsolutePath(p)) return p;
    const base = quickBase();
    return base ? joinPath(base, p) : p;
  }
  function renderQuickButtons() {
    if (!quickBtnsEl) return;
    quickBtnsEl.innerHTML = '';
    const cur = stripTrailingSep(remoteFolderPath);
    quickSlots.forEach((slot, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'server-quick-btn';
      btn.textContent = slot.label || slot.path || `#${idx + 1}`;
      const resolved = resolveQuickPath(slot.path);
      btn.title = resolved || slot.label || '';
      if (!resolved) {
        btn.disabled = true;
      } else {
        if (stripTrailingSep(resolved) === cur) btn.classList.add('cur');
        btn.addEventListener('click', () => applyFolder(resolved));
      }
      quickBtnsEl.appendChild(btn);
    });
  }
  function updateQuickVisible() {
    if (quickWrap) quickWrap.hidden = !remoteMode;
  }
  function renderQuickEditRows() {
    if (!quickRowsEl) return;
    quickRowsEl.innerHTML = '';
    for (let i = 0; i < QUICK_SLOTS; i++) {
      const slot = quickSlots[i] || { label: '', path: '' };
      const row = document.createElement('div');
      row.className = 'server-quick-erow';

      const num = document.createElement('span');
      num.className = 'server-quick-erow-num';
      num.textContent = String(i + 1);

      const lab = document.createElement('input');
      lab.type = 'text';
      lab.className = 'qe-label';
      lab.value = slot.label || '';
      lab.placeholder = t('quick-ph-label');
      lab.dataset.i18nPh = 'quick-ph-label';

      const pth = document.createElement('input');
      pth.type = 'text';
      pth.className = 'qe-path';
      pth.value = slot.path || '';
      pth.placeholder = t('quick-ph-path');
      pth.dataset.i18nPh = 'quick-ph-path';

      row.append(num, lab, pth);
      quickRowsEl.appendChild(row);
    }
  }
  function openQuickEdit() {
    renderQuickEditRows();
    if (quickEditEl) quickEditEl.hidden = false;
    quickGearBtn?.classList.add('on');
  }
  function closeQuickEdit() {
    if (quickEditEl) quickEditEl.hidden = true;
    quickGearBtn?.classList.remove('on');
  }
  function toggleQuickEdit() {
    if (quickEditEl && quickEditEl.hidden) openQuickEdit();
    else closeQuickEdit();
  }
  function saveQuickEdit() {
    if (!quickRowsEl) return;
    const rows = [...quickRowsEl.querySelectorAll('.server-quick-erow')];
    quickSlots = rows.map((row, i) => {
      const path = (row.querySelector('.qe-path')?.value || '').trim();
      const label =
        (row.querySelector('.qe-label')?.value || '').trim() || path || `Folder ${i + 1}`;
      return { label, path };
    });
    writeQuickSlots(quickSlots);
    renderQuickButtons();
    closeQuickEdit();
  }
  function resetQuickEdit() {
    quickSlots = cloneDefaultQuickSlots();
    writeQuickSlots(quickSlots);
    renderQuickEditRows();
    renderQuickButtons();
  }

  // When the probe fails, surface a subtle, non-blocking hint instead of just
  // leaving the pencil hidden — but only on a backend-expecting host and only
  // while no local folder is in use (the hint is about the SERVER capability).
  function failRemote() {
    if (!remoteMode && !folderHandle && !inputFiles) showApiHint(expectsBackend());
    return false;
  }

  async function tryEnterRemoteMode() {
    if (remoteMode || remoteProbing) return remoteMode;
    remoteProbing = true;
    try {
      const r = await fetch(`${REMOTE_API}/default`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) return failRemote();
      // Guard against static hosts (Cloudflare Pages, etc.) and a reverse
      // proxy that 404s /api/xml as a static lookup; both can return HTML,
      // so only accept a JSON body with a `path` key.
      const ct = r.headers.get('content-type') || '';
      if (!ct.toLowerCase().includes('json')) return failRemote();
      const data = await r.json();
      if (!data || typeof data !== 'object' || !('path' in data)) return failRemote();
      remoteMode = true;
      remoteDefaultPath = typeof data.path === 'string' ? data.path : null;
      // Prefer this client's previously chosen path (per-origin localStorage);
      // fall back to the backend-supplied default for first-time visits.
      const saved = readSavedPath();
      remoteFolderPath = saved || data.path || null;
      // Hide the local picker and the hint; show the remote bar.
      showApiHint(false);
      if (pickBtn) pickBtn.hidden = true;
      if (remoteBar) remoteBar.hidden = false;
      updateRemoteFolderDisplay();
      updateQuickVisible();
      renderQuickButtons();
      canPoll = true;
      isPaused = false;
      syncRefreshBtn();
      if (remoteFolderPath) await reloadFromRemote();
      return true;
    } catch (_) {
      return failRemote();
    } finally {
      remoteProbing = false;
    }
  }

  if (remoteFolderBtn) remoteFolderBtn.addEventListener('click', openFolderEdit);
  if (remoteApplyBtn) remoteApplyBtn.addEventListener('click', applyFolderEdit);
  if (remoteCancelBtn) remoteCancelBtn.addEventListener('click', closeFolderEdit);
  if (remoteEditInput) {
    remoteEditInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyFolderEdit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeFolderEdit();
      }
    });
  }

  if (quickGearBtn) quickGearBtn.addEventListener('click', toggleQuickEdit);
  if (quickSaveBtn) quickSaveBtn.addEventListener('click', saveQuickEdit);
  if (quickResetBtn) quickResetBtn.addEventListener('click', resetQuickEdit);
  renderQuickButtons();
  updateQuickVisible();

  syncRefreshBtn();
  tryEnterRemoteMode();

  return {
    setActive,
    hasEntries: () => entries.length > 0,
  };
}
