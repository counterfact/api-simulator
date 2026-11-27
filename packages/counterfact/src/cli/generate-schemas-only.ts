import { CodeGenerator, type SchemaTypeOptions } from "@counterfact/generator";

import type { SpecConfig } from "../app.js";
import { pathJoin } from "../util/forward-slash-path.js";

/**
 * Options that start servers, watchers, or other generators. A schemas-only
 * run writes nothing but schema types, so these cannot accompany it.
 */
export const SCHEMAS_ONLY_CONFLICTING_OPTIONS = [
  "generate",
  "generateClient",
  "generateClientOnly",
  "generateRoutes",
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

const outputDirectory = (...segments: string[]): string =>
  pathJoin(...segments)
    .replace(/\/+$/u, "")
    .replace(/^\.$/u, "");

export interface SchemasOnlyValidationInput {
  /** Conflicting options that were explicitly passed on the command line. */
  conflictingOptions: readonly string[];
  /** Whether the user supplied the destination instead of relying on the default. */
  destinationProvided: boolean;
  source: string;
  specs?: SpecConfig[] | undefined;
  typeOptions?: SchemaTypeOptions;
}

/**
 * Throws a descriptive error when the requested `--generate-schemas-only`
 * invocation cannot be honoured.
 */
export function validateSchemasOnlyOptions({
  conflictingOptions,
  destinationProvided,
  source,
  specs,
}: SchemasOnlyValidationInput): void {
  if (conflictingOptions.length > 0) {
    throw new Error(
      `--generate-schemas-only cannot be combined with ${conflictingOptions.map(toFlag).join(", ")}.`,
    );
  }

  if (!destinationProvided) {
    throw new Error(
      "--generate-schemas-only requires a destination directory, for example: counterfact openapi.yaml ./schemas --generate-schemas-only",
    );
  }

  const entries = specs ?? [{ source, group: "" }];

  if (entries.length === 0 || entries.some((entry) => entry.source === "_")) {
    throw new Error("--generate-schemas-only requires an OpenAPI document.");
  }

  if (entries.length > 1 && entries.some((entry) => entry.group === "")) {
    throw new Error(
      "--generate-schemas-only requires every spec to define a non-empty group when more than one spec is configured.",
    );
  }

  const seen = new Set<string>();
  const versionedByGroup = new Map<string, boolean>();

  for (const entry of entries) {
    const version = entry.version?.trim() ?? "";
    const directory = outputDirectory(entry.group, version);

    if (seen.has(directory)) {
      throw new Error(
        `--generate-schemas-only found more than one spec for group ${JSON.stringify(entry.group)} and version ${JSON.stringify(version)}; each group and version must write to a unique output directory (${JSON.stringify(directory)}).`,
      );
    }

    seen.add(directory);

    const group = outputDirectory(entry.group);
    const wasVersioned = versionedByGroup.get(group);

    if (wasVersioned !== undefined && wasVersioned !== (version !== "")) {
      throw new Error(
        `--generate-schemas-only cannot mix versioned and unversioned specs in group ${JSON.stringify(entry.group)}.`,
      );
    }

    versionedByGroup.set(group, version !== "");
  }
}

export interface SchemasOnlyRunInput {
  basePath: string;
  overlays: readonly string[];
  source: string;
  specs?: SpecConfig[] | undefined;
  typeOptions?: SchemaTypeOptions;
}

/**
 * Writes only the schema types for every configured spec under `basePath`
 * (`<basePath>/<group>/<version>/<Name>.ts`) and returns how many files were
 * written. Specs run one at a time so output is deterministic.
 */
export async function generateSchemasOnly({
  basePath,
  overlays,
  source,
  specs,
  typeOptions = {},
}: SchemasOnlyRunInput): Promise<number> {
  let count = 0;

  for (const spec of specs ?? [{ source, group: "" }]) {
    const generator = new CodeGenerator(
      spec.source,
      spec.group ? pathJoin(basePath, spec.group) : basePath,
      { typeOptions },
      spec.version?.trim() ?? "",
      spec.overlays ?? overlays,
    );

    count += (await generator.generateSchemas()).length;
  }

  return count;
}
