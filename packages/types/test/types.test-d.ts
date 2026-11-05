import {
  expectAssignable,
  expectError,
  expectNotAssignable,
  expectType,
} from "tsd";

import type {
  COUNTERFACT_RESPONSE,
  ExampleNames,
  GenericResponseBuilderInner,
  HttpStatusCode,
  IfHasKey,
  MaybePromise,
  MediaType,
  Middleware,
  MiddlewareRequest,
  MiddlewareResponseBuilderFactory,
  OmitAll,
  OmitValueWhenNever,
  OpenApiOperation,
  OpenApiResponse,
  ResponseBuilder,
  ResponseBuilderFactory,
  WideOperationArgument,
} from "@counterfact/types";

class AuthenticationContext {
  public isAuthorized(apiKey: string | undefined): boolean {
    return apiKey === "secret";
  }
}

const authenticationMiddleware: Middleware<AuthenticationContext> = async (
  $,
  respondTo,
) => {
  if (!$.context.isAuthorized($.auth?.apiKey)) {
    return $.response[401].json({ error: "Unauthorized" });
  }

  return respondTo($);
};

expectAssignable<Middleware<AuthenticationContext>>(authenticationMiddleware);

declare const middlewareRequest: MiddlewareRequest;
expectType<Promise<void>>(middlewareRequest.delay(100));
expectType<unknown>(middlewareRequest.query.parameter);
expectAssignable<MiddlewareRequest["query"]>({
  array: ["first", "second"],
  object: { property: "value" },
});

declare const middlewareResponse: MiddlewareResponseBuilderFactory;
expectType<ResponseBuilder | undefined>(middlewareResponse["200 OK"]);

expectAssignable<OpenApiOperation>({
  responses: {
    200: {
      content: {
        "application/json": {
          schema: { type: "object" },
        },
      },
    },
  },
});

// test exact match
expectType<
  OmitAll<
    {
      yaml: string;
      json: string;
    },
    ["json"]
  >
>({ yaml: "" });

// test match with suffix
expectType<
  OmitAll<
    {
      yaml: string;
      ["json-utf8"]: string;
    },
    ["json"]
  >
>({ yaml: "" });

// test match with prefix
expectType<
  OmitAll<
    {
      yaml: string;
      ["complex-json"]: string;
    },
    ["json"]
  >
>({ yaml: "" });

// test match with prefix and suffix
expectType<
  OmitAll<
    {
      yaml: string;
      ["complex-json-utf8"]: string;
    },
    ["json"]
  >
>({ yaml: "" });

// test mismatch
expectType<
  OmitAll<
    {
      yaml: string;
    },
    ["application/json"]
  >
>({ yaml: "" });

// test exact match
expectType<
  IfHasKey<
    {
      "application/json": string;
    },
    ["application/json"],
    true,
    false
  >
>(true);

// test match with suffix (e.g. application/json; charset=utf-8)
expectType<
  IfHasKey<
    {
      "application/json; charset=utf-8": string;
    },
    ["application/json"],
    true,
    false
  >
>(true);

// test mismatch
expectType<
  IfHasKey<
    {
      yaml: string;
    },
    ["application/json"],
    true,
    false
  >
>(false);

// MaybePromise: accepts direct value or Promise of that value
expectAssignable<MaybePromise<string>>("hello");
expectAssignable<MaybePromise<string>>(Promise.resolve("hello"));
expectNotAssignable<MaybePromise<string>>(42);
expectNotAssignable<MaybePromise<string>>(Promise.resolve(42));

// Generated routes retain schema validation, while versioned wide routes accept
// any response body.
type SchemaCheckedJsonResponse = {
  content: { "application/json": { schema: { id: number } } };
  headers: {};
  requiredHeaders: never;
  examples: {};
};

declare const generatedResponse: ResponseBuilderFactory<{
  200: SchemaCheckedJsonResponse;
}>;

expectError(generatedResponse[200].json("invalid json per schema"));
expectAssignable<COUNTERFACT_RESPONSE>(generatedResponse[200].json({ id: 1 }));

// Function expressions contextually type both the request and completed response.
type SchemaCheckedRoute = ($: {
  response: typeof generatedResponse;
}) => MaybePromise<COUNTERFACT_RESPONSE>;

