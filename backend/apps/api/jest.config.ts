/* eslint-disable */
export default {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'html'],
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.app.json' },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/database/**'],
  coverageDirectory: 'test-output/jest/coverage',
};