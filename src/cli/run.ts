import fs from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
/* eslint-disable security/detect-non-literal-fs-filename -- CLI migration cleanup operates on known child directories under config.basePath. */

import { Command } from "commander";
import createDebug from "debug";
import open from "open";

import { counterfact, type SpecConfig } from "../app.js";
import { pathsToRoutes } from "../migrate/paths-to-routes.js";
import { updateRouteTypes } from "../migrate/update-route-types.js";
import { pathResolve } from "../util/forward-slash-path.js";
import { loadConfigFile } from "../util/load-config-file.js";
import { createIntroduction } from "./banner.js";
import { checkForUpdates } from "./check-for-updates.js";
import {
  hashTelemetryLocation,
  isTelemetryEnabled,
  sendTelemetry,
} from "./telemetry.js";

const debug = createDebug("counterfact:cli:run");

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 3100;

type SpecOptionEntry = {
  source: string;
  prefix?: string;
  group?: string;
  version?: string;
  overlays?: string[];
};
type SpecOption = string | SpecOptionEntry | SpecOptionEntry[] | undefined;

/**
 * Normalises the `spec` option (as read from a config file or the `--spec`
 * CLI flag) into an array of {@link SpecConfig} objects, or `undefined` when
 * the option is a plain string (single OpenAPI document path).
 *
 * - **Array**: each entry is mapped to `{source, prefix, group, version, overlays}` with defaults.
 * - **Object**: wrapped in a single-element array.
 * - **String / undefined**: returns `undefined` — caller handles the string
 *   case (it shifts the positional argument) and the `undefined` case
 *   (single spec derived from config).
 *
 * Note: `prefix` is intentionally left `undefined` when not supplied so that
 * `normalizeSpecs` (in `app.ts`) can derive it automatically from
 * `group`/`version`.
 */
export function normalizeSpecOption(
  specOption: SpecOption,
): SpecConfig[] | undefined {
  if (Array.isArray(specOption)) {
    return specOption.map((entry) => ({
      source: entry.source,
      prefix: entry.prefix,
      group: entry.group ?? "",
      version: entry.version,
      overlays: entry.overlays,
    }));
  }

  if (
    typeof specOption === "object" &&
    specOption !== null &&
    "source" in specOption
  ) {
    return [
      {
        source: specOption.source,
        prefix: specOption.prefix,
        group: specOption.group ?? "",
        version: specOption.version,
        overlays: specOption.overlays,
      },
    ];
  }

  return undefined;
}

/**
 * Subset of resolved CLI options that are intentionally included in startup
 * telemetry. Only non-sensitive flags are captured and all values are sent as
 * booleans/numbers (no raw file paths or free-form user input) to preserve
 * privacy while still allowing high-level usage analysis.
 */
type StartupTelemetryOptions = {
  alwaysFakeOptionals?: boolean;
  buildCache?: boolean;
  generate?: boolean;
  generateRoutes?: boolean;
  generateTypes?: boolean;
  open?: boolean;
  port: number;
  prune?: boolean;
  repl?: boolean;
  serve?: boolean;
  updateCheck: boolean;
  validateRequest: boolean;
  validateResponse: boolean;
  watch?: boolean;
  watchRoutes?: boolean;
  watchTypes?: boolean;
};

export function buildStartupTelemetryProperties(
  options: StartupTelemetryOptions,
  source: string,
  version: string,
  specs?: SpecConfig[],
): Record<string, unknown> {
  const apiSources = specs?.map((spec) => spec.source) ?? [source];
  const apiFileLocationHashes = apiSources
    .filter((apiSource) => apiSource !== "_")
    .map((apiSource) => hashTelemetryLocation(apiSource));

  return {
    alwaysFakeOptionals: Boolean(options.alwaysFakeOptionals),
    apiFileLocationHashes,
    buildCache: Boolean(options.buildCache),
    generateRoutes:
      Boolean(options.generate) || Boolean(options.generateRoutes),
    generateTypes: Boolean(options.generate) || Boolean(options.generateTypes),
    mode:
      specs !== undefined
        ? "multi-spec"
        : source === "_"
          ? "without-openapi"
          : "single-spec",
    openBrowser: Boolean(options.open),
    port: options.port,
    prune: Boolean(options.prune),
    repl: Boolean(options.repl),
    serve: Boolean(options.serve),
    updateCheck: Boolean(options.updateCheck),
    validateRequest: Boolean(options.validateRequest),
    validateResponse: Boolean(options.validateResponse),
    version,
    watchRoutes: Boolean(options.watch) || Boolean(options.watchRoutes),
    watchTypes: Boolean(options.watch) || Boolean(options.watchTypes),
  };
}

