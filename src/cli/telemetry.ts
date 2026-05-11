import { createHash, randomUUID } from "node:crypto";

import { PostHog } from "posthog-node";

const POSTHOG_API_KEY = "phc_msXmBxiL8FVugNMLCx9bnPQGqfEMqmyBjnVkKhHkN3m7";
const POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * Returns `true` when telemetry should be sent.
 *
 * Telemetry is disabled in CI or when `COUNTERFACT_TELEMETRY_DISABLED=true`.
 */
export function isTelemetryEnabled(): boolean {
  if (process.env["CI"]) return false;

  const telemetryDisabledEnv = process.env["COUNTERFACT_TELEMETRY_DISABLED"];
  if (telemetryDisabledEnv === "true") return false;

  return true;
}

export function hashTelemetryLocation(location: string): string {
  return createHash("sha256").update(location).digest("hex");
}

/**
 * Fires a telemetry event to PostHog.  Fire-and-forget — never blocks
 * startup and never surfaces errors to the user.
 */
export function sendTelemetry(
  event: string,
  properties: Record<string, unknown> = {},
): void {
  if (!isTelemetryEnabled()) {
    return;
  }

  const telemetryKey = process.env["POSTHOG_API_KEY"] ?? POSTHOG_API_KEY;
  const telemetryHost = process.env["POSTHOG_HOST"] ?? POSTHOG_HOST;

  try {
    const posthog = new PostHog(telemetryKey, { host: telemetryHost });

    posthog.capture({
      distinctId: randomUUID(),
      event,
      properties: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        source: "counterfact-cli",
        ...properties,
      },
    });

    posthog.flush().catch(() => {
      // ignore errors — telemetry is best-effort
    });
  } catch {
    // ignore errors — telemetry must never surface to the user
  }
}
