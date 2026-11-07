import { once } from "node:events";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { usingTemporaryFiles } from "using-temporary-files";
import { ContextRegistry } from "../dist/server/context-registry.js";
import { ModuleLoader } from "../dist/server/module-loader.js";
import { Registry } from "../dist/server/registry.js";
describe("a module loader", () => {
  it("finds a file and adds it to the registry", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "a/b/c.js",
        `export function GET() {
          return {
              body: "GET from a/b/c"
          }; 
      }`,
      );
      await $.add(
        "hello.js",
        `
      export function GET() {
          return {
              body: "hello"
          };
      }`,
      );
      await $.add("package.json", '{ "type": "module" }');
      const registry = new Registry();
      const loader = new ModuleLoader($.path(""), registry);
      await loader.load();
      assert.equal(registry.exists("GET", "/hello"), true);
      assert.equal(registry.exists("POST", "/hello"), false);
      assert.equal(registry.exists("GET", "/goodbye"), false);
      assert.equal(registry.exists("GET", "/a/b/c"), true);
    });
  });
  it("maps /index to /", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "index.js",
        `export function GET() {
          return {
              body: "GET from a/b/c"
          }; 
      }`,
      );
      await $.add("package.json", '{ "type": "module" }');
      const registry = new Registry();
      const loader = new ModuleLoader($.path(""), registry);
      await loader.load();
      assert.equal(registry.exists("GET", "/index"), true);
      assert.equal(registry.exists("GET", "/"), true);
    });
  });
  it("updates the registry when a file is deleted", async (t) => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "delete-me.js",
        'export function GET() { return { body: "Goodbye" }; }',
      );
      await $.add("package.json", '{ "type": "module" }');
      const registry = new Registry();
      const loader = new ModuleLoader($.path("."), registry);
      await loader.load();
      t.after(() => loader.stopWatching());
      await loader.watch();
      assert.equal(registry.exists("GET", "/delete-me"), true);
      const removed = once(loader, "remove");
      await $.remove("delete-me.js");
      await removed;
      assert.equal(registry.exists("GET", "/delete-me"), false);
      await loader.stopWatching();
    });
  });
  it("does not crash when a context file is deleted", async (t) => {
    await usingTemporaryFiles(async ($) => {
      await $.add("_.context.js", "export class Context { value = 42 }");
      await $.add(
        "hello.js",
        'export function GET() { return { body: "hello" }; }',
      );
      await $.add("package.json", '{ "type": "module" }');
      const registry = new Registry();
      const loader = new ModuleLoader($.path("."), registry);
      await loader.load();
      t.after(() => loader.stopWatching());
      await loader.watch();
      const removed = once(loader, "remove");
      await $.remove("_.context.js");
      await removed;
      // Should not crash and the route should still be accessible
      assert.equal(registry.exists("GET", "/hello"), true);
      await loader.stopWatching();
    });
  });
  it("ignores files with the wrong file extension", async (t) => {
    await usingTemporaryFiles(async ($) => {
      const registry = new Registry();
      const loader = new ModuleLoader($.path("."), registry);
      await $.add(
        "module.js",
        'export function GET() { return { body: "hello" }; }',
      );
      await $.add("package.json", '{"type": "module"}');
      await $.add("README.md", "readme");
      await loader.load();
      t.after(() => loader.stopWatching());
      await loader.watch();
      await $.add("other.txt", "should not be loaded");
      assert.equal(registry.exists("GET", "/module"), true);
      assert.equal(registry.exists("GET", "/READMEx"), false);
      assert.equal(registry.exists("GET", "/other"), false);
      assert.equal(registry.exists("GET", "/types"), false);
      await loader.stopWatching();
    });
  });
  it("finds a context and adds it to the context registry", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("_.context.js", 'export class Context { name = "main"};');
      await $.add(
        "hello/_.context.js",
        'export class Context { name = "hello"};',
      );
      await $.add("package.json", '{ "type": "module" }');
      const registry = new Registry();
      const contextRegistry = new ContextRegistry();
      const loader = new ModuleLoader($.path("."), registry, contextRegistry);
      await loader.load();
      assert.equal(contextRegistry.find("/hello").name, "hello");
      assert.equal(contextRegistry.find("/hello/world").name, "hello");
      assert.equal(contextRegistry.find("/some/other/path").name, "main");
    });
  });
  it("finds a middleware and adds it to the registry", async () => {
    const names = new Map();
    class MiddlewareExposingRegistry extends Registry {
      addMiddleware(url, callback) {
        names.set(url, callback());
      }
    }
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "_.middleware.js",
        'export function middleware() { return "root"; }',
      );
      await $.add(
        "hello/_.middleware.js",
        'export function middleware() { return "hello"; }',
      );
      await $.add("package.json", '{ "type": "module" }');
      const registry = new MiddlewareExposingRegistry();
      const contextRegistry = new ContextRegistry();
      const loader = new ModuleLoader($.path("."), registry, contextRegistry);
      await loader.load();
      assert.equal(names.get("/"), "root");
      assert.equal(names.get("/hello"), "hello");
    });
  });
  it("provides the parent context if the local _.context.ts doesn't export a default", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("_.context.js", "export class Context { value = 0 }");
      await $.add(
        "hello/_.context.js",
        "export class Context  { value =  100 }",
      );
      await $.add("package.json", '{ "type": "module" }');
      const registry = new Registry();
      const contextRegistry = new ContextRegistry();
      const loader = new ModuleLoader($.path("."), registry, contextRegistry);
      await loader.load();
      const rootContext = contextRegistry.find("/");
      const helloContext = contextRegistry.find("/hello");
      rootContext.value = 1;
      helloContext.value = 101;
      assert.equal(contextRegistry.find("/").value, 1);
      assert.equal(contextRegistry.find("/other").value, 1);
      assert.equal(contextRegistry.find("/hello").value, 101);
      assert.equal(contextRegistry.find("/hello/world").value, 101);
    });
  });
  it("provides the loadContext helper for accessing nested contexts", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "_.context.js",
        "export class Context  { constructor({loadContext}) { this.loadContext = loadContext } }",
      );
      await $.add("a/_.context.js", "export class Context  { name = 'a' }");
      await $.add("package.json", '{ "type": "module" }');
      const registry = new Registry();
      const contextRegistry = new ContextRegistry();
      const loader = new ModuleLoader($.path("."), registry, contextRegistry);
      await loader.load();
      const rootContext = contextRegistry.find("/");
      assert.equal(rootContext?.loadContext("/a")?.name, "a");
    });
  });
  it("injects the shared store only when constructing contexts", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "_.context.js",
        "export class Context { constructor($) { this.receivedStore = $.store; this.count = 0 } }",
      );
      await $.add("package.json", '{ "type": "module" }');
      const store = { shared: true };
      const contextRegistry = new ContextRegistry();
      const loader = new ModuleLoader(
        $.path("."),
        new Registry(),
        contextRegistry,
        undefined,
        undefined,
        () => store,
      );
      await loader.load();
      assert.equal(contextRegistry.find("/").receivedStore, store);
    });
  });
  it("reloads contexts with a newly activated store while preserving state", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "_.context.js",
        "export class Context { constructor($) { this.store = $.store; this.count = 0 } }",
      );
      await $.add("package.json", '{ "type": "module" }');
      const storeRef = {};
      const contextRegistry = new ContextRegistry();
      const loader = new ModuleLoader(
        $.path("."),
        new Registry(),
        contextRegistry,
        undefined,
        undefined,
        () => storeRef.current,
      );
      await loader.load();
      const context = contextRegistry.find("/");
      context.count = 7;
      storeRef.current = { activated: true };
      await loader.reloadContexts();
      assert.equal(contextRegistry.find("/"), context);
      assert.equal(context.count, 7);
      assert.equal(context.store, storeRef.current);
    });
  });
  it("provides readJson for reading JSON files relative to the context file", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("data.json", '{"name": "test", "value": 42}');
      await $.add(
        "_.context.js",
        "export class Context { constructor({ readJson }) { this.readJson = readJson; } }",
      );
      await $.add("package.json", '{ "type": "module" }');
      const registry = new Registry();
      const contextRegistry = new ContextRegistry();
      const loader = new ModuleLoader($.path("."), registry, contextRegistry);
      await loader.load();
      const rootContext = contextRegistry.find("/");
      const data = await rootContext.readJson("./data.json");
      assert.deepEqual(data, { name: "test", value: 42 });
    });
  });
  it("resolves readJson paths relative to the context file's directory", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("shared/data.json", '{"shared": true}');
      await $.add(
        "sub/_.context.js",
        "export class Context { constructor({ readJson }) { this.readJson = readJson; } }",
      );
      await $.add("package.json", '{ "type": "module" }');
      const registry = new Registry();
      const contextRegistry = new ContextRegistry();
      const loader = new ModuleLoader($.path("."), registry, contextRegistry);
      await loader.load();
      const subContext = contextRegistry.find("/sub");
      const data = await subContext.readJson("../shared/data.json");
      assert.deepEqual(data, { shared: true });
    });
  });
  it("registers a 500 handler for an ESM route file with a syntax error", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("bad-syntax.js", "this is not valid javascript @@@");
      await $.add("package.json", '{ "type": "module" }');
      const registry = new Registry();
      const loader = new ModuleLoader($.path(""), registry);
      await loader.load();
      assert.equal(registry.exists("GET", "/bad-syntax"), true);
      const response = await registry.endpoint("GET", "/bad-syntax")({});
      assert.equal(response?.status, 500);
      assert.ok(response?.body.includes("bad-syntax.js"));
    });
  });
  it("registers a 500 handler for a CJS route file with a syntax error", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("bad-syntax.cjs", "this is not valid javascript @@@");
      const registry = new Registry();
      const loader = new ModuleLoader($.path(""), registry);
      await loader.load();
      assert.equal(registry.exists("GET", "/bad-syntax"), true);
      const response = await registry.endpoint("GET", "/bad-syntax")({});
      assert.equal(response?.status, 500);
      assert.ok(response?.body.includes("bad-syntax.cjs"));
      assert.ok(response?.body.includes("syntax error"));
    });
  });
  it("prints a warning and skips loading a context file with a syntax error", async (t) => {
    await usingTemporaryFiles(async ($) => {
      await $.add("_.context.js", "this is not valid javascript @@@");
      await $.add(
        "hello.js",
        'export function GET() { return { body: "hello" }; }',
      );
      await $.add("package.json", '{ "type": "module" }');
      const registry = new Registry();
      const contextRegistry = new ContextRegistry();
      const loader = new ModuleLoader($.path(""), registry, contextRegistry);
      const stdout = t.mock.method(process.stdout, "write", () => true);
      assert.equal(await loader.load(), undefined);
      assert.equal(registry.exists("GET", "/hello"), true);
      assert.deepEqual(contextRegistry.getAllPaths(), ["/"]);
      assert.equal(stdout.mock.callCount(), 1);
      const [warning] = stdout.mock.calls[0].arguments;
      assert.ok(warning.includes("syntax error in the context file:"));
      assert.ok(warning.includes("_.context.js"));
    });
  });
});
describe("ModuleLoader scenario loading", () => {
  it("loads scenario files into the ScenarioRegistry on load()", async () => {
    const { ScenarioRegistry } =
      await import("../dist/server/scenario-registry.js");
    await usingTemporaryFiles(async ($) => {
      await $.add("routes/package.json", '{ "type": "module" }');
      await $.add(
        "scenarios/index.js",
        `export function soldPets() {}
export function resetAll() {}
export const notAFunction = 42;`,
      );
      await $.add("scenarios/package.json", '{ "type": "module" }');
      const registry = new Registry();
      const scenarioRegistry = new ScenarioRegistry();
      const loader = new ModuleLoader(
        $.path("routes"),
        registry,
        undefined,
        $.path("scenarios"),
        scenarioRegistry,
      );
      await loader.load();
      const names = scenarioRegistry.getExportedFunctionNames("index");
      assert.ok(names.includes("soldPets"));
      assert.ok(names.includes("resetAll"));
      // Non-functions are still stored but getExportedFunctionNames filters them
      assert.ok(!names.includes("notAFunction"));
    });
  });
  it("stores a nested scenario file under a slash-delimited key", async () => {
    const { ScenarioRegistry } =
      await import("../dist/server/scenario-registry.js");
    await usingTemporaryFiles(async ($) => {
      await $.add("routes/package.json", '{ "type": "module" }');
      await $.add("scenarios/pets/index.js", `export function sold() {}`);
      await $.add("scenarios/pets/package.json", '{ "type": "module" }');
      const registry = new Registry();
      const scenarioRegistry = new ScenarioRegistry();
      const loader = new ModuleLoader(
        $.path("routes"),
        registry,
        undefined,
        $.path("scenarios"),
        scenarioRegistry,
      );
      await loader.load();
      const names = scenarioRegistry.getExportedFunctionNames("pets/index");
      assert.ok(names.includes("sold"));
    });
  });
  it("does not throw when the scenarios directory does not exist", async () => {
    const { ScenarioRegistry } =
      await import("../dist/server/scenario-registry.js");
    await usingTemporaryFiles(async ($) => {
      await $.add("routes/package.json", '{ "type": "module" }');
      const registry = new Registry();
      const scenarioRegistry = new ScenarioRegistry();
      const loader = new ModuleLoader(
        $.path("routes"),
        registry,
        undefined,
        $.path("scenarios"), // does not exist
        scenarioRegistry,
      );
      assert.equal(await loader.load(), undefined);
      assert.equal(scenarioRegistry.getFileKeys().length, 0);
    });
  });
});

