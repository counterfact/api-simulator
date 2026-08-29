import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";

import {
  getOrCreateTelemetryIdentity,
  hashTelemetryLocation,
  isTelemetryEnabled,
  sendTelemetry,
  sendTelemetryAndWait,
} from "../../src/cli/telemetry.js";

describe("isTelemetryEnabled", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns false when CI is set", () => {
    process.env["CI"] = "true";
    expect(isTelemetryEnabled()).toBe(false);
  });

  it("returns false when COUNTERFACT_TELEMETRY_DISABLED is 'true'", () => {
    delete process.env["CI"];
    process.env["COUNTERFACT_TELEMETRY_DISABLED"] = "true";
    expect(isTelemetryEnabled()).toBe(false);
  });

  it("returns true when no opt-out env vars are set", () => {
    delete process.env["CI"];
    delete process.env["COUNTERFACT_TELEMETRY_DISABLED"];
    expect(isTelemetryEnabled()).toBe(true);
  });
});

describe("sendTelemetry", () => {
  it("does not throw when called", () => {
    expect(() => {
      sendTelemetry("counterfact_started", { version: "1.0.0" });
    }).not.toThrow();
  });

  it("resolves awaited telemetry without surfacing provider errors", async () => {
    const previousCI = process.env["CI"];
    process.env["CI"] = "true";
    try {
      await expect(
        sendTelemetryAndWait("counterfact_start_failed", {
          failureCategory: "initialization",
        }),
      ).resolves.toBeUndefined();
    } finally {
      if (previousCI === undefined) delete process.env["CI"];
      else process.env["CI"] = previousCI;
    }
  });
});

describe("getOrCreateTelemetryIdentity", () => {
  it("reuses an anonymous installation identifier before it expires", async () => {
    await usingTemporaryFiles(async ($) => {
      const identityPath = $.path("counterfact/telemetry.json");
      const now = Date.parse("2026-08-29T12:00:00.000Z");

      const first = getOrCreateTelemetryIdentity(identityPath, now);
      const second = getOrCreateTelemetryIdentity(
        identityPath,
        now + 24 * 60 * 60 * 1000,
      );

      expect(second).toEqual(first);
      expect(JSON.parse(await $.read("counterfact/telemetry.json"))).toEqual(
        first,
      );
    });
  });

  it("rotates an anonymous installation identifier after 180 days", async () => {
    await usingTemporaryFiles(async ($) => {
      const identityPath = $.path("counterfact/telemetry.json");
      const now = Date.parse("2026-08-29T12:00:00.000Z");
      const first = getOrCreateTelemetryIdentity(identityPath, now);
      const rotated = getOrCreateTelemetryIdentity(
        identityPath,
        now + 180 * 24 * 60 * 60 * 1000,
      );

      expect(rotated.installationId).not.toBe(first.installationId);
      expect(rotated.createdAt).not.toBe(first.createdAt);
    });
  });

  it("replaces a malformed identity file", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("counterfact/telemetry.json", "not-json");

      const identity = getOrCreateTelemetryIdentity(
        $.path("counterfact/telemetry.json"),
        Date.parse("2026-08-29T12:00:00.000Z"),
      );

      expect(identity.installationId).toMatch(/^[0-9a-f-]{36}$/u);
      expect(JSON.parse(await $.read("counterfact/telemetry.json"))).toEqual(
        identity,
      );
    });
  });
});

describe("hashTelemetryLocation", () => {
  it("hashes API file locations without preserving the raw path", () => {
    const hash = hashTelemetryLocation("/tmp/openapi.yaml");
    const sameInputHash = hashTelemetryLocation("/tmp/openapi.yaml");
    const differentInputHash = hashTelemetryLocation("/tmp/other.yaml");

    expect(hash).not.toContain("/tmp/openapi.yaml");
    expect(hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(sameInputHash).toBe(hash);
    expect(differentInputHash).not.toBe(hash);
  });
});