const functionExpressionRoute: SchemaCheckedRoute = function ($) {
  expectType<typeof generatedResponse>($.response);
  return $.response[200].json({ id: 1 });
};
const asyncFunctionExpressionRoute: SchemaCheckedRoute = async function ($) {
  expectType<typeof generatedResponse>($.response);
  return $.response[200].json({ id: 1 });
};
expectAssignable<SchemaCheckedRoute>(functionExpressionRoute);
expectAssignable<SchemaCheckedRoute>(asyncFunctionExpressionRoute);

expectError<SchemaCheckedRoute>(function ($) {
  $.response[200].json({ id: 1 });
});
expectError<SchemaCheckedRoute>(async function ($) {
  $.response[200].json({ id: 1 });
});
expectError<SchemaCheckedRoute>(function ($) {
  return $.response[200];
});
expectError<SchemaCheckedRoute>(async function ($) {
  return $.response[200];
});
expectError<SchemaCheckedRoute>(function ($) {
  return $.response[200].json({ id: "invalid" });
});

type WideRoute = ($: {
  x: WideOperationArgument;
}) => MaybePromise<COUNTERFACT_RESPONSE>;

const wideRandomRoute: WideRoute = ($) => $.x.response[200].random();
const wideJsonRoute: WideRoute = ($) => $.x.response[200].json({ ok: true });
const wideInvalidJsonRoute: WideRoute = ($) =>
  $.x.response[200].json("invalid json per schema");
const wideChainedRoute: WideRoute = ($) =>
  $.x.response[200].header("x-request-id", "request-123").json({ ok: true });
declare const stream: AsyncIterable<unknown>;
const wideStreamRoute: WideRoute = ($) => $.x.response[200].stream(stream);
expectAssignable<WideRoute>(wideRandomRoute);
expectAssignable<WideRoute>(wideJsonRoute);
expectAssignable<WideRoute>(wideInvalidJsonRoute);
expectAssignable<WideRoute>(wideChainedRoute);
expectAssignable<WideRoute>(wideStreamRoute);

// OmitValueWhenNever: keys whose value is `never` are removed from the type
expectType<OmitValueWhenNever<{ a: string; b: never }>>({ a: "hello" });
expectError<OmitValueWhenNever<{ a: string; b: never }>>({
  a: "hello",
  b: "world",
});

// OmitValueWhenNever: keeps all keys when none are never
expectType<OmitValueWhenNever<{ a: string; b: number }>>({ a: "hello", b: 42 });

// HttpStatusCode: valid 2xx codes
expectAssignable<HttpStatusCode>(200);
expectAssignable<HttpStatusCode>(201);
expectAssignable<HttpStatusCode>(204);

// HttpStatusCode: valid 4xx codes
expectAssignable<HttpStatusCode>(400);
expectAssignable<HttpStatusCode>(401);
expectAssignable<HttpStatusCode>(404);

// HttpStatusCode: valid 5xx codes
expectAssignable<HttpStatusCode>(500);
expectAssignable<HttpStatusCode>(503);

// HttpStatusCode: non-standard codes are not valid
expectNotAssignable<HttpStatusCode>(999);
expectNotAssignable<HttpStatusCode>(0);

// MediaType: valid media types contain a slash
expectAssignable<MediaType>("application/json");
expectAssignable<MediaType>("text/html");
expectAssignable<MediaType>("text/plain");
expectAssignable<MediaType>("application/xml");

// MediaType: strings without a slash are not valid media types
expectNotAssignable<MediaType>("notamediatype");
expectNotAssignable<MediaType>("");

// GenericResponseBuilderInner: response with only JSON content exposes `json` but not `html` or `text`
type JsonOnlyResponse = {
  content: { "application/json": { schema: string } };
  headers: {};
  requiredHeaders: never;
};

declare const jsonBuilder: GenericResponseBuilderInner<JsonOnlyResponse>;
expectAssignable<(body: string) => unknown>(jsonBuilder.json);
expectError(jsonBuilder.html);
expectError(jsonBuilder.text);

// GenericResponseBuilderInner: response with only HTML content exposes `html` but not `json`
type HtmlOnlyResponse = {
  content: { "text/html": { schema: string } };
  headers: {};
  requiredHeaders: never;
};

declare const htmlBuilder: GenericResponseBuilderInner<HtmlOnlyResponse>;
expectAssignable<(body: string) => unknown>(htmlBuilder.html);
expectError(htmlBuilder.json);
expectError(htmlBuilder.text);

// GenericResponseBuilderInner: response with only plain-text content exposes `text` but not `json` or `html`
type TextOnlyResponse = {
  content: { "text/plain": { schema: string } };
  headers: {};
  requiredHeaders: never;
};