/**
 * Builds the Commander program with all CLI options and the action handler.
 * Factored out of `runCli` so it is easy to test or extend.
 *
 * @param version  - Package version string shown in `--version` output.
 * @param taglines - Array of random taglines for the startup banner.
 */
function buildProgram(version: string, taglines: string[]): Command {
  const program = new Command();

  async function main(source: string, destination: string): Promise<void> {
    debug("executing the main function");

    const options = program.opts<{
      adminApi: boolean;
      adminApiToken?: string;
      alwaysFakeOptionals?: boolean;
      buildCache?: boolean;
      config?: string;
      generate?: boolean;
      generateRoutes?: boolean;
      generateTypes?: boolean;
      open?: boolean;
      overlay?: string[];
      port: number;
      prefix: string;
      prune?: boolean;
      proxyUrl?: string;
      repl?: boolean;
      serve?: boolean;
      spec?: SpecOption;
      updateCheck: boolean;
      validateRequest: boolean;
      validateResponse: boolean;
      watch?: boolean;
      watchRoutes?: boolean;
      watchTypes?: boolean;
    }>();

    const updateCheckPromise =
      options.updateCheck === false
        ? Promise.resolve()
        : checkForUpdates(version);

    // Load the config file (counterfact.yaml by default, or --config <path>).
    // CLI options always take precedence over config file settings.
    const configFilePath = resolve(options.config ?? "counterfact.yaml");
    const fileConfig = await loadConfigFile(
      configFilePath,
      options.config !== undefined,
    );
    debug("fileConfig: %o", fileConfig);
    const knownOptionKeys = new Set(
      program.options.map((option) => option.attributeName()),
    );

    // Apply config file values for any option that was not explicitly set on
    // the command line (i.e. its source is "default" or it was never defined).
    for (const [key, value] of Object.entries(fileConfig)) {
      if (!knownOptionKeys.has(key)) {
        debug("ignoring unknown config key %s", key);
        continue;
      }

      const optionSource = program.getOptionValueSource(key);

      if (optionSource !== "cli") {
        // eslint-disable-next-line security/detect-object-injection -- key is validated against known Commander option names above.
        (options as Record<string, unknown>)[key] = value;
      }
    }

    // If the config file specifies a destination and none was given on the CLI,
    // use it (destination has no Commander option — it's a positional argument).
    if (fileConfig["destination"] !== undefined && destination === ".") {
      destination = String(fileConfig["destination"]);
    }

    // --spec takes precedence over the positional [openapi.yaml] argument.
    // When --spec is provided as a string, the [openapi.yaml] positional slot
    // shifts to become the [destination] argument (so `counterfact --spec
    // api.yaml ./api` works the same as `counterfact api.yaml ./api`).
    //
    // When --spec / the config file's `spec` key is an object or array of
    // objects ({source, prefix, group}), it describes multiple API specs and
    // is passed directly to counterfact() as the `specs` argument.

    const specs = normalizeSpecOption(options.spec);

    if (specs === undefined && typeof options.spec === "string") {
      // CLI --spec flag: a string path to a single OpenAPI document.
      if (source !== "_") {
        destination = source;
      }
      source = options.spec;
    }

    const destinationPath = pathResolve(destination);
    const basePath = pathResolve(destinationPath);

    // If no action-related option is provided, default to all options.
    const actions = ["repl", "serve", "watch", "generate", "buildCache"];
    if (
      !Object.keys(options).some((argument) =>
        actions.some((action) => argument.startsWith(action)),
      )
    ) {
      for (const action of actions) {
        // eslint-disable-next-line security/detect-object-injection -- action names come from the local allowlist above.
        (options as Record<string, unknown>)[action] = true;
      }
    }

    debug("options: %o", options);
    debug("source: %s", source);
    debug("destination: %s", destination);

    const startupTelemetryProperties = buildStartupTelemetryProperties(
      options,
      source,
      version,
      specs,
    );

    const openBrowser = options.open;
    const url = `http://localhost:${options.port}${options.prefix}`;
    const guiUrl = `${url}/counterfact/`;
    const swaggerUrl = `${url}/counterfact/swagger/`;

    const config = {
      adminApiToken:
        options.adminApiToken ??
        process.env["COUNTERFACT_ADMIN_API_TOKEN"] ??
        "",
      alwaysFakeOptionals: options.alwaysFakeOptionals ?? false,
      basePath,

      generate: {
        routes:
          Boolean(options.generate) ||
          Boolean(options.generateRoutes) ||
          Boolean(options.watch) ||
          Boolean(options.watchRoutes) ||
          Boolean(options.buildCache),

        types:
          Boolean(options.generate) ||
          Boolean(options.generateTypes) ||
          Boolean(options.watch) ||
          Boolean(options.watchTypes) ||
          Boolean(options.buildCache),

        prune: Boolean(options.prune),
      },

      openApiPath: source,
      overlays: options.overlay ?? [],
      port: options.port,
      proxyPaths: new Map([["", Boolean(options.proxyUrl)]]),
      proxyUrl: options.proxyUrl ?? "",
      prefix: options.prefix,
      startAdminApi: options.adminApi,
      startRepl: Boolean(options.repl),
      startServer: Boolean(options.serve),
      buildCache: Boolean(options.buildCache),
      validateRequests: options.validateRequest !== false,
      validateResponses: options.validateResponse !== false,

      watch: {
        routes: Boolean(options.watch) || Boolean(options.watchRoutes),
        types: Boolean(options.watch) || Boolean(options.watchTypes),
      },
    };

    const configForLogging = {
      ...config,
      adminApiToken: config.adminApiToken ? "[REDACTED]" : "",
    };

    debug("loading counterfact (%o)", configForLogging);

    if (config.startAdminApi && !config.adminApiToken) {
      process.stderr.write(
        "⚠️  WARNING: The admin API is enabled without an authentication token.\n" +
          "   Any process on this machine can read and modify server state via /_counterfact/api/*.\n" +
          "   Set --admin-api-token or COUNTERFACT_ADMIN_API_TOKEN to restrict access.\n\n",
      );
    }

    let didMigrate = false;

    if (fs.existsSync(join(config.basePath, "paths"))) {
      await pathsToRoutes(config.basePath);
      await fs.promises.rmdir(join(config.basePath, "paths"), {
        recursive: true,
      });
      await fs.promises.rmdir(join(config.basePath, "path-types"), {
        recursive: true,
      });
      await fs.promises.rmdir(join(config.basePath, "components"), {
        recursive: true,
      });

      didMigrate = true;
    }

    const { start, startRepl } = await (async () => {
      try {
        return await counterfact(config, specs);
      } catch (error) {
        process.stderr.write(
          `\n❌ ${error instanceof Error ? error.message : String(error)}\n\n`,
        );
        process.exit(1);
      }
    })();

    debug("loaded counterfact", configForLogging);

    // Migrate route type imports if needed.
    debug("checking if route type migration is needed");
    const didMigrateRouteTypes = await updateRouteTypes(
      config.basePath,
      config.openApiPath,
    );
    debug("route type migration check complete: %s", didMigrateRouteTypes);

    const isTelemetryDisabled = !isTelemetryEnabled();

    process.stdout.write(
      createIntroduction({
        config,
        isTelemetryDisabled,
        source,
        swaggerUrl,
        taglines,
        url,
        version,
      }),
    );

    process.stdout.write("\n\n");

    debug("starting server");
    try {
      await start(config);
    } catch (error) {
      process.stderr.write(
        `\n❌ ${error instanceof Error ? error.message : String(error)}\n\n`,
      );
      process.exit(1);
    }
    debug("started server");
    sendTelemetry("counterfact_started", startupTelemetryProperties);

    await updateCheckPromise;

    if (config.startRepl) {
      startRepl();
    }

    if (openBrowser) {
      debug("opening browser");
      await open(guiUrl);
      debug("opened browser");
    }

    if (didMigrate) {
      process.stdout.write("\n\n\n*******************************\n");
      process.stdout.write("MIGRATING TO NEW FILE STRUCTURE\n\n");
      process.stdout.write(
        "In preparation for version 1.0, Counterfact has migrated to a new file structure.\n",
      );
      process.stdout.write(
        "- The paths directory has been renamed to routes.\n",
      );
      process.stdout.write(
        "- The path-types and components directories are now stored under types.\n",
      );
      process.stdout.write("Your files have automatically been migrated.\n");
      process.stdout.write(
        "Please report any issues to https://github.com/pmcelhaney/counterfact/issues\n",
      );
      process.stdout.write("*******************************\n\n\n");
    }

    if (didMigrateRouteTypes) {
      process.stdout.write("\n\n\n*******************************\n");
      process.stdout.write("MIGRATING ROUTE TYPE IMPORTS\n\n");
      process.stdout.write(
        "Operation types now use operationId from your OpenAPI spec when available.\n",
      );
      process.stdout.write(
        "Your route files have been automatically updated to use the new type names.\n",
      );
      process.stdout.write(
        "Example: 'HTTP_GET' may now be 'getPetById' if operationId is defined.\n",
      );
      process.stdout.write(
        "Please review the changes and report any issues to:\n",
      );
      process.stdout.write(
        "https://github.com/pmcelhaney/counterfact/issues\n",
      );
      process.stdout.write("*******************************\n\n\n");
    }
  }

  program
    .name("counterfact")
    .description(
      "Counterfact is a tool for mocking REST APIs in development. See https://counterfact.dev for more info.",
    )
    .version(version)
    .argument(
      "[openapi.yaml]",
      'path or URL to OpenAPI document or "_" to run without OpenAPI',
      "_",
    )
    .argument("[destination]", "path to generated code", ".")
    .option(
      "-p, --port <number>",
      "server port number",
      (v) => Number(v),
      DEFAULT_PORT,
    )
    .option("-o, --open", "open a browser")
    .option("-g, --generate", "generate all code for both routes and types")
    .option("--generate-types", "generate types")
    .option("--generate-routes", "generate routes")
    .option("-w, --watch", "generate + watch all code for changes")
    .option("--watch-types", "generate + watch types for changes")
    .option("--watch-routes", "generate + watch routes for changes")
    .option("-s, --serve", "start the server")
    .option(
      "-b, --build-cache",
      "builds the cache of compiled routes and types",
    )
    .option("--admin-api", "enable the admin API at /_counterfact/api/*")
    .option("-r, --repl", "start the REPL")
    .option("--proxy-url <string>", "proxy URL")
    .option(
      "--admin-api-token <string>",
      "bearer token required for /_counterfact/api/* endpoints (defaults to COUNTERFACT_ADMIN_API_TOKEN)",
    )
    .option(
      "--prefix <string>",
      "base path from which routes will be served (e.g. /api/v1)",
      "",
    )
    .option(
      "--always-fake-optionals",
      "random responses will include optional fields",
    )
    .option(
      "--prune",
      "remove route files that no longer exist in the OpenAPI spec",
    )
    .option(
      "--spec <string>",
      "path or URL to OpenAPI document (alternative to the positional [openapi.yaml] argument)",
    )
    .option(
      "--overlay <path>",
      "path or URL to an OpenAPI overlay file to apply (repeatable)",
      (value: string, previous: string[]) => [...previous, value],
      [] as string[],
    )
    .option("--no-update-check", "disable the npm update check on startup")
    .option(
      "--no-validate-request",
      "disable request validation against the OpenAPI spec",
    )
    .option(
      "--no-validate-response",
      "disable response validation against the OpenAPI spec",
    )
    .option(
      "--config <path>",
      "path to a counterfact.yaml config file (default: counterfact.yaml in the current directory)",
    )
    .action(main);

  return program;
}

