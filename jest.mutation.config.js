import baseConfig from "./jest.config.js";

export default {
  ...baseConfig,
  collectCoverage: false,
  coverageThreshold: undefined,
};
