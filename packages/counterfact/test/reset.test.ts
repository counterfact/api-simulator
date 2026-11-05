import { jest } from "@jest/globals";
import request from "supertest";
import { usingTemporaryFiles } from "using-temporary-files";

import { counterfact } from "../src/app.js";
import type { Config } from "../src/config.js";

const config: Config = {
  openApiPath: "_",
  basePath: ".",
  port: 0,
  prefix: "",
  alwaysFakeOptionals: false,
  buildCache: false,
  generate: { routes: false, types: false },
  watch: { routes: false, types: false },
  proxyPaths: new Map(),
  proxyUrl: "",
  startRepl: false,
  startServer: true,
  validateRequests: false,
  validateResponses: false,
};

function deferred() {
  let finish!: () => void;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, resolve: finish };
}

it("reconstructs stores, nested dependencies, records and routes while retaining the listening address", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "_.store.ts",
      `export class Store {
      records = new Map([["baseline", { name: "Original" }]]);
      count = 0;
      value() { return this.records.get("baseline").name; }
    }`,
    );
    await $.add(
      "routes/_.context.js",
      `export class Context {
      constructor({ store }) { this.store = store; this.baseline = "present"; }
    }`,
    );
    await $.add(
      "routes/nested/_.context.js",
      `export class Context {
      constructor({ store, loadContext }) { this.store = store; this.root = loadContext("/"); this.lookup = loadContext; }
    }`,
    );
    await $.add(
      "routes/state.js",
      `export function GET({ context }) {
      return { body: { records: [...context.store.records], count: context.store.count, baseline: context.baseline, extra: context.extra } };
    }
    export function POST({ context }) {
      context.store.records.delete("baseline");
      context.store.records.set("added", { name: "Added" });
      context.store.extra = true; context.extra = true; delete context.baseline;
      return "mutated";
    }`,
    );
    await $.add(
      "routes/_.middleware.cjs",
      `exports.middleware = async function ($, next) {
      const response = await next($);
      return {...response, headers: {...response.headers, "x-source": "present"}};
    }`,
    );
    await $.add(
      "scenarios/index.js",
      `export async function startup($) {
      await new Promise(resolve => setTimeout(resolve, 5));
      $.context.store.count += 1;
      $.context.ready = true;
      $.routes.baseline = $.route("/state");
    }
    export async function emptyProjects($) {
      await Promise.resolve(); $.context.store.records.clear();
      $.routes.temporary = $.route("/temporary");
    }
    export function inspectBuilders($) {
      $.context.builders = Object.keys($.routes).sort();
    }`,
    );
    await $.add(
      "scenarios/pets/orders.js",
      `export async function pending($) {
      await Promise.resolve(); $.loadContext("/").store.records.set("pending", { name: "Pending" });
    }`,
    );
    const simulator = await counterfact<{
      records: Map<string, object>;
      extra?: boolean;
      count: number;
      value(): string;
    }>({ ...config, basePath: $.path(".") });
    const listen = jest.spyOn(simulator.koaApp, "listen");
    const { stop } = await simulator.start(config);
    const server = listen.mock.results[0]!.value;
    const address = server.address();
    try {
      const initialContext = simulator.loadContext();
      const initialStore = simulator.store;
      const client = request(server);
      const initialResponse = await client.get("/state");
      expect(initialResponse.headers["x-source"]).toBe("present");
      const baseline = initialResponse.body;
      expect(baseline.count).toBe(1);
      await client.post("/state").expect(200);
      await simulator.scenario("emptyProjects");
      await simulator.scenario("pets/orders/pending");
      expect(simulator.store!.records.has("pending")).toBe(true);
      // Runtime additions and replacement handlers must not become the baseline.
      simulator.registry.add("/temporary", { GET: () => "temporary" });
      simulator.registry.add("/state", { GET: () => "override" });
      simulator.contextRegistry.add("/dynamic", { extra: true });
      simulator.registry.addMiddleware("/state", async ($, next) => ({
        ...(await next($)),
        headers: { "x-dynamic": "present" },
      }));
      await client.get("/temporary").expect(200);
      for (let iteration = 0; iteration < 3; iteration += 1) {
        await simulator.reset();
        const restored = await client.get("/state").expect(200);
        expect(restored.body).toEqual(baseline);
        expect(restored.headers["x-source"]).toBe("present");
        expect(restored.headers["x-dynamic"]).toBeUndefined();
        await client.get("/temporary").expect(404);
        expect(simulator.store!.value()).toBe("Original");
        expect(simulator.store!.extra).toBeUndefined();
        expect(simulator.store).not.toBe(initialStore);
        expect(simulator.loadContext()).not.toBe(initialContext);
        const nested = simulator.loadContext("/nested");
        expect(nested["store"]).toBe(simulator.store);
        expect(nested["root"]).toBe(simulator.loadContext());
        const dynamic = { unique: iteration };
        simulator.contextRegistry.add("/runtime", dynamic);
        expect(
          (nested["lookup"] as (path: string) => unknown)("/runtime"),
        ).toBe(dynamic);
        expect(simulator.loadContext()["ready"]).toBe(true);
        expect(simulator.contextRegistry.getAllPaths()).not.toContain(
          "/dynamic",
        );
        expect(server.address()).toEqual(address);
        await simulator.scenario("inspectBuilders");
        expect(simulator.loadContext()["builders"]).toEqual(["baseline"]);
      }
      await expect(simulator.scenario("unknown")).rejects.toThrow(
        '"unknown" is not a function',
      );
      await expect(simulator.scenario("missing/export")).rejects.toThrow(
        'Could not find scenario file "missing"',
      );
      await expect(simulator.scenario("../pending")).rejects.toThrow(
        "Path must not contain",
      );
    } finally {
      await stop();
      listen.mockRestore();
    }
    expect(server.listening).toBe(false);
    await expect(simulator.reset()).rejects.toThrow(
      "requires a started simulator",
    );
  });
});

