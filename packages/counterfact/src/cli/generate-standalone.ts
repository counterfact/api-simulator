import { CodeGenerator } from "@counterfact/generator";

import type { SpecConfig } from "../app.js";
import { pathJoin } from "../util/forward-slash-path.js";

/**
 * Options that start servers, watchers, or other generators. These cannot
 * accompany standalone generation.
 */
export const STANDALONE_CONFLICTING_OPTIONS = [
  "generate",
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

export interface StandaloneValidationInput {
  /** Conflicting options that were explicitly passed on the command line. */
  conflictingOptions: readonly string[];
  flag?: "--generate-client" | "--generate-schemas-only";
  /** Whether the user supplied the destination instead of relying on the default. */
  destinationProvided: boolean;
  source: string;
  specs?: SpecConfig[] | undefined;
}

/**
 * Reject combinations that could write multiple specs to the same directory
 * or start the simulator alongside one-shot generation.
 */
export function validateStandaloneOptions({
  conflictingOptions,
  flag = "--generate-schemas-only",
  destinationProvided,
  source,
  specs,
}: StandaloneValidationInput): void {
  if (conflictingOptions.length > 0) {
    throw new Error(
      `${flag} cannot be combined with ${conflictingOptions.map(toFlag).join(", ")}.`,
    );
  }

  if (!destinationProvided) {
    throw new Error(
      `${flag} requires a destination directory, for example: counterfact openapi.yaml ./${flag === "--generate-client" ? "client" : "schemas"} ${flag}`,
    );
  }

  const entries = specs ?? [{ source, group: "" }];

  if (entries.length === 0 || entries.some((entry) => entry.source === "_")) {
    throw new Error(`${flag} requires an OpenAPI document.`);
  }

  if (entries.length > 1 && entries.some((entry) => entry.group === "")) {
    throw new Error(
      `${flag} requires every spec to define a non-empty group when more than one spec is configured.`,
    );
  }

  const seen = new Set<string>();
  const versionedByGroup = new Map<string, boolean>();

  for (const entry of entries) {
    const version = entry.version?.trim() ?? "";
    const directory = outputDirectory(entry.group, version);

    if (seen.has(directory)) {
      throw new Error(
        `${flag} found more than one spec for group ${JSON.stringify(entry.group)} and version ${JSON.stringify(version)}; each group and version must write to a unique output directory (${JSON.stringify(directory)}).`,
      );
    }

    seen.add(directory);

    const group = outputDirectory(entry.group);
    const wasVersioned = versionedByGroup.get(group);

    if (wasVersioned !== undefined && wasVersioned !== (version !== "")) {
      throw new Error(
        `${flag} cannot mix versioned and unversioned specs in group ${JSON.stringify(entry.group)}.`,
      );
    }

    versionedByGroup.set(group, version !== "");
  }
}

export interface StandaloneRunInput {
  basePath: string;
  target?: "schemas" | "client";
  overlays: readonly string[];
  moduleNameFirstTag?: boolean | undefined;
  moduleNameIndex?: number | undefined;
  source: string;
  specs?: SpecConfig[] | undefined;
}

/**
 * Generates each spec under its group and version and returns the total
 * number of files written.
 */
export async function generateStandalone({
  basePath,
  target = "schemas",
  overlays,
  moduleNameFirstTag,
  moduleNameIndex,
  source,
  specs,
}: StandaloneRunInput): Promise<number> {
  let count = 0;

  for (const spec of specs ?? [{ source, group: "" }]) {
    const generator = new CodeGenerator(
      spec.source,
      spec.group ? pathJoin(basePath, spec.group) : basePath,
      { moduleNameFirstTag, moduleNameIndex },
      spec.version?.trim() ?? "",
      spec.overlays ?? overlays,
    );

    const files = await (target === "client"
      ? generator.generateClient()
      : generator.generateSchemas());
    count += files.length;
  }

  return count;
}
