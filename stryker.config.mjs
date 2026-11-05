const mutablePackages = [
  "client",
  "counterfact",
  "generator",
  "openapi",
  "repl",
  "runtime",
];

const selectedPackage = process.env.COUNTERFACT_MUTATION_PACKAGE;

if (selectedPackage && !mutablePackages.includes(selectedPackage)) {
  throw new Error(
    `Unknown mutation-test package "${selectedPackage}". Expected one of: ${mutablePackages.join(", ")}.`,
  );
}

const selectedPackages = selectedPackage ? [selectedPackage] : mutablePackages;
const reportName = selectedPackage ?? "all";
const reportDirectory = `reports/mutation/${reportName}`;

const mutate = selectedPackages.map(
  (packageName) => `packages/${packageName}/src/**/*.ts`,
);
mutate.push("!packages/*/src/**/*.d.ts");

if (selectedPackages.includes("runtime")) {
  mutate.push("!packages/runtime/src/server/transpiler.ts");
}

export default {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  checkers: ["typescript"],
  concurrency: 2,
  coverageAnalysis: "perTest",
  htmlReporter: {
    fileName: `${reportDirectory}/report.html`,
  },
  incrementalFile: `${reportDirectory}/incremental.json`,
  jest: {
    configFile: "jest.mutation.config.js",
  },
  jsonReporter: {
    fileName: `${reportDirectory}/report.json`,
  },
  maxTestRunnerReuse: 250,
  mutate,
  packageManager: "yarn",
  reporters: ["clear-text", "progress", "html", "json"],
  clearTextReporter: {
    reportMutants: false,
    reportTests: false,
  },
  testFiles: selectedPackages.map(
    (packageName) => `packages/${packageName}/test/**/*.test.ts`,
  ),
  testRunner: "jest",
  testRunnerNodeArgs: ["--experimental-vm-modules"],
  thresholds: {
    break: null,
    high: 80,
    low: 60,
  },
  tsconfigFile: "tsconfig.json",
  typescriptChecker: {
    prioritizePerformanceOverAccuracy: false,
  },
};
