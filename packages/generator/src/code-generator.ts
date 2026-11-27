import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import nodePath from "node:path";
/* eslint-disable security/detect-non-literal-fs-filename -- generated files are written under the caller-provided destination tree. */

import { type FSWatcher, watch } from "chokidar";
import createDebug from "debug";
import { getLocalOpenApiSourcePaths } from "@counterfact/openapi";

import { ensureDirectoryExists } from "./ensure-directory-exists.js";
import { centralTypes } from "./central-types.js";
import {
  type ClientGenerationOptions,
  generateClient,
} from "./client-generator.js";
import { OperationCoder } from "./operation-coder.js";
import {
  assertNoNormalizedPathCollisions,
  normalizeOpenApiPath,
} from "./openapi-path.js";
import { type SecurityScheme } from "./operation-type-coder.js";
import { operationMethodsForPath } from "./path-operations.js";
import { Requirement } from "./requirement.js";
import { Repository } from "./repository.js";
import type { SchemaTypeTransform } from "./schema-type-transform.js";
import { Specification } from "./specification.js";
import type { SchemaTypeOptions } from "./type-options.js";
import { waitForEvent } from "./wait-for-event.js";
import { CHOKIDAR_OPTIONS } from "./watch-options.js";

const debug = createDebug("counterfact:typescript-generator:generate");

