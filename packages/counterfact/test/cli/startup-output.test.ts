import { afterEach, describe, expect, it, jest } from "@jest/globals";

import type { Config } from "../../src/config.js";
import {
  createGeneratedArtifactsSummary,
  createRuntimeProgressMessage,
  createStartupOutput,
  createStartupReporter,
  createSwaggerUrls,
  createWatchSummary,
  shouldUseColor,
} from "../../src/cli/startup-output.js";

const baseConfig: Pick<Config, "generate" | "watch"> = {
  generate: { routes: false, types: false },
  watch: { routes: false, types: false },
};

describe("startup progress spinner", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("fits narrow terminals and clears reflowed rows when resized", async () => {
    jest.useFakeTimers();
    const write = jest.fn<(text: string) => void>();
    const stream = { isTTY: true, columns: 24, write };
    const reporter = createStartupReporter(createStartupOutput(false), stream);
    let finish = () => {};
    const pending = reporter.step(
      "Generating routes and types…",
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    expect(write).toHaveBeenLastCalledWith(
      "\r\u001B[2K⠋ Generating routes an…",
    );
    stream.columns = 12;
    jest.advanceTimersByTime(80);
    expect(write).toHaveBeenLastCalledWith(
      "\r\u001B[2K\u001B[1A\r\u001B[2K⠙ Generati…",
    );
    stream.columns = 5;
    finish();
    await pending;
    expect(write).toHaveBeenLastCalledWith(
      "\r\u001B[2K\u001B[1A\r\u001B[2K\u001B[1A\r\u001B[2K",
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  it("defers stdout and stderr warnings until progress clears and restores writes", async () => {
    jest.useFakeTimers();
    const transcript: string[] = [];
    const write = jest.fn((text: string) => {
      transcript.push(text);
    });
    const writeError = jest.fn((text: string) => {
      transcript.push(text);
    });
    const stdout = { isTTY: true, write };
    const stderr = { write: writeError };
    const reporter = createStartupReporter(
      createStartupOutput(false),
      stdout,
      stderr,
    );
    await expect(
      reporter.step("Loading mock routes…", async () => {
        stdout.write("\nWarning: context failed\n");
        stderr.write("Update notice\n");
        jest.advanceTimersByTime(80);
        expect(transcript.join("")).not.toContain("Warning");
        throw new Error("Failed");
      }),
    ).rejects.toThrow("Failed");
    expect(transcript.slice(-3)).toEqual([
      "\r\u001B[2K",
      "\nWarning: context failed\n",
      "Update notice\n",
    ]);
    expect(stdout.write).toBe(write);
    expect(stderr.write).toBe(writeError);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("animates only while work is pending and clears before completion", async () => {
    jest.useFakeTimers();
    const write = jest.fn<(text: string) => void>();
    const reporter = createStartupReporter(createStartupOutput(false), {
      isTTY: true,
      columns: 0,
      write,
    });
    let finish = () => {};
    const pending = reporter.step(
      "Reading OpenAPI document…",
      () =>
        new Promise<string>((resolve) => {
          finish = () => resolve("ready");
        }),
    );
    expect(write).toHaveBeenLastCalledWith(
      "\r\u001B[2K⠋ Reading OpenAPI document…",
    );
    jest.advanceTimersByTime(80);
    expect(write).toHaveBeenLastCalledWith(
      "\r\u001B[2K⠙ Reading OpenAPI document…",
    );
    finish();
    await expect(pending).resolves.toBe("ready");
    expect(write).toHaveBeenLastCalledWith("\r\u001B[2K");
    const calls = write.mock.calls.length;
    jest.advanceTimersByTime(800);
    expect(write).toHaveBeenCalledTimes(calls);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("clears failed steps and cancels their animation", async () => {
    jest.useFakeTimers();
    const write = jest.fn<(text: string) => void>();
    const reporter = createStartupReporter(createStartupOutput(true), {
      isTTY: true,
      write,
    });
    await expect(
      reporter.step("Generating types…", () =>
        Promise.reject(new Error("Failed")),
      ),
    ).rejects.toThrow("Failed");
    expect(write).toHaveBeenLastCalledWith("\r\u001B[2K");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("keeps redirected progress plain without animation or cursor controls", async () => {
    jest.useFakeTimers();
    const write = jest.fn<(text: string) => void>();
    const reporter = createStartupReporter(createStartupOutput(false), {
      write,
    });
    await reporter.step("Preparing spec-free mock…", () => Promise.resolve());
    expect(write.mock.calls).toEqual([["→ Preparing spec-free mock…\n"]]);
    expect(jest.getTimerCount()).toBe(0);
  });
});

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
