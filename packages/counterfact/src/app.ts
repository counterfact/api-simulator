import fs from "node:fs/promises";
import nodePath from "node:path";

import { createHttpTerminator, type HttpTerminator } from "http-terminator";
import {
  createOpenApiRouteCatalog,
  createRouteFunction,
  type OpenApiRouteDocument,
} from "@counterfact/client";
import { generateVersionsTsContent, Repository } from "@counterfact/generator";
import {
  ContextRegistry,
  ScenarioRegistry,
  StoreLoader,
} from "@counterfact/runtime";
import { createKoaApp } from "@counterfact/runtime/koa";
import { startRepl as startReplServer } from "@counterfact/repl";

import { ApiRunner } from "./api-runner.js";
import { sendTelemetry } from "./cli/telemetry.js";
import type { Config } from "./config.js";
import { ensureDirectoryExists } from "./util/ensure-directory-exists.js";

export { loadOpenApiDocument } from "@counterfact/runtime";
export {
  createMswHandlers,
  handleMswRequest,
  type MockRequest,
} from "@counterfact/runtime/msw";

/**
 * Describes one API specification entry.
 *
 * When `counterfact()` is called with a `specs` array, one {@link ApiRunner}
 * is created per entry. When called without `specs`, a single entry is derived
 * from `config.openApiPath`, `config.prefix`, and `group = ""`.
 *
 * ### URL prefixes
 *
 * `group` and `version` organize generated code and runtime state; they do not
 * change the paths declared by the OpenAPI document. The URL prefix follows
 * this table:
 *
 * | `prefix` | Effective prefix |
 * |----------|------------------|
 * | provided | explicit value   |
 * | absent   | `""` (root)      |
 */
export interface SpecConfig {
  /** Path or URL to the OpenAPI document for this spec. */
  source: string;
  /**
   * URL prefix that this spec's runner intercepts.
   *
   * When absent, the prefix defaults to the root (`""`). Group and version do
   * not affect URL routing.
   */
  prefix?: string;
  /** Name of the subdirectory under `config.basePath` where code is generated. */
  group: string;
  /**
   * Optional version label for this spec (e.g. `"v1"`, `"v2"`).
   *
   * When at least one spec in a group defines a non-empty version,
   * `types/versions.ts` is generated inside that group's subdirectory
   * (e.g. `<basePath>/<group>/types/versions.ts`) with the `Versions`,
   * `VersionsGTE`, and `Versioned` types.
   */
  version?: string;
  /**
   * Optional ordered list of OpenAPI overlay file paths/URLs to apply to the
   * spec after it is loaded.  Overlays are applied in the order listed.
   *
   * Each entry is a path or URL to an OpenAPI overlay document (version 1.0.0)
   * containing `actions` that modify the loaded spec via JSONPath targeting.
   */
  overlays?: string[];
}

type Scenario$ = {
  context: Record<string, unknown>;
  loadContext: (path: string) => Record<string, unknown>;
  route: (path: string) => unknown;
  routes: Record<string, unknown>;
};

export async function runStartupScenario(
  scenarioRegistry: ScenarioRegistry,
  contextRegistry: ContextRegistry,
  config: Pick<Config, "port">,
  openApiDocument?: OpenApiRouteDocument,
): Promise<void> {
  const indexModule = scenarioRegistry.getModule("index");

  if (!indexModule || typeof indexModule["startup"] !== "function") {
    return;
  }

  const scenario$: Scenario$ = {
    context: contextRegistry.find("/") as Record<string, unknown>,
    loadContext: (path: string) =>
      contextRegistry.find(path) as Record<string, unknown>,
    route: createRouteFunction(
      config.port,
      "localhost",
      openApiDocument ? createOpenApiRouteCatalog(openApiDocument) : undefined,
    ),
    routes: {},
  };

  await (indexModule["startup"] as (ctx: Scenario$) => Promise<void> | void)(
    scenario$,
  );
}

/**
 * Runs one startup scenario per API group, in specification declaration order.
 * Versioned runners in one group share the same scenario and context registries,
 * so only the group's first runner participates in startup.
 */
