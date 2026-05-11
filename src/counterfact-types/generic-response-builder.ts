import type { COUNTERFACT_RESPONSE } from "./counterfact-response.js";
import type { CookieOptions } from "./cookie-options.js";
import type { ExampleNames } from "./example-names.js";
import type { IfHasKey } from "./if-has-key.js";
import type { MediaType } from "./media-type.js";
import type { OmitAll } from "./omit-all.js";
import type { OmitValueWhenNever } from "./omit-value-when-never.js";
import type { OpenApiResponse } from "./open-api-response.js";
import type { RandomFunction } from "./random-function.js";

/**
 * Returns `never` when `Record` is an empty object type (`{}`), signalling
 * that there are no remaining choices available on the response builder.
 */
type NeverIfEmpty<Record> = object extends Record ? never : Record;

/**
 * Extracts the union of schema types from a map of media-type content entries.
 * Used to type the body argument of shortcut methods like `.json()` or `.html()`.
 */
type SchemasOf<T extends { [key: string]: { schema: unknown } }> = {
  [K in keyof T]: T[K]["schema"];
}[keyof T];

/**
 * Produces a builder method for a shortcut (e.g. `.json()`, `.html()`) when
 * the response contains at least one of the given `ContentTypes`, and `never`
 * otherwise. Calling the method narrows the builder by removing those content
 * types from the remaining options.
 */
type MaybeShortcut<
  ContentTypes extends MediaType[],
  Response extends OpenApiResponse,
> = IfHasKey<
  Response["content"],
  ContentTypes,
  (body: SchemasOf<Response["content"]>) => GenericResponseBuilder<{
    content: NeverIfEmpty<OmitAll<Response["content"], ContentTypes>>;
    headers: Response["headers"];
    requiredHeaders: Response["requiredHeaders"];
  }>,
  never
>;

/**
 * The type of the `.match(contentType, body)` method on the generic response
 * builder. Calling it narrows the builder by removing the chosen content type
 * from the remaining options.
 */
type MatchFunction<Response extends OpenApiResponse> = <
  ContentType extends MediaType & keyof Response["content"],
>(
  contentType: ContentType,
  body: Response["content"][ContentType]["schema"],
) => GenericResponseBuilder<{
  content: NeverIfEmpty<Omit<Response["content"], ContentType>>;
  headers: Response["headers"];
  requiredHeaders: Response["requiredHeaders"];
}>;

/**
 * The type of the `.header(name, value)` method on the generic response
 * builder. Calling it narrows the builder by removing the satisfied header
 * from the set of required headers.
 */
type HeaderFunction<Response extends OpenApiResponse> = <
  Header extends string & keyof Response["headers"],
>(
  header: Header,
  value: Response["headers"][Header]["schema"],
) => GenericResponseBuilder<{
  content: NeverIfEmpty<Response["content"]>;
  headers: NeverIfEmpty<Omit<Response["headers"], Header>>;
  requiredHeaders: Exclude<Response["requiredHeaders"], Header>;
}>;

/**
 * The inner shape of the generic response builder, listing all methods that
 * are currently available given the remaining response constraints.
 * Methods whose type resolves to `never` are stripped by `OmitValueWhenNever`.
 *
 * Note: `[T] extends [never]` (non-distributive tuple wrapping) is used
 * alongside `[keyof T] extends [never]` to correctly handle both `T = never`
 * (spec-generated no-body) and `T = {}` (all content types consumed) cases.
 * TypeScript evaluates `keyof never` as `string | number | symbol`, so a
 * direct `[keyof never] extends [never]` check would incorrectly return false.
 */
export type GenericResponseBuilderInner<
  Response extends OpenApiResponse = OpenApiResponse,
> = OmitValueWhenNever<{
  binary: MaybeShortcut<["application/octet-stream"], Response>;
  cookie: (
    name: string,
    value: string,
    options?: CookieOptions,
  ) => GenericResponseBuilder<Response>;
  empty: [Response["content"]] extends [never]
    ? () => COUNTERFACT_RESPONSE
    : [keyof Response["content"]] extends [never]
      ? () => COUNTERFACT_RESPONSE
      : never;
  header: [Response["headers"]] extends [never]
    ? never
    : [keyof Response["headers"]] extends [never]
      ? never
      : HeaderFunction<Response>;
  html: MaybeShortcut<["text/html"], Response>;
  json: MaybeShortcut<
    [
      "application/json",
      "text/json",
      "text/x-json",
      "application/xml",
      "text/xml",
    ],
    Response
  >;
  match: [Response["content"]] extends [never]
    ? never
    : [keyof Response["content"]] extends [never]
      ? never
      : MatchFunction<Response>;
  random: [Response["content"]] extends [never]
    ? never
    : [keyof Response["content"]] extends [never]
      ? never
      : RandomFunction;
  example: [ExampleNames<Response>] extends [never]
    ? never
    : (name: ExampleNames<Response>) => COUNTERFACT_RESPONSE;
  text: MaybeShortcut<["text/plain"], Response>;
  xml: MaybeShortcut<["application/xml", "text/xml"], Response>;
  stream: MaybeShortcut<
    ["text/event-stream", "application/jsonl", "application/json-seq"],
    Response
  >;
}>;

/**
 * The strongly-typed, fluent response builder generated for each operation in
 * a route handler. Its available methods are derived from the OpenAPI response
 * schema: as methods are called, the builder type narrows until all required
 * content and headers have been provided, at which point it resolves to
 * `COUNTERFACT_RESPONSE`.
 *
 * When a Response type carries an `examples` key it is a spec-generated
 * response (either the initial no-body builder or a builder that still has
 * content/headers to satisfy). Those always go through
 * `GenericResponseBuilderInner`, which exposes `empty()` when `content` is
 * `never`.
 *
 * When a Response type has no `examples` key it is a narrowed type produced
 * by a method call (e.g. `.json()` sets the body and returns a type without
 * `examples`). Those go through the existing collapse logic so that
 * fully-satisfied responses resolve directly to `COUNTERFACT_RESPONSE`.
 */
export type GenericResponseBuilder<
  Response extends OpenApiResponse = OpenApiResponse,
> = "examples" extends keyof Response
  ? GenericResponseBuilderInner<Response>
  : object extends OmitValueWhenNever<Omit<Response, "examples">>
    ? COUNTERFACT_RESPONSE
    : keyof OmitValueWhenNever<Omit<Response, "examples">> extends "headers"
      ? COUNTERFACT_RESPONSE & {
          header: HeaderFunction<Response>;
        }
      : GenericResponseBuilderInner<Response>;
