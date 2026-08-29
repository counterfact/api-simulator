import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { PostHog } from "posthog-node";

const POSTHOG_API_KEY = "phc_msXmBxiL8FVugNMLCx9bnPQGqfEMqmyBjnVkKhHkN3m7";
const POSTHOG_HOST = "https://us.i.posthog.com";
const TELEMETRY_ID_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const TELEMETRY_FLUSH_TIMEOUT_MS = 500;
const sessionId = randomUUID();

interface TelemetryIdentity {
  createdAt: string;
  installationId: string;
}

function defaultTelemetryIdentityPath(): string {
  const configRoot =
    process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");

  return join(configRoot, "counterfact", "telemetry.json");
}

function createTelemetryIdentity(now: number): TelemetryIdentity {
  return {
    createdAt: new Date(now).toISOString(),
    installationId: randomUUID(),
  };
}

function isCurrentTelemetryIdentity(
  value: unknown,
  now: number,
): value is TelemetryIdentity {
  if (
    value === null ||
    typeof value !== "object" ||
    !("createdAt" in value) ||
    !("installationId" in value) ||
    typeof value.createdAt !== "string" ||
    typeof value.installationId !== "string" ||
    !/^[0-9a-f-]{36}$/iu.test(value.installationId)
  ) {
    return false;
  }

  const createdAt = Date.parse(value.createdAt);

  return (
    Number.isFinite(createdAt) &&
    createdAt <= now &&
    now - createdAt < TELEMETRY_ID_MAX_AGE_MS
  );
}

/**
 * Returns a rotating anonymous identifier used to measure repeat product use.
 *
 * The identifier is stored outside Counterfact projects, contains no machine
 * or user attributes, and rotates after 180 days. File-system failures fall
 * back to an in-memory identifier so telemetry can never block the CLI.
 */
export function getOrCreateTelemetryIdentity(
  filePath = defaultTelemetryIdentityPath(),
  now = Date.now(),
): TelemetryIdentity {
  /* eslint-disable security/detect-non-literal-fs-filename -- the default is a fixed Counterfact config path; tests inject a temporary path. */
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (isCurrentTelemetryIdentity(parsed, now)) {
      return parsed;
    }
  } catch {
    // Missing, inaccessible, or malformed identity files are replaced below.
  }

  const identity = createTelemetryIdentity(now);

  try {
    fs.mkdirSync(dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(identity)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  } catch {
    // Telemetry persistence is best-effort and must never surface to the user.
  }
  /* eslint-enable security/detect-non-literal-fs-filename */

  return identity;
}

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
export async function sendTelemetryAndWait(
  event: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (!isTelemetryEnabled()) {
    return;
  }

  const telemetryKey = process.env["POSTHOG_API_KEY"] ?? POSTHOG_API_KEY;
  const telemetryHost = process.env["POSTHOG_HOST"] ?? POSTHOG_HOST;

  try {
    const posthog = new PostHog(telemetryKey, { host: telemetryHost });
    const { installationId } = getOrCreateTelemetryIdentity();

    posthog.capture({
      distinctId: installationId,
      event,
      properties: {
        $ip: null,
        $process_person_profile: false,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        sessionId,
        source: "counterfact-cli",
        ...properties,
      },
    });

    await Promise.race([
      posthog.flush(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, TELEMETRY_FLUSH_TIMEOUT_MS).unref();
      }),
    ]);
  } catch {
    // ignore errors — telemetry must never surface to the user
  }
}

/** Sends a telemetry event without blocking normal product behavior. */
export function sendTelemetry(
  event: string,
  properties: Record<string, unknown> = {},
): void {
  void sendTelemetryAndWait(event, properties);
}
