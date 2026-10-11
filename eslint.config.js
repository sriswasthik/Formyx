import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist',
    '**/coverage',
    '**/playwright-report',
    '**/test-results',
    '**/blob-report',
    'apps/api/src/generated',
    // Declarations for the shared package's build only (see the file).
    'packages/shared/build-globals.d.ts',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // `value || fallback` is the intended way to treat empty strings as unset.
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],
      'no-console': 'error',
    },
  },

  // Tests stub browser APIs with no-op methods.
  {
    files: ['**/*.test.{ts,tsx}', '**/src/test/**'],
    rules: { '@typescript-eslint/no-empty-function': 'off' },
  },

  // Plain JS config files are not part of any tsconfig.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Scripts other sites load (public/embed.js): plain browser JavaScript, written to run in
  // older browsers too, so no for...of over NodeLists.
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
    rules: { '@typescript-eslint/prefer-for-of': 'off' },
  },

  // Node packages.
  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts', 'e2e/**/*.ts', '**/*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // React app.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: { globals: globals.browser },
  },
  {
    // The public form is what respondents download: keep the editor, dashboard and signed-in
    // app out of its bundle. The renderer it shares with the editor follows the same rule.
    files: [
      'apps/web/src/features/public-form/**/*.{ts,tsx}',
      'apps/web/src/features/form-renderer/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/features/form-editor/*',
                '@/features/forms/*',
                '@/features/auth/*',
                '@/features/shell/*',
              ],
              message: 'Public form code must not pull in editor or signed-in app code.',
            },
          ],
        },
      ],
    },
  },
  {
    // shadcn-style primitives export variant helpers alongside components.
    files: ['apps/web/src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  prettier,
);