async function runGroupStartupScenarios(
  runners: readonly ApiRunner[],
  config: Pick<Config, "port">,
): Promise<void> {
  const startedGroups = new Set<string>();

  for (const runner of runners) {
    if (startedGroups.has(runner.group)) {
      continue;
    }
    startedGroups.add(runner.group);

    try {
      await runStartupScenario(
        runner.scenarioRegistry,
        runner.contextRegistry,
        config,
        runner.openApiDocument,
      );
    } catch (error) {
      const groupLabel = runner.group
        ? `group "${runner.group}"${runner.version ? ` (version "${runner.version}")` : ""}`
        : "the primary API";
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Startup scenario failed for ${groupLabel}: ${message}`, {
        cause: error,
      });
    }
  }
}

/**
 * Normalises the spec configuration to an array.
 *
 * When `specs` is provided, each omitted `prefix` defaults to `""` so the rest
 * of the code can assume it is always a string. When `specs` is omitted, a
 * single-entry array is constructed from `config.openApiPath`, `config.prefix`,
 * and `group = ""`.
 */
function normalizeSpecs(
  config: Pick<Config, "openApiPath" | "prefix">,
  specs?: SpecConfig[],
): Array<SpecConfig & { prefix: string }> {
  if (specs !== undefined) {
    return specs.map((spec) => ({ ...spec, prefix: spec.prefix ?? "" }));
  }

  return [
    {
      source: config.openApiPath,
      prefix: config.prefix,
      group: "",
      version: "",
    },
  ];
}

function validateSpecGroups(
  specs: Array<SpecConfig & { prefix: string }>,
): void {
  if (specs.length <= 1) {
    return;
  }

  const invalidSpecNumbers = specs
    .map((spec, index) => ({ group: spec.group.trim(), index }))
    .filter(({ group }) => group === "")
    .map(({ index }) => String(index + 1));

  if (invalidSpecNumbers.length === 0) {
    const seenKeys = new Set<string>();
    const duplicateKeys = new Set<string>();

    for (const spec of specs) {
      const group = spec.group.trim();
      const version = spec.version?.trim() ?? "";
      // Use group@version as the uniqueness key so that the same group can
      // appear with different versions (e.g. v1 and v2 of the same API).
      // The empty-group case is already rejected above, so `group` is always
      // non-empty here and the `@version` suffix remains unambiguous.
      const key = version ? `${group}@${version}` : group;

      if (seenKeys.has(key)) {
        duplicateKeys.add(key);
        continue;
      }

      seenKeys.add(key);
    }

    if (duplicateKeys.size === 0) {
      return;
    }

    throw new Error(
      `Each spec must define a unique group (and version) when multiple APIs are configured (duplicates: ${[...duplicateKeys].join(", ")}).`,
    );
  }

  throw new Error(
    `Each spec must define a non-empty group when multiple APIs are configured (invalid spec entries: ${invalidSpecNumbers.join(", ")}).`,
  );
}

/**
 * Creates and configures a full Counterfact server instance.
 *
 * Supports one or more API specifications. Each spec produces its own
 * {@link ApiRunner}. When `specs` is omitted a single runner is created from
 * `config.openApiPath` and `config.prefix`.
 *
 * The returned object exposes handles for starting the server, stopping it,
 * and launching the interactive REPL.
 *
 * @param config - Runtime configuration (port, paths, feature flags, etc.).
 * @param specs - Optional array of spec entries. Omit to use a single spec
 *   derived from `config.openApiPath` and `config.prefix`.
 * @returns An object containing the configured sub-systems and two entry-point
 *   functions:
 *   - `start(options)` — generates/watches code and optionally starts the HTTP
 *     server; returns a `stop()` handle.
 *   - `startRepl()` — launches the interactive Node.js REPL connected to the
 *     live server state.
 */
export async function counterfact<TStore = unknown>(
  config: Config,
  specs?: SpecConfig[],
) {
  const normalizedSpecs = normalizeSpecs(
    { openApiPath: config.openApiPath, prefix: config.prefix },
    specs,
  );
  validateSpecGroups(normalizedSpecs);

  let runners: ApiRunner[] = [];
  let hasStore = false;
  const simulatorRef: { current?: { store?: TStore } } = {};
  const replServers = new Set<ReturnType<typeof startReplServer>>();
  const storeLoader = new StoreLoader(config.basePath, {
    async onStoreChange(store) {
      const isActivation = !hasStore;
      hasStore = true;
      if (simulatorRef.current !== undefined) {
        simulatorRef.current.store = store as TStore;
      }
      for (const replServer of replServers) {
        replServer.context.store = store;
      }

      if (isActivation) {
        const seenGroups = new Set<string>();
        for (const runner of runners) {
          if (seenGroups.has(runner.group)) continue;
          seenGroups.add(runner.group);
          await runner.reloadContexts();
        }
      }
    },
  });
  const initialStore = await storeLoader.load();
  hasStore = initialStore !== undefined;

  // Compute the ordered versions per group (oldest first, as declared in specs).
  // This list is passed to each runner so that $.minVersion() can compare
  // version positions at runtime.
  const versionsByGroup = new Map<string, string[]>();
  for (const spec of normalizedSpecs) {
    const version = spec.version ?? "";

    if (version) {
      const existing = versionsByGroup.get(spec.group) ?? [];

      versionsByGroup.set(spec.group, [...existing, version]);
    }
  }

  // A group is one state boundary even when it contains several versioned
  // specification runners. Preserve separate registries between groups while
  // sharing context and scenarios between every runner in the same group.
  const stateByGroup = new Map<
    string,
    {
      contextRegistry: ContextRegistry;
      scenarioRegistry: ScenarioRegistry;
      getStore: () => object | undefined;
    }
  >();
  for (const spec of normalizedSpecs) {
    if (!stateByGroup.has(spec.group)) {
      stateByGroup.set(spec.group, {
        contextRegistry: new ContextRegistry(),
        scenarioRegistry: new ScenarioRegistry(),
        getStore: () => storeLoader.store,
      });
    }
  }

  runners = await Promise.all(
    normalizedSpecs.map((spec) =>
      ApiRunner.create(
        {
          ...config,
          openApiPath: spec.source,
          // Per-spec overlays take precedence; fall back to config-level overlays
          // so that the --overlay CLI flag works in single-spec mode.
          overlays: spec.overlays ?? config.overlays ?? [],
          prefix: spec.prefix,
        },
        spec.group,
        spec.version ?? "",
        versionsByGroup.get(spec.group) ?? [],
        stateByGroup.get(spec.group),
      ),
    ),
  );

  const koaApp = createKoaApp({
    runners,
    config,
    reportEvent: sendTelemetry,
    adminApi: {
      adminApiToken: config.adminApiToken,
      basePath: config.basePath,
      get proxyUrl() {
        return config.proxyUrl;
      },
      getConfigSnapshot: () => ({
        alwaysFakeOptionals: config.alwaysFakeOptionals,
        basePath: config.basePath,
        buildCache: config.buildCache,
        generate: config.generate,
        openApiPath: config.openApiPath,
        port: config.port,
        prefix: config.prefix,
        startAdminApi: config.startAdminApi ?? false,
        startRepl: config.startRepl,
        startServer: config.startServer,
        watch: config.watch,
      }),
      port: config.port,
      prefix: config.prefix,
      proxyPaths: config.proxyPaths,
      setProxyUrl(proxyUrl) {
        config.proxyUrl = proxyUrl;
      },
    },
  });

  // The REPL is configured using the first runner.
  const primaryRunner = runners[0]!;

  async function start(
    options: Pick<Config, "generate" | "startServer" | "watch" | "buildCache">,
  ) {
    async function completeStage(operations: Array<Promise<unknown>>) {
      const results = await Promise.allSettled(operations);
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );

      if (failure !== undefined) {
        throw failure.reason;
      }
    }

    // Serialize generate() calls within each group to avoid concurrent writes
    // to the same output directory.  Runners that share a group share the same
    // basePath subdirectory (and therefore the same counterfact-types
    // destination), so running them in parallel would cause a race when both
    // try to create that directory at startup.  Different groups are still
    // generated in parallel.
    //
    // When multiple versioned specs share the same group, they also share a
    // single Repository instance so that the shared `types/paths/…` files
    // accumulate all versions into a merged Versioned<…> type instead of each
    // overwriting the previous version's types.
    const runnersByGroup = new Map<string, ApiRunner[]>();
    for (const runner of runners) {
      const bucket = runnersByGroup.get(runner.group) ?? [];
      bucket.push(runner);
      runnersByGroup.set(runner.group, bucket);
    }
    await Promise.all(
      Array.from(runnersByGroup.values()).map(async (bucket) => {
        const sharedRepository =
          bucket.length > 1 ? new Repository() : undefined;
        for (const runner of bucket) {
          await runner.generate(sharedRepository);
        }
      }),
    );

    if (options.generate?.types) {
      // Build a per-group map of unique non-empty version strings in
      // declaration order. new Set() preserves insertion order so the first
      // occurrence of each version is kept and duplicates are dropped without
      // reordering.
      const versionsByGroup = new Map<string, string[]>();
      for (const spec of normalizedSpecs) {
        const group = spec.group;
        const version = (spec.version ?? "").trim();
        if (version === "") {
          continue;
        }
        const existing = versionsByGroup.get(group) ?? [];
        if (!existing.includes(version)) {
          existing.push(version);
        }
        versionsByGroup.set(group, existing);
      }

      // Write <basePath>/<group>/types/versions.ts for every group that has
      // at least one versioned spec.  When the group is empty the path
      // collapses to <basePath>/types/versions.ts (the single-spec case).
      await Promise.all(
        Array.from(versionsByGroup.entries()).map(async ([group, versions]) => {
          const content = await generateVersionsTsContent(versions);
          const versionsFilePath = group
            ? nodePath.join(config.basePath, group, "types", "versions.ts")
            : nodePath.join(config.basePath, "types", "versions.ts");

          /* eslint-disable security/detect-non-literal-fs-filename -- path is derived from the caller-supplied basePath and fixed suffixes. */
          await ensureDirectoryExists(versionsFilePath);
          await fs.writeFile(versionsFilePath, content, "utf8");
          /* eslint-enable security/detect-non-literal-fs-filename */
        }),
      );
    }
    let httpTerminator: HttpTerminator | undefined;

    async function stopResources(): Promise<void> {
      const results = await Promise.allSettled([
        ...runners.map((runner) => runner.stopWatching()),
        storeLoader.stopWatching(),
        httpTerminator?.terminate(),
      ]);
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );

      if (errors.length > 0) {
        throw new AggregateError(
          errors,
          "Failed to stop all Counterfact resources",
        );
      }
    }

    try {
      await completeStage(runners.map((runner) => runner.watch()));
      await completeStage(runners.map((runner) => runner.start(options)));

      if (options.startServer) {
        await storeLoader.watch();
      }

      if (!options.startServer) {
        return { stop: stopResources };
      }

      await runGroupStartupScenarios(runners, { port: config.port });

      const server = koaApp.listen({
        port: config.port,
      });

      httpTerminator = createHttpTerminator({
        server,
      });
    } catch (error) {
      await stopResources().catch(() => undefined);
      throw error;
    }

    return {
      stop: stopResources,
    };
  }

  const baseSimulator = {
    contextRegistry: primaryRunner.contextRegistry,
    koaApp,
    registry: primaryRunner.registry,
    start,
    startRepl: () => {
      const routeCatalogs = new Map(
        runners.map((runner) => [
          runner,
          runner.openApiDocument
            ? createOpenApiRouteCatalog(runner.openApiDocument)
            : undefined,
        ]),
      );
      const replServer = startReplServer(
        primaryRunner.contextRegistry,
        primaryRunner.registry,
        {
          port: config.port,
          proxyPaths: config.proxyPaths,
          proxyUrl: config.proxyUrl,
        },
        undefined, // use the default print function (stdout)
        routeCatalogs.get(primaryRunner),
        primaryRunner.scenarioRegistry,
        runners.map((runner) => ({
          contextRegistry: runner.contextRegistry,
          group: runner.group,
          registry: runner.registry,
          routeCatalog: routeCatalogs.get(runner),
          scenarioRegistry: runner.scenarioRegistry,
        })),
        storeLoader.store,
        ({ command }) => {
          sendTelemetry("repl_command_used", { command });
        },
      );
      replServers.add(replServer);
      return replServer;
    },
  };
  const result: typeof baseSimulator & { store?: TStore } = baseSimulator;
  simulatorRef.current = result;

  if (initialStore !== undefined) {
    result.store = initialStore as TStore;
  }

  return result;
}
