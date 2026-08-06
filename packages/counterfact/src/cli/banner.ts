import type { Config } from "../server/config.js";

/**
 * Centers a tag line within the fixed-width ASCII banner header.
 */
export function padTagLine(tagLine: string): string {
  const headerLength = 51;
  const padding = " ".repeat((headerLength - tagLine.length) / 2);

  return `${padding}${tagLine}`;
}

/**
 * Returns a short human-readable message describing which files are being
 * watched or generated, or `undefined` when neither is active.
 */
export function createWatchMessage(
  config: Pick<Config, "generate" | "watch">,
): string | undefined {
  switch (true) {
    case config.watch.routes && config.watch.types: {
      return "   Watching for changes";
    }
    case config.watch.routes: {
      return "   Watching routes for changes";
    }
    case config.watch.types: {
      return "   Watching types for changes";
    }
    default: {
      break;
    }
  }

  switch (true) {
    case config.generate.routes && config.generate.types: {
      return "Generating routes and types";
    }
    case config.generate.routes: {
      return "Generating routes";
    }
    case config.generate.types: {
      return "Generating types";
    }
    default: {
      return undefined;
    }
  }
}

/**
 * Builds the startup introduction lines that are printed to stdout when
 * Counterfact starts.
 */
export function createIntroduction(params: {
  config: Pick<Config, "generate" | "startRepl" | "startServer" | "watch">;
  isTelemetryDisabled: boolean;
  source: string;
  swaggerUrl: string;
  taglines: string[];
  url: string;
  version: string;
}): string {
  const {
    config,
    isTelemetryDisabled,
    source,
    swaggerUrl,
    taglines,
    url,
    version,
  } = params;

  const watchMessage = createWatchMessage({
    generate: config.generate,
    watch: config.watch,
  });

  const telemetryWarning = isTelemetryDisabled
    ? []
    : [
        "⚠️  Telemetry will be enabled by default starting May 1, 2026.",
        "   Learn more and how to disable: https://counterfact.dev/telemetry-discussion",
        "",
      ];

  const lines: (string | undefined)[] = [
    "   ____ ____ _  _ _ _ ___ ____ ____ ____ ____ ____ ___",
    String.raw`   |___ [__] |__| |\|  |  |=== |--< |--- |--| |___  | `,
    "   " +
      padTagLine(taglines[Math.floor(Math.random() * taglines.length)] ?? ""),
    "",
    `   Version       ${version}`,
    `   API Base URL  ${url}`,
    source === "_" ? undefined : `   Swagger UI    ${swaggerUrl}`,
    "",
    "   Instructions  https://github.com/counterfact/api-simulator/blob/main/docs/usage.md",
    "   Help/feedback https://github.com/pmcelhaney/counterfact/issues",
    "",
    ...telemetryWarning,
    watchMessage,
    config.startServer ? "   Starting server" : undefined,
    config.startRepl
      ? "   Starting REPL (type .help for more info)"
      : undefined,
  ];

  return lines.filter((line) => line !== undefined).join("\n");
}
