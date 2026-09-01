import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";

import {
  createReplTelemetryEvent,
  createRuntimeTelemetryEvent,
  getOrCreateTelemetryIdentity,
  hashTelemetryLocation,
  isTelemetryEnabled,
  sanitizeTelemetryEvent,
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
      sendTelemetry({
        event: "repl_command_used",
        properties: { command: "counterfact" },
      });
    }).not.toThrow();
  });

  it("resolves awaited telemetry without surfacing provider errors", async () => {
    const previousCI = process.env["CI"];
    process.env["CI"] = "true";
    try {
      await expect(
        sendTelemetryAndWait({
          event: "counterfact_start_failed",
          properties: { failureCategory: "initialization" },
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
      expect(rotated.locationHashKey).not.toBe(first.locationHashKey);
    });
  });

  it("upgrades a current legacy identity without changing its identifier or age", async () => {
    await usingTemporaryFiles(async ($) => {
      const identityPath = $.path("counterfact/telemetry.json");
      const legacyIdentity = {
        createdAt: "2026-08-29T12:00:00.000Z",
        installationId: "5e267bfe-353e-42b4-a80d-36d49d24f209",
      };
      await $.add(
        "counterfact/telemetry.json",
        `${JSON.stringify(legacyIdentity)}\n`,
      );

      const upgraded = getOrCreateTelemetryIdentity(
        identityPath,
        Date.parse("2026-08-30T12:00:00.000Z"),
      );

      expect(upgraded).toMatchObject(legacyIdentity);
      expect(upgraded.locationHashKey).toMatch(/^[a-f0-9]{64}$/u);
      expect(JSON.parse(await $.read("counterfact/telemetry.json"))).toEqual(
        upgraded,
      );
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

  it("falls back safely when the identity path is inaccessible", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.addDirectory("counterfact/telemetry.json");

      const identity = getOrCreateTelemetryIdentity(
        $.path("counterfact/telemetry.json"),
        Date.parse("2026-08-29T12:00:00.000Z"),
      );

      expect(identity.installationId).toMatch(/^[0-9a-f-]{36}$/u);
      expect(identity.locationHashKey).toMatch(/^[a-f0-9]{64}$/u);
    });
  });
});

describe("hashTelemetryLocation", () => {
  it("creates a stable keyed identifier without preserving the raw path or key", () => {
    const key = "a".repeat(64);
    const hash = hashTelemetryLocation("/tmp/openapi.yaml", key);
    const sameInputHash = hashTelemetryLocation("/tmp/openapi.yaml", key);
    const differentInputHash = hashTelemetryLocation("/tmp/other.yaml", key);

    expect(hash).not.toContain("/tmp/openapi.yaml");
    expect(hash).not.toContain(key);
    expect(hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(sameInputHash).toBe(hash);
    expect(differentInputHash).not.toBe(hash);
  });

  it("cannot correlate the same location across installation keys", () => {
    const location = "/tmp/openapi.yaml";

    expect(hashTelemetryLocation(location, "a".repeat(64))).not.toBe(
      hashTelemetryLocation(location, "b".repeat(64)),
    );
  });
});

describe("telemetry event allow-list", () => {
  it("keeps only the fixed failure category", () => {
    const sanitized = sanitizeTelemetryEvent({
      event: "counterfact_start_failed",
      properties: {
        failureCategory: "initialization",
        error: "private startup error",
        openApiPath: "/private/openapi.yaml",
      },
    } as never);

    expect(sanitized).toEqual({
      event: "counterfact_start_failed",
      properties: { failureCategory: "initialization" },
    });
  });

  it("reconstructs runtime events from only enumerated values", () => {
    expect(
      createRuntimeTelemetryEvent("first_api_request_served", {
        authorization: "Bearer private-token",
        path: "/private/path",
        statusClass: "2xx",
      }),
    ).toEqual({
      event: "first_api_request_served",
      properties: { statusClass: "2xx" },
    });
    expect(
      createRuntimeTelemetryEvent("first_api_request_served", {
        statusClass: "private-status",
      }),
    ).toBeUndefined();
  });

  it("accepts only the enumerated REPL command names", () => {
    expect(createReplTelemetryEvent("scenario")).toEqual({
      event: "repl_command_used",
      properties: { command: "scenario" },
    });
    expect(
      createReplTelemetryEvent(".scenario private-argument"),
    ).toBeUndefined();
  });

  it("does not create local identity state when explicitly disabled", async () => {
    await usingTemporaryFiles(async ($) => {
      const previousEnv = process.env;
      process.env = {
        ...previousEnv,
        COUNTERFACT_TELEMETRY_DISABLED: "true",
        XDG_CONFIG_HOME: $.path("config"),
      };
      delete process.env["CI"];

      try {
        await sendTelemetryAndWait({
          event: "counterfact_start_failed",
          properties: { failureCategory: "initialization" },
        });
        await expect(
          $.read("config/counterfact/telemetry.json"),
        ).rejects.toBeDefined();
      } finally {
        process.env = previousEnv;
      }
    });
  });
});
