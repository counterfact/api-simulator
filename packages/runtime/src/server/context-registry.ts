import { isDeepStrictEqual } from "node:util";

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

const DECLARATION_CLASS = Symbol("declaration class");
const DECLARATION_METHOD = Symbol("declaration method");
const DECLARATION_OPAQUE = Symbol("opaque declaration");
const opaqueIdentities = new WeakMap<object, symbol>();

function isNativeSource(source: string): boolean {
  return /^function\b[^{]*\{\s*\[native code\]\s*\}$/u.test(source);
}

function hasOpaqueSlots(value: object): boolean {
  let prototype = Object.getPrototypeOf(value) as object | null;
  while (prototype !== null && prototype !== Object.prototype) {
    const constructor = Object.getOwnPropertyDescriptor(
      prototype,
      "constructor",
    )?.value as unknown;
    if (typeof constructor === "function") {
      const source = Function.prototype.toString.call(constructor);
      if (
        isNativeSource(source) &&
        source !== Function.prototype.toString.call(Object)
      )
        return true;
      // JavaScript-implemented platform globals can also own hidden slots.
      const name = Object.getOwnPropertyDescriptor(constructor, "name")
        ?.value as unknown;
      if (
        typeof name === "string" &&
        Object.getOwnPropertyDescriptor(globalThis, name)?.value === constructor
      )
        return true;
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return false;
}

/** Describe user constructors without relying on generation-specific identity. */
function classDeclaration(
  value: object,
): { constructors: string[]; nativePrototype: object | null } | undefined {
  const declarations: string[] = [];
  let prototype = Object.getPrototypeOf(value) as object | null;
  while (prototype !== null && prototype !== Object.prototype) {
    const constructor = Object.getOwnPropertyDescriptor(
      prototype,
      "constructor",
    )?.value as unknown;
    if (typeof constructor !== "function") return undefined;
    const source = Function.prototype.toString.call(constructor);
    if (isNativeSource(source)) {
      if (declarations.length > 0) declarations.push(source);
      break;
    }
    declarations.push(source);
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return declarations.length === 0
    ? undefined
    : { constructors: declarations, nativePrototype: prototype };
}

/**
 * Snapshot declaration data independently of local ESM generation prototypes.
 * Class instances retain a constructor-source descriptor, so switching classes
 * or changing their declarations is still observable. Supported native values
 * retain real slots, enumerable properties, symbols and cycles. Other opaque
 * values compare by identity instead of discarding their internal state.
 *
 * Own methods of nested class instances are compared by source, like prototype
 * methods. Retained instances are not migrated to new closure captures. Direct
 * context functions and opaque/bound functions remain identity-sensitive.
 */
function cloneForCache(
  value: unknown,
  seen = new Map<object, object>(),
  contextRoot = false,
  classMethod = false,
): unknown {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  )
    return value;
  // Method snapshots have a private memo table. Their source normalization must
  // never leak into identity-sensitive direct/plain callbacks through aliases.
  if (typeof value === "function" && !classMethod)
    return seen.get(value) ?? value;
  if (seen.has(value)) return seen.get(value);

  let methodSource: string | undefined;
  if (typeof value === "function") {
    methodSource = Function.prototype.toString.call(value);
    if (isNativeSource(methodSource)) return value;
  }
  const declaration =
    methodSource === undefined ? classDeclaration(value) : undefined;
  let clone: object;
  if (methodSource !== undefined) {
    clone = { [DECLARATION_METHOD]: methodSource };
    seen = new Map(seen);
  } else if (value instanceof Map) {
    const entries = new Map<unknown, unknown>();
    clone = entries;
    seen.set(value, clone);
    for (const [key, entry] of value)
      entries.set(cloneForCache(key, seen), cloneForCache(entry, seen));
  } else if (value instanceof Set) {
    const entries = new Set<unknown>();
    clone = entries;
    seen.set(value, clone);
    for (const entry of value) entries.add(cloneForCache(entry, seen));
  } else if (value instanceof Date) {
    clone = new Date(value.getTime());
  } else if (value instanceof RegExp) {
    const expression = structuredClone(value);
    Object.setPrototypeOf(expression, RegExp.prototype);
    expression.lastIndex = value.lastIndex;
    clone = expression;
  } else if (Buffer.isBuffer(value)) {
    clone = Buffer.from(value);
  } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    clone = structuredClone(value);
    Object.setPrototypeOf(
      clone,
      declaration?.nativePrototype ?? Object.getPrototypeOf(value),
    );
  } else if (Array.isArray(value)) {
    clone = new Array(value.length);
  } else if (!contextRoot && hasOpaqueSlots(value)) {
    // Unsupported internal slots cannot be reconstructed from enumerable data.
    // Compare opaque values by identity, including on older Node versions whose
    // deep comparison treats different Promise/WeakMap instances as equal.
    let identity = opaqueIdentities.get(value);
    if (identity === undefined) {
      identity = Symbol("opaque value");
      opaqueIdentities.set(value, identity);
    }
    clone = { [DECLARATION_OPAQUE]: identity };
    seen.set(value, clone);
    return clone;
  } else {
    clone = Object.create(
      declaration ? Object.prototype : Object.getPrototypeOf(value),
    ) as object;
  }

  seen.set(value, clone);
  if (declaration !== undefined && !contextRoot) {
    Object.defineProperty(clone, DECLARATION_CLASS, {
      enumerable: true,
      value: declaration.constructors,
    });
  }
  const inherited = new Set<string>();
  if (contextRoot) for (const key in value) inherited.add(key);
  const keys = new Set([...Reflect.ownKeys(value), ...inherited]);
  for (const key of keys) {
    if (
      !Object.prototype.propertyIsEnumerable.call(value, key) &&
      !(typeof key === "string" && inherited.has(key))
    )
      continue;
    const entry: unknown = Reflect.get(value, key);
    Object.defineProperty(clone, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: cloneForCache(
        entry,
        seen,
        false,
        declaration !== undefined && !contextRoot,
      ),
    });
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

    this.cache.set(path, cloneForCache(context, new Map(), true) as Context);

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
    const snapshot = cloneForCache(updatedContext, new Map(), true) as Context;

    for (const property in updatedContext) {
      if (
        // eslint-disable-next-line security/detect-object-injection -- Compare enumerable local Context declaration snapshots, not mutable live state.
        !isDeepStrictEqual(snapshot[property], this.cache.get(path)?.[property])
      ) {
        // eslint-disable-next-line security/detect-object-injection -- Hot reload intentionally compares and updates enumerable properties of locally authored Context instances, preserving class behavior.
        context[property] = updatedContext[property];
      }
    }

    Object.setPrototypeOf(context, Object.getPrototypeOf(updatedContext));

    this.cache.set(path, snapshot);
  }

  /** Discards live contexts and hot-reload snapshots before reconstruction. */
  public clear(): void {
    this.entries.clear();
    this.cache.clear();
    this.seen.clear();
    this.add("/", {});
  }

  /** Returns all registered route paths as an array. */
  public getAllPaths(): string[] {
    return Array.from(this.entries.keys());
  }

  /** Returns a plain object mapping every registered path to its context. */
  public getAllContexts(): Record<string, Context> {
    return Object.fromEntries(this.entries);
  }
}