it("drains active requests, rejects new requests, coalesces resets and awaits async startup", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "routes/state.js",
      `export async function GET({ context }) {
      context.entered(); await context.wait; context.finished = true; return "complete";
    }`,
    );
    await $.add(
      "scenarios/index.js",
      `let gate; let enter;
      export function holdStartup($) { gate = $.context.gate; enter = $.context.enterStartup; }
      export async function startup($) { if (gate) { enter(); await gate; } $.context.ready = true; }
      export async function waiting($) { $.context.enterScenario(); await $.context.scenarioGate; }
    `,
    );
    const simulator = await counterfact({ ...config, basePath: $.path(".") });
    const { stop } = await simulator.start(config);
    const entered = deferred();
    const finishRequest = deferred();
    const startupEntered = deferred();
    const finishStartup = deferred();
    try {
      const context = simulator.loadContext();
      context["entered"] = entered.resolve;
      context["wait"] = finishRequest.promise;
      context["gate"] = finishStartup.promise;
      context["enterStartup"] = startupEntered.resolve;
      await simulator.scenario("holdStartup");
      const active = request(simulator.koaApp.callback())
        .get("/state")
        .then((response) => response);
      await entered.promise;
      const first = simulator.reset();
      expect(simulator.reset()).toBe(first);
      await request(simulator.koaApp.callback()).get("/state").expect(503);
      expect(() => simulator.loadContext()).toThrow("Context unavailable");
      await expect(simulator.scenario("anything")).rejects.toThrow(
        "await reset() first",
      );
      finishRequest.resolve();
      await active;
      await startupEntered.promise;
      let resetFinished = false;
      void first.then(() => {
        resetFinished = true;
        return undefined;
      });
      await request(simulator.koaApp.callback()).get("/state").expect(503);
      expect(resetFinished).toBe(false);
      finishStartup.resolve();
      await first;
      expect(context["finished"]).toBe(true);
      expect(simulator.loadContext()["finished"]).toBeUndefined();
      expect(simulator.loadContext()["ready"]).toBe(true);
      const scenarioEntered = deferred();
      const finishScenario = deferred();
      simulator.loadContext()["enterScenario"] = scenarioEntered.resolve;
      simulator.loadContext()["scenarioGate"] = finishScenario.promise;
      const scenario = simulator.scenario("waiting");
      await scenarioEntered.promise;
      await expect(simulator.reset()).rejects.toThrow(
        "Cannot reset while a scenario is running",
      );
      await expect(simulator.scenario("waiting")).rejects.toThrow(
        "Another scenario is already running",
      );
      finishScenario.resolve();
      await scenario;
    } finally {
      finishRequest.resolve();
      startupEntered.resolve();
      finishStartup.resolve();
      await stop();
    }
  });
});