it("restores source import errors after initial load and a failed hot reload", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("broken.cjs", 'throw new Error("initial import failure");');
    await $.add("changed.cjs", 'exports.GET = () => "original";');
    const registry = new Registry();
    const loader = new ModuleLoader($.path("."), registry);
    await loader.load();
    const error = registry.handler("/broken", "GET").module.GET;
    assert.equal(error({}).status, 500);
    loader.resetRoutes();
    assert.equal(registry.handler("/broken", "GET").module.GET, error);
    await loader.watch();
    try {
      const changed = once(loader, "add");
      await $.add("changed.cjs", 'throw new Error("reload import failure");');
      await changed;
      const failedReload = registry.handler("/changed", "GET").module.GET;
      assert.equal(failedReload({}).status, 500);
      loader.resetRoutes();
      assert.equal(
        registry.handler("/changed", "GET").module.GET,
        failedReload,
      );
    } finally {
      await loader.stopWatching();
    }
  });
});

it("resets nested contexts on demand and restores source middleware and handlers", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "_.context.mjs",
      'export class Context { constructor({loadContext}){this.child=loadContext("/CHILD/deeper");} }',
    );
    await $.add(
      "child/_.context.mjs",
      "export class Context { count=0; constructor({loadContext}){this.lookup=loadContext;} }",
    );
    await $.add(
      "_.middleware.mjs",
      "export const middleware=async ($,next)=>next($);",
    );
    await $.add("index.mjs", 'export const GET=()=>({body:"source"});');
    const registry = new Registry();
    const contexts = new ContextRegistry();
    const loader = new ModuleLoader($.path("."), registry, contexts);
    await loader.load();
    const original = contexts.find("/");
    assert.equal(original.child, contexts.find("/child"));
    assert.equal(original.child.lookup("/missing"), original);
    original.child.count = 9;
    loader.resetContexts();
    assert.notEqual(contexts.find("/"), original);
    assert.equal(contexts.find("/").child.count, 0);
    const source = registry.handler("/", "GET").module.GET;
    registry.add("/", { GET: () => ({ body: "override" }) });
    loader.resetRoutes();
    assert.equal(registry.handler("/", "GET").module.GET, source);
  });
});

