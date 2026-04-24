// ESLint flat config (ESLint 9+).
// Intentionally lenient: this codebase pre-dates the linter, so most stylistic
// concerns are warnings, not errors. CI only fails on the "error" tier below.

import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

const unusedVarOpts = {
  args: 'after-used',
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrors: 'all',
  caughtErrorsIgnorePattern: '^_',
  destructuredArrayIgnorePattern: '^_',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'parser/pkg/**',
      'parser/target/**',
      'geometry_data/**',
      'live_atlas/**',
      'tmp_atlas_*/**',
      '.chrome-headless/**',
      'js/atlas_id_parser.js',
      'setup/lib/**',
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
      'no-unused-vars': ['warn', unusedVarOpts],
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
      'no-unused-vars': ['warn', unusedVarOpts],
    },
  },

  // Vitest unit tests (Node). describe/it/expect are imported explicitly,
  // so no test-runner globals are needed.
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', unusedVarOpts],
    },
  },

  // Disable ESLint rules that Prettier handles (must be last).
  prettier,
];
