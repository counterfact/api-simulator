import { load as loadYaml } from "js-yaml";
import { readFile } from "./read-file.js";

function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function normalizeKeys(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [kebabToCamel(key), value]),
  );
}

/**
 * Loads and parses a counterfact YAML config file.
 *
 * @param configPath - Absolute or relative path to the config file.
 * @param required - When true, throws if the file does not exist.
 *                   When false (default), returns an empty object for missing files.
 * @returns A plain object of config keys (camelCase) to values.
 */
export async function loadConfigFile(
  configPath: string,
  required = false,
): Promise<Record<string, unknown>> {
  let content: string;

  try {
    content = await readFile(configPath);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      if (required) {
        throw new Error(`Config file not found: ${configPath}`, {
          cause: error,
        });
      }

      return {};
    }

    throw error;
  }

  if (!content.trim()) {
    return {};
  }

  const parsed = loadYaml(content);

  if (parsed === null || parsed === undefined) {
    return {};
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Config file must be a YAML object (mapping): ${configPath}`,
    );
  }

  return normalizeKeys(parsed as Record<string, unknown>);
}
