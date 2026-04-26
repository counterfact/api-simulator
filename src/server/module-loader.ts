import { once } from "node:events";
import fs from "node:fs/promises";
import nodePath, { basename } from "node:path";
/* eslint-disable security/detect-non-literal-fs-filename -- readJson resolves paths against the current context directory before file access. */

import { type FSWatcher, watch } from "chokidar";
import createDebug from "debug";

import { CHOKIDAR_OPTIONS } from "./constants.js";
import { ContextRegistry } from "./context-registry.js";
import { determineModuleKind } from "./determine-module-kind.js";
import { FileDiscovery } from "./file-discovery.js";
import {
  type ContextModule,
  isContextModule,
  isMiddlewareModule,
} from "./middleware-detector.js";
import { ModuleDependencyGraph } from "./module-dependency-graph.js";
import type { Module, Registry } from "./registry.js";
import { ScenarioRegistry } from "./scenario-registry.js";
import { uncachedImport } from "./uncached-import.js";
import {
  toForwardSlashPath,
  pathDirname,
  pathRelative,
} from "../util/forward-slash-path.js";
import { unescapePathForWindows } from "../util/windows-escape.js";

const { uncachedRequire } = await import("./uncached-require.cjs");

const debug = createDebug("counterfact:server:module-loader");

/**
 * Watches the compiled routes directory and dynamically loads/reloads route
 * modules, context files, and middleware as files are added, changed, or
 * removed.
 *
 * Loaded modules are registered in the {@link Registry} (route handlers) or
 * the {@link ContextRegistry} (context files).  An optional
 * {@link ScenarioRegistry} receives scenario modules loaded from a separate
 * `scenarios/` directory.
 *
 * Emits DOM-style events (`"add"`, `"remove"`) so callers can react to module
 * lifecycle changes.
 */
export class ModuleLoader extends EventTarget {
  private readonly basePath: string;

  public readonly registry: Registry;

  private watcher: FSWatcher | undefined;

  private scenariosWatcher: FSWatcher | undefined;

  private versionedScenariosWatcher: FSWatcher | undefined;

  private readonly contextRegistry: ContextRegistry;

  private readonly scenariosPath: string | undefined;

  private readonly versionedScenariosPath: string | undefined;

  private readonly scenarioRegistry: ScenarioRegistry | undefined;

  private readonly dependencyGraph = new ModuleDependencyGraph();

  private readonly fileDiscovery: FileDiscovery;

  private readonly uncachedImport: (moduleName: string) => Promise<unknown> =
    async function (moduleName: string) {
      throw new Error(`uncachedImport not set up; importing ${moduleName}`);
    };

  public constructor(
    basePath: string,
    registry: Registry,
    contextRegistry = new ContextRegistry(),
    scenariosPath?: string,
    scenarioRegistry?: ScenarioRegistry,
    versionedScenariosPath?: string,
  ) {
    super();
    this.basePath = toForwardSlashPath(basePath);
    this.registry = registry;
    this.contextRegistry = contextRegistry;
    this.scenariosPath =
      scenariosPath === undefined
        ? undefined
        : toForwardSlashPath(scenariosPath);
    this.versionedScenariosPath =
      versionedScenariosPath === undefined
        ? undefined
        : toForwardSlashPath(versionedScenariosPath);
    this.scenarioRegistry = scenarioRegistry;
    this.fileDiscovery = new FileDiscovery(this.basePath);
  }

