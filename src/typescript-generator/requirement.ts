import type { Specification } from "./specification.js";

export type RequirementData =
  | (Record<string, unknown> & { $ref?: string })
  | string
  | number
  | boolean
  | null;

/**
 * A node in the dereferenced OpenAPI spec tree.
 *
 * A `Requirement` wraps a raw JSON object (`data`) together with its location
 * (`url`, a JSON Pointer) and a back-reference to the owning
 * {@link Specification}.  Navigation methods (`get`, `select`, `find`, …)
 * transparently follow `$ref` pointers.
 */
export class Requirement {
  public data: RequirementData;
  public url: string;
  public specification: Specification | undefined;

  /**
   * The requirement that produced this one via a `get()` call, or `undefined`
   * for root requirements that were constructed directly.
   *
   * For path-traversal purposes this is the "logical" parent: when a `$ref` is
   * followed, the parent is the resolved reference target rather than the
   * `$ref` node itself.
   */
  public parent: Requirement | undefined;

  public constructor(
    data: RequirementData,
    url = "",
    specification: Specification | undefined = undefined,
  ) {
    this.data = data;
    this.url = url;
    this.specification = specification;
  }

  /** `true` when this node is a JSON Reference (`$ref`) rather than inline data. */
  public get isReference(): boolean {
    return (
      typeof this.data === "object" &&
      this.data !== null &&
      this.data["$ref"] !== undefined
    );
  }

  /**
   * When this node is a JSON Reference, returns the raw `$ref` URL string.
   * Returns `undefined` for non-reference (inline) nodes.
   */
  public get refUrl(): string | undefined {
    if (typeof this.data !== "object" || this.data === null) {
      return undefined;
    }

    return this.data["$ref"] as string | undefined;
  }

  /**
   * Resolves the `$ref` and returns the target {@link Requirement}.
   *
   * @throws When `isReference` is `false` or the specification is not set.
   */
  public reference(): Requirement {
    return this.specification!.getRequirement(
      (this.data as Record<string, unknown>)["$ref"] as string,
    );
  }

  /**
   * Returns `true` when this node has a child property named `item`.
   *
   * Transparently follows `$ref` references.
   *
   * @param item - The property key to check.
   */
  public has(item: string): boolean {
    if (this.isReference) {
      return this.reference().has(item);
    }

    if (typeof this.data !== "object" || this.data === null) {
      return false;
    }

    return item in this.data;
  }

  /**
   * Returns the child {@link Requirement} for `item`, or `undefined`.
   *
   * @param item - The property key (string) or array index (number).
   */
  public get(item: string | number): Requirement | undefined {
    if (this.isReference) {
      return this.reference().get(item);
    }

    const key = String(item);

    if (!this.has(key)) {
      return undefined;
    }

    const objectData = this.data as Record<string, unknown>;
    const child = new Requirement(
      objectData[key] as RequirementData,
      `${this.url}/${this.escapeJsonPointer(key)}`,
      this.specification,
    );

    child.parent = this;

    return child;
  }

  /**
   * Navigates to a descendant node using a slash-delimited JSON Pointer path.
   *
   * Tilde-escaped characters (`~0` → `~`, `~1` → `/`) and percent-encoded
   * characters are unescaped during traversal.
   *
   * @param path - A slash-delimited path (e.g. `"responses/200/content"`).
   * @returns The target {@link Requirement}, or `undefined` if the path does
   *   not exist.
   */
  public select(path: string): Requirement | undefined {
    const parts = path
      .split("/")
      .map((p) => this.unescapeJsonPointer(p) as string)
      // Unescape URL encoded characters (e.g. %20 -> " ")
      // Technically we should not be unescaping, but it came up in https://github.com/pmcelhaney/counterfact/issues/1083
      // and I can't think of a reason anyone would intentionally put a % in a key name.

      .map((part) => {
        try {
          return decodeURIComponent(part);
        } catch {
          return part;
        }
      });

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let result: Requirement | undefined = this;

    for (const part of parts) {
      result = result.get(part);

      if (result === undefined) {
        return undefined;
      }
    }

    return result;
  }

  /**
   * Iterates over all child properties and calls `callback` with each child
   * requirement and its key.
   *
   * @param callback - Called for each child with `(child, key)`.
   */
  public forEach(callback: (value: Requirement, key: string) => void): void {
    if (typeof this.data !== "object" || this.data === null) {
      return;
    }

    Object.keys(this.data).forEach((key) => {
      callback(this.select(this.escapeJsonPointer(key) as string)!, key);
    });
  }

  /**
   * Maps over all child properties and returns the collected results.
   *
   * @param callback - Transformation function called with `(child, key)`.
   */
  public map<T>(callback: (value: Requirement, key: string) => T): T[] {
    const result: T[] = [];

    this.forEach((value, key) => result.push(callback(value, key)));

    return result;
  }

  /**
   * Maps and flattens over all child properties.
   *
   * @param callback - Transformation function that may return a value or an
   *   array of values.
   */
  public flatMap<T>(
    callback: (value: Requirement, key: string) => T | T[],
  ): T[] {
    return this.map(callback).flat() as T[];
  }

  /**
   * Returns the first child for which `callback` returns `true`, or
   * `undefined` when nothing matches.
   *
   * @param callback - Predicate called with `(child, key)`.
   */
  public find(
    callback: (value: Requirement, key: string) => boolean,
  ): Requirement | undefined {
    let result: Requirement | undefined;

    this.forEach((value, key) => {
      if (result === undefined && callback(value, key)) {
        result = value;
      }
    });

    return result;
  }

  /**
   * Escapes a JSON Pointer token: `~` → `~0`, `/` → `~1`.
   *
   * @param value - The token to escape.
   */
  public escapeJsonPointer(value: string | number): string | number {
    if (typeof value !== "string") return value;
    return value.replaceAll("~", "~0").replaceAll("/", "~1");
  }

  /**
   * Unescapes a JSON Pointer token: `~1` → `/`, `~0` → `~`.
   *
   * @param pointer - The token to unescape.
   */
  public unescapeJsonPointer(pointer: string | number): string | number {
    if (typeof pointer !== "string") return pointer;
    return pointer.replaceAll("~1", "/").replaceAll("~0", "~");
  }
}
