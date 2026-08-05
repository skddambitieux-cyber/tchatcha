/* eslint-disable */
export default {
  displayName: 'default',
  testEnvironment: 'node',
  preset: 'ts-jest/presets/default-esm-legacy',
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.base.json',
      useESM: false,
    },
  },
  transform: {
    '^.+\\.[tj]s$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
};