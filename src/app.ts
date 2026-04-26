import fs from "node:fs/promises";
import nodePath from "node:path";

import { createHttpTerminator, type HttpTerminator } from "http-terminator";

import { ApiRunner } from "./api-runner.js";
import { startRepl as startReplServer } from "./repl/repl.js";
import { createRouteFunction } from "./repl/route-builder.js";
import type { Config } from "./server/config.js";
import { ContextRegistry } from "./server/context-registry.js";
import { createKoaApp } from "./server/web-server/create-koa-app.js";
import { ScenarioRegistry } from "./server/scenario-registry.js";
import { Repository } from "./typescript-generator/repository.js";
import { ensureDirectoryExists } from "./util/ensure-directory-exists.js";
import { generateVersionsTsContent } from "./typescript-generator/versions-ts-generator.js";

export { loadOpenApiDocument } from "./server/load-openapi-document.js";
export {
  createMswHandlers,
  handleMswRequest,
  type MockRequest,
} from "./msw.js";

/**
 * Describes one API specification entry.
 *
 * When `counterfact()` is called with a `specs` array, one {@link ApiRunner}
 * is created per entry. When called without `specs`, a single entry is derived
 * from `config.openApiPath`, `config.prefix`, and `group = ""`.
 *
 * ### Prefix derivation
 *
 * When `prefix` is omitted (or `undefined`), the URL prefix is derived from
 * `group` and `version` according to this table:
 *
 * | `prefix`    | `group` | `version` | Derived prefix       |
 * |-------------|---------|-----------|----------------------|
 * | provided    | any     | any       | use the explicit prefix |
 * | absent      | set     | set       | `/<group>/<version>` |
 * | absent      | set     | absent    | `/<group>`           |
 * | absent      | absent  | absent    | `""` (root)          |
 */
export interface SpecConfig {
  /** Path or URL to the OpenAPI document for this spec. */
  source: string;
  /**
   * URL prefix that this spec's runner intercepts.
   *
   * When absent, the prefix is derived automatically from `group` and
   * `version` (see the derivation table on the interface). Pass an explicit
   * empty string (`""`) to force the root prefix regardless of `group`/`version`.
   */
  prefix?: string;
  /** Name of the subdirectory under `config.basePath` where code is generated. */
  group: string;
  /**
   * Optional version label for this spec (e.g. `"v1"`, `"v2"`).
   *
   * When combined with `group` and no explicit `prefix`, the server mounts
   * this spec's routes under `/<group>/<version>`.
   *
   * When at least one spec in a group defines a non-empty version,
   * `types/versions.ts` is generated inside that group's subdirectory
   * (e.g. `<basePath>/<group>/types/versions.ts`) with the `Versions`,
   * `VersionsGTE`, and `Versioned` types.
   */
  version?: string;
}

type Scenario$ = {
  context: Record<string, unknown>;
  loadContext: (path: string) => Record<string, unknown>;
  route: (path: string) => unknown;
  routes: Record<string, unknown>;
  version: string;
};

export async function runStartupScenario(
  scenarioRegistry: ScenarioRegistry,
  contextRegistry: ContextRegistry,
  config: Pick<Config, "port">,
  openApiDocument?: Parameters<typeof createRouteFunction>[2],
  version = "",
): Promise<void> {
  const indexModule = scenarioRegistry.getModule("index");

  if (!indexModule || typeof indexModule["startup"] !== "function") {
    return;
  }

  const scenario$: Scenario$ = {
    context: contextRegistry.find("/") as Record<string, unknown>,
    loadContext: (path: string) =>
      contextRegistry.find(path) as Record<string, unknown>,
    route: createRouteFunction(config.port, "localhost", openApiDocument),
    routes: {},
    version,
  };

  await (indexModule["startup"] as (ctx: Scenario$) => Promise<void> | void)(
    scenario$,
  );
}

/**
 * Derives the URL prefix for a spec entry.
 *
 * Applies the following precedence rules:
 *  1. Explicit `prefix` (even `""`) → returned as-is.
 *  2. `group` + `version` both present → `/<group>/<version>`.
 *  3. `group` present (no `version`) → `/<group>`.
 *  4. Neither → `""` (root).
 */
function derivePrefix(
  spec: Pick<SpecConfig, "prefix" | "group" | "version">,
): string {
  if (spec.prefix !== undefined) {
    return spec.prefix;
  }

  if (spec.group && spec.version) {
    return `/${spec.group}/${spec.version}`;
  }

  if (spec.group) {
    return `/${spec.group}`;
  }

  return "";
}

/**
 * Normalises the spec configuration to an array.
 *
 * When `specs` is provided, each entry's `prefix` is resolved via
 * {@link derivePrefix} so the rest of the code can assume `prefix` is always
 * a string. When `specs` is omitted, a single-entry array is constructed from
 * `config.openApiPath`, `config.prefix`, and `group = ""`.
 */
function normalizeSpecs(
  config: Pick<Config, "openApiPath" | "prefix">,
  specs?: SpecConfig[],
): Array<SpecConfig & { prefix: string }> {
  if (specs !== undefined) {
    return specs.map((spec) => ({ ...spec, prefix: derivePrefix(spec) }));
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
export async function counterfact(config: Config, specs?: SpecConfig[]) {
  const normalizedSpecs = normalizeSpecs(
    { openApiPath: config.openApiPath, prefix: config.prefix },
    specs,
  );
  validateSpecGroups(normalizedSpecs);

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

  const runners = await Promise.all(
    normalizedSpecs.map((spec) =>
      ApiRunner.create(
        { ...config, openApiPath: spec.source, prefix: spec.prefix },
        spec.group,
        spec.version ?? "",
        versionsByGroup.get(spec.group) ?? [],
      ),
    ),
  );

  const koaApp = createKoaApp({
    runners,
    config,
  });

  // The REPL is configured using the first runner.
  const primaryRunner = runners[0]!;

  async function start(
    options: Pick<Config, "generate" | "startServer" | "watch" | "buildCache">,
  ) {
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
    await Promise.all(runners.map((runner) => runner.watch()));
    await Promise.all(runners.map((runner) => runner.start(options)));

    let httpTerminator: HttpTerminator | undefined;

    if (options.startServer) {
      await runStartupScenario(
        primaryRunner.scenarioRegistry,
        primaryRunner.contextRegistry,
        { port: config.port },
        primaryRunner.openApiDocument,
        primaryRunner.version,
      );

      const server = koaApp.listen({
        port: config.port,
      });

      httpTerminator = createHttpTerminator({
        server,
      });
    }

    return {
      async stop() {
        await Promise.all(runners.map((runner) => runner.stopWatching()));
        await httpTerminator?.terminate();
      },
    };
  }

  return {
    contextRegistry: primaryRunner.contextRegistry,
    koaApp,
    registry: primaryRunner.registry,
    start,
    startRepl: () =>
      startReplServer(
        primaryRunner.contextRegistry,
        primaryRunner.registry,
        {
          port: config.port,
          proxyPaths: config.proxyPaths,
          proxyUrl: config.proxyUrl,
        },
        undefined, // use the default print function (stdout)
        primaryRunner.openApiDocument,
        primaryRunner.scenarioRegistry,
        runners.map((runner) => ({
          contextRegistry: runner.contextRegistry,
          group: runner.group,
          openApiDocument: runner.openApiDocument,
          registry: runner.registry,
          scenarioRegistry: runner.scenarioRegistry,
        })),
      ),
  };
}