it("resets each group once in startup order and selects named scenarios explicitly", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("_.store.ts", `export class Store { order = []; }`);
    for (const group of ["billing", "inventory"]) {
      await $.add(
        `${group}/routes/_.context.js`,
        `export class Context { constructor({store}) { this.store = store; } }`,
      );
      await $.add(
        `${group}/routes/${group}.js`,
        `export function GET({context}) { return {body: context.store.order}; }`,
      );
      await $.add(
        `${group}/scenarios/index.js`,
        `export async function startup($) {
        await Promise.resolve(); $.context.store.order.push("${group}");
      }
      export async function selected($) { await Promise.resolve(); $.context.selected = "${group}"; }`,
      );
    }
    const simulator = await counterfact<{ order: string[] }>(
      { ...config, basePath: $.path(".") },
      [
        { source: "_", group: "billing", version: "v1", prefix: "/v1" },
        { source: "_", group: "inventory", prefix: "/inventory" },
        { source: "_", group: "billing", version: "v2", prefix: "/v2" },
      ],
    );
    const { stop } = await simulator.start(config);
    try {
      for (let i = 0; i < 2; i += 1) {
        expect(simulator.store!.order).toEqual(["billing", "inventory"]);
        await expect(simulator.scenario("selected")).rejects.toThrow(
          "Select an API group",
        );
        await expect(simulator.scenario("selected", "missing")).rejects.toThrow(
          "Available groups",
        );
        await simulator.scenario("selected", "inventory");
        expect(simulator.loadContext("/", "inventory")["selected"]).toBe(
          "inventory",
        );
        expect(
          simulator.loadContext("/", "billing")["selected"],
        ).toBeUndefined();
        await request(simulator.koaApp.callback())
          .get("/v2/billing")
          .expect(200, ["billing", "inventory"]);
        await simulator.reset();
      }
    } finally {
      await stop();
    }
  });
});

it("keeps failed resets unavailable, allows recovery, and cleans up while resetting", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("_.store.ts", `export class Store { fail = false; }`);
    await $.add(
      "routes/_.context.js",
      `export class Context { constructor({store}) { this.store = store; } }`,
    );
    await $.add("routes/state.js", `export function GET() { return "ready"; }`);
    await $.add(
      "scenarios/index.cjs",
      `let failures = 0;
      exports.startup = async ($) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        if (failures-- > 0) throw new Error("seed failed");
        $.context.ready = true;
      }
      exports.breakStartup = () => { failures = 2; };
    `,
    );
    const simulator = await counterfact({ ...config, basePath: $.path(".") });
    const { stop } = await simulator.start(config);
    try {
      await simulator.scenario("breakStartup");
      await expect(simulator.reset()).rejects.toThrow(
        "Startup scenario failed for the primary API: seed failed",
      );
      await request(simulator.koaApp.callback()).get("/state").expect(503);
      await expect(simulator.reset()).rejects.toThrow("seed failed");
      await expect(simulator.scenario("startup")).rejects.toThrow(
        "requires a running simulator",
      );
      expect(() => simulator.loadContext()).toThrow("Context unavailable");
      expect(() => simulator.store).toThrow("Store unavailable");
      // The loaded startup fails twice, then succeeds; retry reconstructs from scratch.
      await simulator.reset();
      expect(simulator.loadContext()["ready"]).toBe(true);
      await request(simulator.koaApp.callback())
        .get("/state")
        .expect(200, "ready");
      const resetting = simulator.reset();
      await stop();
      await resetting;
      await expect(simulator.scenario("startup")).rejects.toThrow(
        "requires a running simulator",
      );
    } finally {
      await stop();
    }
  });
});

