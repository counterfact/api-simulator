import type { CounterfactResponseObject } from "./registry.js";

/**
 * Sentinel value used to distinguish "body not set" from `undefined`.
 * This allows `body()` to explicitly replace the response body with `undefined`.
 */
const UNSET = Symbol("UNSET");
const CONTENT_TYPE_HEADER = "content-type";

/**
 * A monotonically increasing counter used to determine rule recency.
 * Using a counter instead of `Date.now()` ensures stable ordering even when
 * multiple rules are updated within the same millisecond (common in tests).
 */
let _sequence = 0;

/**
 * Result returned by {@link ChaosRule.tryApply} when the rule fires.
 */
export interface ChaosApplyResult {
  /** Number of milliseconds to delay the response, if any. */
  delayMs?: number;
  /** The (potentially modified) response object. */
  response: CounterfactResponseObject;
}

/**
 * A single chaos rule that can modify HTTP responses for paths matching a
 * given prefix.
 *
 * All configuration methods return `this` for fluent chaining and update the
 * rule's recency so that the most recently configured rule wins when multiple
 * rules match the same request path.
 *
 * ### Example
 *
 * ```ts
 * const fault = chaos("/orders")
 *   .next(3)
 *   .probability(0.5)
 *   .status(500)
 *   .delay(1_000)
 *   .header("Retry-After", "60");
 * ```
 */
export class ChaosRule {
  /** Path prefix this rule matches against. Empty string matches all paths. */
  public readonly prefix: string;

  private _remaining: number | "always";
  private _probability = 1;
  private _status?: number;
  private _delay?: number;
  private _headers = new Map<string, string>();
  private _removedHeaders = new Set<string>();
  private _body: symbol | unknown = UNSET;
  private _transformBody?: (body: unknown) => unknown;
  private _active = true;
  private _updatedAt = ++_sequence;

  /** @internal */
  public constructor(prefix: string) {
    this.prefix = prefix;
    this._remaining = "always";
  }

  /** Monotonically increasing value representing when this rule was last updated. */
  public get updatedAt(): number {
    return this._updatedAt;
  }

  /** `true` when the rule is active (not stopped and has remaining count). */
  public get isEligible(): boolean {
    return (
      this._active && (this._remaining === "always" || this._remaining > 0)
    );
  }

  private touch(): void {
    this._updatedAt = ++_sequence;
  }

  /**
   * Configures this rule to apply to the next matching response.
   *
   * When `count` is omitted, applies once. When provided, applies to the next
   * `count` matching responses. Only responses where the rule actually fires
   * (after probability check) decrement the count.
   */
  public next(count = 1): this {
    this._remaining = count;
    this.touch();
    return this;
  }

  /**
   * Sets the probability that the rule fires for each eligible response.
   *
   * @param value - A number between `0` (never) and `1` (always). Default is `1`.
   */
  public probability(value: number): this {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(
        `Chaos rule probability must be a number between 0 and 1. Received: ${String(value)}`,
      );
    }

