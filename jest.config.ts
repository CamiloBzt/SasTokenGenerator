import type { Config } from 'jest';

const config: Config = {
  verbose: true,
  clearMocks: true,
  collectCoverage: true,
  coverageProvider: 'v8',
  testResultsProcessor: 'jest-sonar-reporter',
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.test\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/main.ts',
    '!**/server.ts',
    '!**/__mocks__/**',
    '!**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'html', 'clover', 'lcov'],
  coveragePathIgnorePatterns: [
    '/coverage/',
    '/dist/',
    '/node_modules/',
    '.*\\.module\\.ts$',
    'jest.config.ts',
    '\\.interface\\.ts$',
    '.eslintrc.js',
  ],
  testPathIgnorePatterns: ['\\.interface\\.ts$'],
};

export default config;