it("reports constructor failures, keeps HTTP gated, and permits a fresh retry", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "_.store.ts",
      `export class Store {
      static failNext = false;
      constructor() { if (Store.failNext) { Store.failNext = false; throw new Error("store construction failed"); } }
      fail() { Store.failNext = true; }
    }`,
    );
    await $.add(
      "routes/_.context.js",
      `export class Context {
      static failNext = false;
      constructor({store}) { if (Context.failNext) { Context.failNext = false; throw new Error("context construction failed"); } this.store = store; }
      fail() { Context.failNext = true; }
    }`,
    );
    await $.add("routes/state.js", `export function GET() { return "ready"; }`);
    const simulator = await counterfact<{ fail(): void }>({
      ...config,
      basePath: $.path("."),
    });
    const { stop } = await simulator.start(config);
    try {
      simulator.store!.fail();
      await expect(simulator.reset()).rejects.toThrow(
        "store construction failed",
      );
      await request(simulator.koaApp.callback()).get("/state").expect(503);
      await simulator.reset();
      (simulator.loadContext()["fail"] as () => void)();
      await expect(simulator.reset()).rejects.toThrow(
        "context construction failed",
      );
      await request(simulator.koaApp.callback()).get("/state").expect(503);
      await simulator.reset();
      await request(simulator.koaApp.callback())
        .get("/state")
        .expect(200, "ready");
    } finally {
      await stop();
    }
  });
});

it("rejects circular constructor dependencies and cleans up failed startup", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "routes/_.context.js",
      `export class Context { constructor({loadContext}) { this.child = loadContext("/nested"); } }`,
    );
    await $.add(
      "routes/nested/_.context.js",
      `export class Context { constructor({loadContext}) { this.parent = loadContext("/"); } }`,
    );
    const simulator = await counterfact({ ...config, basePath: $.path(".") });
    await expect(simulator.start(config)).rejects.toThrow(
      "Circular context dependency",
    );
    await expect(simulator.reset()).rejects.toThrow(
      "requires a started simulator",
    );
  });
});

it("preserves context identity and mutations across the existing stop/start lifecycle", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "routes/_.context.js",
      `export class Context { baseline = true; }`,
    );
    const simulator = await counterfact({ ...config, basePath: $.path(".") });
    const first = await simulator.start(config);
    const context = simulator.loadContext();
    context["extra"] = true;
    await first.stop();
    const second = await simulator.start(config);
    try {
      expect(simulator.loadContext()).toBe(context);
      expect(simulator.loadContext()["extra"]).toBe(true);
    } finally {
      await second.stop();
    }
  });
});

it("waits for streamed responses before rebuilding application state", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "routes/stream.js",
      `export function GET({context}) {
      return { contentType: "text/plain", body: (async function* () {
        yield "first"; context.entered(); await context.wait;
        context.finished = true; yield "last";
      })() };
    }`,
    );
    const simulator = await counterfact({ ...config, basePath: $.path(".") });
    const { stop } = await simulator.start(config);
    const entered = deferred();
    const finish = deferred();
    const context = simulator.loadContext();
    context["entered"] = entered.resolve;
    context["wait"] = finish.promise;
    try {
      const streaming = request(simulator.koaApp.callback())
        .get("/stream")
        .then((response) => response);
      await entered.promise;
      const resetting = simulator.reset();
      await request(simulator.koaApp.callback()).get("/stream").expect(503);
      expect(context["finished"]).toBeUndefined();
      finish.resolve();
      expect((await streaming).text).toContain("last");
      await resetting;
      expect(context["finished"]).toBe(true);
      expect(simulator.loadContext()["finished"]).toBeUndefined();
    } finally {
      finish.resolve();
      await stop();
    }
  });
});