/** Which artifacts {@link CodeGenerator.generate} writes. */
export interface GenerateOptions {
  schemaTypeTransform?: SchemaTypeTransform;
  /**
   * Generate a typed API client in `client/`. `true` uses the default
   * options. Requires `types`.
   */
  client?: ClientGenerationOptions | boolean;
  prune?: boolean;
  routes?: boolean;
  types?: boolean;
  /** How schema types are declared in `types/` (and the client's data contracts). */
  typeOptions?: SchemaTypeOptions;
}

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

  private readonly overlays: readonly string[];

  private readonly generateOptions: GenerateOptions;

  private watcher: FSWatcher | undefined;

  public constructor(
    openApiPath: string,
    destination: string,
    generateOptions: GenerateOptions,
    version = "",
    overlays: readonly string[] = [],
  ) {
    super();
    this.openapiPath = openApiPath;
    this.destination = destination;
    this.version = version;
    this.overlays = overlays;
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

    await ensureDirectoryExists(cacheReadmePath);
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
      return (
        specification.getRequirement("#/paths") ??
        new Requirement({}, "#/paths", specification)
      );
    } catch (error) {
      process.stderr.write(
        `Could not find #/paths in the specification.\n${error as string}\n`,
      );

      return new Requirement({}, "#/paths", specification);
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
  public async generate(
    repository = new Repository({
      schemaTypeTransform: this.generateOptions.schemaTypeTransform,
    }),
    deferWrite = false,
  ): Promise<void> {
    if (
      this.generateOptions.schemaTypeTransform &&
      repository.options.schemaTypeTransform !==
        this.generateOptions.schemaTypeTransform
    ) {
      throw new Error(
        "Configure the same schemaTypeTransform on the supplied Repository, or omit the Repository argument.",
      );
    }
    const { destination } = this;

    debug("generating code from %s to %s", this.openapiPath, destination);

    debug("initializing the .cache directory");
    await this.buildCacheDirectory(destination);
    debug("done initializing the .cache directory");

    debug("creating specification from %s", this.openapiPath);

    const specification = await Specification.fromFile(
      this.openapiPath,
      this.overlays,
    );
    specification.typeOptions = this.generateOptions.typeOptions ?? {};

    debug("created specification: $o", specification);

    debug("reading the #/paths from the specification");

    centralTypes(repository).addComponents(specification, this.version);

    const paths = await this.getPathsFromSpecification(specification);

    debug("got %i paths", paths?.map?.length ?? 0);

    const openApiPaths = paths.map((_pathDefinition, key) => key);

    assertNoNormalizedPathCollisions(openApiPaths);

    const securityRequirement = specification.getRequirement(
      "#/components/securitySchemes",
    );

    const securitySchemes = Object.values(
      (securityRequirement?.data as Record<string, unknown>) ?? {},
    ) as SecurityScheme[];

    paths.forEach((pathDefinition, key: string) => {
      debug("processing path %s", key);

      const normalizedPath = normalizeOpenApiPath(key);
      const path = normalizedPath === "/" ? "/index" : normalizedPath;
      repository.recordRouteFile(`routes${path}.ts`);
      operationMethodsForPath(pathDefinition).forEach(
        ([operation, requestMethod]) => {
          // Keep the logical route location when a Path Item is a reference or
          // a method is declared under OpenAPI 3.2 additionalOperations.
          const logicalOperation = new Requirement(
            operation.data,
            `${pathDefinition.url}/${requestMethod}`,
            specification,
          );
          logicalOperation.parent = pathDefinition;
          repository
            .route(`routes${path}.ts`, normalizedPath)
            .export(
              new OperationCoder(
                logicalOperation,
                this.version,
                requestMethod,
                securitySchemes,
              ),
            );
        },
      );
    });

    if (!deferWrite) {
      await this.finishGeneration(repository);
    }

    debug("finished writing the files");

    const { client } = this.generateOptions;

    if (client && this.generateOptions.types) {
      if (this.version === "") {
        debug("generating the API client");
        // The generated types import the root context, which normally comes
        // with the routes. Create it (only if missing) so a client-only
        // generation still compiles.
        await repository.createDefaultContextFile(destination);
        await generateClient(
          specification,
          destination,
          client === true ? {} : client,
        );
        debug("finished generating the API client");
      } else {
        process.stderr.write(
          `Skipping client generation for version ${JSON.stringify(this.version)}: generated clients do not support versioned APIs yet.\n`,
        );
      }
    }
  }

  /** Write the complete shared route layout once all versions have registered. */
  public async finishGeneration(repository: Repository): Promise<void> {
    await repository.writeFiles(this.destination, {
      ...this.generateOptions,
      keepVersionsFile: this.version !== "",
    });
  }

  /**
   * Writes only the schema types, directly into `destination`
   * (or `destination/<version>` for a versioned spec), and nothing else.
   *
   * Unlike {@link generate}, this creates no `.cache`, routes, scenarios,
   * helper types or central `types/index.ts`.
   *
   * @param repository - Injectable repository instance; defaults to a fresh one.
   * @returns The written file paths, relative to `destination`.
   */
  public async generateSchemas(
    repository = new Repository(),
  ): Promise<string[]> {
    const specification = await Specification.fromFile(
      this.openapiPath,
      this.overlays,
    );
    specification.typeOptions = this.generateOptions.typeOptions ?? {};

    if (specification.getRequirement("#/swagger") !== undefined) {
      throw new Error(
        "Schema-only generation does not support Swagger 2.0 documents because their schemas live under #/definitions. Convert the document to OpenAPI 3.x first.",
      );
    }

    centralTypes(repository).addComponents(specification, this.version, [
      "schemas",
    ]);

    return repository.writeSchemas(this.destination, this.version);
  }

  /**
   * Writes only a standalone API client into `destination/client`, and
   * nothing else.
   *
   * Unlike {@link generate}, this creates no `.cache`, routes, scenarios or
   * shared types: the client declares its own request, response and schema
   * types (see {@link ClientGenerationOptions.standalone}).
   *
   * @returns The written file paths, relative to `destination`.
   */
  public async generateClientOnly(): Promise<string[]> {
    if (this.version !== "") {
      throw new Error(
        "Client-only generation does not support versioned APIs yet.",
      );
    }

    const specification = await Specification.fromFile(
      this.openapiPath,
      this.overlays,
    );
    specification.typeOptions = this.generateOptions.typeOptions ?? {};

    const { client } = this.generateOptions;

    return generateClient(specification, this.destination, {
      ...(typeof client === "object" ? client : {}),
      standalone: true,
    });
  }

  /**
   * Starts watching the OpenAPI document and any overlay files for changes.
   *
   * Has no effect when neither source is watchable (for example, an HTTP
   * OpenAPI source with no local overlays).
   * Resolves once the watcher is ready.
   * A caller may supply regeneration for a whole group of versioned sources.
   */
  public async watch(regenerate: () => Promise<void> = () => this.generate()) {
    const watchablePaths = getLocalOpenApiSourcePaths([
      this.openapiPath,
      ...this.overlays,
    ]);

    if (watchablePaths.length === 0) {
      return;
    }

    this.watcher = watch(watchablePaths, CHOKIDAR_OPTIONS).on("change", () => {
      void regenerate().then(
        () => {
          this.dispatchEvent(new Event("generate"));

          return true;
        },
        () => {
          this.dispatchEvent(new Event("failed"));

          return false;
        },
      );
    });

    await waitForEvent(this.watcher, "ready");
  }

  /** Closes the file-system watcher. */
  public async stopWatching(): Promise<void> {
    await this.watcher?.close();
  }
}