declare const textBuilder: GenericResponseBuilderInner<TextOnlyResponse>;
expectAssignable<(body: string) => unknown>(textBuilder.text);
expectError(textBuilder.json);
expectError(textBuilder.html);

// GenericResponseBuilderInner: response with headers exposes `header` method
type ResponseWithHeaders = {
  content: { "application/json": { schema: string } };
  headers: { "x-custom": { schema: string } };
  requiredHeaders: "x-custom";
};

declare const headerBuilder: GenericResponseBuilderInner<ResponseWithHeaders>;
expectAssignable<(header: "x-custom", value: string) => unknown>(
  headerBuilder.header,
);

// GenericResponseBuilderInner: response with no headers does not expose `header` method
declare const noHeaderBuilder: GenericResponseBuilderInner<JsonOnlyResponse>;
expectError(noHeaderBuilder.header);

// ResponseBuilderFactory: status codes map to response builders
type Responses = {
  200: JsonOnlyResponse;
  404: {
    content: { "text/plain": { schema: string } };
    headers: {};
    requiredHeaders: never;
  };
};

declare const factory: ResponseBuilderFactory<Responses>;
expectAssignable<(body: string) => unknown>(factory[200].json);
expectAssignable<(body: string) => unknown>(factory[404].text);

// GenericResponseBuilderInner: response with examples exposes `example` with typed names
type ResponseWithExamples = {
  content: { "application/json": { schema: string } };
  examples: { namedExample1: unknown; namedExample2: unknown };
  headers: {};
  requiredHeaders: never;
};

// ExampleNames: extracts example names as a union of string literals
expectAssignable<ExampleNames<ResponseWithExamples>>("namedExample1");
expectAssignable<ExampleNames<ResponseWithExamples>>("namedExample2");
expectNotAssignable<ExampleNames<ResponseWithExamples>>("unknownExample");

// ExampleNames: returns `never` when no examples are defined
expectNotAssignable<ExampleNames<JsonOnlyResponse>>("anything");

declare const exampleBuilder: GenericResponseBuilderInner<ResponseWithExamples>;
expectAssignable<(name: "namedExample1" | "namedExample2") => unknown>(
  exampleBuilder.example,
);
expectError(exampleBuilder.example("unknownExample"));

// GenericResponseBuilderInner: response without examples does not expose `example` method
declare const noExampleBuilder: GenericResponseBuilderInner<JsonOnlyResponse>;
expectError(noExampleBuilder.example);

// OpenApiResponse: well-formed response satisfies the OpenApiResponse interface
expectAssignable<OpenApiResponse>({
  content: {
    "application/json": { schema: { type: "string" } },
  },
  headers: {},
  requiredHeaders: "",
});

// GenericResponseBuilderInner: response with application/octet-stream content exposes `binary`
type OctetStreamResponse = {
  content: { "application/octet-stream": { schema: Uint8Array | string } };
  headers: {};
  requiredHeaders: never;
};

declare const binaryBuilder: GenericResponseBuilderInner<OctetStreamResponse>;
expectAssignable<(body: Uint8Array | string) => unknown>(binaryBuilder.binary);
expectError(binaryBuilder.json);
expectError(binaryBuilder.html);
expectError(binaryBuilder.text);

// GenericResponseBuilderInner: response without application/octet-stream does not expose `binary`
declare const noBinaryBuilder: GenericResponseBuilderInner<JsonOnlyResponse>;
expectError(noBinaryBuilder.binary);

// GenericResponseBuilderInner: response with no content exposes `empty`
type NoContentResponse = {
  content: {};
  headers: {};
  requiredHeaders: never;
};

declare const emptyBuilder: GenericResponseBuilderInner<NoContentResponse>;
expectAssignable<() => unknown>(emptyBuilder.empty);

// GenericResponseBuilderInner: response with content does not expose `empty`
declare const noEmptyBuilder: GenericResponseBuilderInner<JsonOnlyResponse>;
expectError(noEmptyBuilder.empty);

// ResponseBuilderFactory: response with no body exposes .empty() which returns COUNTERFACT_RESPONSE.
// Bare access ($.response[200] without .empty()) is NOT directly COUNTERFACT_RESPONSE.
type NoBodyResponse = {
  content: never;
  headers: never;
  requiredHeaders: never;
  examples: {};
};