it.each(["initial configuration", "startup override"])(
  "uses the assigned port from %s for public scenarios and startup builders recreated by reset",
  async (portSource) => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "routes/state.cjs",
        `exports.GET = ({context}) => {
      context.requests = (context.requests || 0) + 1; return "connected";
    };`,
      );
      await $.add(
        "scenarios/index.cjs",
        `exports.startup = ($) => { $.routes.state = $.route("/state").method("get"); };
      exports.request = async ($) => { await $.route("/state").method("get").send(); };
      exports.savedRequest = async ($) => { await $.routes.state.send(); };`,
      );
      const simulator = await counterfact({
        ...config,
        basePath: $.path("."),
        port: portSource === "startup override" ? 8100 : 0,
      });
      const { stop } = await simulator.start(
        portSource === "startup override" ? { port: 0 } : undefined,
      );
      try {
        const initialStatus = simulator.status();
        expect(initialStatus.listening).toBe(true);
        expect(initialStatus.port).toBe(0);
        expect(initialStatus.address?.port).toBeGreaterThan(0);
        await simulator.scenario("request");
        expect(simulator.loadContext()["requests"]).toBe(1);
        await simulator.scenario("savedRequest");
        expect(simulator.loadContext()["requests"]).toBe(2);
        await simulator.reset();
        expect(simulator.status()).toEqual(initialStatus);
        await simulator.scenario("savedRequest");
        expect(simulator.loadContext()["requests"]).toBe(1);
      } finally {
        await stop();
      }
    });
  },
);

it("keeps state guarded when shutdown overlaps pending or failed reset startup", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.addDirectory("routes");
    await $.add("_.store.ts", `export class Store { ready = true; }`);
    await $.add(
      "scenarios/index.cjs",
      `let gate; let entered; let fail;
      exports.arm = ($) => { gate = $.context.gate; entered = $.context.entered; fail = $.context.fail; };
      exports.startup = async () => { if (gate) { entered(); await gate; if (fail) throw new Error("seed failed"); } };`,
    );
    for (const fail of [false, true]) {
      const simulator = await counterfact({ ...config, basePath: $.path(".") });
      const { stop } = await simulator.start(config);
      const entered = deferred();
      const gate = deferred();
      try {
        Object.assign(simulator.loadContext(), {
          gate: gate.promise,
          entered: entered.resolve,
          fail,
        });
        await simulator.scenario("arm");
        const resetting = simulator.reset();
        const outcome = resetting.then(
          () => undefined,
          (error) => error,
        );
        await entered.promise;
        const stopping = stop();
        expect(() => simulator.store).toThrow("Store unavailable");
        expect(() => simulator.loadContext()).toThrow("Context unavailable");
        gate.resolve();
        const error = await outcome;
        await stopping;
        expect(error instanceof Error).toBe(fail);
      } finally {
        gate.resolve();
        await stop();
      }
    }
  });
});

it("waits for a disconnected stream's blocked producer and asynchronous cleanup", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "routes/stream.cjs",
      `exports.GET = ({context}) => ({contentType: "text/plain", body: (async function* () {
      try { yield "first"; context.entered(); await context.wait; }
      finally { context.cleanupEntered(); await context.cleanup; context.cleaned = true; }
    })()});`,
    );
    const simulator = await counterfact({ ...config, basePath: $.path(".") });
    const listen = jest.spyOn(simulator.koaApp, "listen");
    const { stop } = await simulator.start(config);
    const server = listen.mock.results[0]!.value;
    const entered = deferred();
    const finish = deferred();
    const cleanupEntered = deferred();
    const cleanup = deferred();
    const closed = deferred();
    // A deliberate client disconnect can emit Koa's expected premature-close error.
    simulator.koaApp.on("error", () => {});
    const context = simulator.loadContext();
    Object.assign(context, {
      entered: entered.resolve,
      wait: finish.promise,
      cleanupEntered: cleanupEntered.resolve,
      cleanup: cleanup.promise,
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Expected a TCP listener");
      const { get } = await import("node:http");
      const client = get(
        `http://localhost:${address.port}/stream`,
        (response) => {
          response.on("error", () => {});
          response.once("close", closed.resolve);
          response.once("data", () => response.destroy());
        },
      );
      client.on("error", () => {});
      await entered.promise;
      await closed.promise;
      const resetting = simulator.reset();
      await request(server).get("/stream").expect(503);
      finish.resolve();
      await cleanupEntered.promise;
      await request(server).get("/stream").expect(503);
      expect(context["cleaned"]).toBeUndefined();
      cleanup.resolve();
      await resetting;
      expect(context["cleaned"]).toBe(true);
      expect(simulator.loadContext()["cleaned"]).toBeUndefined();
    } finally {
      finish.resolve();
      cleanup.resolve();
      await stop();
      listen.mockRestore();
    }
  });
});
