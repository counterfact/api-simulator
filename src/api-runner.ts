import { rm } from "node:fs/promises";

import type { Config } from "./server/config.js";
import { ContextRegistry } from "./server/context-registry.js";
import { Dispatcher } from "./server/dispatcher.js";
import { loadOpenApiDocument } from "./server/load-openapi-document.js";
import { ModuleLoader } from "./server/module-loader.js";
import type { OpenApiDocument } from "./server/openapi-document.js";
import { Registry } from "./server/registry.js";
import { ScenarioRegistry } from "./server/scenario-registry.js";
import { Transpiler } from "./server/transpiler.js";
import { CodeGenerator } from "./typescript-generator/code-generator.js";
import { Repository } from "./typescript-generator/repository.js";
import { ScenarioFileGenerator } from "./typescript-generator/scenario-file-generator.js";
import { pathJoin } from "./util/forward-slash-path.js";
import { runtimeCanExecuteErasableTs } from "./util/runtime-can-execute-erasable-ts.js";

/**
 * Encapsulates the creation and lifecycle management of all Counterfact
 * sub-systems for a single API specification.
 *
 * Use the static {@link ApiRunner.create} factory method to construct an
 * instance — the constructor requires async initialisation (loading the
 * OpenAPI document and probing for native TypeScript support) that cannot
 * be done in a synchronous constructor.
 *
 * Each sub-system is exposed as a public property so callers can interact
 * with individual components directly when needed. The composite methods
 * {@link generate}, {@link load}, {@link watch}, and {@link stopWatching}
 * coordinate across multiple sub-systems and encapsulate the conditional
 * logic driven by the configuration.
 */
export class ApiRunner {
  /** Stores loaded route handlers, keyed by path. */
  public readonly registry: Registry;

  /** Stores context objects per route path and dispatches change events. */
  public readonly contextRegistry: ContextRegistry;

  /** Registry of loaded scenario modules (used by the REPL). */
  public readonly scenarioRegistry: ScenarioRegistry;

  /** Generates `types/_.context.ts` and the default `scenarios/index.ts`. */
  public readonly scenarioFileGenerator: ScenarioFileGenerator;

  /** Reads the OpenAPI spec and writes TypeScript route/type stub files. */
  public readonly codeGenerator: CodeGenerator;

  /** Routes incoming HTTP requests to the matching handler in `registry`. */
  public readonly dispatcher: Dispatcher;

  /**
   * Compiles TypeScript route files to JavaScript when the runtime cannot
   * execute TypeScript natively.
   */
  public readonly transpiler: Transpiler;

  /**
   * Imports compiled route/context/scenario modules and hot-reloads them on
   * file-system changes.
   */
  public readonly moduleLoader: ModuleLoader;

  /**
   * The loaded OpenAPI document, or `undefined` when `config.openApiPath`
   * is `"_"` (spec-less mode).
   */
  public readonly openApiDocument: OpenApiDocument | undefined;

  /** `true` when the current Node.js runtime can execute TypeScript natively. */
  public readonly nativeTs: boolean;

  /** Path or URL to the OpenAPI document for this runner. */
  public readonly openApiPath: string;

  /** URL prefix that this runner intercepts (default `""`). */
  public readonly prefix: string;

  /**
   * Optional group name that places generated code in a subdirectory.
   * Defaults to `""` (no subdirectory).
   */
  public readonly group: string;

  /**
   * Optional version label for this runner's spec (e.g. `"v1"`, `"v2"`).
   * Defaults to `""` (unversioned).
   */
  public readonly version: string;

  /**
   * The subdirectory path segment derived from {@link group}.
   * Returns `""` when `group` is empty, otherwise `"/${group}"`.
   */
  public get subdirectory(): string {
    return this.group ? `/${this.group}` : "";
  }

  private readonly config: Config;

  private constructor(
    config: Config,
    nativeTs: boolean,
    openApiDocument: OpenApiDocument | undefined,
    group: string,
    version = "",
    versions: readonly string[] = [],
  ) {
    this.group = group;
    this.version = version;

    const modulesPath = this.group
      ? pathJoin(config.basePath, this.group)
      : config.basePath;
    const compiledPathsDirectory = pathJoin(
      modulesPath,
      nativeTs ? "routes" : ".cache",
    );

    this.config = config;
    this.nativeTs = nativeTs;
    this.openApiDocument = openApiDocument;
    this.openApiPath = config.openApiPath;
    this.prefix = config.prefix;

    this.registry = new Registry();
    this.contextRegistry = new ContextRegistry();
    this.scenarioRegistry = new ScenarioRegistry();

    this.scenarioFileGenerator = new ScenarioFileGenerator(modulesPath);

    this.codeGenerator = new CodeGenerator(
      this.openApiPath,
      config.basePath + this.subdirectory,
      config.generate,
      version,
    );

    this.dispatcher = new Dispatcher(
      this.registry,
      this.contextRegistry,
      openApiDocument,
      config,
      version,
      versions,
    );

    this.transpiler = new Transpiler(
      pathJoin(modulesPath, "routes"),
      compiledPathsDirectory,
      "commonjs",
    );

    this.moduleLoader = new ModuleLoader(
      compiledPathsDirectory,
      this.registry,
      this.contextRegistry,
      pathJoin(modulesPath, "scenarios"),
      this.scenarioRegistry,
      version ? pathJoin(modulesPath, version, "scenarios") : undefined,
    );
  }

