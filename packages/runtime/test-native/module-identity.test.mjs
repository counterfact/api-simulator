import assert from "node:assert/strict";
import { it } from "node:test";
import { usingTemporaryFiles } from "using-temporary-files";
import { ContextRegistry } from "../dist/server/context-registry.js";
import { Dispatcher } from "../dist/server/dispatcher.js";
import { ModuleLoader } from "../dist/server/module-loader.js";
import { Registry } from "../dist/server/registry.js";

async function waitForRouteVersion(registries, contexts, version) {
  // Windows can emit multiple notifications for the previous write. Wait for
  // the requested behavior, not merely the next watcher completion event.
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const responses = await Promise.all(
      registries.map(async (routes) =>
        new Dispatcher(routes, contexts).request({
          method: "GET",
          path: "/probe",
          headers: {},
          query: {},
          req: {},
        }),
      ),
    );
    if (responses.every((response) => response.body.version === version)) {
      for (const response of responses)
        assert.deepEqual(response.body, { version, identity: true });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Route version ${version} was not published to all registries`);
}

it("shares initial ESM context constructors, errors, and singletons with routes", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "_.context.mjs",
      [
        "export const singleton = {};",
        "export class DomainError extends Error {}",
        "export class Context { marker = singleton; fail() { throw new DomainError('failure'); } }",
      ].join("\n"),
    );
    await $.add(
      "identity.mjs",
      [
        "import { Context, DomainError, singleton } from './_.context.mjs';",
        "export function GET($) {",
        "try { $.context.fail(); } catch (error) {",
        "return { status: 200, body: {context: $.context instanceof Context, error: error instanceof DomainError, singleton: $.context.marker === singleton} };",
        "} }",
      ].join("\n"),
    );
    const registry = new Registry();
    const contexts = new ContextRegistry();
    const loader = new ModuleLoader($.path(""), registry, contexts);
    await loader.load();
    const response = await new Dispatcher(registry, contexts).request({
      method: "GET",
      path: "/identity",
      body: undefined,
      headers: {},
      query: {},
      req: {},
    });
    assert.deepEqual(response.body, {
      context: true,
      error: true,
      singleton: true,
    });
  });
});

it("preserves root arrow and private methods through unrelated route edits and group joins", async (t) => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "_.context.mjs",
      `
      export class Context {
        count = 0;
        #privateCount = 0;
        increment = () => ++this.count;
        incrementPrivate() { return ++this.#privateCount; }
      }
    `,
    );
    const route = (version) => `import { Context } from './_.context.mjs';
      export const GET = $ => ({body: {version: ${version}, identity: $.context instanceof Context}});`;
    await $.add("probe.mjs", route(1));
    const contexts = new ContextRegistry();
    const registry = new Registry();
    const loader = new ModuleLoader($.path(""), registry, contexts);
    await loader.load();
    t.after(() => loader.stopWatching());
    const context = contexts.find("/");
    context.count = 5;
    assert.equal(context.incrementPrivate(), 1);
    const second = new ModuleLoader($.path(""), new Registry(), contexts);
    await second.load();
    assert.equal(context.increment(), 6);
    assert.equal(context.count, 6);
    assert.equal(context.incrementPrivate(), 2);
    await loader.watch();
    for (const version of [2, 3]) {
      await $.add("probe.mjs", route(version));
      await waitForRouteVersion([registry, second.registry], contexts, version);
      assert.equal(contexts.find("/"), context);
      assert.equal(context.increment(), version + 5);
      assert.equal(context.count, version + 5);
      assert.equal(context.incrementPrivate(), version + 1);
      for (const routes of [registry, second.registry]) {
        const response = await new Dispatcher(routes, contexts).request({
          method: "GET",
          path: "/probe",
          headers: {},
          query: {},
          req: {},
        });
        assert.deepEqual(response.body, { version, identity: true });
      }
    }
    loader.resetContexts();
    const reset = contexts.find("/");
    assert.notEqual(reset, context);
    assert.equal(reset.increment(), 1);
    assert.equal(reset.incrementPrivate(), 1);
  });
});

it("preserves CommonJS root arrow and private methods through unrelated route edits and group joins", async (t) => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "_.context.cjs",
      `
      exports.Context = class Context {
        count = 0;
        #privateCount = 0;
        increment = () => ++this.count;
        incrementPrivate() { return ++this.#privateCount; }
      }
    `,
    );
    const route = (version) => `const { Context } = require('./_.context.cjs');
      exports.GET = $ => ({body: {version: ${version}, identity: $.context instanceof Context}});`;
    await $.add("probe.cjs", route(1));
    const contexts = new ContextRegistry();
    const registry = new Registry();
    const loader = new ModuleLoader($.path(""), registry, contexts);
    await loader.load();
    t.after(() => loader.stopWatching());
    const context = contexts.find("/");
    context.count = 5;
    assert.equal(context.incrementPrivate(), 1);
    const second = new ModuleLoader($.path(""), new Registry(), contexts);
    await second.load();
    assert.equal(context.increment(), 6);
    assert.equal(context.count, 6);
    assert.equal(context.incrementPrivate(), 2);
    await loader.watch();
    for (const version of [2, 3]) {
      await $.add("probe.cjs", route(version));
      await waitForRouteVersion([registry, second.registry], contexts, version);
      assert.equal(contexts.find("/"), context);
      assert.equal(context.increment(), version + 5);
      assert.equal(context.count, version + 5);
      assert.equal(context.incrementPrivate(), version + 1);
      for (const routes of [registry, second.registry]) {
        const response = await new Dispatcher(routes, contexts).request({
          method: "GET",
          path: "/probe",
          headers: {},
          query: {},
          req: {},
        });
        assert.deepEqual(response.body, { version, identity: true });
      }
    }
    loader.resetContexts();
    const reset = contexts.find("/");
    assert.notEqual(reset, context);
    assert.equal(reset.increment(), 1);
    assert.equal(reset.incrementPrivate(), 1);
  });
});

it("refreshes context behavior when a transitive local dependency changes", async (t) => {
  await usingTemporaryFiles(async ($) => {
    await $.add("amount.mjs", "export const amount = 1;");
    await $.add("helper.mjs", "export { amount } from './amount.mjs';");
    await $.add(
      "_.context.mjs",
      `import { amount } from './helper.mjs';
      export class Context { count = 0; increment() { this.count += amount; return this.count; } }`,
    );
    await $.add(
      "probe.mjs",
      `import { Context } from './_.context.mjs';
      export const GET = $ => ({body: {identity: $.context instanceof Context, count: $.context.increment()}});`,
    );
    const contexts = new ContextRegistry();
    const registry = new Registry();
    const loader = new ModuleLoader($.path(""), registry, contexts);
    t.after(() => loader.stopWatching());
    await loader.load();
    const context = contexts.find("/");
    context.count = 5;
    await loader.watch();
    const refreshed = new Promise((resolve) =>
      loader.addEventListener("add", resolve, { once: true }),
    );
    await $.add("amount.mjs", "export const amount = 2;");
    await refreshed;
    const response = await new Dispatcher(registry, contexts).request({
      method: "GET",
      path: "/probe",
      headers: {},
      query: {},
      req: {},
    });
    assert.deepEqual(response.body, { identity: true, count: 7 });
    assert.equal(contexts.find("/"), context);
  });
});

for (const fixture of [
  {
    kind: "ESM syntax error",
    extension: "mjs",
    context:
      "export class Context { count=0; #privateCount=0; increment=()=>++this.count; incrementPrivate(){return ++this.#privateCount;} }",
    route: (version) =>
      `import {Context} from './_.context.mjs'; export const GET=$=>({body:{version:${version},identity:$.context instanceof Context}});`,
    broken: "export const GET = ;",
  },
  {
    kind: "ESM evaluation error",
    extension: "mjs",
    context:
      "export class Context { count=0; #privateCount=0; increment=()=>++this.count; incrementPrivate(){return ++this.#privateCount;} }",
    route: (version) =>
      `import {Context} from './_.context.mjs'; export const GET=$=>({body:{version:${version},identity:$.context instanceof Context}});`,
    broken:
      "import {Context} from './_.context.mjs'; throw new Error('unfinished route');",
  },
  {
    kind: "CommonJS syntax error",
    extension: "cjs",
    context:
      "exports.Context=class Context { count=0; #privateCount=0; increment=()=>++this.count; incrementPrivate(){return ++this.#privateCount;} }",
    route: (version) =>
      `const {Context}=require('./_.context.cjs'); exports.GET=$=>({body:{version:${version},identity:$.context instanceof Context}});`,
    broken: "exports.GET = ;",
  },
  {
    kind: "CommonJS evaluation error",
    extension: "cjs",
    context:
      "exports.Context=class Context { count=0; #privateCount=0; increment=()=>++this.count; incrementPrivate(){return ++this.#privateCount;} }",
    route: (version) =>
      `const {Context}=require('./_.context.cjs'); exports.GET=$=>({body:{version:${version},identity:$.context instanceof Context}});`,
    broken: "require('./_.context.cjs'); throw new Error('unfinished route');",
  },
]) {
  it(`preserves live contexts while recovering from an unrelated ${fixture.kind}`, async (t) => {
    await usingTemporaryFiles(async ($) => {
      await $.add(`_.context.${fixture.extension}`, fixture.context);
      await $.add(`probe.${fixture.extension}`, fixture.route(1));
      const contexts = new ContextRegistry();
      const registry = new Registry();
      const loader = new ModuleLoader($.path(""), registry, contexts);
      t.after(() => loader.stopWatching());
      await loader.load();
      const context = contexts.find("/");
      context.count = 5;
      assert.equal(context.incrementPrivate(), 1);
      await loader.watch();
      await $.add(`probe.${fixture.extension}`, fixture.broken);
      let sawError = false;
      for (let attempt = 0; attempt < 250; attempt += 1) {
        const response = await new Dispatcher(registry, contexts).request({
          method: "GET",
          path: "/probe",
          headers: {},
          query: {},
          req: {},
        });
        if (response.status === 500) {
          sawError = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(
        sawError,
        true,
        "broken route should produce a diagnostic response",
      );
      await $.add(`probe.${fixture.extension}`, fixture.route(2));
      await waitForRouteVersion([registry], contexts, 2);
      assert.equal(contexts.find("/"), context);
      assert.equal(context.increment(), 6);
      assert.equal(context.count, 6);
      assert.equal(context.incrementPrivate(), 2);
    });
  });
}

it("reloads changed CommonJS routes without adopting a separate loader's cached graph", async (t) => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "_.context.cjs",
      "exports.Context=class Context { count=0; increment=()=>++this.count; }",
    );
    const route = (version) =>
      `const {Context}=require('./_.context.cjs'); exports.GET=$=>({body:{version:${version},identity:$.context instanceof Context}});`;
    await $.add("probe.cjs", route(1));
    const contexts = new ContextRegistry();
    const registry = new Registry();
    const first = new ModuleLoader($.path(""), registry, contexts);
    t.after(() => first.stopWatching());
    await first.load();
    const live = contexts.find("/");
    live.count = 5;
    const otherContexts = new ContextRegistry();
    const second = new ModuleLoader($.path(""), new Registry(), otherContexts);
    await second.load();
    assert.notEqual(
      Object.getPrototypeOf(live),
      Object.getPrototypeOf(otherContexts.find("/")),
    );
    await first.watch();
    await $.add("probe.cjs", route(2));
    await waitForRouteVersion([registry], contexts, 2);
    assert.equal(live.increment(), 6);
    assert.equal(live.count, 6);
  });
});
