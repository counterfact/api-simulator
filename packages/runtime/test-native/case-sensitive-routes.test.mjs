import assert from "node:assert/strict";
import { once } from "node:events";
import { describe, it } from "node:test";
import { usingTemporaryFiles } from "using-temporary-files";
import { ContextRegistry } from "../dist/server/context-registry.js";
import { Dispatcher } from "../dist/server/dispatcher.js";
import { ModuleLoader } from "../dist/server/module-loader.js";
import { Registry } from "../dist/server/registry.js";

const routeModule = `
export const __counterfactPaths = ["/Pets/{id}", "/pets/{id}"];
export const GET = { "/Pets/{id}": ({ path }) => "Upper " + path.id };
export const POST = { "/pets/{id}": ({ path }) => "Lower " + path.id };
`;

describe("case-sensitive route modules", () => {
  it("registers exact URL spellings and disjoint HTTP methods through dispatch", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("package.json", '{"type":"module"}');
      await $.add("pets/{id}.js", routeModule);
      await $.add("Legacy.js", 'export const GET = () => "Legacy";');
      await $.add(
        "index.js",
        'export const __counterfactPaths = ["/"]; export const GET = () => "Root";',
      );
      await $.add(
        "pets/_.middleware.js",
        `const prefix = (text) => async ($, next) => {
          const response = await next($);
          return { ...response, body: text + response.body };
        };
        export const middleware = { "/Pets": prefix("U:"), "/pets": prefix("L:") };`,
      );
      const context = new ContextRegistry();
      const registry = new Registry();
      const loader = new ModuleLoader($.path("."), registry, context);
      await loader.load();
      const contract = {
        paths: {
          "/Pets/{id}": { get: { responses: { 200: { description: "ok" } } } },
          "/pets/{id}": { post: { responses: { 200: { description: "ok" } } } },
        },
      };
      const dispatcher = new Dispatcher(
        registry,
        context,
        contract,
        undefined,
        "v1",
      );
      const incoming = { headers: {}, query: {}, req: {} };
      const get = await dispatcher.request({
        ...incoming,
        method: "GET",
        path: "/Pets/42",
      });
      const post = await dispatcher.request({
        ...incoming,
        method: "POST",
        path: "/pets/42",
      });
      const wrongMethod = await dispatcher.request({
        ...incoming,
        method: "GET",
        path: "/pets/42",
      });
      const wrongCase = await dispatcher.request({
        ...incoming,
        method: "GET",
        path: "/PETS/42",
      });
      assert.deepEqual([get.status, get.body], [200, "U:Upper 42"]);
      assert.deepEqual([post.status, post.body], [200, "L:Lower 42"]);
      assert.deepEqual(
        [wrongMethod.status, wrongMethod.headers.allow],
        [405, "POST"],
      );
      assert.equal(wrongCase.status, 404);
      assert.equal(registry.exists("GET", "/legacy"), true);
      assert.equal(registry.exists("GET", "/"), true);
      assert.equal(registry.exists("GET", "/index"), false);
    });
  });

  it("uses exact metadata to give root and /index separate handlers", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("package.json", '{"type":"module"}');
      await $.add(
        "index.js",
        `export const __counterfactPaths = ["/", "/index"];
        export const GET = { "/": () => "Root", "/index": () => "Index" };`,
      );
      const context = new ContextRegistry();
      const registry = new Registry();
      await new ModuleLoader($.path("."), registry, context).load();
      const dispatcher = new Dispatcher(registry, context);
      const get = (path) =>
        dispatcher.request({
          method: "GET",
          path,
          headers: {},
          query: {},
          req: {},
        });
      assert.equal((await get("/")).body, "Root");
      assert.equal((await get("/index")).body, "Index");
      assert.equal((await get("/INDEX")).status, 404);
    });
  });

  it("keeps migrated implementations private while reloading wrappers on edits", async (t) => {
    await usingTemporaryFiles(async ($) => {
      const privateFile = "pets/_.counterfact-legacy-a1b2.js";
      await $.add("package.json", '{"type":"module"}');
      await $.add(privateFile, 'export const GET = () => "before";');
      await $.add(
        "pets/index.js",
        `import { GET } from "./_.counterfact-legacy-a1b2.js";
        export { GET };
        export const __counterfactPaths = ["/Pets"];`,
      );

      const context = new ContextRegistry();
      const registry = new Registry();
      const loader = new ModuleLoader($.path("."), registry, context);
      const dispatcher = new Dispatcher(registry, context);
      const get = (path) =>
        dispatcher.request({
          method: "GET",
          path,
          headers: {},
          query: {},
          req: {},
        });

      await loader.load();
      t.after(() => loader.stopWatching());
      await loader.watch();
      assert.equal((await get("/Pets")).body, "before");
      assert.equal((await get("/pets/_.counterfact-legacy-a1b2")).status, 404);
      assert.deepEqual(
        registry.routes.map(({ path }) => path),
        ["/Pets"],
      );

      const refresh = once(loader, "add", {
        signal: AbortSignal.timeout(5000),
      });
      await $.add(privateFile, 'export const GET = () => "after";');
      await refresh;
      assert.equal((await get("/Pets")).body, "after");
      loader.resetRoutes();
      assert.deepEqual(
        registry.routes.map(({ path }) => path),
        ["/Pets"],
      );
      await loader.stopWatching();
    });
  });

  it("refreshes exact routes on edits, preserves them on reset, and removes them on unlink", async (t) => {
    await usingTemporaryFiles(async ($) => {
      await $.add("package.json", '{"type":"module"}');
      await $.add("pets/{id}.js", routeModule);
      const registry = new Registry();
      const loader = new ModuleLoader($.path("."), registry);
      await loader.load();
      t.after(() => loader.stopWatching());
      await loader.watch();
      assert.equal(registry.exists("GET", "/Pets/42"), true);
      assert.equal(registry.exists("POST", "/pets/42"), true);

      const add = once(loader, "add", { signal: AbortSignal.timeout(5000) });
      await $.add(
        "pets/{id}.js",
        'export const __counterfactPaths = ["/Pets/{id}"]; export const PATCH = () => "New";',
      );
      await add;
      assert.equal(registry.exists("GET", "/Pets/42"), false);
      assert.equal(registry.exists("POST", "/pets/42"), false);
      assert.equal(registry.exists("PATCH", "/Pets/42"), true);
      assert.equal(registry.exists("PATCH", "/pets/42"), false);

      registry.add("/temporary", { GET: () => "temporary" });
      loader.resetRoutes();
      assert.equal(registry.exists("GET", "/temporary"), false);
      assert.equal(registry.exists("PATCH", "/Pets/42"), true);
      assert.equal(registry.exists("PATCH", "/pets/42"), false);

      const remove = once(loader, "remove", {
        signal: AbortSignal.timeout(5000),
      });
      await $.remove("pets/{id}.js");
      await remove;
      assert.equal(registry.exists("PATCH", "/Pets/42"), false);
      loader.resetRoutes();
      assert.equal(registry.exists("PATCH", "/Pets/42"), false);
      await loader.stopWatching();
    });
  });
});
