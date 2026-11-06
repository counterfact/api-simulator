import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "projects.spec.ts",
  fullyParallel: true,
  outputDir: "../../test-results/playwright-example",
});
