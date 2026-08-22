import type { CounterfactResponseObject } from "./registry.js";

const UNSET = Symbol("UNSET");
const CONTENT_TYPE_HEADER = "content-type";

let sequence = 0;

type HeaderMutation =
  { kind: "remove" } | { kind: "set"; name: string; value: string };

export interface ChaosApplyResult {
  delayMs?: number;
  response: CounterfactResponseObject;
}

/** A fluent HTTP-response fault rule for requests matching a path prefix. */
export class ChaosRule {
  public readonly prefix: string;

  private remaining: number | "indefinite" = "indefinite";
  private firingProbability = 1;
  private statusCode?: number;
  private delayMilliseconds?: number;
  private readonly headerMutations = new Map<string, HeaderMutation>();
  private replacementBody: symbol | unknown = UNSET;
  private bodyTransformer?: (body: unknown) => unknown;
  private active = true;
  private revision = ++sequence;

  public constructor(prefix: string) {
    this.prefix = prefix;
  }

  public get updatedAt(): number {
    return this.revision;
  }

  public get isEligible(): boolean {
    return (
      this.active && (this.remaining === "indefinite" || this.remaining > 0)
    );
  }

  private touch(): void {
    this.revision = ++sequence;
  }

  public next(count = 1): this {
    this.remaining = count;
    this.touch();
    return this;
  }

  public probability(value: number): this {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(
        `Chaos rule probability must be a number between 0 and 1. Received: ${String(value)}`,
      );
    }

    this.firingProbability = value;
    this.touch();
    return this;
  }

  public status(code: number): this {
    this.statusCode = code;
    this.touch();
    return this;
  }

  public delay(ms: number): this {
    this.delayMilliseconds = ms;
    this.touch();
    return this;
  }

  public header(name: string, value: string): this {
    const normalizedName = name.toLowerCase();

    if (normalizedName === CONTENT_TYPE_HEADER) return this;

    this.headerMutations.set(normalizedName, { kind: "set", name, value });
    this.touch();
    return this;
  }

  public removeHeader(name: string): this {
    const normalizedName = name.toLowerCase();

    if (normalizedName === CONTENT_TYPE_HEADER) return this;

    this.headerMutations.set(normalizedName, { kind: "remove" });
    this.touch();
    return this;
  }

  public body(value: unknown): this {
    this.replacementBody = value;
    this.bodyTransformer = undefined;
    this.touch();
    return this;
  }

  public transformBody(transform: (body: unknown) => unknown): this {
    this.bodyTransformer = transform;
    this.replacementBody = UNSET;
    this.touch();
    return this;
  }

  public stop(): this {
    this.active = false;
    this.touch();
    return this;
  }

  public start(): this {
    this.active = true;
    this.touch();
    return this;
  }

  public tryApply(
    response: CounterfactResponseObject,
  ): ChaosApplyResult | null {
    if (!this.isEligible || Math.random() >= this.firingProbability) {
      return null;
    }

    if (this.remaining !== "indefinite") {
      this.remaining -= 1;
    }

    const headers: NonNullable<CounterfactResponseObject["headers"]> = {
      ...(response.headers ?? {}),
    };

    for (const [normalizedName, mutation] of this.headerMutations) {
      for (const existingName of Object.keys(headers)) {
        if (existingName.toLowerCase() === normalizedName) {
          // eslint-disable-next-line security/detect-object-injection -- existingName came from Object.keys(headers).
          delete headers[existingName];
        }
      }

      if (mutation.kind === "set") {
        headers[mutation.name] = mutation.value;
      }
    }

    let body: unknown = response.body;

    if (this.replacementBody !== UNSET) {
      body = this.replacementBody;
    } else if (this.bodyTransformer !== undefined) {
      body = this.bodyTransformer(body);
    }

    const result: CounterfactResponseObject = {
      ...response,
      body: body as CounterfactResponseObject["body"],
      headers,
    };

    if (this.statusCode !== undefined) {
      result.status = this.statusCode;
    }

    return { delayMs: this.delayMilliseconds, response: result };
  }
}

/** Selects the most specific, most recently updated eligible chaos rule. */
export class ChaosRegistry {
  private readonly rules: ChaosRule[] = [];

  public createRule(prefix = ""): ChaosRule {
    const rule = new ChaosRule(prefix);
    this.rules.push(rule);
    return rule;
  }

  public findBestMatch(path: string): ChaosRule | undefined {
    const eligible = this.rules.filter(
      (rule) => rule.isEligible && path.startsWith(rule.prefix),
    );

    return eligible.reduce<ChaosRule | undefined>((best, rule) => {
      if (best === undefined) return rule;
      if (rule.prefix.length > best.prefix.length) return rule;
      if (
        rule.prefix.length === best.prefix.length &&
        rule.updatedAt > best.updatedAt
      ) {
        return rule;
      }
      return best;
    }, undefined);
  }
}
