import js from '@eslint/js';
import ts from 'typescript-eslint';
import angular from 'angular-eslint';

export default ts.config(
  { ignores: ['dist/**', 'coverage/**', 'test-results/**', 'playwright-report/**', '.angular/**'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...ts.configs.recommended, ...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
  },
  {
    files: ['src/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
);
