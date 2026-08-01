/* eslint-disable @typescript-eslint/no-explicit-any */
// import { describe, it, expect } from "@jest/globals";
import { jest } from "@jest/globals";
import request from "supertest";
import { usingTemporaryFiles } from "using-temporary-files";

import * as app from "../src/app";
import { ApiRunner } from "../src/api-runner";
import { ContextRegistry } from "../src/server/context-registry";
import { ScenarioRegistry } from "../src/server/scenario-registry";

// Minimal valid mock Config
const mockConfig = {
  openApiPath: "_",
  basePath: ".",
  port: 1234,
  alwaysFakeOptionals: false,
  generate: { routes: false, types: false },
  proxyPaths: new Map(),
  proxyUrl: "",
  startAdminApi: false,
  startRepl: false,
  startServer: false,
  watch: { routes: false, types: false },
  prefix: "",
};

describe("counterfact", () => {
  it("returns a startRepl function", async () => {
    const result = await (app as any).counterfact(mockConfig);
    expect(typeof result.startRepl).toBe("function");
  });

  it("returns contextRegistry, registry, koaApp, and start", async () => {
    const result = await (app as any).counterfact(mockConfig);
    expect(result.contextRegistry).toBeDefined();
    expect(result.registry).toBeDefined();
    expect(result.koaApp).toBeDefined();
    expect(result.routesMiddleware).toBeUndefined();
    expect(typeof result.start).toBe("function");
  });

  it("does not start the REPL automatically", async () => {
    // If start() still auto-started the REPL, it would call repl.start() which binds
    // to stdin; testing the `startRepl` property being a separate callable is the
    // architectural contract. We also verify start() returns a stop() function (not
    // a replServer), confirming the REPL is no longer embedded in the return value.
    const { start, startRepl } = await (app as any).counterfact({
      ...mockConfig,
      startRepl: true,
    });
    const result = await start({ ...mockConfig, startRepl: true });
    expect(typeof startRepl).toBe("function");
    expect(typeof result.stop).toBe("function");
    expect((result as any).replServer).toBeUndefined();
    await result.stop();
  });

  it("accepts a specs array and creates runners for each spec", async () => {
    const spy = jest.spyOn(ApiRunner, "create");

    const specs = [
      { source: "_", prefix: "/api/v1", group: "v1" },
      { source: "_", prefix: "/api/v2", group: "v2" },
    ];

    await (app as any).counterfact(mockConfig, specs);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ openApiPath: "_", prefix: "/api/v1" }),
      "v1",
      "",
      [],
      expect.objectContaining({
        contextRegistry: expect.any(ContextRegistry),
        scenarioRegistry: expect.any(ScenarioRegistry),
      }),
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ openApiPath: "_", prefix: "/api/v2" }),
      "v2",
      "",
      [],
      expect.objectContaining({
        contextRegistry: expect.any(ContextRegistry),
        scenarioRegistry: expect.any(ScenarioRegistry),
      }),
    );

    spy.mockRestore();
  });

  it("throws when multiple specs include an empty group", async () => {
    const specs = [
      { source: "_", prefix: "/api/v1", group: "billing" },
      { source: "_", prefix: "/api/v2", group: "" },
    ];

    await expect((app as any).counterfact(mockConfig, specs)).rejects.toThrow(
      "Each spec must define a non-empty group when multiple APIs are configured",
    );
  });

  it("allows a single spec with an empty group", async () => {
    const specs = [{ source: "_", prefix: "/api/v1", group: "" }];

    await expect((app as any).counterfact(mockConfig, specs)).resolves.toEqual(
      expect.objectContaining({
        start: expect.any(Function),
        startRepl: expect.any(Function),
      }),
    );
  });

  it("throws when multiple specs include duplicate groups", async () => {
    const specs = [
      { source: "_", prefix: "/api/v1", group: "billing" },
      { source: "_", prefix: "/api/v2", group: "billing" },
    ];

    await expect((app as any).counterfact(mockConfig, specs)).rejects.toThrow(
      "Each spec must define a unique group (and version) when multiple APIs are configured",
    );
  });

  it("allows two specs with the same group but different non-empty versions", async () => {
    const specs = [
      { source: "_", prefix: "/api/v1", group: "my-api", version: "v1" },
      { source: "_", prefix: "/api/v2", group: "my-api", version: "v2" },
    ];

    await expect((app as any).counterfact(mockConfig, specs)).resolves.toEqual(
      expect.objectContaining({
        start: expect.any(Function),
        startRepl: expect.any(Function),
      }),
    );
  });

  it("shares context and scenarios across versions in a group but isolates different groups", async () => {
    const realCreate = ApiRunner.create;
    const capturedRunners: ApiRunner[] = [];
    const createSpy = jest
      .spyOn(ApiRunner, "create")
      .mockImplementation(async (...args) => {
        const runner = await realCreate.apply(ApiRunner, args);
        capturedRunners.push(runner);
        return runner;
      });

    await (app as any).counterfact(mockConfig, [
      { source: "_", group: "billing", version: "v1" },
      { source: "_", group: "inventory", version: "v1" },
      { source: "_", group: "billing", version: "v2" },
    ]);

    const billingV1 = capturedRunners.find(
      ({ group, version }) => group === "billing" && version === "v1",
    )!;
    const billingV2 = capturedRunners.find(
      ({ group, version }) => group === "billing" && version === "v2",
    )!;
    const inventory = capturedRunners.find(
      ({ group }) => group === "inventory",
    )!;

    expect(billingV1.contextRegistry).toBe(billingV2.contextRegistry);
    expect(billingV1.scenarioRegistry).toBe(billingV2.scenarioRegistry);
    expect(billingV1.contextRegistry).not.toBe(inventory.contextRegistry);
    expect(billingV1.scenarioRegistry).not.toBe(inventory.scenarioRegistry);

    billingV1.contextRegistry.find("/")["seed"] = "shared";
    expect(billingV2.contextRegistry.find("/")["seed"]).toBe("shared");
    expect(inventory.contextRegistry.find("/")["seed"]).toBeUndefined();

    createSpy.mockRestore();
  });

  it("throws when two specs share the same group and same non-empty version", async () => {
    const specs = [
      { source: "_", prefix: "/api/v1", group: "my-api", version: "v1" },
      { source: "_", prefix: "/api/v2", group: "my-api", version: "v1" },
    ];

    await expect((app as any).counterfact(mockConfig, specs)).rejects.toThrow(
      "Each spec must define a unique group (and version) when multiple APIs are configured",
    );
  });

  it("uses the first spec's runner as primary (contextRegistry, registry) when specs are provided", async () => {
    const realCreate = ApiRunner.create;
    const capturedRunnersByGroup = new Map<string, ApiRunner>();

    const createSpy = jest.spyOn(ApiRunner, "create");
    createSpy.mockImplementation(async (...args) => {
      const runner = await realCreate.apply(ApiRunner, args);
      const group = args[1];
      if (group) {
        capturedRunnersByGroup.set(group, runner);
      }
      return runner;
    });

    const specs = [
      { source: "_", prefix: "/api/v1", group: "v1" },
      { source: "_", prefix: "/api/v2", group: "v2" },
    ];

    const result = await (app as any).counterfact(mockConfig, specs);
    const firstRunner = capturedRunnersByGroup.get("v1");

    expect(capturedRunnersByGroup.size).toBe(2);
    expect(firstRunner).toBeDefined();
    expect(result.contextRegistry).toBe(firstRunner!.contextRegistry);
    expect(result.registry).toBe(firstRunner!.registry);

    createSpy.mockRestore();
  });

  it("wires all runners into REPL grouped context when specs are provided", async () => {
    await usingTemporaryFiles(async ($) => {
      const specs = [
        { source: "_", prefix: "/api/v1", group: "billing" },
        { source: "_", prefix: "/api/v2", group: "inventory" },
      ];

      const result = await (app as any).counterfact(
        { ...mockConfig, basePath: $.path(".") },
        specs,
      );

      result.contextRegistry.add("/", { from: "primary" });

      const replServer = result.startRepl();

      expect(replServer.context["context"]).toMatchObject({
        billing: { from: "primary" },
        inventory: {},
      });
      expect(replServer.context["routes"]).toEqual({
        billing: {},
        inventory: {},
      });

      replServer.close();
    });
  });

  it("routes requests to the correct runner based on prefix when specs are provided", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "v1/routes/hello.js",
        `export function GET() { return { body: "hello from v1" }; }`,
      );
      await $.add(
        "v2/routes/hello.js",
        `export function GET() { return { body: "hello from v2" }; }`,
      );

      const specs = [
        { source: "_", prefix: "/api/v1", group: "v1" },
        { source: "_", prefix: "/api/v2", group: "v2" },
      ];

      const { koaApp, start } = await (app as any).counterfact(
        { ...mockConfig, basePath: $.path(".") },
        specs,
      );

      const { stop } = await start({
        startServer: true,
        buildCache: false,
        generate: { routes: false, types: false },
        watch: { routes: false, types: false },
      });

      const v1Response = await request(koaApp.callback()).get("/api/v1/hello");
      const v2Response = await request(koaApp.callback()).get("/api/v2/hello");

      expect(v1Response.text).toContain("hello from v1");
      expect(v2Response.text).toContain("hello from v2");

      await stop();
    });
  });
  it("defaults an omitted prefix to root when group and version are present", async () => {
    const spy = jest.spyOn(ApiRunner, "create");

    const specs = [
      { source: "_", group: "my-api", version: "v1" },
      { source: "_", group: "my-api", version: "v2" },
    ];

    await (app as any).counterfact(mockConfig, specs);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "" }),
      "my-api",
      "v1",
      ["v1", "v2"],
      expect.objectContaining({
        contextRegistry: expect.any(ContextRegistry),
        scenarioRegistry: expect.any(ScenarioRegistry),
      }),
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "" }),
      "my-api",
      "v2",
      ["v1", "v2"],
      expect.objectContaining({
        contextRegistry: expect.any(ContextRegistry),
        scenarioRegistry: expect.any(ScenarioRegistry),
      }),
    );

    spy.mockRestore();
  });

  it("uses explicit prefix even when group and version are present", async () => {
    const spy = jest.spyOn(ApiRunner, "create");

    const specs = [
      { source: "_", prefix: "/custom/path", group: "my-api", version: "v1" },
    ];

    await (app as any).counterfact(mockConfig, specs);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "/custom/path" }),
      "my-api",
      "v1",
      ["v1"],
      expect.objectContaining({
        contextRegistry: expect.any(ContextRegistry),
        scenarioRegistry: expect.any(ScenarioRegistry),
      }),
    );

    spy.mockRestore();
  });

  it("preserves an explicit empty prefix", async () => {
    const spy = jest.spyOn(ApiRunner, "create");

    const specs = [{ source: "_", prefix: "", group: "my-api", version: "v1" }];

    await (app as any).counterfact(mockConfig, specs);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "" }),
      "my-api",
      "v1",
      ["v1"],
      expect.objectContaining({
        contextRegistry: expect.any(ContextRegistry),
        scenarioRegistry: expect.any(ScenarioRegistry),
      }),
    );

    spy.mockRestore();
  });

  it("defaults an omitted prefix to root when version is absent", async () => {
    const spy = jest.spyOn(ApiRunner, "create");

    const specs = [{ source: "_", group: "my-api" }];

    await (app as any).counterfact(mockConfig, specs);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "" }),
      "my-api",
      "",
      [],
      expect.objectContaining({
        contextRegistry: expect.any(ContextRegistry),
        scenarioRegistry: expect.any(ScenarioRegistry),
      }),
    );

    spy.mockRestore();
  });

  it("allows two specs with the same group but different versions", async () => {
    const specs = [
      { source: "_", group: "my-api", version: "v1" },
      { source: "_", group: "my-api", version: "v2" },
    ];

    await expect((app as any).counterfact(mockConfig, specs)).resolves.toEqual(
      expect.objectContaining({
        start: expect.any(Function),
        startRepl: expect.any(Function),
      }),
    );
  });

  it("runs generate() sequentially within a group to avoid concurrent writes to the same directory", async () => {
    const order: string[] = [];
    let runnerIndex = 0;
    const generateSpy = jest
      .spyOn(ApiRunner.prototype, "generate")
      .mockImplementation(async function () {
        const idx = ++runnerIndex;
        order.push(`start:${idx}`);
        await Promise.resolve(); // yield to the event loop so concurrent calls could interleave
        order.push(`end:${idx}`);
      });

    const specs = [
      { source: "_", group: "my-api", version: "v1" },
      { source: "_", group: "my-api", version: "v2" },
    ];

    const { start } = await (app as any).counterfact(mockConfig, specs);
    await start({
      startServer: false,
      buildCache: false,
      generate: { routes: false, types: false },
      watch: { routes: false, types: false },
    });

    // Serial execution: runner 1 must complete before runner 2 starts.
    // Concurrent execution would produce ["start:1", "start:2", "end:1", "end:2"].
    expect(order).toEqual(["start:1", "end:1", "start:2", "end:2"]);

    generateSpy.mockRestore();
  });

  it("throws when two specs share the same group and version", async () => {
    const specs = [
      { source: "_", group: "my-api", version: "v1" },
      { source: "_", group: "my-api", version: "v1" },
    ];

    await expect((app as any).counterfact(mockConfig, specs)).rejects.toThrow(
      "Each spec must define a unique group (and version) when multiple APIs are configured",
    );
  });

  it("serves canonical paths from grouped specs sharing an omitted prefix", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "customers/routes/customers.js",
        `export function GET() { return { body: "customers" }; }`,
      );
      await $.add(
        "products/routes/products.js",
        `export function GET() { return { body: "products" }; }`,
      );

      const specs = [
        { source: "_", group: "customers" },
        { source: "_", group: "products" },
      ];

      const { koaApp, start } = await (app as any).counterfact(
        { ...mockConfig, basePath: $.path(".") },
        specs,
      );

      const { stop } = await start({
        startServer: true,
        buildCache: false,
        generate: { routes: false, types: false },
        watch: { routes: false, types: false },
      });

      const customers = await request(koaApp.callback()).get("/customers");
      const products = await request(koaApp.callback()).get("/products");
      const duplicatedPath = await request(koaApp.callback()).get(
        "/customers/customers",
      );

      expect(customers.text).toContain("customers");
      expect(products.text).toContain("products");
      expect(duplicatedPath.status).toBe(404);

      await stop();
    });
  });

  it("runs every group's startup once, sequentially in declaration order", async () => {
    await usingTemporaryFiles(async ($) => {
      const realCreate = ApiRunner.create;
      const capturedRunners: ApiRunner[] = [];
      const createSpy = jest
        .spyOn(ApiRunner, "create")
        .mockImplementation(async (...args) => {
          const runner = await realCreate.apply(ApiRunner, args);
          capturedRunners.push(runner);
          return runner;
        });
      const runnerStartSpy = jest
        .spyOn(ApiRunner.prototype, "start")
        .mockResolvedValue(undefined);
      const order: string[] = [];

      const result = await (app as any).counterfact(
        { ...mockConfig, basePath: $.path("."), port: 0 },
        [
          { source: "_", group: "billing", version: "v1" },
          { source: "_", group: "inventory", version: "v1" },
          { source: "_", group: "billing", version: "v2" },
        ],
      );
      const billingV1 = capturedRunners.find(
        ({ group, version }) => group === "billing" && version === "v1",
      )!;
      const billingV2 = capturedRunners.find(
        ({ group, version }) => group === "billing" && version === "v2",
      )!;
      const inventory = capturedRunners.find(
        ({ group }) => group === "inventory",
      )!;

      billingV1.scenarioRegistry.add("index", {
        startup: async ($: any) => {
          order.push("billing:start");
          await Promise.resolve();
          $.context.seed = "billing-seed";
          order.push("billing:end");
        },
      });
      inventory.scenarioRegistry.add("index", {
        startup: async ($: any) => {
          order.push("inventory:start");
          await Promise.resolve();
          expect($.context.seed).toBeUndefined();
          $.context.seed = "inventory-seed";
          order.push("inventory:end");
        },
      });

      const { stop } = await result.start({
        startServer: true,
        buildCache: false,
        generate: { routes: false, types: false },
        watch: { routes: false, types: false },
      });

      expect(order).toEqual([
        "billing:start",
        "billing:end",
        "inventory:start",
        "inventory:end",
      ]);
      expect(billingV2.contextRegistry.find("/")["seed"]).toBe("billing-seed");
      expect(inventory.contextRegistry.find("/")["seed"]).toBe(
        "inventory-seed",
      );

      await stop();
      runnerStartSpy.mockRestore();
      createSpy.mockRestore();
    });
  });

  it("attributes a startup failure to its group and does not listen", async () => {
    await usingTemporaryFiles(async ($) => {
      const realCreate = ApiRunner.create;
      const capturedRunners: ApiRunner[] = [];
      const createSpy = jest
        .spyOn(ApiRunner, "create")
        .mockImplementation(async (...args) => {
          const runner = await realCreate.apply(ApiRunner, args);
          capturedRunners.push(runner);
          return runner;
        });
      const runnerStartSpy = jest
        .spyOn(ApiRunner.prototype, "start")
        .mockResolvedValue(undefined);
      const stopWatchingSpy = jest
        .spyOn(ApiRunner.prototype, "stopWatching")
        .mockResolvedValue(undefined);

      const result = await (app as any).counterfact(
        { ...mockConfig, basePath: $.path("."), port: 0 },
        [
          { source: "_", group: "customers", version: "v1" },
          { source: "_", group: "products", version: "v2" },
        ],
      );
      capturedRunners
        .find(({ group }) => group === "products")!
        .scenarioRegistry.add("index", {
          startup: () => {
            throw new Error("could not seed products");
          },
        });
      const listenSpy = jest.spyOn(result.koaApp, "listen");

      await expect(
        result.start({
          startServer: true,
          buildCache: false,
          generate: { routes: false, types: false },
          watch: { routes: false, types: false },
        }),
      ).rejects.toThrow(
        'Startup scenario failed for group "products" (version "v2"): could not seed products',
      );
      expect(listenSpy).not.toHaveBeenCalled();
      expect(stopWatchingSpy).toHaveBeenCalledTimes(2);

      listenSpy.mockRestore();
      stopWatchingSpy.mockRestore();
      runnerStartSpy.mockRestore();
      createSpy.mockRestore();
    });
  });

  it("preserves startup behavior when specs are omitted", async () => {
    await usingTemporaryFiles(async ($) => {
      const realCreate = ApiRunner.create;
      let capturedRunner: ApiRunner | undefined;
      const createSpy = jest
        .spyOn(ApiRunner, "create")
        .mockImplementation(async (...args) => {
          capturedRunner = await realCreate.apply(ApiRunner, args);
          return capturedRunner;
        });
      const runnerStartSpy = jest
        .spyOn(ApiRunner.prototype, "start")
        .mockResolvedValue(undefined);
      const startup = jest.fn();
      const result = await (app as any).counterfact({
        ...mockConfig,
        basePath: $.path("."),
        port: 0,
      });
      capturedRunner!.scenarioRegistry.add("index", { startup });

      const { stop } = await result.start({
        startServer: true,
        buildCache: false,
        generate: { routes: false, types: false },
        watch: { routes: false, types: false },
      });

      expect(startup).toHaveBeenCalledTimes(1);
      await stop();
      runnerStartSpy.mockRestore();
      createSpy.mockRestore();
    });
  });

  it("calls startup from the index module if it exists", async () => {
    const scenarioRegistry = new ScenarioRegistry();
    const contextRegistry = new ContextRegistry();
    let startupCalled = false;

    scenarioRegistry.add("index", {
      startup: () => {
        startupCalled = true;
      },
    });

    await (app as any).runStartupScenario(
      scenarioRegistry,
      contextRegistry,
      mockConfig,
    );

    expect(startupCalled).toBe(true);
  });

  it("passes the applyContext ($) to startup", async () => {
    const scenarioRegistry = new ScenarioRegistry();
    const contextRegistry = new ContextRegistry();
    let receivedContext: any;

    scenarioRegistry.add("index", {
      startup: ($: any) => {
        receivedContext = $;
      },
    });

    await (app as any).runStartupScenario(
      scenarioRegistry,
      contextRegistry,
      mockConfig,
    );

    expect(receivedContext).toBeDefined();
    expect(typeof receivedContext.context).toBe("object");
    expect(typeof receivedContext.loadContext).toBe("function");
    expect(typeof receivedContext.route).toBe("function");
    expect(typeof receivedContext.routes).toBe("object");
  });

  it("does nothing if there is no index module", async () => {
    const scenarioRegistry = new ScenarioRegistry();
    const contextRegistry = new ContextRegistry();

    await expect(
      (app as any).runStartupScenario(
        scenarioRegistry,
        contextRegistry,
        mockConfig,
      ),
    ).resolves.toBeUndefined();
  });

  it("does nothing if startup is not a function in the index module", async () => {
    const scenarioRegistry = new ScenarioRegistry();
    const contextRegistry = new ContextRegistry();

    scenarioRegistry.add("index", {
      startup: 42,
    });

    await expect(
      (app as any).runStartupScenario(
        scenarioRegistry,
        contextRegistry,
        mockConfig,
      ),
    ).resolves.toBeUndefined();
  });

  it("awaits an async startup function", async () => {
    const scenarioRegistry = new ScenarioRegistry();
    const contextRegistry = new ContextRegistry();
    let resolved = false;

    scenarioRegistry.add("index", {
      startup: async () => {
        await Promise.resolve();
        resolved = true;
      },
    });

    await (app as any).runStartupScenario(
      scenarioRegistry,
      contextRegistry,
      mockConfig,
    );

    expect(resolved).toBe(true);
  });
});
