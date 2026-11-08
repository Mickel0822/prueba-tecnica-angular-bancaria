const { createCjsPreset } = require('jest-preset-angular/presets');
module.exports = {
  ...createCjsPreset({ tsconfig: '<rootDir>/tsconfig.spec.json' }),
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  collectCoverageFrom: ['src/app/**/*.ts', '!src/app/**/*.spec.ts', '!src/app/app.config.ts'],
  coverageReporters: ['text', 'html', 'lcov', 'json-summary'],
  coverageThreshold: { global: { branches: 80, functions: 80, lines: 80, statements: 80 } },
};
