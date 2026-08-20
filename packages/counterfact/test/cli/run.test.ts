import { describe, expect, it } from "@jest/globals";

import {
  buildStartupTelemetryProperties,
  normalizeSpecOption,
} from "../../src/cli/run.js";

describe("normalizeSpecOption", () => {
  describe("when given undefined", () => {
    it("returns undefined", () => {
      expect(normalizeSpecOption(undefined)).toBeUndefined();
    });
  });

  describe("when given a string (CLI --spec flag)", () => {
    it("returns undefined so the caller can handle the positional shift", () => {
      expect(normalizeSpecOption("path/to/openapi.yaml")).toBeUndefined();
    });
  });

  describe("when given a single spec object", () => {
    it("wraps it in an array with all fields populated", () => {
      expect(
        normalizeSpecOption({
          source: "api.yaml",
          prefix: "/api",
          group: "v1",
        }),
      ).toEqual([{ source: "api.yaml", prefix: "/api", group: "v1" }]);
    });

    it("leaves prefix undefined when omitted so normalizeSpecs can derive it", () => {
      expect(normalizeSpecOption({ source: "api.yaml" })).toEqual([
        { source: "api.yaml", prefix: undefined, group: "" },
      ]);
    });

    it("defaults group to empty string when omitted", () => {
      expect(
        normalizeSpecOption({ source: "api.yaml", prefix: "/v2" }),
      ).toEqual([{ source: "api.yaml", prefix: "/v2", group: "" }]);
    });

    it("passes version through when present", () => {
      expect(
        normalizeSpecOption({
          source: "api.yaml",
          group: "my-api",
          version: "v1",
        }),
      ).toEqual([
        {
          source: "api.yaml",
          prefix: undefined,
          group: "my-api",
          version: "v1",
        },
      ]);
    });
  });

  describe("when given an array of spec objects", () => {
    it("maps each entry to a SpecConfig with all fields", () => {
      expect(
        normalizeSpecOption([
          { source: "pets.yaml", prefix: "/pets", group: "pets" },
          { source: "store.yaml", prefix: "/store", group: "store" },
        ]),
      ).toEqual([
        { source: "pets.yaml", prefix: "/pets", group: "pets" },
        { source: "store.yaml", prefix: "/store", group: "store" },
      ]);
    });

    it("leaves prefix undefined when omitted from an entry", () => {
      expect(
        normalizeSpecOption([{ source: "api.yaml", group: "v1" }]),
      ).toEqual([{ source: "api.yaml", prefix: undefined, group: "v1" }]);
    });

    it("defaults group to empty string when omitted from an entry", () => {
      expect(
        normalizeSpecOption([{ source: "api.yaml", prefix: "/v2" }]),
      ).toEqual([{ source: "api.yaml", prefix: "/v2", group: "" }]);
    });

    it("leaves both prefix undefined and group empty when both are omitted from an entry", () => {
      expect(normalizeSpecOption([{ source: "api.yaml" }])).toEqual([
        { source: "api.yaml", prefix: undefined, group: "" },
      ]);
    });

    it("handles an empty array", () => {
      expect(normalizeSpecOption([])).toEqual([]);
    });

    it("handles a mixed array where some entries have optional fields and some do not", () => {
      expect(
        normalizeSpecOption([
          { source: "a.yaml", prefix: "/a", group: "a" },
          { source: "b.yaml" },
        ]),
      ).toEqual([
        { source: "a.yaml", prefix: "/a", group: "a" },
        { source: "b.yaml", prefix: undefined, group: "" },
      ]);
    });

    it("passes version through for each entry", () => {
      expect(
        normalizeSpecOption([
          { source: "v1.yaml", group: "my-api", version: "v1" },
          { source: "v2.yaml", group: "my-api", version: "v2" },
        ]),
      ).toEqual([
        {
          source: "v1.yaml",
          prefix: undefined,
          group: "my-api",
          version: "v1",
        },
        {
          source: "v2.yaml",
          prefix: undefined,
          group: "my-api",
          version: "v2",
        },
      ]);
    });
  });
});

describe("buildStartupTelemetryProperties", () => {
  it("hashes OpenAPI file locations in single-spec mode", () => {
    const properties = buildStartupTelemetryProperties(
      {
        port: 3100,
        updateCheck: true,
        validateRequest: true,
        validateResponse: true,
      },
      "/tmp/openapi.yaml",
      "1.2.3",
    );

    expect(properties["mode"]).toBe("single-spec");
    expect(properties["updateCheck"]).toBe(true);
    expect(properties["validateRequest"]).toBe(true);
    expect(properties["validateResponse"]).toBe(true);
    expect(properties["apiFileLocationHashes"]).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    ]);
    expect(JSON.stringify(properties)).not.toContain("/tmp/openapi.yaml");
  });

  it("tracks multi-spec startup mode and hashes each API source", () => {
    const properties = buildStartupTelemetryProperties(
      {
        generate: true,
        port: 3100,
        updateCheck: true,
        validateRequest: true,
        validateResponse: true,
      },
      "_",
      "1.2.3",
      [
        { source: "https://example.com/v1/openapi.yaml", group: "v1" },
        { source: "/tmp/v2/openapi.yaml", group: "v2" },
      ],
    );

    expect(properties["mode"]).toBe("multi-spec");
    expect(properties["generateRoutes"]).toBe(true);
    expect(properties["generateTypes"]).toBe(true);
    expect(properties["apiFileLocationHashes"]).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    ]);
  });

  it("tracks without-openapi mode when source is '_'", () => {
    const properties = buildStartupTelemetryProperties(
      {
        port: 3100,
        updateCheck: true,
        validateRequest: true,
        validateResponse: true,
      },
      "_",
      "1.2.3",
    );

    expect(properties["mode"]).toBe("without-openapi");
    expect(properties["apiFileLocationHashes"]).toEqual([]);
  });
});
