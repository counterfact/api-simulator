import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { SchemaTypeTransform } from "@counterfact/generator";

/** Load the callback module relative to the YAML configuration file. */
export async function loadSchemaTypeTransform(
  modulePath: unknown,
  configPath: string,
): Promise<SchemaTypeTransform | undefined> {
  if (modulePath === undefined) return undefined;
  if (typeof modulePath !== "string" || !modulePath.trim()) {
    throw new Error(
      "schema-type-transform must be a nonempty JavaScript module path.",
    );
  }
  const resolved = resolve(dirname(configPath), modulePath);
  let loaded: { default?: unknown };
  try {
    loaded = await import(pathToFileURL(resolved).href);
  } catch (cause) {
    throw new Error(
      `Could not load schema type transform ${resolved}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  if (typeof loaded.default !== "function") {
    throw new Error(
      `Schema type transform ${resolved} must default-export a function.`,
    );
  }
  return loaded.default as SchemaTypeTransform;
}
