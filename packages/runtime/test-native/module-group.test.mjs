import assert from "node:assert/strict";
import { once } from "node:events";
import { it } from "node:test";
import { usingTemporaryFiles } from "using-temporary-files";
import { ContextRegistry } from "../dist/server/context-registry.js";
import { ModuleLoader } from "../dist/server/module-loader.js";
import { Registry } from "../dist/server/registry.js";
import { ScenarioRegistry } from "../dist/server/scenario-registry.js";

async function withVersionedLoaders(run) {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "routes/_.context.mjs",
      "export class DomainError extends Error {}\n" +
        "export class Context { count = 0; fail() { throw new DomainError(); } }",
    );
    const route = (version) =>
      "import { Context, DomainError } from './_.context.mjs';\n" +
      `export function GET({context}) { try { context.fail(); } catch (error) { return { context: context instanceof Context, error: error instanceof DomainError, count: context.count, version: ${version} }; } }`;
    await $.add("routes/identity.mjs", route(1));
    await $.add(
      "scenarios/index.mjs",
      "import { Context } from '../routes/_.context.mjs'; export const identity = ({context}) => context instanceof Context;",
    );
    const contexts = new ContextRegistry();
    const scenarios = new ScenarioRegistry();
    const registries = [new Registry(), new Registry()];
    const loaders = registries.map(
      (registry) =>
        new ModuleLoader(
          $.path("routes"),
          registry,
          contexts,
          $.path("scenarios"),
          scenarios,
        ),
    );
    const verify = (count, version) => {
      for (const registry of registries)
        assert.deepEqual(
          registry.handler("/identity", "GET").module.GET({
            context: contexts.find("/"),
          }),
          { context: true, error: true, count, version },
        );
      assert.equal(
        scenarios.getModule("index").identity({ context: contexts.find("/") }),
        true,
      );
    };
    try {
      await run({ $, contexts, loaders, registries, route, verify });
    } finally {
      await Promise.all(loaders.map((loader) => loader.stopWatching()));
    }
  });
}

it("keeps versioned handlers, errors and scenarios in their shared context generation", async () => {
  await withVersionedLoaders(
    async ({ $, contexts, loaders, route, verify }) => {
      await Promise.all(loaders.map((loader) => loader.load()));
      verify(0, 1);
      contexts.find("/").count = 7;
      await $.add("routes/identity.mjs", route(2));
      await loaders[0].reloadContexts();
      verify(7, 2);
      await Promise.all(loaders.map((loader) => loader.load()));
      verify(7, 2);

      // Reset pauses every runner separately; a shared refresh queue must not
      // cause the second pause to wait for the first pause's release.
      const resume = [];
      for (const loader of loaders) resume.push(await loader.pauseUpdates());
      for (const release of resume) release();
      await loaders[1].load();
      verify(7, 2);
    },
  );
});

it("preserves existing live state when a second version joins the shared group", async () => {
  await withVersionedLoaders(async ({ contexts, loaders, verify }) => {
    await loaders[0].load();
    contexts.find("/").count = 9;
    await loaders[1].load();
    verify(9, 1);
  });
});

it("refreshes all versions before publishing a watched change", async () => {
  await withVersionedLoaders(
    async ({ $, contexts, loaders, route, verify }) => {
      await Promise.all(loaders.map((loader) => loader.load()));
      contexts.find("/").count = 5;
      await loaders[0].watch();
      const changed = once(loaders[0], "add");
      await $.add("routes/identity.mjs", route(3));
      await changed;
      verify(5, 3);
    },
  );
});

it("removes deleted routes from every version before publishing completion", async () => {
  await withVersionedLoaders(async ({ $, loaders, registries }) => {
    await Promise.all(loaders.map((loader) => loader.load()));
    await loaders[0].watch();
    const removed = once(loaders[0], "remove");
    await $.remove("routes/identity.mjs");
    await removed;
    for (const registry of registries) {
      assert.equal(registry.handler("/identity", "GET").module, undefined);
    }
    for (const loader of loaders) loader.resetRoutes();
    for (const registry of registries) {
      assert.equal(registry.handler("/identity", "GET").module, undefined);
    }
  });
});