  /**
   * Starts watching the routes directory (and optionally the scenarios
   * directory) for file-system changes, loading or reloading modules on
   * `"add"` and `"change"` events and deregistering them on `"unlink"`.
   *
   * Resolves once the initial directory scan is complete.
   */
  public async watch(): Promise<void> {
    this.watcher = watch(this.basePath, CHOKIDAR_OPTIONS).on(
      "all",

      (eventName: string, pathNameOriginal: string) => {
        const JS_EXTENSIONS = ["js", "mjs", "cjs", "ts", "mts", "cts"];

        if (
          !JS_EXTENSIONS.some((extension) =>
            pathNameOriginal.endsWith(`.${extension}`),
          )
        )
          return;

        const pathName = toForwardSlashPath(pathNameOriginal);

        if (pathName.includes("$.context") && eventName === "add") {
          process.stdout.write(
            `\n\n!!! The file at ${pathName} needs a minor update.\n    See https://github.com/pmcelhaney/counterfact/blob/main/docs/faq.md\n\n\n`,
          );

          return;
        }

        if (!["add", "change", "unlink"].includes(eventName)) {
          return;
        }

        const parts = nodePath.parse(pathName.replace(this.basePath, ""));
        const url = unescapePathForWindows(
          toForwardSlashPath(`/${parts.dir}/${parts.name}`).replaceAll(
            /\/+/gu,
            "/",
          ),
        );

        if (eventName === "unlink") {
          this.registry.remove(url);
          this.dispatchEvent(new Event("remove"));
          if (this.isContextFile(pathName)) {
            this.contextRegistry.remove(
              unescapePathForWindows(toForwardSlashPath(parts.dir)) || "/",
            );
          }
          return;
        }

        const dependencies = this.dependencyGraph.dependentsOf(pathName);

        void this.loadEndpoint(pathName);

        for (const dependency of dependencies) {
          void this.loadEndpoint(dependency);
        }
      },
    );
    await once(this.watcher, "ready");

    if (this.scenariosPath && this.scenarioRegistry) {
      const JS_EXTENSIONS = ["js", "mjs", "cjs", "ts", "mts", "cts"];
      const scenariosPath = this.scenariosPath;

      this.scenariosWatcher = watch(scenariosPath, CHOKIDAR_OPTIONS).on(
        "all",
        (eventName: string, pathNameOriginal: string) => {
          if (
            !JS_EXTENSIONS.some((ext) => pathNameOriginal.endsWith(`.${ext}`))
          )
            return;

          if (!["add", "change", "unlink"].includes(eventName)) return;

          const pathName = toForwardSlashPath(pathNameOriginal);

          if (eventName === "unlink") {
            const fileKey = this.scenarioFileKey(pathName, scenariosPath);
            this.scenarioRegistry?.remove(fileKey);
            return;
          }

          void this.loadScenarioFile(pathName, scenariosPath);
        },
      );
      await once(this.scenariosWatcher, "ready");
    }

    if (this.versionedScenariosPath && this.scenarioRegistry) {
      const JS_EXTENSIONS = ["js", "mjs", "cjs", "ts", "mts", "cts"];
      const versionedScenariosPath = this.versionedScenariosPath;

      this.versionedScenariosWatcher = watch(
        versionedScenariosPath,
        CHOKIDAR_OPTIONS,
      ).on("all", (eventName: string, pathNameOriginal: string) => {
        if (!JS_EXTENSIONS.some((ext) => pathNameOriginal.endsWith(`.${ext}`)))
          return;

        if (!["add", "change", "unlink"].includes(eventName)) return;

        const pathName = toForwardSlashPath(pathNameOriginal);

        if (eventName === "unlink") {
          const fileKey = this.scenarioFileKey(
            pathName,
            versionedScenariosPath,
          );
          this.scenarioRegistry?.remove(fileKey);
          return;
        }

        void this.loadScenarioFile(pathName, versionedScenariosPath);
      });
      await once(this.versionedScenariosWatcher, "ready");
    }
  }

  /** Closes both file-system watchers (routes and scenarios). */
  public async stopWatching(): Promise<void> {
    await this.watcher?.close();
    await this.scenariosWatcher?.close();
    await this.versionedScenariosWatcher?.close();
  }

  private isContextFile(pathName: string): boolean {
    return basename(pathName).startsWith("_.context.");
  }

  /**
   * Performs a one-shot load of all modules found under `directory` (relative
   * to the configured base path) and all scenario files.
   *
   * @param directory - Sub-directory to load, defaults to the root (`""`).
   */
  public async load(directory = ""): Promise<void> {
    const files = await this.fileDiscovery.findFiles(directory);
    await Promise.all(files.map((file) => this.loadEndpoint(file)));
    await this.loadScenarios();
  }

  private shouldLoadScenarioFile(pathName: string): boolean {
    return !pathName.endsWith(".d.ts") && !pathName.endsWith(".map");
  }

  private async loadScenarios(): Promise<void> {
    if (!this.scenariosPath || !this.scenarioRegistry) return;

    // Load shared (fallback) scenarios first.
    try {
      const fileDiscovery = new FileDiscovery(this.scenariosPath);
      const files = await fileDiscovery.findFiles();
      const loadableFiles = files.filter((file) =>
        this.shouldLoadScenarioFile(file),
      );

      await Promise.all(
        loadableFiles.map((file) =>
          this.loadScenarioFile(file, this.scenariosPath!),
        ),
      );
    } catch {
      // Scenarios directory does not exist yet — that's fine.
    }

    // Load version-specific scenarios second so they take precedence over
    // shared ones with the same file key.
    if (this.versionedScenariosPath) {
      try {
        const fileDiscovery = new FileDiscovery(this.versionedScenariosPath);
        const files = await fileDiscovery.findFiles();
        const loadableFiles = files.filter((file) =>
          this.shouldLoadScenarioFile(file),
        );

        await Promise.all(
          loadableFiles.map((file) =>
            this.loadScenarioFile(file, this.versionedScenariosPath!),
          ),
        );
      } catch {
        // Versioned scenarios directory does not exist yet — that's fine.
      }
    }
  }

