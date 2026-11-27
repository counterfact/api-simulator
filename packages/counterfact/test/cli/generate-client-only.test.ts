import { describe, expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";

import {
  generateClientOnly,
  validateClientOnlyOptions,
} from "../../src/cli/generate-client-only.js";

const valid = { conflictingOptions: [], source: "openapi.yaml" };

describe("validateClientOnlyOptions", () => {
  it("accepts a single spec", () => {
    expect(() => validateClientOnlyOptions(valid)).not.toThrow();
  });

  it("rejects explicit conflicting options by flag name", () => {
    expect(() =>
      validateClientOnlyOptions({
        ...valid,
        conflictingOptions: ["serve", "generateSchemasOnly"],
      }),
    ).toThrow(
      "--generate-client-only cannot be combined with --serve, --generate-schemas-only.",
    );
  });

  it("requires an OpenAPI document", () => {
    expect(() => validateClientOnlyOptions({ ...valid, source: "_" })).toThrow(
      /requires an OpenAPI document/u,
    );
    expect(() => validateClientOnlyOptions({ ...valid, specs: [] })).toThrow(
      /requires an OpenAPI document/u,
    );
  });

  it("rejects versioned specs", () => {
    expect(() =>
      validateClientOnlyOptions({
        ...valid,
        specs: [{ source: "a.yaml", group: "a", version: "v1" }],
      }),
    ).toThrow(/does not support versioned APIs/u);
  });

  it("rejects specs that would write the same client directory", () => {
    expect(() =>
      validateClientOnlyOptions({
        ...valid,
        specs: [
          { source: "a.yaml", group: "catalog" },
          { source: "b.yaml", group: "catalog/" },
        ],
      }),
    ).toThrow('each client gets its own directory ("catalog/client")');
  });
});

function spec(path: string, schemaName: string): string {
  return [
    "openapi: 3.0.3",
    "info: { title: T, version: 1.0.0 }",
    "paths:",
    `  /${path}:`,
    "    get:",
    "      responses:",
    "        '200':",
    "          description: OK",
    "          content:",
    "            application/json:",
    `              schema: { $ref: '#/components/schemas/${schemaName}' }`,
    "components:",
    "  schemas:",
    `    ${schemaName}: { type: object, properties: { id: { type: string } } }`,
  ].join("\n");
}

describe("generateClientOnly", () => {
  it("writes a standalone client for each group and nothing else", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("pets.yaml", spec("pets", "Pet"));
      await $.add("billing.yaml", spec("invoices", "Invoice"));

      const written = await generateClientOnly({
        basePath: $.path("out"),
        clientOptions: { typeSuffix: "Dto" },
        overlays: [],
        source: "_",
        specs: [
          { source: $.path("pets.yaml"), group: "pets" },
          { source: $.path("billing.yaml"), group: "billing" },
        ],
        typeOptions: { preferInterfaces: true },
      });

      expect(written).toContain("pets/client/data-contracts/PetDto.ts");
      expect(written).toContain("billing/client/Invoices.ts");
      expect(
        await $.read("out/pets/client/data-contracts/PetDto.ts"),
      ).toContain("export interface PetDto {");
      await expect($.read("out/pets/types/index.ts")).rejects.toThrow();
    });
  });
});