it("rejects circular context dependencies instead of exposing partially initialized state", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "_.context.mjs",
      'export class Context { constructor({loadContext}){loadContext("/child");} }',
    );
    await $.add(
      "child/_.context.mjs",
      'export class Context { constructor({loadContext}){loadContext("/");} }',
    );
    const loader = new ModuleLoader($.path("."), new Registry());
    await assert.rejects(loader.load(), /Circular context dependency/u);
  });
});

it("diagnoses missing and malformed context JSON without changing path resolution", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "_.context.mjs",
      "export class Context { constructor({readJson}){this.readJson=readJson;} }",
    );
    await $.add("invalid.json", '{"broken":');
    const contexts = new ContextRegistry();
    await new ModuleLoader($.path("."), new Registry(), contexts).load();
    await assert.rejects(
      contexts.find("/").readJson("missing.json"),
      /readJson: could not read file/u,
    );
    await assert.rejects(
      contexts.find("/").readJson("invalid.json"),
      /does not contain valid JSON/u,
    );
  });
});

it("skips undefined CommonJS exports and scenario declaration files", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("routes/empty.cjs", "module.exports=undefined;");
    await $.add("scenarios/empty.cjs", "module.exports=undefined;");
    await $.add("scenarios/ignored.d.ts", "this should never be evaluated");
    const { ScenarioRegistry } =
      await import("../dist/server/scenario-registry.js");
    const registry = new Registry();
    const scenarios = new ScenarioRegistry();
    await new ModuleLoader(
      $.path("routes"),
      registry,
      undefined,
      $.path("scenarios"),
      scenarios,
    ).load();
    assert.equal(registry.exists("GET", "/empty"), false);
    assert.deepEqual(scenarios.getFileKeys(), []);
  });
});

