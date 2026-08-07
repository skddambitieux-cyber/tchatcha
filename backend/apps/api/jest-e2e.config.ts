/**
 * TCHATCHA — Config Jest E2E (suite 6.2-E2E) : apps/api/test/**.
 */
export default {
  displayName: 'api-e2e',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'html'],
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.app.json' },
    ],
  },
  testTimeout: 180000,
  maxWorkers: 1,
  setupFiles: ['<rootDir>/test/setup-e2e.ts'],
};