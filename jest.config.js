export default {
  collectCoverage: true,

  collectCoverageFrom: [
    "packages/counterfact/src/**/*.{js,jsx,ts,tsx}",
    "packages/generator/src/**/*.{js,jsx,ts,tsx}",
    "!**/node_modules/**",
    "!**/*.d.ts",
    "!packages/types/src/**",
    "!packages/counterfact/src/server/config.ts",
  ],

  coverageProvider: "v8",

  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 77,
      statements: 77,
    },
  },

  extensionsToTreatAsEsm: [".ts", ".mts"],

  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  roots: [
    "<rootDir>/packages/counterfact/test",
    "<rootDir>/packages/generator/test",
    "<rootDir>/packages/openapi/test",
  ],

  testEnvironment: "node",

  testTimeout: 10_000,

  transform: {
    "^.+\\.(t|j|mj)s?$": "@swc/jest",
  },
};
