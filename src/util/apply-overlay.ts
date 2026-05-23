import { load as loadYaml } from "js-yaml";
import { JSONPath } from "jsonpath-plus";

import { readFile } from "./read-file.js";

interface OverlayAction {
  target: string;
  update?: Record<string, unknown>;
  remove?: boolean;
}

interface Overlay {
  overlay: string;
  info?: { title?: string; version?: string };
  actions: OverlayAction[];
}

/**
 * Deeply merges `source` into `target`, overwriting scalar values and
 * recursively merging plain objects.  Arrays and non-plain-object values in
 * `source` always overwrite the corresponding entry in `target`.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(source)) {
    // Guard against prototype pollution attacks.
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }

    const existingValue = Reflect.get(target, key);

    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof existingValue === "object" &&
      existingValue !== null &&
      !Array.isArray(existingValue)
    ) {
      deepMerge(
        existingValue as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      Object.assign(target, { [key]: value });
    }
  }
}

/**
 * Applies a list of overlay actions to `document` in place.
 *
 * Each action may either:
 * - **update**: deep-merge the `action.update` object into every node matched
 *   by the JSONPath `action.target`.
 * - **remove**: delete every node matched by `action.target` from its parent.
 *
 * @param document - The OpenAPI document object to mutate.
 * @param actions  - The ordered list of overlay actions to apply.
 */
export function applyOverlayActions(
  document: Record<string, unknown>,
  actions: OverlayAction[],
): void {
  for (const action of actions) {
    type PathResult = {
      path: string;
      value: unknown;
      parent: Record<string, unknown> | unknown[];
      parentProperty: string | number;
    };

    const results = JSONPath({
      path: action.target,
      json: document,
      resultType: "all",
    }) as PathResult[];

    if (action.remove === true) {
      // Iterate in reverse so that removing by numeric index doesn't shift
      // subsequent items in the same parent array.
      for (const result of [...results].reverse()) {
        const { parent, parentProperty } = result;
        if (Array.isArray(parent)) {
          parent.splice(Number(parentProperty), 1);
        } else {
          Reflect.deleteProperty(parent, String(parentProperty));
        }
      }
    } else if (action.update !== undefined) {
      for (const result of results) {
        if (
          typeof result.value === "object" &&
          result.value !== null &&
          !Array.isArray(result.value)
        ) {
          deepMerge(result.value as Record<string, unknown>, action.update);
        }
      }
    }
  }
}

/**
 * Loads and parses an overlay file (YAML or JSON), validates that it looks
 * like a valid OpenAPI overlay document, and returns the parsed object.
 *
 * @param overlayPath - Path or URL to the overlay file.
 * @throws When the file cannot be read, parsed, or does not contain an
 *   `overlay` version field and an `actions` array.
 */
export async function loadOverlay(overlayPath: string): Promise<Overlay> {
  let content: string;

  try {
    content = await readFile(overlayPath);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not read overlay file "${overlayPath}".\n${details}`,
      { cause: error },
    );
  }

  let parsed: unknown;

  try {
    parsed = loadYaml(content);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not parse overlay file "${overlayPath}".\n${details}`,
      { cause: error },
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("overlay" in parsed) ||
    !("actions" in parsed) ||
    !Array.isArray((parsed as { actions: unknown }).actions)
  ) {
    throw new Error(
      `"${overlayPath}" does not appear to be a valid OpenAPI overlay file. ` +
        `Expected an object with "overlay" and "actions" fields.`,
    );
  }

  return parsed as Overlay;
}

/**
 * Applies all overlays listed in `overlayPaths` to `document` in order.
 *
 * Each overlay is loaded from disk (or a URL), parsed, and its actions are
 * applied sequentially.  The document is mutated in place.
 *
 * @param document      - The OpenAPI document object to mutate.
 * @param overlayPaths  - Ordered list of paths/URLs to overlay files.
 */
export async function applyOverlays(
  document: Record<string, unknown>,
  overlayPaths: readonly string[],
): Promise<void> {
  for (const overlayPath of overlayPaths) {
    const overlay = await loadOverlay(overlayPath);

    applyOverlayActions(document, overlay.actions);
  }
}
