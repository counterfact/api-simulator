import { describe, expect, it } from "@jest/globals";

import type { Config } from "../../src/server/config.js";
import {
  createIntroduction,
  createWatchMessage,
  padTagLine,
} from "../../src/cli/banner.js";

const baseConfig: Pick<
  Config,
  "generate" | "startRepl" | "startServer" | "watch"
> = {
  generate: { routes: false, types: false },
  startRepl: false,
  startServer: false,
  watch: { routes: false, types: false },
};

describe("padTagLine", () => {
  it("returns a string containing the original tag line", () => {
    expect(padTagLine("hello")).toContain("hello");
  });

  it("adds leading padding so the tag line is roughly centred in 51 characters", () => {
    const padded = padTagLine("hi");
    expect(padded.length).toBeGreaterThan(2);
    expect(padded.trimStart()).toBe("hi");
  });

  it("returns the tag line unchanged when it is already 51 characters", () => {
    const tagLine = "a".repeat(51);
    expect(padTagLine(tagLine)).toBe(tagLine);
  });
});

describe("createWatchMessage", () => {
  it("returns undefined when nothing is watching or generating", () => {
    expect(createWatchMessage(baseConfig)).toBeUndefined();
  });

  it("returns the 'watching' message when both routes and types are watched", () => {
    expect(
      createWatchMessage({
        ...baseConfig,
        watch: { routes: true, types: true },
      }),
    ).toContain("Watching for changes");
  });

  it("returns the routes-only watching message", () => {
    expect(
      createWatchMessage({
        ...baseConfig,
        watch: { routes: true, types: false },
      }),
    ).toContain("routes");
  });

  it("returns the types-only watching message", () => {
    expect(
      createWatchMessage({
        ...baseConfig,
        watch: { routes: false, types: true },
      }),
    ).toContain("types");
  });

  it("returns the 'generating routes and types' message", () => {
    expect(
      createWatchMessage({
        ...baseConfig,
        generate: { routes: true, types: true },
      }),
    ).toBe("Generating routes and types");
  });

  it("returns the 'generating routes' message", () => {
    expect(
      createWatchMessage({
        ...baseConfig,
        generate: { routes: true, types: false },
      }),
    ).toBe("Generating routes");
  });

  it("returns the 'generating types' message", () => {
    expect(
      createWatchMessage({
        ...baseConfig,
        generate: { routes: false, types: true },
      }),
    ).toBe("Generating types");
  });
});

describe("createIntroduction", () => {
  const baseParams = {
    config: baseConfig,
    isTelemetryDisabled: true,
    source: "_",
    swaggerUrl: "http://localhost:3100/counterfact/swagger/",
    taglines: ["tagline one", "tagline two"],
    url: "http://localhost:3100",
    version: "1.2.3",
  };

  it("includes the version string", () => {
    expect(createIntroduction(baseParams)).toContain("1.2.3");
  });

  it("includes the API base URL", () => {
    expect(createIntroduction(baseParams)).toContain("http://localhost:3100");
  });

  it("omits the Swagger UI line when source is '_'", () => {
    expect(createIntroduction({ ...baseParams, source: "_" })).not.toContain(
      "Swagger UI",
    );
  });

  it("includes the Swagger UI line when source is a real spec path", () => {
    expect(
      createIntroduction({ ...baseParams, source: "openapi.yaml" }),
    ).toContain("Swagger UI");
  });

  it("includes a tagline from the provided list", () => {
    const intro = createIntroduction(baseParams);
    const hasTagline = baseParams.taglines.some((t) => intro.includes(t));
    expect(hasTagline).toBe(true);
  });

  it("includes the telemetry warning when telemetry is not disabled", () => {
    expect(
      createIntroduction({ ...baseParams, isTelemetryDisabled: false }),
    ).toContain("Telemetry");
  });

  it("omits the telemetry warning when telemetry is disabled", () => {
    expect(
      createIntroduction({ ...baseParams, isTelemetryDisabled: true }),
    ).not.toContain("Telemetry");
  });

  it("includes the 'Starting server' line when startServer is true", () => {
    expect(
      createIntroduction({
        ...baseParams,
        config: { ...baseConfig, startServer: true },
      }),
    ).toContain("Starting server");
  });

  it("includes the REPL line when startRepl is true", () => {
    expect(
      createIntroduction({
        ...baseParams,
        config: { ...baseConfig, startRepl: true },
      }),
    ).toContain("REPL");
  });
});
