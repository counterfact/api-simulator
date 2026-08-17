import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
/* eslint-disable security/detect-non-literal-fs-filename -- module kind detection only probes package.json while walking parent directories. */

const DEFAULT_MODULE_KIND = "commonjs";

interface PackageJsonWithType {
  type?: string;
}

/**
 * Determines whether a module file should be treated as CommonJS or ESM.
 *
 * Resolution order (matches Node.js conventions):
 * 1. `.cjs` extension → `"commonjs"`.
 * 2. `.mjs` or `.ts` extension → `"module"`.
 * 3. Walk up the directory tree looking for a `package.json` with a `"type"`
 *    field.
 * 4. Falls back to `"commonjs"` at the filesystem root.
 *
 * @param modulePath - Absolute or relative path to the module file.
 * @returns `"commonjs"` or `"module"`.
 */
export async function determineModuleKind(modulePath: string) {
  if (modulePath.endsWith(".cjs")) {
    return "commonjs";
  }

  if (modulePath.endsWith(".mjs") || modulePath.endsWith(".ts")) {
    return "module";
  }

  if (modulePath === path.parse(modulePath).root) {
    return DEFAULT_MODULE_KIND;
  }

  const packageJsonPath = path.join(modulePath, "package.json");

  if (existsSync(packageJsonPath)) {
    try {
      const packageJson: PackageJsonWithType = JSON.parse(
        await fs.readFile(packageJsonPath, "utf8"),
      ) as PackageJsonWithType;

      if (typeof packageJson.type !== "string") {
        return DEFAULT_MODULE_KIND;
      }

      return packageJson.type;
    } catch (error) {
      process.stderr.write(
        `Error reading or parsing package.json: ${String(error)}`,
      );
    }
  }

  return await determineModuleKind(path.dirname(modulePath));
}
