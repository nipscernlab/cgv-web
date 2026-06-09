// @ts-check
// Generic "collection picker" dropdown shared by the jet (L3) and cluster (L2)
// selectors in rpanel2. Custom listbox (not a native <select>) positioned in
// viewport coordinates so it can escape rpanel's transformed containing block.
//
// The cluster picker additionally offers a leading "All collections" row
// (includeAll) that selects the ALL pseudo-key — the historical merge-every-
// collection behaviour. Jets don't use it.

import { t } from '../i18n/index.js';

/**
 * @param {{
 *   trigger: HTMLElement | null,
 *   label: HTMLElement | null,
 *   menu: HTMLElement | null,
 *   optClass: string,
 *   getCollections: () => Array<{ key: string }>,
 *   getActiveKey: () => string | null,
 *   setActiveKey: (key: string) => void,
 *   onStateChange: (cb: () => void) => void,
 *   countOf: (coll: any) => number,
 *   includeAll?: boolean,
 *   allKey?: string,
 *   allLabelKey?: string,
 * }} opts
 */
export function setupCollectionDropdown({
  trigger,
  label,
  menu,
  optClass,
  getCollections,
  getActiveKey,
  setActiveKey,
  onStateChange,
  countOf,
  includeAll = false,
  allKey = '',
  allLabelKey = '',
}) {
  if (!trigger || !label || !menu) {
    return { sync() {}, close() {}, setVisible(/** @type {boolean} */ _show) {} };
  }
  // Non-null aliases so the nested closures below don't re-widen these back to
  // `HTMLElement | null` (TS can't prove a captured outer binding stays narrowed).
  const trig = trigger;
  const lab = label;
  const men = menu;

  function close() {
    men.classList.remove('open');
    trig.setAttribute('aria-expanded', 'false');
  }

  function position() {
    const br = trig.getBoundingClientRect();
    const mw = men.offsetWidth;
    const mh = men.offsetHeight;
    // Anchor the menu's top-right to the trigger's bottom-right, then clamp so
    // it never spills off-screen (flip above the trigger when short on room).
    let left = br.right - mw;
    let top = br.bottom + 6;
    left = Math.max(6, Math.min(left, window.innerWidth - mw - 6));
    if (top + mh > window.innerHeight - 6) {
      top = Math.max(6, br.top - mh - 6);
    }
    men.style.left = `${left}px`;
    men.style.top = `${top}px`;
  }

  function open() {
    // Display first so we can measure, then position, then add .open on the
    // next frame to let the animation play from the start state.
    men.style.display = 'flex';
    men.style.visibility = 'hidden';
    position();
    men.style.visibility = '';
    requestAnimationFrame(() => {
      men.classList.add('open');
      trig.setAttribute('aria-expanded', 'true');
    });
  }

  /**
   * @param {string} key
   * @param {string} name
   * @param {number} count
   * @param {string | null} activeKey
   * @param {string} [i18nKey]  data-i18n key so the row localises on lang switch
   */
  function addRow(key, name, count, activeKey, i18nKey) {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = optClass;
    opt.setAttribute('role', 'option');
    opt.dataset.key = key;
    if (key === activeKey) {
      opt.classList.add('on');
      opt.setAttribute('aria-selected', 'true');
    }
    const nameEl = document.createElement('span');
    nameEl.className = `${optClass}-name`;
    if (i18nKey) nameEl.dataset.i18n = i18nKey;
    nameEl.textContent = name;
    const countEl = document.createElement('span');
    countEl.className = `${optClass}-count`;
    countEl.textContent = String(count);
    opt.appendChild(nameEl);
    opt.appendChild(countEl);
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      setActiveKey(key);
      close();
    });
    men.appendChild(opt);
  }

  // Rebuild the menu rows + trigger label from the current collections/active
  // key. Called on every state change and once at setup.
  function sync() {
    const colls = getCollections();
    const activeKey = getActiveKey();
    men.innerHTML = '';
    if (includeAll && colls.length) {
      const total = colls.reduce((n, c) => n + countOf(c), 0);
      addRow(allKey, t(allLabelKey), total, activeKey, allLabelKey);
    }
    for (const c of colls) addRow(c.key, c.key, countOf(c), activeKey);
    // Trigger label: the localised "All" name when the All key is active (kept
    // in sync on language switch via data-i18n), else the raw collection key.
    if (includeAll && activeKey === allKey) {
      lab.dataset.i18n = allLabelKey;
      lab.textContent = t(allLabelKey);
    } else {
      delete lab.dataset.i18n;
      lab.textContent = activeKey || '—';
    }
    if (men.classList.contains('open')) position();
  }

  trig.addEventListener('click', (e) => {
    e.stopPropagation();
    men.classList.contains('open') ? close() : open();
  });
  document.addEventListener('click', (e) => {
    if (!men.classList.contains('open')) return;
    if (e.target === men || men.contains(/** @type {Node} */ (e.target))) return;
    close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && men.classList.contains('open')) close();
  });
  window.addEventListener('resize', () => {
    if (men.classList.contains('open')) position();
  });
  window.addEventListener(
    'scroll',
    () => {
      if (men.classList.contains('open')) position();
    },
    true,
  );

  onStateChange(sync);
  sync();

  return {
    sync,
    close,
    /** @param {boolean} show */
    setVisible(show) {
      trig.style.display = show ? '' : 'none';
      if (!show) close();
    },
  };
}
