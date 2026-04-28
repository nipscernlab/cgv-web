// ESLint flat config (ESLint 9+).
//
// Tiering:
//   - js.configs.recommended provides the baseline (no-undef, no-unreachable,
//     no-self-assign, etc.).
//   - The project-specific rules below are tuned to fail CI on real bug
//     classes (eqeqeq, no-var, prefer-const, no-duplicate-imports, the
//     three pre-existing `warn` rules promoted to `error`) while staying
//     out of the way for legitimate idioms (`!= null`, allowEmptyCatch,
//     while(true) loops in event pumps).

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
      // Promoted from warn to error: codebase is currently clean, so any
      // new offence fails CI immediately.
      'no-unused-vars': ['error', unusedVarOpts],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      // Bug-class rules. eqeqeq keeps the `== null` idiom for null+undefined.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-duplicate-imports': 'error',
      // Off-by-design.
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
      'no-unused-vars': ['error', unusedVarOpts],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-duplicate-imports': 'error',
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
      'no-unused-vars': ['error', unusedVarOpts],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-duplicate-imports': 'error',
    },
  },

  // Disable ESLint rules that Prettier handles (must be last).
  prettier,
];
