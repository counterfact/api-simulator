import { createHmac, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { PostHog } from "posthog-node";

const POSTHOG_API_KEY = "phc_msXmBxiL8FVugNMLCx9bnPQGqfEMqmyBjnVkKhHkN3m7";
const POSTHOG_HOST = "https://us.i.posthog.com";
const TELEMETRY_ID_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const TELEMETRY_FLUSH_TIMEOUT_MS = 500;
const sessionId = randomUUID();

export interface TelemetryIdentity {
  createdAt: string;
  installationId: string;
  locationHashKey: string;
}

type TelemetryIdentityWithoutLocationHashKey = Omit<
  TelemetryIdentity,
  "locationHashKey"
>;

export type StartupTelemetryProperties = {
  alwaysFakeOptionals: boolean;
  apiFileLocationHashes: string[];
  buildCache: boolean;
  generateRoutes: boolean;
  generateTypes: boolean;
  mode: "multi-spec" | "single-spec" | "without-openapi";
  openBrowser: boolean;
  port: number;
  prune: boolean;
  repl: boolean;
  serve: boolean;
  sourceKind: "local" | "multi-spec" | "remote" | "without-openapi";
  specCount: number;
  updateCheck: boolean;
  validateRequest: boolean;
  validateResponse: boolean;
  version: string;
  watchRoutes: boolean;
  watchTypes: boolean;
};

export type CounterfactTelemetryEvent =
  | {
      event: "counterfact_start_attempted" | "counterfact_started";
      properties: StartupTelemetryProperties;
    }
  | {
      event: "counterfact_start_failed";
      properties: {
        failureCategory: "initialization" | "port-in-use" | "runtime-start";
      };
    }
  | {
      event: "file_change_detected";
      properties: {
        changeType: "add" | "change" | "unlink";
        fileType: "context" | "openapi" | "route";
      };
    }
  | {
      event: "first_api_request_served";
      properties: {
        statusClass: "1xx" | "2xx" | "3xx" | "4xx" | "5xx";
      };
    }
  | {
      event: "repl_command_used";
      properties: {
        command: "counterfact" | "proxy" | "scenario";
      };
    };

function defaultTelemetryIdentityPath(): string {
  const configRoot =
    process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");

  return join(configRoot, "counterfact", "telemetry.json");
}

function createLocationHashKey(): string {
  return randomBytes(32).toString("hex");
}

function createTelemetryIdentity(now: number): TelemetryIdentity {
  return {
    createdAt: new Date(now).toISOString(),
    installationId: randomUUID(),
    locationHashKey: createLocationHashKey(),
  };
}

function isCurrentTelemetryIdentityWithoutLocationHashKey(
  value: unknown,
  now: number,
): value is TelemetryIdentityWithoutLocationHashKey {
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

function isCurrentTelemetryIdentity(
  value: unknown,
  now: number,
): value is TelemetryIdentity {
  return (
    isCurrentTelemetryIdentityWithoutLocationHashKey(value, now) &&
    "locationHashKey" in value &&
    typeof value.locationHashKey === "string" &&
    /^[a-f0-9]{64}$/u.test(value.locationHashKey)
  );
}

function persistTelemetryIdentity(
  filePath: string,
  identity: TelemetryIdentity,
): void {
  /* eslint-disable security/detect-non-literal-fs-filename -- the default is a fixed Counterfact config path; tests inject a temporary path. */
  try {
    fs.mkdirSync(dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(identity)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Telemetry persistence is best-effort and must never surface to the user.
  }
  /* eslint-enable security/detect-non-literal-fs-filename */
}

/**
 * Returns a rotating anonymous identifier and private location-hash key.
 *
 * Both values are stored outside Counterfact projects and rotate together
 * after 180 days. A current identity created by an older Counterfact release
 * is upgraded in place with a new private key while retaining its installation
 * identifier and creation date. File-system failures fall back to in-memory
 * values so telemetry can never block the CLI.
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

    if (isCurrentTelemetryIdentityWithoutLocationHashKey(parsed, now)) {
      const upgraded = {
        ...parsed,
        locationHashKey: createLocationHashKey(),
      };
      persistTelemetryIdentity(filePath, upgraded);

      return upgraded;
    }
  } catch {
    // Missing, inaccessible, or malformed identity files are replaced below.
  }
  /* eslint-enable security/detect-non-literal-fs-filename */

  const identity = createTelemetryIdentity(now);
  persistTelemetryIdentity(filePath, identity);

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

export function hashTelemetryLocation(
  location: string,
  locationHashKey: string,
): string {
  return createHmac("sha256", locationHashKey).update(location).digest("hex");
}

function sanitizeStartupProperties(
  properties: StartupTelemetryProperties,
): StartupTelemetryProperties {
  return {
    alwaysFakeOptionals: properties.alwaysFakeOptionals,
    apiFileLocationHashes: properties.apiFileLocationHashes.filter((hash) =>
      /^[a-f0-9]{64}$/u.test(hash),
    ),
    buildCache: properties.buildCache,
    generateRoutes: properties.generateRoutes,
    generateTypes: properties.generateTypes,
    mode: properties.mode,
    openBrowser: properties.openBrowser,
    port: properties.port,
    prune: properties.prune,
    repl: properties.repl,
    serve: properties.serve,
    sourceKind: properties.sourceKind,
    specCount: properties.specCount,
    updateCheck: properties.updateCheck,
    validateRequest: properties.validateRequest,
    validateResponse: properties.validateResponse,
    version: properties.version,
    watchRoutes: properties.watchRoutes,
    watchTypes: properties.watchTypes,
  };
}

export function sanitizeTelemetryEvent(event: CounterfactTelemetryEvent): {
  event: CounterfactTelemetryEvent["event"];
  properties: Record<string, unknown>;
} {
  switch (event.event) {
    case "counterfact_start_attempted":
    case "counterfact_started":
      return {
        event: event.event,
        properties: sanitizeStartupProperties(event.properties),
      };
    case "counterfact_start_failed":
      return {
        event: event.event,
        properties: { failureCategory: event.properties.failureCategory },
      };
    case "file_change_detected":
      return {
        event: event.event,
        properties: {
          changeType: event.properties.changeType,
          fileType: event.properties.fileType,
        },
      };
    case "first_api_request_served":
      return {
        event: event.event,
        properties: { statusClass: event.properties.statusClass },
      };
    case "repl_command_used":
      return {
        event: event.event,
        properties: { command: event.properties.command },
      };
  }
}

/**
 * Sends an allow-listed telemetry event to PostHog. Awaiting this helper is
 * reserved for failure paths that may immediately terminate the process.
 */
export async function sendTelemetryAndWait(
  event: CounterfactTelemetryEvent,
): Promise<void> {
  if (!isTelemetryEnabled()) {
    return;
  }

  const telemetryKey = process.env["POSTHOG_API_KEY"] ?? POSTHOG_API_KEY;
  const telemetryHost = process.env["POSTHOG_HOST"] ?? POSTHOG_HOST;

  try {
    const { installationId } = getOrCreateTelemetryIdentity();
    const sanitized = sanitizeTelemetryEvent(event);
    const posthog = new PostHog(telemetryKey, { host: telemetryHost });

    posthog.capture({
      distinctId: installationId,
      event: sanitized.event,
      properties: {
        $ip: null,
        $process_person_profile: false,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        sessionId,
        source: "counterfact-cli",
        ...sanitized.properties,
      },
    });

    await Promise.race([
      posthog.flush(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, TELEMETRY_FLUSH_TIMEOUT_MS).unref();
      }),
    ]);
  } catch {
    // Telemetry must never surface provider or persistence errors to the user.
  }
}

/** Sends an allow-listed telemetry event without blocking product behavior. */
export function sendTelemetry(event: CounterfactTelemetryEvent): void {
  void sendTelemetryAndWait(event);
}

export function createRuntimeTelemetryEvent(
  event: string,
  properties: Record<string, unknown> = {},
): CounterfactTelemetryEvent | undefined {
  if (
    event === "first_api_request_served" &&
    ["1xx", "2xx", "3xx", "4xx", "5xx"].includes(
      String(properties["statusClass"]),
    )
  ) {
    return {
      event,
      properties: {
        statusClass: properties["statusClass"] as
          "1xx" | "2xx" | "3xx" | "4xx" | "5xx",
      },
    };
  }

  if (
    event === "file_change_detected" &&
    ["add", "change", "unlink"].includes(String(properties["changeType"])) &&
    ["context", "openapi", "route"].includes(String(properties["fileType"]))
  ) {
    return {
      event,
      properties: {
        changeType: properties["changeType"] as "add" | "change" | "unlink",
        fileType: properties["fileType"] as "context" | "openapi" | "route",
      },
    };
  }

  return undefined;
}

/** Adapts provider-independent runtime events to the product allow-list. */
export function reportRuntimeTelemetry(
  event: string,
  properties: Record<string, unknown> = {},
): void {
  const telemetryEvent = createRuntimeTelemetryEvent(event, properties);
  if (telemetryEvent !== undefined) sendTelemetry(telemetryEvent);
}

export function createReplTelemetryEvent(
  command: string,
): CounterfactTelemetryEvent | undefined {
  if (!["counterfact", "proxy", "scenario"].includes(command)) {
    return undefined;
  }

  return {
    event: "repl_command_used",
    properties: {
      command: command as "counterfact" | "proxy" | "scenario",
    },
  };
}

/** Adapts the REPL's enumerated command observer to the product allow-list. */
export function reportReplTelemetry(
  command: "counterfact" | "proxy" | "scenario",
): void {
  const telemetryEvent = createReplTelemetryEvent(command);
  if (telemetryEvent !== undefined) sendTelemetry(telemetryEvent);
}