  private scenarioFileKey(
    pathName: string,
    baseScenariosPath?: string,
  ): string {
    const normalizedScenariosPath = toForwardSlashPath(
      baseScenariosPath ?? this.scenariosPath ?? "",
    );
    const directory = pathDirname(
      pathName.slice(normalizedScenariosPath.length),
    );
    const name = nodePath.parse(basename(pathName)).name;
    const url = unescapePathForWindows(
      toForwardSlashPath(`/${nodePath.join(directory, name)}`).replaceAll(
        /\/+/gu,
        "/",
      ),
    );

    return url.slice(1); // strip leading "/"
  }

  private async loadScenarioFile(
    pathName: string,
    baseScenariosPath?: string,
  ): Promise<void> {
    if (!this.scenariosPath || !this.scenarioRegistry) return;

    const fileKey = this.scenarioFileKey(pathName, baseScenariosPath);

    try {
      const doImport =
        (await determineModuleKind(pathName)) === "commonjs"
          ? uncachedRequire
          : uncachedImport;

      const module = await doImport(pathName);

      if (module) {
        this.scenarioRegistry.add(fileKey, module as Record<string, unknown>);
      }
    } catch (error: unknown) {
      process.stdout.write(
        `\nError loading scenario ${pathName}:\n${String(error)}\n`,
      );
    }
  }

  private async loadEndpoint(pathName: string) {
    debug("importing module: %s", pathName);

    const directory = pathDirname(pathName.slice(this.basePath.length));

    const url = unescapePathForWindows(
      toForwardSlashPath(
        `/${nodePath.join(directory, nodePath.parse(basename(pathName)).name)}`,
      ).replaceAll(/\/+/gu, "/"),
    );

    debug(`loading pathName from dependencyGraph: ${pathName}`);

    this.dependencyGraph.load(pathName);

    try {
      const doImport =
        (await determineModuleKind(pathName)) === "commonjs"
          ? uncachedRequire
          : uncachedImport;

      let importError: unknown;

      const endpoint = (await doImport(pathName).catch((error: unknown) => {
        importError = error;
      })) as ContextModule | Module;

      if (importError !== undefined) {
        const isSyntaxError =
          importError instanceof SyntaxError ||
          String(importError).startsWith("SyntaxError:");

        const displayPath = pathRelative(
          process.cwd(),
          unescapePathForWindows(pathName),
        );

        if (this.isContextFile(pathName)) {
          const warning = isSyntaxError
            ? `Warning: There is a syntax error in the context file: ${displayPath}`
            : `Warning: There was an error loading the context file: ${displayPath}`;

          process.stdout.write(`\n${warning}\n`);

          return;
        }

        const message = isSyntaxError
          ? `There is a syntax error in the route file: ${displayPath}`
          : `There was an error loading the route file: ${displayPath}`;

        const errorResponse = () => ({
          body: message,
          status: 500,
        });

        this.registry.add(url, {
          DELETE: errorResponse,
          GET: errorResponse,
          HEAD: errorResponse,
          OPTIONS: errorResponse,
          PATCH: errorResponse,
          POST: errorResponse,
          PUT: errorResponse,
          TRACE: errorResponse,
        });

        this.dispatchEvent(new Event("add"));

        return;
      }

      if (!endpoint) {
        return;
      }

      this.dispatchEvent(new Event("add"));

      if (this.isContextFile(pathName) && isContextModule(endpoint)) {
        const loadContext = (path: string) => this.contextRegistry.find(path);

        const contextDir = nodePath.dirname(unescapePathForWindows(pathName));
        const readJson = async (relativePath: string): Promise<unknown> => {
          const absolutePath = nodePath.resolve(contextDir, relativePath);
          let content: string;
          try {
            content = await fs.readFile(absolutePath, "utf8");
          } catch {
            throw new Error(
              `readJson: could not read file at "${absolutePath}" (resolved from "${relativePath}" relative to "${contextDir}")`,
            );
          }
          try {
            return JSON.parse(content) as unknown;
          } catch {
            throw new Error(
              `readJson: file at "${absolutePath}" does not contain valid JSON`,
            );
          }
        };

        this.contextRegistry.update(
          directory,

          // @ts-expect-error TS says Context has no constructable signatures but that's not true?

          new endpoint.Context({
            loadContext,
            readJson,
          }),
        );
        return;
      }

      if (
        basename(pathName).startsWith("_.middleware.") &&
        isMiddlewareModule(endpoint)
      ) {
        this.registry.addMiddleware(
          url.slice(0, url.lastIndexOf("/")) || "/",
          endpoint.middleware,
        );
      }

      if (url === "/index") this.registry.add("/", endpoint as Module);

      debug(`adding "${url}" to registry`);
      this.registry.add(url, endpoint as Module);
    } catch (error: unknown) {
      if (
        String(error) ===
        "SyntaxError: Identifier 'Context' has already been declared"
      ) {
        // Not sure why Node throws this error. It doesn't seem to matter.
        return;
      }

      process.stdout.write(`\nError loading ${pathName}:\n${String(error)}\n`);

      throw error;
    }
  }
}
