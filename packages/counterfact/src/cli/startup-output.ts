import type { Config } from "../config.js";

const ansi = {
  bold: "\u001B[1m",
  cyan: "\u001B[36m",
  dim: "\u001B[2m",
  green: "\u001B[32m",
  red: "\u001B[31m",
  reset: "\u001B[0m",
  yellow: "\u001B[33m",
};

export type StartupOutput = {
  error: (message: string) => string;
  progress: (message: string, frame?: string) => string;
  success: (label: string, value?: string) => string;
  title: (version: string) => string;
  warning: (message: string) => string;
};

/**
 * Returns whether Counterfact should add ANSI colour codes to startup output.
 * Redirected output is deliberately plain and NO_COLOR always wins.
 */
export function shouldUseColor(params: {
  isTTY: boolean | undefined;
  noColor: string | undefined;
}): boolean {
  return params.isTTY === true && params.noColor === undefined;
}

function describeGeneratedArtifacts(
  config: Pick<Config, "generate">,
  hasOpenApi: boolean,
): string | undefined {
  const generatesRoutes = hasOpenApi && config.generate.routes;
  const generatesTypes = config.generate.types;

  if (generatesRoutes && generatesTypes) {
    return "routes and types";
  }

  if (generatesRoutes) {
    return "routes";
  }

  if (generatesTypes) {
    return "types";
  }

  return undefined;
}

/** Returns the next truthful lifecycle message before the runtime starts. */
export function createRuntimeProgressMessage(
  config: Pick<Config, "generate">,
  hasOpenApi: boolean,
): string {
  const generatedArtifacts = describeGeneratedArtifacts(config, hasOpenApi);

  return generatedArtifacts === undefined
    ? "Loading mock routes…"
    : `Generating ${generatedArtifacts}…`;
}

/**
 * Builds a compact, semantic startup presentation without depending on a
 * third-party terminal-styling package.
 */
export function createStartupOutput(useColor: boolean): StartupOutput {
  const color = (code: string, value: string) =>
    useColor ? `${code}${value}${ansi.reset}` : value;

  return {
    title(version) {
      return `${color(ansi.bold, "Counterfact")} ${color(ansi.dim, `v${version}`)}`;
    },
    progress(message, frame = "→") {
      return `${color(ansi.cyan, frame)} ${color(ansi.dim, message)}`;
    },
    success(label, value) {
      const detail =
        value === undefined ? "" : ` ${color(ansi.cyan, `→ ${value}`)}`;
      return `${color(ansi.green, "✓")} ${color(ansi.green, label)}${detail}`;
    },
    warning(message) {
      return color(ansi.yellow, message);
    },
    error(message) {
      return color(ansi.red, message);
    },
  };
}

type StartupStream = {
  isTTY?: boolean;
  columns?: number;
  write: (text: string) => unknown;
};

/** Owns transient progress and defers other startup writes until it clears. */
export function createStartupReporter(
  output: StartupOutput,
  stream: StartupStream,
  diagnosticStream?: StartupStream,
) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  return {
    async step<T>(message: string, operation: () => Promise<T>): Promise<T> {
      const write = stream.write.bind(stream);
      let timer: ReturnType<typeof setInterval> | undefined;
      let displayedLength = 0;
      const deferredWrites: Array<() => unknown> = [];
      const restoreWrites: Array<() => void> = [];
      const clear = (nextLine = "") => {
        // A resize can reflow the previously displayed line onto several rows.
        const columns = Math.max(1, stream.columns || 80);
        const rows = Math.max(1, Math.ceil(displayedLength / columns));
        write(
          `\r\u001B[2K${"\u001B[1A\r\u001B[2K".repeat(rows - 1)}${nextLine}`,
        );
        displayedLength = 0;
      };

      if (stream.isTTY === true) {
        for (const target of new Set([stream, diagnosticStream])) {
          if (target === undefined) continue;
          const originalWrite = target.write;
          target.write = (...args: Parameters<StartupStream["write"]>) => {
            deferredWrites.push(() => originalWrite.apply(target, args));
            return true;
          };
          restoreWrites.push(() => {
            target.write = originalWrite;
          });
        }
        let frame = 0;
        const render = () => {
          // Startup labels use single-cell characters. Leave the last column
          // empty to avoid automatic wrapping at the terminal margin.
          const available = Math.max(0, (stream.columns || 80) - 3);
          const label =
            message.length > available
              ? `${message.slice(0, Math.max(0, available - 1))}…`.slice(
                  0,
                  available,
                )
              : message;
          if (available > 0) {
            clear(output.progress(label, frames.at(frame)));
            displayedLength = label.length + 2;
          } else {
            clear();
          }
          frame = (frame + 1) % frames.length;
        };
        render();
        timer = setInterval(render, 80);
        timer.unref();
      } else {
        write(`${output.progress(message)}\n`);
      }

      try {
        return await operation();
      } finally {
        if (timer !== undefined) {
          clearInterval(timer);
          clear();
        }
        for (const restore of restoreWrites) restore();
        for (const flush of deferredWrites) flush();
      }
    },
  };
}

/**
 * Returns the completed generation line only when the selected mode actually
 * generated source files.
 */
export function createGeneratedArtifactsSummary(
  config: Pick<Config, "generate">,
  hasOpenApi: boolean,
): string | undefined {
  const generatedArtifacts = describeGeneratedArtifacts(config, hasOpenApi);

  return generatedArtifacts === undefined
    ? undefined
    : `Generated ${generatedArtifacts}`;
}

/** Describes precisely which generated artifacts Counterfact is watching. */
export function createWatchSummary(
  config: Pick<Config, "watch">,
  hasOpenApi: boolean,
): string | undefined {
  const watchesRoutes = hasOpenApi && config.watch.routes;
  const watchesTypes = config.watch.types;

  if (watchesRoutes && watchesTypes) {
    return "Watching routes and types";
  }

  if (watchesRoutes) {
    return "Watching routes";
  }

  if (watchesTypes) {
    return "Watching types";
  }

  return undefined;
}

/** Returns the Swagger UI links exposed by the resolved OpenAPI specs. */
export function createSwaggerUrls(
  origin: string,
  specs: ReadonlyArray<{ group: string; source: string }>,
): string[] {
  return specs
    .filter((spec) => spec.source !== "_")
    .map(
      (spec) =>
        `${origin}/counterfact/swagger${spec.group ? `/${spec.group}` : ""}/`,
    );
}
