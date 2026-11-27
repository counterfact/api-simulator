import {
  type ClientGenerationOptions,
  CodeGenerator,
  type SchemaTypeOptions,
} from "@counterfact/generator";

import type { SpecConfig } from "../app.js";
import { pathJoin } from "../util/forward-slash-path.js";

/**
 * Options that start servers, watchers, or other generators. A client-only
 * run writes nothing but the standalone client, so these cannot accompany it.
 */
export const CLIENT_ONLY_CONFLICTING_OPTIONS = [
  "generate",
  "generateRoutes",
  "generateSchemasOnly",
  "generateTypes",
  "watch",
  "watchRoutes",
  "watchTypes",
  "serve",
  "repl",
  "buildCache",
  "prune",
] as const;

const toFlag = (option: string): string =>
  `--${option.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`;

export interface ClientOnlyValidationInput {
  /** Conflicting options that were explicitly passed on the command line. */
  conflictingOptions: readonly string[];
  source: string;
  specs?: SpecConfig[] | undefined;
}

/**
 * Throws a descriptive error when the requested `--generate-client-only`
 * invocation cannot be honoured.
 */
export function validateClientOnlyOptions({
  conflictingOptions,
  source,
  specs,
}: ClientOnlyValidationInput): void {
  if (conflictingOptions.length > 0) {
    throw new Error(
      `--generate-client-only cannot be combined with ${conflictingOptions.map(toFlag).join(", ")}.`,
    );
  }

  const entries = specs ?? [{ source, group: "" }];

  if (entries.length === 0 || entries.some((entry) => entry.source === "_")) {
    throw new Error("--generate-client-only requires an OpenAPI document.");
  }

  if (entries.some((entry) => (entry.version?.trim() ?? "") !== "")) {
    throw new Error(
      "--generate-client-only does not support versioned APIs yet.",
    );
  }

  const directories = new Set<string>();

  for (const { group } of entries) {
    const directory = pathJoin(group, "client");
    if (directories.has(directory)) {
      throw new Error(
        `--generate-client-only found more than one spec for group ${JSON.stringify(group)}; each spec needs its own group so each client gets its own directory (${JSON.stringify(directory)}).`,
      );
    }
    directories.add(directory);
  }
}

export interface ClientOnlyRunInput {
  basePath: string;
  clientOptions: ClientGenerationOptions;
  overlays: readonly string[];
  source: string;
  specs?: SpecConfig[] | undefined;
  typeOptions?: SchemaTypeOptions;
}

/**
 * Writes only a standalone client for every configured spec, in
 * `<basePath>/<group>/client`, and returns the written paths relative to
 * `basePath`. Specs run one at a time so output is deterministic.
 */
export async function generateClientOnly({
  basePath,
  clientOptions,
  overlays,
  source,
  specs,
  typeOptions = {},
}: ClientOnlyRunInput): Promise<string[]> {
  const written: string[] = [];

  for (const spec of specs ?? [{ source, group: "" }]) {
    const generator = new CodeGenerator(
      spec.source,
      spec.group ? pathJoin(basePath, spec.group) : basePath,
      { client: clientOptions, typeOptions },
      "",
      spec.overlays ?? overlays,
    );

    for (const path of await generator.generateClientOnly()) {
      written.push(spec.group ? pathJoin(spec.group, path) : path);
    }
  }

  return written;
}
