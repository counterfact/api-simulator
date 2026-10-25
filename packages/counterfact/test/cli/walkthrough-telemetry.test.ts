import { channel } from "node:diagnostics_channel";
import { afterEach, expect, it, jest } from "@jest/globals";

const capture = jest.fn();
const flush = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
jest.unstable_mockModule("posthog-node", () => ({
  PostHog: class {
    capture = capture;
    flush = flush;
  },
}));
const { enableWalkthroughTelemetry } =
  await import("../../src/cli/walkthrough-telemetry.js");
const originalEnv = process.env;
afterEach(() => {
  process.env = originalEnv;
  capture.mockClear();
});

const message = {
  event: "walkthrough_started",
  sessionId: "temporary-session",
  properties: { tour: "coffee-shop", phase: 0, elapsedSeconds: 0 },
};
it("subscribes once and uses the temporary session as the analytics identity", () => {
  process.env = { ...originalEnv };
  delete process.env["CI"];
  delete process.env["COUNTERFACT_TELEMETRY_DISABLED"];
  enableWalkthroughTelemetry("1.2.3");
  enableWalkthroughTelemetry("1.2.3");
  channel("counterfact:walkthrough").publish(message);
  expect(capture).toHaveBeenCalledTimes(1);
  expect(capture).toHaveBeenCalledWith({
    event: "walkthrough_started",
    distinctId: "temporary-session",
    properties: {
      ...message.properties,
      version: "1.2.3",
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      source: "counterfact-cli",
    },
  });
});

it.each([{ CI: "true" }, { COUNTERFACT_TELEMETRY_DISABLED: "true" }])(
  "honors opt-out settings: %j",
  (environment) => {
    process.env = { ...environment };
    enableWalkthroughTelemetry("1.2.3");
    channel("counterfact:walkthrough").publish(message);
    expect(capture).not.toHaveBeenCalled();
  },
);

it("keeps the walkthrough usable when the transport fails", async () => {
  process.env = {};
  flush.mockRejectedValueOnce(new Error("offline"));
  expect(() =>
    channel("counterfact:walkthrough").publish(message),
  ).not.toThrow();
  await Promise.resolve();
});
