import { describe, expect, it } from "@jest/globals";

import type { Config } from "../../src/config.js";
import {
  createGeneratedArtifactsSummary,
  createRuntimeProgressMessage,
  createStartupOutput,
  createSwaggerUrls,
  createWatchSummary,
  shouldUseColor,
} from "../../src/cli/startup-output.js";

const baseConfig: Pick<Config, "generate" | "watch"> = {
  generate: { routes: false, types: false },
  watch: { routes: false, types: false },
};

describe("shouldUseColor", () => {
  it("enables colour for an interactive terminal without NO_COLOR", () => {
    expect(shouldUseColor({ isTTY: true, noColor: undefined })).toBe(true);
  });

  it("disables colour when output is redirected", () => {
    expect(shouldUseColor({ isTTY: false, noColor: undefined })).toBe(false);
  });

  it("disables colour whenever NO_COLOR is present, including an empty value", () => {
    expect(shouldUseColor({ isTTY: true, noColor: "" })).toBe(false);
  });
});

describe("createStartupOutput", () => {
  it("renders a semantic, colour-coded default startup flow", () => {
    const output = createStartupOutput(true);

    expect(output.title("1.2.3")).toContain("\u001B[1mCounterfact\u001B[0m");
    expect(output.progress("Reading OpenAPI document…")).toContain(
      "\u001B[36m→\u001B[0m",
    );
    expect(output.success("Mock server", "http://localhost:3100")).toContain(
      "\u001B[32m✓\u001B[0m",
    );
    expect(output.success("Mock server", "http://localhost:3100")).toContain(
      "\u001B[36m→ http://localhost:3100\u001B[0m",
    );
    expect(output.warning("Warning")).toContain("\u001B[33mWarning\u001B[0m");
    expect(output.error("Error")).toContain("\u001B[31mError\u001B[0m");
  });

  it("retains the same readable messages without ANSI codes", () => {
    const output = createStartupOutput(false);
    const lines = [
      output.title("1.2.3"),
      output.progress("Generating routes and types…"),
      output.success("Generated routes and types"),
      output.success("Mock server", "http://localhost:3100"),
    ].join("\n");

    expect(lines).toContain("Counterfact v1.2.3");
    expect(lines).toContain("→ Generating routes and types…");
    expect(lines).toContain("✓ Generated routes and types");
    expect(lines).toContain("✓ Mock server → http://localhost:3100");
    expect(lines).not.toContain("\u001B[");
  });
});

describe("startup lifecycle descriptions", () => {
  it("describes the default generated, served, and watched API", () => {
    const config = {
      generate: { routes: true, types: true },
      watch: { routes: true, types: true },
    };

    expect(createRuntimeProgressMessage(config, true)).toBe(
      "Generating routes and types…",
    );
    expect(createGeneratedArtifactsSummary(config, true)).toBe(
      "Generated routes and types",
    );
    expect(createWatchSummary(config, true)).toBe("Watching routes and types");
  });

  it("describes generation-only and no-server modes without claiming readiness links", () => {
    const config = {
      generate: { routes: false, types: true },
      watch: { routes: false, types: false },
    };

    expect(createRuntimeProgressMessage(config, true)).toBe(
      "Generating types…",
    );
    expect(createGeneratedArtifactsSummary(config, true)).toBe(
      "Generated types",
    );
    expect(createWatchSummary(config, true)).toBeUndefined();
  });

  it("does not claim route generation or Swagger support in spec-free mode", () => {
    const config = {
      generate: { routes: true, types: true },
      watch: { routes: true, types: true },
    };

    expect(createRuntimeProgressMessage(config, false)).toBe(
      "Generating types…",
    );
    expect(createGeneratedArtifactsSummary(config, false)).toBe(
      "Generated types",
    );
    expect(createWatchSummary(config, false)).toBe("Watching types");
  });

  it("describes route loading when generation is disabled", () => {
    expect(createRuntimeProgressMessage(baseConfig, true)).toBe(
      "Loading mock routes…",
    );
    expect(createGeneratedArtifactsSummary(baseConfig, true)).toBeUndefined();
  });
});

describe("createSwaggerUrls", () => {
  it("returns the exact UI link for every resolved OpenAPI group", () => {
    expect(
      createSwaggerUrls("http://localhost:3100", [
        { source: "pets.yaml", group: "pets" },
        { source: "store.yaml", group: "store" },
      ]),
    ).toEqual([
      "http://localhost:3100/counterfact/swagger/pets/",
      "http://localhost:3100/counterfact/swagger/store/",
    ]);
  });

  it("omits Swagger UI for spec-free entries", () => {
    expect(
      createSwaggerUrls("http://localhost:3100", [{ source: "_", group: "" }]),
    ).toEqual([]);
  });
});
