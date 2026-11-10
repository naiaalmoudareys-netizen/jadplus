// ESLint flat config: strict, type-aware rules for every TypeScript package. Run with --max-warnings 0.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.wrangler/**',
      '**/.expo/**',
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  security.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Object property access by validated keys is common in typed code; real injection risks are covered by zod + review.
      'security/detect-object-injection': 'off',
    },
  },
  {
    // Tests read fixed repository files (e.g. apps/api/migrations); runtime code keeps the rule on.
    files: ['**/test/**/*.ts'],
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
);
