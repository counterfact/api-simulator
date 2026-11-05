import type { CookieOptions } from "./cookie-options.js";
import type { GenericResponseBuilder } from "./generic-response-builder.js";
import type { OpenApiResponse, OpenApiResponses } from "./open-api-response.js";

type StatusCodes<Responses> =
  | keyof Responses
  | {
      [Key in keyof Responses]: Key extends `${infer Code extends number}`
        ? Code
        : never;
    }[keyof Responses];

type ResponseAt<Responses, Code> = Code extends keyof Responses
  ? Responses[Code]
  : Code extends number
    ? `${Code}` extends keyof Responses
      ? Responses[`${Code}`]
      : Responses extends { default: infer Default }
        ? Default
        : never
    : Responses extends { default: infer Default }
      ? Default
      : never;

type HeaderNames<Responses extends OpenApiResponses> = {
  [Code in keyof Responses]: [Responses[Code]["headers"]] extends [never]
    ? never
    : keyof Responses[Code]["headers"];
}[keyof Responses] &
  string;

type HeaderValues<Responses extends OpenApiResponses, Name extends string> = {
  [Code in keyof Responses]: Name extends keyof Responses[Code]["headers"]
    ? Responses[Code]["headers"][Name]["schema"]
    : never;
}[keyof Responses];

// Filter each response independently, preserving the relationship between a
// status code and its remaining body/header requirements.
type WithHeader<
  Responses extends OpenApiResponses,
  Name extends string,
  Value,
> = {
  [
    Code in keyof Responses as [Responses[Code]["headers"]] extends [never]
      ? never
      : [Name] extends [keyof Responses[Code]["headers"]]
        ? [Value] extends [Responses[Code]["headers"][Name]["schema"]]
          ? Code
          : never
        : never
  ]: {
    content: Responses[Code]["content"];
    headers: Omit<Responses[Code]["headers"], Name>;
    requiredHeaders: Exclude<Responses[Code]["requiredHeaders"], Name>;
  };
};

/**
 * Select a response with `response.status(200)`.
 * Headers supplied before selection narrow the available status codes and
 * satisfy the same requirements as headers supplied after selection.
 */
export type ResponseBuilderFactory<
  Responses extends OpenApiResponses = OpenApiResponses,
  ExcludedStatuses extends PropertyKey = never,
> = {
  /** @deprecated Use response.status(statusCode) instead. */
  [StatusCode in keyof Responses]: GenericResponseBuilder<
    Responses[StatusCode]
  >;
} & {
  /** @deprecated Use response.status(statusCode) instead. */
  [key: string]: GenericResponseBuilder<Responses["default"]>;
} & {
  status: <
    Code extends
      | StatusCodes<Responses>
      | ("default" extends keyof Responses
          ? number | `${number} ${string}`
          : never),
  >(
    statusCode: Code extends ExcludedStatuses
      ? never
      : Code extends number
        ? `${Code}` extends ExcludedStatuses
          ? never
          : Code
        : Code,
  ) => Code extends unknown
    ? ResponseAt<Responses, Code> extends infer Response extends OpenApiResponse
      ? GenericResponseBuilder<Response>
      : never
    : never;
  header: <
    Name extends HeaderNames<Responses>,
    const Value extends HeaderValues<Responses, Name>,
  >(
    name: Name,
    value: Value,
  ) => ResponseBuilderFactory<
    WithHeader<Responses, Name, Value>,
    | ExcludedStatuses
    | Exclude<keyof Responses, keyof WithHeader<Responses, Name, Value>>
  >;
  cookie: (
    name: string,
    value: string,
    options?: CookieOptions,
  ) => ResponseBuilderFactory<Responses, ExcludedStatuses>;
};