/**
 * Entry point for the Counterfact CLI.
 *
 * Reads the package version and taglines, fires telemetry (if enabled),
 * then hands off to Commander to parse `argv` and invoke the action handler.
 *
 * @param argv - Raw argument vector, typically `process.argv`.
 */
export async function runCli(argv: string[]): Promise<void> {
  // Read version from package.json.
  // src/cli/ and dist/cli/ are both two levels below the project root,
  // so "../../package.json" resolves correctly in both environments.
  const packageJson = JSON.parse(
    await readFile(resolve(__dirname, "../../package.json"), "utf8"),
  ) as { version: string };
  const version = packageJson.version;

  // Taglines live in bin/taglines.txt; both src/cli/ and dist/cli/ are two
  // levels below the project root, so "../bin/taglines.txt" (or the equivalent
  // from the root) resolves correctly.  We go up two levels to the root and
  // then into bin/.
  let taglines: string[];
  try {
    const taglinesFile = await readFile(
      resolve(__dirname, "../../bin/taglines.txt"),
      "utf8",
    );
    taglines = taglinesFile.split("\n").slice(0, -1);
  } catch {
    taglines = ["counterfact — mock API server"];
  }

  debug("running counterfact CLI v%s", version);

  const program = buildProgram(version, taglines);
  await program.parseAsync(argv);
}
