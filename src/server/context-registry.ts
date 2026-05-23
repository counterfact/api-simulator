/**
 * A context object that lives at a specific route path and is shared across
 * all requests to that path (and its descendants).
 *
 * Route handlers receive this object as `$.context` and may freely add or
 * modify properties to maintain state between requests.
 */
export class Context {
  public constructor() {}

  [key: string]: unknown;
}

/**
 * Returns the parent path of a route path by stripping the last segment.
 *
 * @param path - A route path such as `"/pets/1"`.
 * @returns The parent path (e.g. `"/pets"`), or `"/"` for top-level paths.
 */
export function parentPath(path: string): string {
  return String(path.split("/").slice(0, -1).join("/")) || "/";
}

/**
 * Deep-clones an object for caching purposes.
 * Plain objects and class instances have their own enumerable properties
 * recursively cloned (preserving the prototype chain). Functions are copied
 * by reference since they are not structurally comparable data.
 */
function cloneForCache(value: unknown): unknown {
  if (value === null || typeof value === "function") {
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return (value as unknown[]).map(cloneForCache);
  }

  const proto = Object.getPrototypeOf(value) as object | null;
  const clone: Record<string, unknown> =
    proto !== null && proto !== Object.prototype
      ? (Object.create(proto) as Record<string, unknown>)
      : {};

  for (const key of Object.keys(value)) {
    clone[key] = cloneForCache((value as Record<string, unknown>)[key]);
  }

  return clone;
}

/**
 * Registry of per-path {@link Context} objects that persist state across
 * requests.
 *
 * The registry is case-insensitive for path lookups and uses a write-through
 * cache to detect which context properties have changed between hot-reloads.
 * It extends {@link EventTarget} so that listeners can react to structural
 * changes (e.g. to regenerate type files):
 *
 * ```ts
 * contextRegistry.addEventListener("context-changed", () => { ... });
 * ```
 */
export class ContextRegistry extends EventTarget {
  private readonly entries = new Map<string, Context>();

  private readonly cache = new Map<string, Context>();

  private readonly seen = new Set<string>();

  public constructor() {
    super();
    this.add("/", {});
  }

  private getContextIgnoreCase(map: Map<string, Context>, key: string) {
    const lowerCaseKey = key.toLowerCase();

    for (const currentKey of map.keys()) {
      if (currentKey.toLowerCase() === lowerCaseKey) {
        return map.get(currentKey);
      }
    }

    return undefined;
  }

  /**
   * Registers a new context for `path`, replacing any existing one, and
   * dispatches a `"context-changed"` event so listeners can react.
   *
   * @param path - The route path (e.g. `"/pets"`).
   * @param context - The context object to store.
   */
  public add(path: string, context: Context): void {
    this.entries.set(path, context);

    this.cache.set(path, cloneForCache(context) as Context);

    this.dispatchEvent(new Event("context-changed"));
  }

  /**
   * Removes the context entry for the given path and dispatches a
   * "context-changed" event so that listeners (e.g. the _.context type
   * generator) can regenerate type files in response to the removal.
   *
   * @param path - The route path whose context entry should be deleted
   *   (e.g. "/pets").
   */
  public remove(path: string): void {
    this.entries.delete(path);

    this.cache.delete(path);

    this.seen.delete(path);

    this.dispatchEvent(new Event("context-changed"));
  }

  /**
   * Finds the context for `path`, walking up the path hierarchy until a
   * context is found.  Falls back to `"/"` which always has a context.
   *
   * @param path - The route path to look up.
   * @returns The nearest ancestor context (or the root context).
   */
  public find(path: string): Context {
    return (
      this.getContextIgnoreCase(this.entries, path) ??
      this.find(parentPath(path))
    );
  }

  /**
   * Merges `updatedContext` into the existing context for `path`.
   *
   * On the first call for a path the context is added directly.  On subsequent
   * calls only properties whose values differ from the cached snapshot are
   * applied, preserving live mutations made by route handlers between reloads.
   *
   * @param path - The route path (e.g. `"/pets"`).
   * @param updatedContext - The new context instance (typically freshly
   *   constructed from the reloaded `_.context.ts` file).
   */
  public update(path: string, updatedContext?: Context): void {
    if (updatedContext === undefined) {
      return;
    }

    if (!this.seen.has(path)) {
      this.seen.add(path);
      this.add(path, updatedContext);

      return;
    }

    const context = this.find(path);

    for (const property in updatedContext) {
      if (updatedContext[property] !== this.cache.get(path)?.[property]) {
        context[property] = updatedContext[property];
      }
    }

    Object.setPrototypeOf(context, Object.getPrototypeOf(updatedContext));

    this.cache.set(path, cloneForCache(updatedContext) as Context);
  }

  /** Returns all registered route paths as an array. */
  public getAllPaths(): string[] {
    return Array.from(this.entries.keys());
  }

  /** Returns a plain object mapping every registered path to its context. */
  public getAllContexts(): Record<string, Context> {
    const result: Record<string, Context> = {};

    for (const [path, context] of this.entries.entries()) {
      result[path] = context;
    }

    return result;
  }
}
