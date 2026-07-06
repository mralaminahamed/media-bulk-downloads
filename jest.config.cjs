module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jest-environment-jsdom',
    setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
    moduleNameMapper: {
      '^@/(.*)$': '<rootDir>/src/$1',
    },
    transform: {
      '^.+\\.tsx?$': ['ts-jest', {
        tsconfig: 'tsconfig.json',
      }],
    },
    collectCoverage: true,
    coverageReporters: ["lcov", "text-summary"],
    // Bound worker count so a memory-heavy suite (mp4box in the muxer test is
    // ~2 MB) can't over-subscribe RAM and crash sibling workers — which surfaced
    // as flaky, unrelated React-test failures under load. Serial was always green.
    maxWorkers: "50%",
  };