declare const noBodyFactory: ResponseBuilderFactory<{
  200: NoBodyResponse;
  404: NoBodyResponse;
}>;
expectAssignable<COUNTERFACT_RESPONSE>(noBodyFactory[200].empty());
expectAssignable<COUNTERFACT_RESPONSE>(noBodyFactory[404].empty());
expectNotAssignable<COUNTERFACT_RESPONSE>(noBodyFactory[200]);

// GenericResponseBuilder: response with only optional headers (no content) exposes .empty()
// rather than the old ALL_REMAINING_HEADERS_ARE_OPTIONAL shortcut.
type NoBodyWithOptionalHeadersResponse = {
  content: never;
  headers: { "x-request-id": { schema: string } };
  requiredHeaders: never;
  examples: {};
};

declare const optionalHeadersFactory: ResponseBuilderFactory<{
  200: NoBodyWithOptionalHeadersResponse;
}>;
expectAssignable<COUNTERFACT_RESPONSE>(optionalHeadersFactory[200].empty());
expectAssignable<(header: "x-request-id", value: string) => unknown>(
  optionalHeadersFactory[200].header,
);

// Function-based status selection retains the exact indexed builder type.
expectType<(typeof generatedResponse)[200]>(generatedResponse.status(200));
expectError(generatedResponse.status(404));
expectError(generatedResponse.status(200).json({ id: "wrong" }));
expectAssignable<COUNTERFACT_RESPONSE>(
  generatedResponse.status(200).json({ id: 1 }),
);

type HeaderResponse<Kind extends string> = {
  content: { "application/json": { schema: { kind: Kind } } };
  headers: { "x-kind": { schema: Kind }; "x-id": { schema: string } };
  requiredHeaders: "x-kind" | "x-id";
  examples: {};
};
declare const statusFactory: ResponseBuilderFactory<{
  200: HeaderResponse<"success">;
  404: HeaderResponse<"missing">;
  204: { content: never; headers: never; requiredHeaders: never; examples: {} };
}>;
const successFactory = statusFactory.header("x-kind", "success");
expectError(successFactory.status(404));
expectError(successFactory.status(204));
expectError(statusFactory.header("unknown", "value"));
expectError(statusFactory.header("x-kind", "invalid"));
expectError(successFactory.header("x-kind", "success"));
expectError(successFactory.status(200).json({ kind: "missing" }));
expectNotAssignable<COUNTERFACT_RESPONSE>(
  successFactory.status(200).json({ kind: "success" }),
);
expectAssignable<COUNTERFACT_RESPONSE>(
  successFactory.header("x-id", "123").status(200).json({ kind: "success" }),
);
expectAssignable<COUNTERFACT_RESPONSE>(
  statusFactory
    .header("x-id", "123")
    .status(404)
    .header("x-kind", "missing")
    .json({ kind: "missing" }),
);
expectAssignable<COUNTERFACT_RESPONSE>(statusFactory.status(204).empty());
expectType<(typeof generatedResponse)[200]>(
  generatedResponse.cookie("session", "abc").status(200),
);

declare const stringStatusFactory: ResponseBuilderFactory<{
  "200": SchemaCheckedJsonResponse;
}>;
expectType<(typeof stringStatusFactory)["200"]>(
  stringStatusFactory.status(200),
);
expectType<(typeof stringStatusFactory)["200"]>(
  stringStatusFactory.status("200"),
);
declare const defaultStatusFactory: ResponseBuilderFactory<{
  default: SchemaCheckedJsonResponse;
}>;
expectType<(typeof defaultStatusFactory)["default"]>(
  defaultStatusFactory.status(418),
);
expectError(defaultStatusFactory.status(418).json("wrong"));
expectType<ResponseBuilder>(
  middlewareResponse.header("x-id", "123").status(201),
);
const wideStatusRoute: WideRoute = ($) =>
  $.x.response.header("x-id", "123").status(201).json({ ok: true });
expectAssignable<WideRoute>(wideStatusRoute);

// An explicit response ruled out by a header must not fall back to default.
declare const defaultHeaderFactory: ResponseBuilderFactory<{
  200: HeaderResponse<"success">;
  default: HeaderResponse<"missing">;
}>;
const missingFactory = defaultHeaderFactory.header("x-kind", "missing");
expectError(missingFactory.status(200));
expectError(missingFactory.cookie("session", "abc").status(200));
expectAssignable<COUNTERFACT_RESPONSE>(
  missingFactory.status(418).header("x-id", "123").json({ kind: "missing" }),
);
declare const uncertainKind: "success" | "missing";
expectError(statusFactory.header("x-kind", uncertainKind).status(200));
