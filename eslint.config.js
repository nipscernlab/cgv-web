// ESLint flat config (ESLint 9+).
// Intentionally lenient: this codebase pre-dates the linter, so most stylistic
// concerns are warnings, not errors. CI only fails on the "error" tier below.

import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'node_modules/**',
      'parser/pkg/**',
      'parser/target/**',
      'geometry_data/**',
      'atlantis/**',
      'live_atlas/**',
      'tmp_atlas_*/**',
      '.chrome-headless/**',
      'js/atlas_id_parser.js',
    ],
  },

  js.configs.recommended,

  // Frontend modules (browser + ES module).
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.worker,
        THREE: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-inner-declarations': 'off',
      'no-prototype-builtins': 'off',
      'no-console': 'off',
    },
  },

  // Build pipeline (Node, ES module).
  {
    files: ['setup/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Disable ESLint rules that Prettier handles (must be last).
  prettier,
];
