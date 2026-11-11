import type { COUNTERFACT_RESPONSE } from "./counterfact-response.js";

/** A request snapshot, before OpenAPI coercion or middleware mutation. */
export interface HarRequest {
  readonly method: string;
  readonly pathname: string;
  readonly query: Readonly<Record<string, readonly string[]>>;
  readonly headers: Readonly<Record<string, readonly string[]>>;
  readonly body: unknown;
  readonly rawBody?: string;
  /** False when a payload is omitted or unavailable for HAR text comparison. */
  readonly bodyAvailable: boolean;
}

/** A replayable recorded exchange. Predicate arguments are isolated copies. */
export interface HarEntry {
  readonly request: HarRequest;
  readonly response: {
    readonly status: number;
    readonly headers: Readonly<Record<string, readonly string[]>>;
    readonly contentType: string;
    readonly body?: string | Uint8Array;
  };
  readonly filename: string;
  readonly entryIndex: number;
}

/** Compare a request field, or a named header/query parameter, with the recording. */
export interface HarMatch {
  (key: keyof HarRequest): boolean;
  (key: "header" | "query", name: string): boolean;
}

/** Named predicate arguments for one recorded exchange. */
export interface HarPredicateArguments {
  readonly request: HarRequest;
  readonly entry: HarEntry;
  readonly match: HarMatch;
  readonly defaultMatch: boolean;
}

/** Replaces default matching. Return true to select this recorded exchange. */
export type HarPredicate = (args: HarPredicateArguments) => boolean;

/** Returns a fresh complete response, or undefined on a lookup miss. */
export type HarLookup = (
  predicate?: HarPredicate,
) => COUNTERFACT_RESPONSE | undefined;
