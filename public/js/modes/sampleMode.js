// @ts-check
import {
  saveUserXml,
  overwriteUserXml,
  listUserXml,
  readUserXml,
  removeUserXml,
  clearUserXml,
} from './userXmlStore.js';

/**
 * One row in the sample list. `source` carries exactly one of url (built-in
 * test sample), opfsId (persisted user file) or file (in-session user file).
 * @typedef {Object} SampleEntry
 * @property {string} display
 * @property {'test' | 'user'} kind
 * @property {{ url?: string, file?: File, opfsId?: string }} source
 * @property {string} key
 */

/**
 * @param {{
 *   advanceProgress: (stage: string) => void,
 *   endProgress: () => void,
 *   esc: (s: string) => string,
 *   processXml: (xml: string) => void,
 *   setStatus: (html: string) => void,
 *   startProgress: () => void,
 *   t: (key: string) => string,
 * }} deps
 */
export function setupSampleMode({
  advanceProgress,
  endProgress,
  esc,
  processXml,
  setStatus,
  startProgress,
  t,
}) {
  let sampleLoaded = false;
  /** @type {SampleEntry[]} */
  let entries = [];
  /** @type {string | null} */
  let currentKey = null;
  let seq = 0;

  const listEl = /** @type {HTMLElement} */ (document.getElementById('sample-list'));
  const msgEl = /** @type {HTMLElement} */ (document.getElementById('sample-list-msg'));
  const sec = /** @type {HTMLElement} */ (document.getElementById('sample-sec'));
  const addBtn = /** @type {HTMLElement} */ (document.getElementById('btn-sample-add'));
  const clearBtn = /** @type {HTMLElement} */ (document.getElementById('btn-sample-clear'));
  const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('sample-file-in'));

  function syncClearVisibility() {
    clearBtn.hidden = entries.length === 0;
  }

  function renderList() {
    listEl.innerHTML = '';
    entries.forEach((entry) => {
      const btn = document.createElement('div');
      btn.className = 'sample-item' + (entry.key === currentKey ? ' cur' : '');
      const iconHtml =
        entry.kind === 'test'
          ? `<svg class="ic sample-item-icon" style="width:11px;height:11px"><use href="#i-star"/></svg>`
          : `<i class="ti ti-file-code sample-item-icon" style="font-size:11px"></i>`;
      const subKey = entry.kind === 'test' ? 'sample-sub-test' : 'sample-sub-user';
      btn.innerHTML = `
        ${iconHtml}
        <div class="sample-item-info">
          <div class="sample-item-name">${esc(entry.display)}</div>
          <div class="sample-item-sub" data-i18n="${subKey}">${esc(t(subKey))}</div>
        </div>
        <button class="sample-item-x" data-tip="Remove from list" data-i18n-tip="tip-sample-remove">
          <svg class="ic" style="width:9px;height:9px;stroke-width:2.2"><use href="#i-x"/></svg>
        </button>`;
      btn.addEventListener('click', (ev) => {
        if (/** @type {HTMLElement | null} */ (ev.target)?.closest('.sample-item-x')) return;
        load(entry, btn);
      });
      btn.querySelector('.sample-item-x')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        removeEntry(entry.key);
      });
      listEl.appendChild(btn);
    });
    syncClearVisibility();
  }

  /**
   * @param {SampleEntry} entry
   * @param {HTMLElement} rowEl
   */
  async function load(entry, rowEl) {
    document.querySelectorAll('.sample-item.cur').forEach((b) => b.classList.remove('cur'));
    rowEl.classList.add('cur');
    currentKey = entry.key;
    setStatus('Loading sample…');
    startProgress();
    advanceProgress('request');
    try {
      let xmlText = '';
      if (entry.source.url) {
        const res = await fetch(entry.source.url);
        advanceProgress('download');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        xmlText = await res.text();
      } else if (entry.source.opfsId) {
        advanceProgress('acquire');
        xmlText = await readUserXml(entry.source.opfsId);
      } else if (entry.source.file) {
        advanceProgress('acquire');
        xmlText = await entry.source.file.text();
      }
      advanceProgress('load');
      processXml(xmlText);
      endProgress();
    } catch (err) {
      endProgress();
      setStatus(
        `<span class="err">Error: ${esc(err instanceof Error ? err.message : String(err))}</span>`,
      );
      rowEl.classList.remove('cur');
    }
  }

  /** @param {string} key */
  function removeEntry(key) {
    const entry = entries.find((e) => e.key === key);
    entries = entries.filter((e) => e.key !== key);
    if (currentKey === key) currentKey = null;
    renderList();
    if (entry && entry.source.opfsId) removeUserXml(entry.source.opfsId);
  }

  function clearAll() {
    entries = [];
    currentKey = null;
    renderList();
    clearUserXml();
  }

  // Persist each added file to OPFS so the user list survives reloads; if OPFS
  // is unavailable, saveUserXml returns null and we keep the file in-session
  // only (the previous behaviour). async so callers await it sequentially,
  // which serialises the OPFS index read-modify-write.
  /** @param {File} file */
  async function addUserFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.xml')) return;
    // Dedupe by name: re-adding a same-named file refreshes the existing
    // entry's content in place instead of creating a second copy.
    const existing = entries.find((e) => e.kind === 'user' && e.display === file.name);
    if (existing) {
      if (existing.source.opfsId) await overwriteUserXml(existing.source.opfsId, file);
      else existing.source.file = file;
      renderList();
      return;
    }
    const id = await saveUserXml(file.name, file);
    entries.unshift(
      id
        ? { display: file.name, kind: 'user', source: { opfsId: id }, key: `u:${id}` }
        : { display: file.name, kind: 'user', source: { file }, key: `u:${++seq}` },
    );
    renderList();
  }

  // Rebuild the persisted user entries from OPFS on startup.
  async function restoreUserEntries() {
    const metas = await listUserXml(); // most-recent first
    if (!metas.length) return;
    entries = entries.concat(
      metas.map(
        (m) =>
          /** @type {SampleEntry} */ ({
            display: m.name,
            kind: 'user',
            source: { opfsId: m.id },
            key: `u:${m.id}`,
          }),
      ),
    );
    renderList();
  }

  async function loadSampleIndex() {
    if (sampleLoaded) return;
    msgEl.textContent = t('sample-loading');
    msgEl.hidden = false;

    try {
      const res = await fetch('./default_xml/index.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const names = /** @type {string[]} */ (await res.json());
      msgEl.hidden = true;
      if (!names.length) {
        msgEl.textContent = t('sample-empty');
        msgEl.hidden = false;
        return;
      }
      const testEntries = names.map(
        (name) =>
          /** @type {SampleEntry} */ ({
            display: `test_${name}`,
            kind: 'test',
            source: { url: `./default_xml/${encodeURIComponent(name)}` },
            key: `t:${name}`,
          }),
      );
      entries = testEntries.concat(entries.filter((e) => e.kind === 'user'));
      renderList();
      sampleLoaded = true;
    } catch (_) {
      msgEl.textContent = t('sample-error');
      msgEl.hidden = false;
    }
  }

  addBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files ?? [])];
    fileInput.value = '';
    for (const f of files) await addUserFile(f);
  });
  clearBtn.addEventListener('click', clearAll);

  ['dragenter', 'dragover'].forEach((ev) =>
    sec.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      sec.classList.add('dragover');
      const dt = /** @type {DragEvent} */ (e).dataTransfer;
      if (dt) dt.dropEffect = 'copy';
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
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) =>
      f.name.toLowerCase().endsWith('.xml'),
    );
    for (const f of files) await addUserFile(f);
  });

  syncClearVisibility();
  restoreUserEntries();

  return { loadSampleIndex };
}
