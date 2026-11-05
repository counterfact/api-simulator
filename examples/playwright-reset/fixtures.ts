import path from "node:path";
import { fileURLToPath } from "node:url";

import { test as base, expect } from "@playwright/test";
import { usingTemporaryFiles } from "using-temporary-files";
import { counterfact, type Simulator } from "counterfact";

interface TestFixtures {
  scenarioName: string | undefined;
  simulator: Simulator;
}

interface WorkerFixtures {
  workerSimulator: Simulator;
  simulatorURL: string;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  scenarioName: [undefined, { option: true }],
  simulatorURL: [
    // Playwright requires object destructuring even when no fixtures are needed.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      // Give each worker its own listener; choose a free range for your project.
      await use(`http://localhost:${18100 + workerInfo.workerIndex}`);
    },
    { scope: "worker" },
  ],
  workerSimulator: [
    async ({ simulatorURL }, use) => {
      await usingTemporaryFiles(async ($) => {
        // Isolate generated caches as well as in-memory state between workers.
        const sourcePath = path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "api",
        );
        for (const file of [
          "_.store.ts",
          "routes/_.context.ts",
          "routes/projects.ts",
          "scenarios/index.ts",
        ]) {
          const source = path.relative(
            $.path("."),
            path.join(sourcePath, file),
          );
          await $.add(file, await $.read(source));
        }
        const simulator = await counterfact({
          basePath: $.path("."),
          port: Number(new URL(simulatorURL).port),
        });
        const { stop } = await simulator.start();
        try {
          await use(simulator);
        } finally {
          await stop();
        }
      });
    },
    { scope: "worker" },
  ],
  simulator: [
    async ({ workerSimulator, scenarioName }, use) => {
      await workerSimulator.reset();
      if (scenarioName) await workerSimulator.scenario(scenarioName);
      await use(workerSimulator);
    },
    { auto: true },
  ],
});

export { expect };
