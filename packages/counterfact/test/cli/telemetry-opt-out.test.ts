import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const postHogConstructor = jest.fn();

await jest.unstable_mockModule("posthog-node", () => ({
  PostHog: function PostHog(...args: unknown[]) {
    postHogConstructor(...args);

    return {
      capture: jest.fn(),
      flush: jest.fn(() => Promise.resolve()),
    };
  },
}));

const { sendTelemetryAndWait } = await import("../../src/cli/telemetry.js");

describe("telemetry transport opt-out", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["CI"];
    delete process.env["COUNTERFACT_TELEMETRY_DISABLED"];
    postHogConstructor.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each([
    ["CI", { CI: "true" }],
    ["explicit opt-out", { COUNTERFACT_TELEMETRY_DISABLED: "true" }],
  ])("does not construct the provider under %s", async (_label, optOut) => {
    process.env = { ...process.env, ...optOut };

    await sendTelemetryAndWait({
      event: "counterfact_start_failed",
      properties: { failureCategory: "initialization" },
    });

    expect(postHogConstructor).not.toHaveBeenCalled();
  });
});
