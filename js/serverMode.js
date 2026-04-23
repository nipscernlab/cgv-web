const MAX_ENTRIES = 100;
const REFRESH_MS = 5000;

function fmtTime(ts) {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const pad = n => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
    const f = await new Promise(res => entry.file(res, () => res(null)));
    if (f && f.name.toLowerCase().endsWith('.xml')) {
      out.push({ file: f, rel: prefix + f.name });
    }
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise(res => reader.readEntries(res, () => res([])));
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
  let folderHandle = null;
  let inputFiles = null;
  let refreshTimer = null;
  let isActive = false;

  const sec = document.getElementById('live-server-sec');
  const listEl = document.getElementById('server-list');
  const emptyEl = document.getElementById('server-empty');
  const refreshBadge = document.getElementById('server-refresh');
  const pickBtn = document.getElementById('btn-server-pick');
  const folderInput = document.getElementById('server-folder-in');

  function keyFor(f, rel) {
    return `${rel || f.name}|${f.size}|${f.lastModified}`;
  }

  function flashRefresh() {
    if (!refreshBadge) return;
    refreshBadge.hidden = false;
    refreshBadge.classList.add('spin');
    clearTimeout(flashRefresh._t);
    flashRefresh._t = setTimeout(() => {
      refreshBadge.classList.remove('spin');
      refreshBadge.hidden = true;
    }, 700);
  }

  function renderList() {
    emptyEl.hidden = entries.length > 0;
    listEl.hidden = entries.length === 0;
    listEl.innerHTML = '';
    entries.forEach((e, idx) => {
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
        listEl.querySelectorAll('.srow.cur').forEach(r => r.classList.remove('cur'));
        row.classList.add('cur');
        await readAndProcess(e.file);
      });
      row.querySelector('.srow-dl').addEventListener('click', ev => {
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
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function updateEntries(rawItems) {
    const sorted = rawItems
      .slice()
      .sort((a, b) => (b.file.lastModified || 0) - (a.file.lastModified || 0))
      .slice(0, MAX_ENTRIES)
      .map(it => ({ ...it, key: keyFor(it.file, it.rel) }));
    const sameLen = sorted.length === entries.length;
    const sameKeys = sameLen && sorted.every((e, i) => e.key === entries[i].key);
    if (!sameKeys) {
      entries = sorted;
      renderList();
    }
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

  async function refreshTick() {
    if (!isActive) return;
    flashRefresh();
    if (folderHandle) await reloadFromHandle();
    scheduleRefresh();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (!isActive) return;
    if (!folderHandle) return;
    refreshTimer = setTimeout(refreshTick, REFRESH_MS);
  }

  function clearRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  async function pickFolder() {
    if (window.showDirectoryPicker) {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        folderHandle = handle;
        inputFiles = null;
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

  folderInput.addEventListener('change', e => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    folderHandle = null;
    inputFiles = files;
    reloadFromInput();
    clearRefresh();
  });

  ['dragenter', 'dragover'].forEach(ev => sec.addEventListener(ev, e => {
    e.preventDefault();
    e.stopPropagation();
    sec.classList.add('dragover');
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }));
  ['dragleave', 'dragend'].forEach(ev => sec.addEventListener(ev, e => {
    if (e.target === sec) sec.classList.remove('dragover');
  }));
  sec.addEventListener('drop', async e => {
    e.preventDefault();
    e.stopPropagation();
    sec.classList.remove('dragover');
    const items = e.dataTransfer?.items ? [...e.dataTransfer.items] : [];
    const out = [];

    const entriesList = items
      .filter(it => it.kind === 'file')
      .map(it => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null))
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
    inputFiles = out.map(o => o.file);
    updateEntries(out);
    clearRefresh();
  });

  function setActive(b) {
    isActive = !!b;
    if (isActive) {
      scheduleRefresh();
    } else {
      clearRefresh();
    }
  }

  return {
    setActive,
    hasEntries: () => entries.length > 0,
  };
}
