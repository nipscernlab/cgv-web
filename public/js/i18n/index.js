// @ts-check
import { TRANSLATIONS } from './translations.js';

let currentLang = 'en';

/** @param {string} key */
export function t(key) {
  return (TRANSLATIONS[currentLang] ?? TRANSLATIONS.en)[key] ?? TRANSLATIONS.en[key] ?? key;
}

/** @param {string} lang */
function applyLang(lang) {
  currentLang = lang;

  /** @type {Record<string, string>} */
  const htmlLang = { no: 'nb', pt: 'pt-BR' };
  document.documentElement.lang = htmlLang[lang] ?? lang;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const htmlEl = /** @type {HTMLElement} */ (el);
    const v = t(htmlEl.dataset.i18n ?? '');
    if (v) htmlEl.textContent = v;
  });

  document.querySelectorAll('[data-i18n-tip]').forEach((el) => {
    const htmlEl = /** @type {HTMLElement} */ (el);
    const v = t(htmlEl.dataset.i18nTip ?? '');
    if (v) htmlEl.dataset.tip = v;
  });

  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const inputEl = /** @type {HTMLInputElement} */ (el);
    const v = t(inputEl.dataset.i18nPh ?? '');
    if (v) inputEl.placeholder = v;
  });

  document
    .querySelectorAll('.lang-opt')
    .forEach((o) => o.classList.toggle('on', /** @type {HTMLElement} */ (o).dataset.lang === lang));

  try {
    localStorage.setItem('cgv-lang', lang);
  } catch (_) {}
}

export function initLanguage() {
  /** @type {string | null} */
  let saved = null;
  try {
    saved = localStorage.getItem('cgv-lang');
  } catch (_) {}
  const browser = (navigator.language ?? 'en')
    .split('-')[0]
    .replace('nb', 'no')
    .replace('nn', 'no');
  const initial = saved ?? (['en', 'fr', 'no', 'pt'].includes(browser) ? browser : 'en');

  applyLang(initial);
}

export function setupLanguagePicker() {
  const langMenu = /** @type {HTMLElement} */ (document.getElementById('lang-menu'));
  const langButton = /** @type {HTMLElement} */ (document.getElementById('btn-lang'));
  if (!langMenu || !langButton) return;

  langButton.addEventListener('click', (e) => {
    e.stopPropagation();

    const open = langMenu.classList.toggle('open');
    if (!open) return;

    const br = langButton.getBoundingClientRect();
    const mw = langMenu.offsetWidth || 158;
    const mh = langMenu.offsetHeight || 138;
    const tb = document.getElementById('toolbar');
    const tbr = tb ? tb.getBoundingClientRect() : { left: 0, height: 0, width: 0 };
    const isVerticalDock = tbr.left < 8 && tbr.height > tbr.width;

    let left;
    let top;
    if (isVerticalDock) {
      left = Math.min(window.innerWidth - mw - 8, br.right + 8);
      top = br.top + br.height / 2 - mh / 2;
    } else {
      left = br.left + br.width / 2 - mw / 2;
      top = br.top - mh - 10;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - mh - 8));

    langMenu.style.left = `${left}px`;
    langMenu.style.top = `${top}px`;
  });

  document.addEventListener('click', () => langMenu.classList.remove('open'));

  document.querySelectorAll('.lang-opt').forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      applyLang(/** @type {HTMLElement} */ (opt).dataset.lang ?? 'en');
      langMenu.classList.remove('open');
    });
  });
}
