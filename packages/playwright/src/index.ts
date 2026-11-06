import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  test as base,
  mergeTests,
  type TestType,
  type PlaywrightTestArgs,
  type PlaywrightTestOptions,
  type PlaywrightWorkerArgs,
  type PlaywrightWorkerOptions,
} from "@playwright/test";
import { counterfact, type Simulator } from "counterfact";

export interface CounterfactTestOptions {
  /** API source directory, resolved relative to process.cwd(). */
  basePath: string;
}

export interface CounterfactFixtures {
  /** Named scenario applied after reset. This option has test scope. */
  scenarioName: string | undefined;
  /** Live simulator after reset and optional scenario setup. */
  simulator: Simulator;
}

export interface CounterfactWorkerFixtures {
  /** Worker resource; use simulator in tests to depend on completed setup. */
  workerSimulator: Simulator;
  /** HTTP origin of this worker's OS-assigned listener. */
  simulatorURL: string;
}

// Mirror ancestor lookup levels so local dependencies still shadow hoisted ones.
// Share installed code, while keeping source files and caches worker-owned.
async function copySource(sourcePath: string, temporaryPath: string) {
  const ancestors = [sourcePath];
  let ancestor = sourcePath;
  while (path.dirname(ancestor) !== ancestor) {
    ancestor = path.dirname(ancestor);
    ancestors.unshift(ancestor);
  }
  let isolatedPath = temporaryPath;
  for (const [index, directory] of ancestors.entries()) {
    isolatedPath = path.join(
      isolatedPath,
      index === ancestors.length - 1 ? "api" : "ancestor",
    );
    await mkdir(isolatedPath);
    if (directory === sourcePath) {
      await cp(sourcePath, isolatedPath, {
        recursive: true,
        dereference: true,
        filter: (source) =>
          ![".cache", "node_modules"].includes(path.basename(source)),
      });
    } else {
      try {
        const { type } = JSON.parse(
          await readFile(path.join(directory, "package.json"), "utf8"),
        ) as { type?: string };
        // Preserve package boundaries even when the nearest scope has no type.
        await writeFile(
          path.join(isolatedPath, "package.json"),
          JSON.stringify({ type }),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const dependencies = path.join(directory, "node_modules");
    try {
      if ((await stat(dependencies)).isDirectory()) {
        await symlink(
          dependencies,
          path.join(isolatedPath, "node_modules"),
          "junction",
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return isolatedPath;
}

type CounterfactTest = TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & CounterfactFixtures,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions & CounterfactWorkerFixtures
>;

/** Create fixtures, optionally composing an existing extended Playwright test. */
export function createCounterfactTest(
  options: CounterfactTestOptions,
): CounterfactTest;
export function createCounterfactTest<T extends object, W extends object>(
  options: CounterfactTestOptions,
  existingTest: TestType<T, W>,
): TestType<T & CounterfactFixtures, W & CounterfactWorkerFixtures>;
export function createCounterfactTest<T extends object, W extends object>(
  { basePath }: CounterfactTestOptions,
  existingTest?: TestType<T, W>,
) {
  const sourcePath = path.resolve(basePath);
  const fixtures = base.extend<CounterfactFixtures, CounterfactWorkerFixtures>({
    scenarioName: [undefined, { option: true }],
    workerSimulator: [
      // Playwright requires destructuring even when there are no dependencies.
      // eslint-disable-next-line no-empty-pattern
      async ({}, use) => {
        const temporaryPath = await mkdtemp(
          path.join(tmpdir(), "counterfact-playwright-"),
        );
        try {
          const isolatedPath = await copySource(sourcePath, temporaryPath);
          const simulator = await counterfact({
            basePath: isolatedPath,
            port: 0,
          });
          const { stop } = await simulator.start();
          try {
            await use(simulator);
          } finally {
            await stop();
          }
        } finally {
          await rm(temporaryPath, { recursive: true, force: true });
        }
      },
      { scope: "worker" },
    ],
    simulatorURL: [
      async ({ workerSimulator }, use) => {
        const { address } = workerSimulator.status();
        if (!address) throw new Error("Counterfact is not listening");
        await use(`http://localhost:${address.port}`);
      },
      { scope: "worker" },
    ],
    simulator: [
      async ({ workerSimulator, scenarioName }, use) => {
        await workerSimulator.reset();
        if (scenarioName !== undefined)
          await workerSimulator.scenario(scenarioName);
        await use(workerSimulator);
      },
      { auto: true },
    ],
  });
  return existingTest ? mergeTests(existingTest, fixtures) : fixtures;
}

export { expect } from "@playwright/test";
