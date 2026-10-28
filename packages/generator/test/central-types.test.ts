import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";
import { ScenarioFileGenerator } from "../src/scenario-file-generator.js";
import { Repository } from "../src/repository.js";
import { generateVersionsTsContent } from "../src/versions-ts-generator.js";

const spec = {
  openapi: "3.2.0",
  info: { title: "Central types", version: "1" },
  paths: {
    "/pets/{id}": {
      get: {
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { 204: { description: "Empty" } },
      },
    },
  },
  components: {
    schemas: {
      "pet-record": {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      Alias: { $ref: "#/components/schemas/pet-record" },
      Routes: { type: "number" },
      Components: { type: "boolean" },
      Schemas: { type: "string" },
      Recursive: {
        type: "object",
        properties: { child: { $ref: "#/components/schemas/Recursive" } },
      },
    },
    parameters: {
      Limit: { in: "query", name: "limit", schema: { type: "integer" } },
    },
    headers: { Remaining: { schema: { type: "integer" } } },
    responses: {
      NotFound: {
        description: "Missing",
        headers: { Remaining: { schema: { type: "integer" } } },
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/pet-record" },
          },
        },
      },
    },
    requestBodies: {
      Create: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/pet-record" },
          },
        },
      },
    },
    examples: {
      Pet: { value: { id: "sample", schema: "literal" } },
    },
    securitySchemes: { Bearer: { type: "http", scheme: "bearer" } },
    links: {
      Pet: { operationId: "getPet", parameters: { id: "$response.body#/id" } },
    },
    callbacks: {
      Done: {
        "{$request.query.callback}": {
          post: {
            requestBody: {
              content: { "application/json": { schema: { type: "string" } } },
            },
            responses: { 204: { description: "Empty" } },
          },
        },
      },
    },
    pathItems: {
      Health: { get: { responses: { 204: { description: "Healthy" } } } },
    },
    mediaTypes: { Json: { schema: { type: "string" } } },
  },
};

