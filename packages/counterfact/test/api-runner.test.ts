import { fileURLToPath } from "node:url";

import { usingTemporaryFiles } from "using-temporary-files";

import { ApiRunner } from "../src/api-runner.js";
import { CodeGenerator, ScenarioFileGenerator } from "@counterfact/generator";
import {
  ChaosRegistry,
  ContextRegistry,
  Dispatcher,
  ModuleLoader,
  Registry,
  ScenarioRegistry,
  Transpiler,
} from "@counterfact/runtime";

const exampleOpenApiPath = fileURLToPath(
  new URL("./fixtures/openapi/example.yaml", import.meta.url),
);

const baseConfig = {
  openApiPath: "_",
  basePath: ".",
  port: 1234,
  alwaysFakeOptionals: false,
  generate: { routes: false, types: false },
  proxyPaths: new Map<string, boolean>(),
  proxyUrl: "",
  startAdminApi: false,
  startRepl: false,
  startServer: false,
  buildCache: false,
  watch: { routes: false, types: false },
  prefix: "",
  validateRequests: false,
  validateResponses: false,
};

describe("ApiRunner", () => {
  describe("create()", () => {
    it("returns an ApiRunner instance", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        expect(runner).toBeInstanceOf(ApiRunner);
      });
    });

    it("exposes registry as a public property", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        expect(runner.registry).toBeInstanceOf(Registry);
      });
    });

    it("exposes contextRegistry as a public property", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        expect(runner.contextRegistry).toBeInstanceOf(ContextRegistry);
      });
    });

    it("exposes scenarioRegistry as a public property", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        expect(runner.scenarioRegistry).toBeInstanceOf(ScenarioRegistry);
      });
    });

    it("exposes scenarioFileGenerator as a public property", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        expect(runner.scenarioFileGenerator).toBeInstanceOf(
          ScenarioFileGenerator,
        );
      });
    });

    it("exposes codeGenerator as a public property", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        expect(runner.codeGenerator).toBeInstanceOf(CodeGenerator);
      });
    });

    it("exposes dispatcher as a public property", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        expect(runner.dispatcher).toBeInstanceOf(Dispatcher);
      });
    });

    it("passes a supplied chaos registry to the dispatcher", async () => {
      await usingTemporaryFiles(async ($) => {
        const chaosRegistry = new ChaosRegistry();
        const runner = await ApiRunner.create(
          { ...baseConfig, basePath: $.path(".") },
          "",
          "",
          [],
          undefined,
          chaosRegistry,
        );

        expect(runner.dispatcher.chaosRegistry).toBe(chaosRegistry);
      });
    });

    it("exposes transpiler as a public property", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        expect(runner.transpiler).toBeInstanceOf(Transpiler);
      });
    });

    it("exposes moduleLoader as a public property", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        expect(runner.moduleLoader).toBeInstanceOf(ModuleLoader);
      });
    });

    it("sets openApiDocument to undefined in spec-less mode", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        expect(runner.openApiDocument).toBeUndefined();
      });
    });

    it("sets nativeTs to a boolean", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        expect(typeof runner.nativeTs).toBe("boolean");
      });
    });

    it("exposes openApiPath as a public property matching config", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
          openApiPath: exampleOpenApiPath,
        });
        expect(runner.openApiPath).toBe(exampleOpenApiPath);
      });
    });

    it("exposes prefix as a public property matching config", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
          prefix: "/api/v1",
        });
        expect(runner.prefix).toBe("/api/v1");
      });
    });

    it("exposes group as empty string by default", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        expect(runner.group).toBe("");
      });
    });

    it("exposes group as the value passed to create()", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create(
          { ...baseConfig, basePath: $.path(".") },
          "v2",
        );
        expect(runner.group).toBe("v2");
      });
    });

    it("subdirectory is empty string when group is empty", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        expect(runner.subdirectory).toBe("");
      });
    });

    it("subdirectory is /group when group is set", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create(
          { ...baseConfig, basePath: $.path(".") },
          "pets",
        );
        expect(runner.subdirectory).toBe("/pets");
      });
    });

    it("loads openApiDocument when openApiPath is set", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
          openApiPath: exampleOpenApiPath,
        });
        expect(runner.openApiDocument).toBeDefined();
      });
    });
  });

  describe("generate()", () => {
    it("does not throw when generate flags are false", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        await expect(runner.generate()).resolves.toBeUndefined();
      });
    });

    it("generates type files when config.generate.types is true", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
          generate: { routes: false, types: true },
        });
        await runner.generate();
        // ScenarioFileGenerator writes types/_.context.ts
        const content = await $.read("types/_.context.ts");
        expect(content).toContain("Scenario$");
      });
    });
  });

  describe("load()", () => {
    it("loads modules into the registry from the routes directory", async () => {
      await usingTemporaryFiles(async ($) => {
        await $.add(
          "routes/hello.js",
          `export function GET() { return { body: "hello" }; }`,
        );
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        await runner.load();
        const routes = runner.registry.routes;
        expect(routes.some((r) => r.path === "/hello")).toBe(true);
      });
    });
  });

  describe("stopWatching()", () => {
    it("resolves without throwing even when nothing is watching", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        await expect(runner.stopWatching()).resolves.toBeUndefined();
      });
    });

    it("stops watchers that were started by start()", async () => {
      await usingTemporaryFiles(async ($) => {
        await $.addDirectory("routes");
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        await runner.start({ startServer: false, buildCache: false });
        await expect(runner.stopWatching()).resolves.toBeUndefined();
      });
    });
  });

  describe("start()", () => {
    it("does not throw when startServer and buildCache are both false", async () => {
      await usingTemporaryFiles(async ($) => {
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        await expect(
          runner.start({ startServer: false, buildCache: false }),
        ).resolves.toBeUndefined();
      });
    });

    it("loads modules into the registry when startServer is true", async () => {
      await usingTemporaryFiles(async ($) => {
        await $.add(
          "routes/hello.js",
          `export function GET() { return { body: "hello" }; }`,
        );
        const runner = await ApiRunner.create({
          ...baseConfig,
          basePath: $.path("."),
        });
        await runner.start({ startServer: true, buildCache: false });
        const routes = runner.registry.routes;
        expect(routes.some((r) => r.path === "/hello")).toBe(true);
        await runner.stopWatching();
      });
    });
  });
});
