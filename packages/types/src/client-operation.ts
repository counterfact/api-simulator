import type { ResponseBuilderFactory } from "./response-builder-factory.js";

/**
 * The `$` argument of a generated route handler type such as
 * `Routes["/pets"]["GET"]`.
 */
type OperationArgument<Operation> = Operation extends (
  $: infer Argument,
) => unknown
  ? Argument
  : never;

/** Path parameters declared by a generated operation. */
export type OperationPath<Operation> =
  OperationArgument<Operation> extends { path: infer Path } ? Path : never;

/** Query parameters declared by a generated operation. */
export type OperationQuery<Operation> =
  OperationArgument<Operation> extends { query: infer Query } ? Query : never;

/** Header parameters declared by a generated operation. */
export type OperationHeaders<Operation> =
  OperationArgument<Operation> extends { headers: infer Headers }
    ? Headers
    : never;

/** Request body declared by a generated operation. */
export type OperationBody<Operation> =
  OperationArgument<Operation> extends { body: infer Body } ? Body : never;

/** Status-code keyed responses declared by a generated operation. */
export type OperationResponses<Operation> =
  OperationArgument<Operation> extends {
    response: ResponseBuilderFactory<infer Responses>;
  }
    ? Responses
    : never;

type JsonMediaType = "application/json" | `application/${string}+json`;

// Prefer JSON media types because the generated clients parse JSON by default.
type ContentSchema<Content> = [Content] extends [never]
  ? void
  : Extract<keyof Content, JsonMediaType> extends infer Json extends
        keyof Content
    ? [Json] extends [never]
      ? Content[keyof Content] extends { schema: infer Schema }
        ? Schema
        : unknown
      : Content[Json] extends { schema: infer Schema }
        ? Schema
        : unknown
    : unknown;

type ResponseBody<Response> = Response extends { content: infer Content }
  ? ContentSchema<Content>
  : void;

type IsSuccessStatus<Status> = Status extends string | number
  ? `${Status}` extends `2${string}`
    ? true
    : false
  : false;

type ResponseBodies<Operation, Success extends boolean> = {
  [
    Status in keyof OperationResponses<Operation>
  ]: IsSuccessStatus<Status> extends Success
    ? ResponseBody<OperationResponses<Operation>[Status]>
    : never;
}[keyof OperationResponses<Operation>];

type OrDefault<Type, Default> = [Type] extends [never] ? Default : Type;

/**
 * Body of every 2xx response declared by a generated operation, or `unknown`
 * when the operation declares no successful response.
 */
export type OperationData<Operation> = OrDefault<
  ResponseBodies<Operation, true>,
  unknown
>;

/**
 * Body of every non-2xx (including `default`) response declared by a
 * generated operation, or `unknown` when it declares none.
 */
export type OperationError<Operation> = OrDefault<
  ResponseBodies<Operation, false>,
  unknown
>;
