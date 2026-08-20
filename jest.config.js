export default {
  collectCoverage: true,

  collectCoverageFrom: [
    "packages/client/src/**/*.{js,jsx,ts,tsx}",
    "packages/counterfact/src/**/*.{js,jsx,ts,tsx}",
    "packages/generator/src/**/*.{js,jsx,ts,tsx}",
    "packages/openapi/src/**/*.{js,jsx,ts,tsx}",
    "packages/runtime/src/**/*.{js,jsx,ts,tsx}",
    "packages/repl/src/**/*.{js,jsx,ts,tsx}",
    "!**/node_modules/**",
    "!**/*.d.ts",
    "!packages/types/src/**",
    "!packages/counterfact/src/config.ts",
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
    "<rootDir>/packages/client/test",
    "<rootDir>/packages/counterfact/test",
    "<rootDir>/packages/generator/test",
    "<rootDir>/packages/openapi/test",
    "<rootDir>/packages/runtime/test",
    "<rootDir>/packages/repl/test",
  ],

  testEnvironment: "node",

  testTimeout: 10_000,

  transform: {
    "^.+\\.(t|j|mj)s?$": "@swc/jest",
  },
};
