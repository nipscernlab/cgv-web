// ============================================================
//  CGV Web — i18n.js
//  Internationalization engine + language switcher
//  Supported: en, fr, no, pt
// ============================================================

const SUPPORTED_LANGS = ['en', 'fr', 'no', 'pt'];
const DEFAULT_LANG    = 'en';
const CACHE_KEY       = 'cgv_lang';

let _translations = {};
let _lang         = DEFAULT_LANG;

// ── Load all translations from JSON ─────────────────────────
async function _loadTranslations() {
  const res  = await fetch('./i18n/translations.json');
  _translations = await res.json();
}

// ── Detect best language ─────────────────────────────────────
function _detectLanguage() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached && SUPPORTED_LANGS.includes(cached)) return cached;

  // navigator.languages gives ordered preference list
  for (const navLang of (navigator.languages || [navigator.language])) {
    const code = navLang.slice(0, 2).toLowerCase();
    if (SUPPORTED_LANGS.includes(code)) return code;
  }
  return DEFAULT_LANG;
}

// ── Translate a key (falls back to 'en' then to the key) ────
function t(key) {
  return _translations[_lang]?.[key]
      ?? _translations['en']?.[key]
      ?? key;
}

// ── Apply translations to the DOM ───────────────────────────
function _applyTranslations() {
  // textContent
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const txt = t(el.dataset.i18n);
    if (txt) el.textContent = txt;
  });

  // innerHTML (for rich text)
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const html = t(el.dataset.i18nHtml);
    if (html) el.innerHTML = html;
  });

  // aria-label
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const txt = t(el.dataset.i18nAria);
    if (txt) el.setAttribute('aria-label', txt);
  });

  // title attribute
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const txt = t(el.dataset.i18nTitle);
    if (txt) el.setAttribute('title', txt);
  });

  // placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const txt = t(el.dataset.i18nPlaceholder);
    if (txt) el.setAttribute('placeholder', txt);
  });

  // Page title
  document.title = t('page_title');

  // html[lang]
  document.documentElement.lang = _lang;

  // Notify other modules
  document.dispatchEvent(new CustomEvent('cgv:langchange', {
    detail: { lang: _lang, t }
  }));
}

// ── Update switcher button states ────────────────────────────
function _updateSwitcher() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    const active = btn.dataset.lang === _lang;
    btn.classList.toggle('lang-btn--active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

// ── Public: set a language ───────────────────────────────────
async function setLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  _lang = lang;
  localStorage.setItem(CACHE_KEY, lang);
  _applyTranslations();
  _updateSwitcher();
}

// ── Build the switcher DOM ───────────────────────────────────
function _buildSwitcher() {
  const wrap = document.getElementById('lang-switcher');
  if (!wrap) return;

  const LANGS = [
    { code: 'en', flag: 'gb', label: 'English'    },
    { code: 'fr', flag: 'fr', label: 'Français'   },
    { code: 'no', flag: 'no', label: 'Norsk'      },
    { code: 'pt', flag: 'br', label: 'Português'  },
  ];

  wrap.innerHTML = '';
  LANGS.forEach(({ code, flag, label }) => {
    const btn = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'lang-btn';
    btn.dataset.lang = code;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(code === _lang));
    btn.title       = label;
    btn.innerHTML   = `<span class="fi fi-${flag} fi-squared"></span>`;
    btn.addEventListener('click', () => setLanguage(code));
    if (code === _lang) btn.classList.add('lang-btn--active');
    wrap.appendChild(btn);
  });
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  await _loadTranslations();
  _lang = _detectLanguage();
  _buildSwitcher();
  _applyTranslations();
}

// ── Exports ──────────────────────────────────────────────────
export { init, t, setLanguage };
export const getCurrentLang = () => _lang;
