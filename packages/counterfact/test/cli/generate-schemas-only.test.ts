import { describe, expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";

import {
  generateStandalone,
  validateStandaloneOptions,
} from "../../src/cli/generate-standalone.js";

const valid = {
  conflictingOptions: [],
  destinationProvided: true,
  source: "openapi.yaml",
};

describe("validateStandaloneOptions", () => {
  it("accepts a single spec with a destination", () => {
    expect(() => validateStandaloneOptions(valid)).not.toThrow();
  });

  it("rejects explicit conflicting options by flag name", () => {
    expect(() =>
      validateStandaloneOptions({
        ...valid,
        conflictingOptions: ["generateTypes", "watchRoutes", "buildCache"],
      }),
    ).toThrow(
      "--generate-schemas-only cannot be combined with --generate-types, --watch-routes, --build-cache.",
    );
  });

  it("requires a destination", () => {
    expect(() =>
      validateStandaloneOptions({ ...valid, destinationProvided: false }),
    ).toThrow(/requires a destination directory/u);
  });

  it("requires an OpenAPI document", () => {
    expect(() => validateStandaloneOptions({ ...valid, source: "_" })).toThrow(
      /requires an OpenAPI document/u,
    );
    expect(() =>
      validateStandaloneOptions({
        ...valid,
        specs: [{ source: "_", group: "" }],
      }),
    ).toThrow(/requires an OpenAPI document/u);
    expect(() => validateStandaloneOptions({ ...valid, specs: [] })).toThrow(
      /requires an OpenAPI document/u,
    );
  });

  it("accepts several specs with distinct groups and versions", () => {
    expect(() =>
      validateStandaloneOptions({
        ...valid,
        specs: [
          { source: "a.yaml", group: "a", version: "v1" },
          { source: "b.yaml", group: "a", version: "v2" },
          { source: "c.yaml", group: "c" },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects multiple specs when one has no group", () => {
    expect(() =>
      validateStandaloneOptions({
        ...valid,
        specs: [
          { source: "a.yaml", group: "" },
          { source: "b.yaml", group: "b" },
        ],
      }),
    ).toThrow(/non-empty group/u);
  });

  it("rejects duplicate group and version pairs", () => {
    expect(() =>
      validateStandaloneOptions({
        ...valid,
        specs: [
          { source: "a.yaml", group: "a", version: "v1" },
          { source: "b.yaml", group: "a", version: "v1" },
        ],
      }),
    ).toThrow(/more than one spec for group "a" and version "v1"/u);
  });

  it.each([
    [
      "trailing separators",
      { group: "catalog" },
      { group: "catalog/" },
      '"catalog"',
    ],
    [
      "relative segments",
      { group: "catalog" },
      { group: "./catalog" },
      '"catalog"',
    ],
    [
      "a version folded into the group",
      { group: "catalog", version: "v1" },
      { group: "catalog/v1" },
      '"catalog/v1"',
    ],
    [
      "a trailing separator before the version",
      { group: "catalog", version: "v1" },
      { group: "catalog/", version: "v1" },
      '"catalog/v1"',
    ],
  ])(
    "rejects specs that resolve to the same output directory through %s",
    (_name, first, second, directory) => {
      expect(() =>
        validateStandaloneOptions({
          ...valid,
          specs: [
            { source: "a.yaml", ...first },
            { source: "b.yaml", ...second },
          ],
        }),
      ).toThrow(`unique output directory (${directory})`);
    },
  );

  it("rejects mixing versioned and unversioned specs in one group", () => {
    expect(() =>
      validateStandaloneOptions({
        ...valid,
        specs: [
          { source: "a.yaml", group: "a" },
          { source: "b.yaml", group: "a", version: "v1" },
        ],
      }),
    ).toThrow(/cannot mix versioned and unversioned specs in group "a"/u);
  });
});

function spec(schemaName: string): string {
  return [
    "openapi: 3.0.3",
    "info: { title: T, version: 1.0.0 }",
    "paths: {}",
    "components:",
    "  schemas:",
    `    ${schemaName}: { type: object, properties: { id: { type: string } } }`,
  ].join("\n");
}

describe("generateStandalone", () => {
  it("writes a single spec directly into the destination", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.yaml", spec("Pet"));

      const count = await generateStandalone({
        basePath: $.path("out"),
        overlays: [],
        source: $.path("openapi.yaml"),
      });

      expect(count).toBe(1);
      expect(await $.read("out/Pet.ts")).toContain("Pet");
    });
  });

  it("writes each group and version into its own directory", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("pets.yaml", spec("Pet"));
      await $.add("pets-v2.yaml", spec("Pet"));
      await $.add("billing.yaml", spec("Invoice"));

      const count = await generateStandalone({
        basePath: $.path("out"),
        overlays: [],
        source: "_",
        specs: [
          { source: $.path("pets.yaml"), group: "pets", version: "v1" },
          { source: $.path("pets-v2.yaml"), group: "pets", version: "v2" },
          { source: $.path("billing.yaml"), group: "billing" },
        ],
      });

      expect(count).toBe(3);
      expect(await $.read("out/pets/v1/Pet.ts")).toContain("Pet");
      expect(await $.read("out/pets/v2/Pet.ts")).toContain("Pet");
      expect(await $.read("out/billing/Invoice.ts")).toContain("Invoice");
    });
  });
});
