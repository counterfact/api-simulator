import path from "node:path";
import { fileURLToPath } from "node:url";

import { test as base } from "@playwright/test";
import { createCounterfactTest, expect } from "@counterfact/playwright";

// Composition must retain existing test and worker fixture types and behavior.
const existing = base.extend<{ greeting: string }, { workerGreeting: string }>({
  workerGreeting: [
    // Playwright requires fixture argument destructuring.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use("hello");
    },
    { scope: "worker" },
  ],
  greeting: async ({ workerGreeting }, use) => {
    await use(`${workerGreeting} world`);
  },
});

export const test = createCounterfactTest(
  {
    basePath: path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../examples/playwright-reset/api",
    ),
  },
  existing,
);
export { expect };
