import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.angular/**',
      '**/out-tsc/**',
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...eslint.configs.recommended,
  },
  {
    files: ['apps/api/**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
  },
  {
    files: ['apps/web/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
  },
  {
    files: ['apps/web/**/*.html'],
    extends: [...angular.configs.templateRecommended],
  },
  {
    files: ['apps/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'off' }],
    },
  },
  prettier,
);
