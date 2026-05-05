import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import nodePath from "node:path";
/* eslint-disable security/detect-non-literal-fs-filename -- generated files are written under the caller-provided destination tree. */

import { type FSWatcher, watch } from "chokidar";
import createDebug from "debug";

import { CHOKIDAR_OPTIONS } from "../server/constants.js";
import { ensureDirectoryExists } from "../util/ensure-directory-exists.js";
import { waitForEvent } from "../util/wait-for-event.js";
import { OperationCoder } from "./operation-coder.js";
import { type SecurityScheme } from "./operation-type-coder.js";
import { pruneRoutes } from "./prune.js";
import { Repository } from "./repository.js";
import { Specification } from "./specification.js";

const debug = createDebug("counterfact:typescript-generator:generate");

/**
 * Orchestrates the code-generation pipeline and optional file-system watching.
 *
 * When {@link watch} is called, Counterfact watches the source OpenAPI document
 * for changes and re-runs code generation automatically.  `"generate"` and
 * `"failed"` events are emitted after each attempt.
 */
export class CodeGenerator extends EventTarget {
  private readonly openapiPath: string;

  private readonly destination: string;

  private readonly version: string;

  private readonly generateOptions: {
    prune?: boolean;
    routes?: boolean;
    types?: boolean;
  };

  private watcher: FSWatcher | undefined;

  public constructor(
    openApiPath: string,
    destination: string,
    generateOptions: { prune?: boolean; routes?: boolean; types?: boolean },
    version = "",
  ) {
    super();
    this.openapiPath = openApiPath;
    this.destination = destination;
    this.version = version;
    this.generateOptions = generateOptions;
  }

  /**
   * Initialises the `.cache` directory that holds compiled JS output.
   *
   * Creates a `.gitignore` file that excludes the `.cache` sub-directory and a
   * `README.md` inside `.cache` that explains its purpose.
   *
   * @param destination - The root output directory.
   */
  private async buildCacheDirectory(destination: string): Promise<void> {
    const gitignorePath = nodePath.join(destination, ".gitignore");
    const cacheReadmePath = nodePath.join(destination, ".cache", "README.md");

    debug("ensuring the directory containing .gitgnore exists");

    await ensureDirectoryExists(gitignorePath);

    debug("creating the .gitignore file if it doesn't already exist");

    if (!existsSync(gitignorePath)) {
      await fs.writeFile(gitignorePath, ".cache\n", "utf8");
    }

    debug("creating the .cache/README.md file");

    ensureDirectoryExists(cacheReadmePath);
    await fs.writeFile(
      cacheReadmePath,
      "This directory contains compiled JS files from the paths directory. Do not edit these files directly.\n",
      "utf8",
    );
  }

  /**
   * Reads and returns the `#/paths` requirement from `specification`.
   *
   * Writes a diagnostic message to stderr and returns an empty set when the
   * `paths` key is missing or cannot be read.
   *
   * @param specification - The loaded OpenAPI specification.
   */
  private async getPathsFromSpecification(
    specification: Specification,
  ): Promise<ReturnType<Specification["getRequirement"]>> {
    try {
      return specification.getRequirement("#/paths") ?? new Set<never>();
    } catch (error) {
      process.stderr.write(
        `Could not find #/paths in the specification.\n${error as string}\n`,
      );

      return undefined as unknown as ReturnType<
        Specification["getRequirement"]
      >;
    }
  }

  /**
   * Runs the main code-generation pipeline once and resolves when complete.
   *
   * Loads the OpenAPI spec from `openapiPath`, optionally prunes defunct route
   * files, registers all path operations as {@link OperationCoder} exports, and
   * writes the resulting TypeScript files to `destination`.
   *
   * @param repository - Injectable repository instance; defaults to a fresh one
   *   (primarily useful in tests).
   */
  public async generate(repository = new Repository()): Promise<void> {
    const { destination } = this;

    debug("generating code from %s to %s", this.openapiPath, destination);

    debug("initializing the .cache directory");
    await this.buildCacheDirectory(destination);
    debug("done initializing the .cache directory");

    debug("creating specification from %s", this.openapiPath);

    const specification = await Specification.fromFile(this.openapiPath);

    debug("created specification: $o", specification);

    debug("reading the #/paths from the specification");

    const paths = await this.getPathsFromSpecification(specification);

    debug("got %i paths", paths?.map?.length ?? 0);

    if (this.generateOptions.prune && this.generateOptions.routes) {
      debug("pruning defunct route files");
      await pruneRoutes(
        destination,
        paths.map((_v, key) => key),
      );
      debug("done pruning");
    }

    const securityRequirement = specification.getRequirement(
      "#/components/securitySchemes",
    );

    const securitySchemes = Object.entries(
      (securityRequirement?.data as Record<string, unknown>) ?? {},
    ).map(([name, scheme]) => ({
      ...(scheme as SecurityScheme),
      name,
    }));

    const HTTP_VERBS = new Set([
      "get",
      "put",
      "post",
      "delete",
      "options",
      "head",
      "patch",
      "trace",
    ]);

    paths.forEach((pathDefinition, key: string) => {
      debug("processing path %s", key);

      const path = key === "/" ? "/index" : key;
      pathDefinition.forEach((operation, requestMethod: string) => {
        if (!HTTP_VERBS.has(requestMethod)) {
          return;
        }

        repository
          .get(`routes${path}.ts`)
          .export(
            new OperationCoder(
              operation,
              this.version,
              requestMethod,
              securitySchemes,
            ),
          );
      });
    });

    debug("telling the repository to write the files to %s", destination);

    await repository.writeFiles(destination, this.generateOptions);

    debug("finished writing the files");
  }

  /**
   * Starts watching the OpenAPI document for changes.
   *
   * Has no effect when `openApiPath` is a URL (HTTP sources are not watched).
   * Resolves once the watcher is ready.
   */
  public async watch() {
    if (this.openapiPath.startsWith("http")) {
      return;
    }

    this.watcher = watch(this.openapiPath, CHOKIDAR_OPTIONS).on(
      "change",
      () => {
        void this.generate().then(
          () => {
            this.dispatchEvent(new Event("generate"));

            return true;
          },
          () => {
            this.dispatchEvent(new Event("failed"));

            return false;
          },
        );
      },
    );

    await waitForEvent(this.watcher, "ready");
  }

  /** Closes the file-system watcher. */
  public async stopWatching(): Promise<void> {
    await this.watcher?.close();
  }
}