  /**
   * Creates and returns a fully initialised `ApiRunner`.
   *
   * Probes for native TypeScript support, optionally cleans the compiled
   * output directory, and loads the OpenAPI document before constructing
   * the runner.
   *
   * @param config - Runtime configuration for this runner instance.
   * @param group - Optional group name placing generated code in a subdirectory (default `""`).
   * @param version - Optional version label for this spec (e.g. `"v1"`, `"v2"`).
   * @param versions - Optional ordered list of all version labels in this group (oldest first).
   */
  public static async create(
    config: Config,
    group = "",
    version = "",
    versions: readonly string[] = [],
  ): Promise<ApiRunner> {
    const nativeTs = await runtimeCanExecuteErasableTs();

    const modulesPath = group
      ? pathJoin(config.basePath, group)
      : config.basePath;
    const compiledPathsDirectory = pathJoin(
      modulesPath,
      nativeTs ? "routes" : ".cache",
    );

    if (!nativeTs) {
      await rm(compiledPathsDirectory, { force: true, recursive: true });
    }

    const openApiDocument =
      config.openApiPath === "_"
        ? undefined
        : await loadOpenApiDocument(config.openApiPath);

    return new ApiRunner(
      config,
      nativeTs,
      openApiDocument,
      group,
      version,
      versions,
    );
  }

  /**
   * Generates TypeScript route stubs and type files from the OpenAPI spec.
   *
   * Respects the `config.generate.routes` and `config.generate.types` flags:
   * - Routes and types are only generated when `config.openApiPath` is not `"_"`.
   * - The scenario context type file is always generated when
   *   `config.generate.types` is `true`, even without a spec.
   *
   * @param repository - Optional shared repository.  Pass a shared instance
   *   when multiple versioned specs in the same group should merge their types
   *   into the same output tree.
   */
  public async generate(repository?: Repository): Promise<void> {
    if (
      this.config.openApiPath !== "_" &&
      (this.config.generate.routes || this.config.generate.types)
    ) {
      await this.codeGenerator.generate(repository);
    }

    if (this.config.generate.types) {
      await this.scenarioFileGenerator.generate();
    }
  }

  /**
   * Loads all compiled route, context, and scenario modules into the
   * appropriate registries.
   */
  public async load(): Promise<void> {
    await this.moduleLoader.load();
  }

  /**
   * Starts watching the OpenAPI spec and scenario context files for changes
   * and re-generates the corresponding TypeScript files on each change.
   *
   * - Re-generates route stubs when the spec changes (when
   *   `config.watch.routes` or `config.watch.types` is `true`).
   * - Re-generates `types/_.context.ts` when a `_.context.ts` file changes
   *   (when `config.watch.types` is `true`).
   */
  public async watch(): Promise<void> {
    if (
      this.config.openApiPath !== "_" &&
      (this.config.watch.routes || this.config.watch.types)
    ) {
      await this.codeGenerator.watch();
    }

    if (this.config.watch.types) {
      await this.scenarioFileGenerator.watch();
    }
  }

  /**
   * Starts the server-related sub-systems based on the supplied options.
   *
   * When `startServer` is `true`:
   * - Watches the OpenAPI document for live reloads.
   * - Transpiles TypeScript route files (when the runtime does not support
   *   native TypeScript execution).
   * - Loads all compiled modules into their registries.
   * - Watches compiled modules for hot-reload.
   *
   * When `buildCache` is `true` (and `startServer` is `false`):
   * - Runs the transpiler once to build the compiled-output cache, then stops.
   *
   * @param options - Subset of the runtime config that governs startup behaviour.
   */
  public async start(
    options: Pick<Config, "startServer" | "buildCache">,
  ): Promise<void> {
    const { startServer, buildCache } = options;

    if (startServer) {
      await this.openApiDocument?.watch();

      if (!this.nativeTs) {
        await this.transpiler.watch();
      }

      await this.moduleLoader.load();
      await this.moduleLoader.watch();
    } else if (buildCache) {
      // Transpile once to populate the cache, then immediately stop watching.
      await this.transpiler.watch();
      await this.transpiler.stopWatching();
    }
  }

  /**
   * Stops all active file-system watchers across every sub-system.
   */
  public async stopWatching(): Promise<void> {
    await this.codeGenerator.stopWatching();
    await this.scenarioFileGenerator.stopWatching();
    await this.transpiler.stopWatching();
    await this.moduleLoader.stopWatching();
    await this.openApiDocument?.stopWatching();
  }
}