    this._probability = value;
    this.touch();
    return this;
  }

  /**
   * Overrides the HTTP status code of the response.
   *
   * @param code - The HTTP status code to return (e.g. `500`, `429`).
   */
  public status(code: number): this {
    this._status = code;
    this.touch();
    return this;
  }

  /**
   * Delays the response by the specified number of milliseconds.
   *
   * @param ms - Number of milliseconds to delay.
   */
  public delay(ms: number): this {
    this._delay = ms;
    this.touch();
    return this;
  }

  /**
   * Sets or replaces a response header.
   *
   * @param name - Header name.
   * @param value - Header value.
   */
  public header(name: string, value: string): this {
    if (name.toLowerCase() === CONTENT_TYPE_HEADER) {
      return this;
    }

    this._headers.set(name, value);
    this.touch();
    return this;
  }

  /**
   * Removes a response header if present.
   *
   * @param name - Header name to remove.
   */
  public removeHeader(name: string): this {
    if (name.toLowerCase() === CONTENT_TYPE_HEADER) {
      return this;
    }

    this._removedHeaders.add(name);
    this.touch();
    return this;
  }

  /**
   * Replaces the response body with the given value.
   *
   * Clears any previously configured {@link transformBody} transformer.
   *
   * @param value - The new response body.
   */
  public body(value: unknown): this {
    this._body = value;
    this._transformBody = undefined;
    this.touch();
    return this;
  }

  /**
   * Transforms the response body using the given function.
   *
   * The transformer receives the current response body and returns the new
   * body. Clears any previously configured {@link body} replacement.
   *
   * @param fn - Function that receives the current body and returns the new body.
   */
  public transformBody(fn: (body: unknown) => unknown): this {
    this._transformBody = fn;
    this._body = UNSET;
    this.touch();
    return this;
  }

  /**
   * Disables this rule. Stopped rules do not affect responses and do not
   * decrement their remaining count.
   */
  public stop(): this {
    this._active = false;
    this.touch();
    return this;
  }

  /**
   * Re-enables a previously stopped rule.
   */
  public start(): this {
    this._active = true;
    this.touch();
    return this;
  }

  /**
   * Attempts to apply this rule to `response`.
   *
   * Returns `null` when the rule does not apply:
   * - The rule is inactive (stopped).
   * - The remaining count is exhausted.
   * - The probability check fails (skipped — count is not decremented).
   *
   * Returns a {@link ChaosApplyResult} when the rule fires, with the
   * modified response and an optional delay.
   *
   * @param response - The original response from the route handler.
   */
  public tryApply(
    response: CounterfactResponseObject,
  ): ChaosApplyResult | null {
    if (!this._active) {
      return null;
    }

    if (this._remaining !== "always" && this._remaining <= 0) {
      return null;
    }

    // Probability check: skipped responses do NOT decrement the count.
    if (Math.random() > this._probability) {
      return null;
    }

    // Decrement the count ONLY when the rule fires.
    if (this._remaining !== "always") {
      this._remaining--;
    }

    // Apply header modifications.
    const headers: CounterfactResponseObject["headers"] = {
      ...(response.headers ?? {}),
    };

    for (const [name, value] of this._headers) {
      headers[name] = value;
    }

    for (const name of this._removedHeaders) {
      delete headers[name];
    }

    // Apply body modifications.
    // The body is typed as unknown here because chaos rules may replace it
    // with any value (including plain objects that Koa will serialize to JSON).
    // The cast to CounterfactResponseObject['body'] is applied below when
    // setting the result property.
    let body: unknown = response.body;

    if (this._body !== UNSET) {
      body = this._body;
    } else if (this._transformBody !== undefined) {
      body = this._transformBody(body);
    }

    const result: CounterfactResponseObject = {
      ...response,
      // Cast is safe: Koa serializes object bodies to JSON at the middleware level.
      body: body as CounterfactResponseObject["body"],
      headers,
    };

    if (this._status !== undefined) {
      result.status = this._status;
    }

    return { response: result, delayMs: this._delay };
  }
}

/**
 * Stores and selects active chaos rules for incoming requests.
 *
 * When multiple rules match a request path, the registry applies the rule
 * with the longest matching prefix. Among rules with the same prefix length,
 * the most recently updated rule is chosen.
 */
export class ChaosRegistry {
  private readonly rules: ChaosRule[] = [];

  /**
   * Creates a new {@link ChaosRule} for the given path prefix and registers
   * it with this registry.
   *
   * @param prefix - URL path prefix. When omitted, the rule matches all paths.
   * @returns The newly created rule for fluent configuration.
   */
  public createRule(prefix = ""): ChaosRule {
    const rule = new ChaosRule(prefix);
    this.rules.push(rule);
    return rule;
  }

  /**
   * Finds the best matching active, eligible rule for the given request path.
   *
   * Selection priority:
   * 1. Longest matching path prefix.
   * 2. Most recently updated rule (highest `updatedAt` value).
   *
   * @param path - The incoming request path (e.g. `/orders/123`).
   * @returns The best matching rule, or `undefined` when no rule matches.
   */
  public findBestMatch(path: string): ChaosRule | undefined {
    const eligible = this.rules.filter(
      (rule) => rule.isEligible && path.startsWith(rule.prefix),
    );

    if (eligible.length === 0) {
      return undefined;
    }

    const maxPrefixLength = Math.max(...eligible.map((r) => r.prefix.length));

    const longestPrefixRules = eligible.filter(
      (r) => r.prefix.length === maxPrefixLength,
    );

    return longestPrefixRules.reduce((best, r) =>
      r.updatedAt > best.updatedAt ? r : best,
    );
  }
}
