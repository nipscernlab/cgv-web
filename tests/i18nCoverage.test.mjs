// Asserts that every key in the canonical English locale is present in the
// other locales. `en` is the source of truth — when you add a UI string,
// add it to en.js first, then translate. CI fails here when a translation
// is forgotten.

import { describe, it, expect } from 'vitest';
import { TRANSLATIONS } from '../js/i18n/translations.js';

const SOURCE_LOCALE = 'en';
const TARGET_LOCALES = Object.keys(TRANSLATIONS).filter((l) => l !== SOURCE_LOCALE);
const SOURCE_KEYS = Object.keys(TRANSLATIONS[SOURCE_LOCALE]);

describe('i18n coverage', () => {
  it('source locale has at least one key', () => {
    expect(SOURCE_KEYS.length).toBeGreaterThan(0);
  });

  it.each(TARGET_LOCALES)('locale "%s" includes every key from "en"', (loc) => {
    const missing = SOURCE_KEYS.filter((k) => !(k in TRANSLATIONS[loc]));
    if (missing.length) {
      throw new Error(
        `Locale "${loc}" is missing ${missing.length} translation(s):\n  ${missing.join('\n  ')}`,
      );
    }
  });

  it.each(TARGET_LOCALES)('locale "%s" has no extra keys not in "en"', (loc) => {
    const extras = Object.keys(TRANSLATIONS[loc]).filter(
      (k) => !(k in TRANSLATIONS[SOURCE_LOCALE]),
    );
    if (extras.length) {
      throw new Error(
        `Locale "${loc}" has ${extras.length} stray key(s) absent from "en":\n  ${extras.join(
          '\n  ',
        )}`,
      );
    }
  });

  it.each(TARGET_LOCALES)('locale "%s" has no empty translation values', (loc) => {
    const empty = Object.entries(TRANSLATIONS[loc])
      .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
      .map(([k]) => k);
    if (empty.length) {
      throw new Error(
        `Locale "${loc}" has ${empty.length} empty value(s):\n  ${empty.join('\n  ')}`,
      );
    }
  });
});