function diagnostics(file: string): string[] {
  const program = ts.createProgram([file], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
}

describe("central generated types", () => {
  it("compiles routes and every component category, including unused and aliased schemas", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("spec.json", JSON.stringify(spec));
      const generator = new CodeGenerator($.path("spec.json"), $.path("api"), {
        routes: true,
        types: true,
      });
      await generator.generate();
      await new ScenarioFileGenerator($.path("api")).generate();
      await $.add(
        "consumer.ts",
        `
        import type { Routes, Components, Schemas } from "./api/types/index.js";
        type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
        const alias: Same<Schemas, Components["schemas"]> = true;
        const model: Schemas["pet-record"] = { id: "pet" };
        const referenced: Schemas["Alias"] = model;
        const recursive: Schemas["Recursive"] = { child: {} };
        const routesName: Schemas["Routes"] = 1;
        const componentsName: Schemas["Components"] = true;
        const schemasName: Schemas["Schemas"] = "ok";
        const limit: Components["parameters"]["Limit"] = 10;
        const remaining: Components["headers"]["Remaining"] = 5;
        const body: Components["requestBodies"]["Create"]["content"]["application/json"]["schema"] = model;
        const response: Components["responses"]["NotFound"]["content"]["application/json"]["schema"] = model;
        const header: Components["responses"]["NotFound"]["headers"]["Remaining"]["schema"] = 5;
        const example: Components["examples"]["Pet"]["value"] = { id: "sample", schema: "literal" };
        const security: Components["securitySchemes"]["Bearer"]["scheme"] = "bearer";
        const link: Components["links"]["Pet"]["operationId"] = "getPet";
        const callback: Components["callbacks"]["Done"]["{$request.query.callback}"]["post"]["requestBody"]["content"]["application/json"]["schema"] = "done";
        const path: Components["pathItems"]["Health"]["get"]["responses"]["204"]["description"] = "Healthy";
        const media: Components["mediaTypes"]["Json"]["schema"] = "ok";
        const handler: Routes["/pets/{id}"]["GET"] = ($) => $.response.status(204).empty();
        // @ts-expect-error The id is required.
        const missing: Schemas["pet-record"] = {};
        // @ts-expect-error Parameters retain their value types.
        const wrong: Components["parameters"]["Limit"] = "ten";
        // @ts-expect-error Only declared methods exist.
        type Missing = Routes["/pets/{id}"]["POST"];
      `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
      expect(diagnostics($.path("api/routes/pets/{id}.ts"))).toEqual([]);
      const index = await $.read("api/types/index.ts");
      await generator.generate();
      expect(await $.read("api/types/index.ts")).toBe(index);
    });
  });

  it("exports empty maps for a components-only spec and absent categories", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "spec.json",
        JSON.stringify({
          openapi: "3.1.0",
          info: spec.info,
          components: { schemas: { Unused: { type: "string" } } },
        }),
      );
      await new CodeGenerator($.path("spec.json"), $.path("api"), {
        types: true,
        routes: false,
      }).generate();
      await $.add(
        "consumer.ts",
        `import type { Routes, Components, Schemas } from "./api/types/index.js";
        const model: Schemas["Unused"] = "ok";
        const noRoutes: keyof Routes extends never ? true : false = true;
        const noResponses: keyof Components["responses"] extends never ? true : false = true;
        // @ts-expect-error Absent components are not accepted.
        type Missing = Components["responses"]["Missing"];
      `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("combines component versions without losing either contract", async () => {
    await usingTemporaryFiles(async ($) => {
      const repository = new Repository();
      for (const [version, type] of [
        ["v1", "string"],
        ["v2", "number"],
      ]) {
        await $.add(
          `${version}.json`,
          JSON.stringify({
            ...spec,
            components: { schemas: { Value: { type } } },
          }),
        );
        await new CodeGenerator(
          $.path(`${version}.json`),
          $.path("api"),
          { routes: true, types: true },
          version,
        ).generate(repository);
      }
      await new ScenarioFileGenerator($.path("api")).generate();
      await $.add(
        "api/types/versions.ts",
        await generateVersionsTsContent(["v1", "v2"]),
      );
      await $.add(
        "consumer.ts",
        `import type { Schemas, Routes } from "./api/types/index.js";
        const first: Schemas["Value"] = "ok";
        const second: Schemas["Value"] = 1;
        // @ts-expect-error Neither version accepts a boolean.
        const wrong: Schemas["Value"] = true;
        const handler: Routes["/pets/{id}"]["GET"] = ($) => $.response.status(204).empty();
      `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("uses logical paths for referenced path items and additional HTTP methods", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "spec.json",
        JSON.stringify({
          ...spec,
          paths: {
            "/health/": { $ref: "#/components/pathItems/Health" },
            "/custom": {
              additionalOperations: {
                QUERY: { responses: { 204: { description: "Empty" } } },
              },
            },
          },
        }),
      );
      await new CodeGenerator($.path("spec.json"), $.path("api"), {
        types: true,
        routes: true,
      }).generate();
      await new ScenarioFileGenerator($.path("api")).generate();
      await $.add(
        "consumer.ts",
        `import type { Routes } from "./api/types/index.js";
        const get: Routes["/health/"]["GET"] = ($) => $.response.status(204).empty();
        const query: Routes["/custom"]["QUERY"] = ($) => $.response.status(204).empty();
        // @ts-expect-error Map keys preserve the original trailing slash.
        type Normalized = Routes["/health"];
      `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
      expect(diagnostics($.path("api/routes/health.ts"))).toEqual([]);
      expect(diagnostics($.path("api/routes/custom.ts"))).toEqual([]);
    });
  });

  it("supports more than 100 operations with the same method", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "spec.json",
        JSON.stringify({
          ...spec,
          components: {},
          paths: Object.fromEntries(
            Array.from({ length: 125 }, (_, index) => [
              `/route${index}`,
              { get: { responses: { 204: { description: "Empty" } } } },
            ]),
          ),
        }),
      );
      const repository = new Repository();
      await new CodeGenerator($.path("spec.json"), $.path("api"), {
        types: true,
        routes: true,
      }).generate(repository);
      await new ScenarioFileGenerator($.path("api")).generate();
      await $.add(
        "consumer.ts",
        `import type { Routes } from "./api/types/index.js";
        const handler: Routes["/route124"]["GET"] = ($) => $.response.status(204).empty();`,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });
});