it("reports scenario import errors without preventing routes from loading", async (t) => {
  await usingTemporaryFiles(async ($) => {
    await $.add("routes/probe.mjs", 'export const GET=()=>({body:"ready"});');
    await $.add(
      "scenarios/broken.mjs",
      'throw new Error("scenario import failed");',
    );
    const { ScenarioRegistry } =
      await import("../dist/server/scenario-registry.js");
    const stdout = t.mock.method(process.stdout, "write", () => true);
    const registry = new Registry();
    await new ModuleLoader(
      $.path("routes"),
      registry,
      undefined,
      $.path("scenarios"),
      new ScenarioRegistry(),
    ).load();
    assert.equal(registry.exists("GET", "/probe"), true);
    assert.ok(
      stdout.mock.calls.some((call) =>
        String(call.arguments[0]).includes("scenario import failed"),
      ),
    );
  });
});

it("keeps watcher reloads working when telemetry fails and reports constructor failures", async (t) => {
  await usingTemporaryFiles(async ($) => {
    await $.add("_.context.mjs", "export class Context { value=1; }");
    const contexts = new ContextRegistry();
    const loader = new ModuleLoader(
      $.path("."),
      new Registry(),
      contexts,
      undefined,
      undefined,
      undefined,
      () => {
        throw new Error("telemetry unavailable");
      },
    );
    await loader.load();
    t.after(() => loader.stopWatching());
    await loader.watch();
    const changed = once(loader, "add");
    await $.add("_.context.mjs", "export class Context { value=2; }");
    await changed;
    assert.equal(contexts.find("/").value, 2);
    let reported;
    const diagnostic = new Promise((resolve) => {
      reported = resolve;
    });
    t.mock.method(process.stderr, "write", (message) => {
      if (String(message).includes("constructor failed")) reported();
      return true;
    });
    t.mock.method(process.stdout, "write", () => true);
    await $.add(
      "_.context.mjs",
      'export class Context { constructor(){throw new Error("constructor failed");} }',
    );
    await diagnostic;
    assert.equal(contexts.find("/").value, 2);
  });
});

it("warns about legacy context filenames without registering them", async (t) => {
  await usingTemporaryFiles(async ($) => {
    await $.addDirectory("routes");
    const registry = new Registry();
    const loader = new ModuleLoader($.path("routes"), registry);
    await loader.load();
    t.after(() => loader.stopWatching());
    await loader.watch();
    let warned;
    const diagnostic = new Promise((resolve) => {
      warned = resolve;
    });
    t.mock.method(process.stdout, "write", (message) => {
      if (String(message).includes("needs a minor update")) warned();
      return true;
    });
    await $.add("routes/$.context.mjs", "export const ignored=true;");
    await diagnostic;
    assert.equal(registry.exists("GET", "/$.context"), false);
  });
});
