/**
 * Node.js custom loader that remaps .js import specifiers to .ts when a
 * corresponding .ts file exists alongside the importer.
 *
 * Usage:
 *   node --experimental-strip-types --loader ./bin/ts-loader.mjs bin/counterfact.js ...
 *
 * Why: Node's built-in --experimental-strip-types handles type annotation
 * removal, but it does not remap .js → .ts import specifiers. This codebase
 * uses the TypeScript convention of writing .js extensions in import paths
 * (which resolve to .ts files at authoring time). This loader bridges that gap.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- loader checks file existence for Node-resolved internal module URLs only. */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".js") && context.parentURL) {
    const tsSpecifier = specifier.slice(0, -3) + ".ts";
    try {
      const resolved = new URL(tsSpecifier, context.parentURL);
      if (existsSync(fileURLToPath(resolved))) {
        return nextResolve(tsSpecifier, context);
      }
    } catch {
      // If URL construction fails, fall through to default resolution
    }
  }

  return nextResolve(specifier, context);
}
