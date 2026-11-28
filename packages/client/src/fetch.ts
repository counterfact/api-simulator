import type {
  ClientOperation,
  ClientOperations,
  ClientResult,
  ClientRouteFunction,
  ClientSecurityScheme,
  ClientSendOptions,
  ClientStreamResult,
  Streamable,
} from "@counterfact/types/client-route";

import {
  applyAuthentication,
  type CredentialProvider,
  type SecurityRequirement,
} from "./fetch-auth.js";

export { RequestAuthenticationError } from "./fetch-auth.js";
export type {
  BasicCredential,
  CookieCredential,
  CredentialProvider,
} from "./fetch-auth.js";

export type {
  ClientOperations,
  ClientResult,
  ClientStreamResult,
  ClientRouteFunction,
} from "@counterfact/types/client-route";

type ResponseValidators = Readonly<Record<string, (body: unknown) => boolean>>;

type Location = "path" | "query" | "headers" | "cookies";

type CollectionFormat = "csv" | "ssv" | "tsv" | "pipes" | "multi";

interface SwaggerFormField {
  name: string;
  required: boolean;
  file: boolean;
  collectionFormat?: CollectionFormat;
}

export interface FetchParameter {
  name: string;
  location: Location;
  required: boolean;
  style: string;
  explode: boolean;
  allowReserved?: boolean;
  contentType?: string;
  collectionFormat?: CollectionFormat;
}

type FormFieldEncoding = {
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
  contentType?: string;
};

interface WholeQuery {
  required: boolean;
  mediaType: string;
  encoding?: Readonly<Record<string, FormFieldEncoding>>;
}

export interface FetchOperation {
  parameters: readonly FetchParameter[];
  querystring?: WholeQuery;
  body?: {
    required: boolean;
    mediaType: string;
    formFields?: readonly SwaggerFormField[];
  };
  responses: Readonly<Record<string, readonly string[]>>;
  security?: readonly SecurityRequirement[];
  responseSchemas?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export type FetchOperations<Operations extends ClientOperations> = {
  [Path in keyof Operations]: {
    [Method in keyof Operations[Path]]: FetchOperation;
  };
};

export interface FetchClientOptions<
  Auth extends Readonly<Record<string, CredentialProvider | undefined>> =
    Readonly<Record<string, CredentialProvider | undefined>>,
> {
  auth?: Auth;
  baseUrl: string | URL;
  fetch?: typeof fetch;
  headers?: ConstructorParameters<typeof Headers>[0];
  credentials?: RequestInit["credentials"];
}

export type FetchClientOptionsWithDefault<
  Auth extends Readonly<Record<string, CredentialProvider | undefined>>,
> = Omit<FetchClientOptions<Auth>, "baseUrl"> & {
  baseUrl?: FetchClientOptions["baseUrl"];
};

type Values = Readonly<Record<string, unknown>>;
type Inputs = Record<Location, Values> & {
  body: unknown;
  querystring: unknown;
};
const empty: Inputs = {
  path: {},
  query: {},
  headers: {},
  cookies: {},
  body: undefined,
  querystring: undefined,
};

function scalar(value: unknown): string {
  if (value === null) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  throw new TypeError("Expected a primitive OpenAPI parameter value");
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => "%" + character.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function encodeQueryValue(value: string, allowReserved?: boolean): string {
  // Preserve reserved characters that cannot split the query or start a fragment.
  return allowReserved
    ? encode(value).replace(
        /%(?:3A|2F|3F|5B|5D|40|21|24|27|28|29|2A|2C|3B)/gu,
        (token) => decodeURIComponent(token),
      )
    : encode(value);
}

function pairs(value: unknown): [string, unknown][] | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value)
    : undefined;
}

function formEncode(value: string): string {
  return new URLSearchParams([["", value]]).toString().slice(1);
}

const delimiters = { csv: ",", ssv: " ", tsv: "\t", pipes: "|" } as const;

function collectionItems(
  values: readonly unknown[],
  format: CollectionFormat,
  stringify: (value: unknown) => string,
  encodeDelimiter: (delimiter: string) => string = (delimiter) => delimiter,
): string[] {
  const items = values.map(stringify);
  if (format === "multi") return items;
  // eslint-disable-next-line security/detect-object-injection -- the key is a declared Swagger collection format.
  const delimiter = delimiters[format];
  return [items.join(encodeDelimiter(delimiter))];
}

function serialize(
  parameter: FetchParameter,
  value: unknown,
  encodeField = encode,
  encodeParameterValue?: (text: string) => string,
): [string, string][] {
  const { name, location, style, explode } = parameter;
  const encodeValue =
    location === "headers"
      ? (text: string) => text
      : (encodeParameterValue ??
        ((text: string) =>
          encodeQueryValue(
            text,
            location === "query" && parameter.allowReserved,
          )));
  const key = location === "headers" ? name : encodeField(name);
  const stringify = (item: unknown) => encodeValue(scalar(item));

  if (parameter.contentType !== undefined) {
    if (!isJson(parameter.contentType)) {
      throw new TypeError(
        `Unsupported parameter content type: ${parameter.contentType}`,
      );
    }
    return [[key, encodeValue(JSON.stringify(value))]];
  }

  if (parameter.collectionFormat && Array.isArray(value)) {
    return collectionItems(
      value,
      parameter.collectionFormat,
      stringify,
      (delimiter) =>
        /\s/u.test(delimiter) && location !== "headers"
          ? encodeValue(delimiter)
          : delimiter,
    ).map((item) => [key, item]);
  }

  const fields = pairs(value);
  const items = Array.isArray(value) ? value : undefined;
  const positional = fields ? fields.flat() : items;
  const joined = positional?.map(stringify).join(",") ?? stringify(value);
  const named = fields?.map(([field, item]): [string, string] => [
    encodeValue(field),
    stringify(item),
  ]);
  const assignments = named?.map(([field, item]) => `${field}=${item}`);
  const repeated = items?.map(
    (item) => [key, stringify(item)] satisfies [string, string],
  );

  switch (style) {
    case "simple":
      return [[key, explode && assignments ? assignments.join(",") : joined]];
    case "form":
      return explode ? (named ?? repeated ?? [[key, joined]]) : [[key, joined]];
    case "label":
      return [
        [
          key,
          "." +
            (explode
              ? (assignments?.join(".") ??
                items?.map(stringify).join(".") ??
                joined)
              : joined),
        ],
      ];
    case "matrix": {
      const expanded =
        assignments ?? items?.map((item) => `${key}=${stringify(item)}`);
      return [
        [
          key,
          ";" + (explode && expanded ? expanded.join(";") : `${key}=${joined}`),
        ],
      ];
    }
    case "deepObject":
      if (fields)
        return fields.map(([field, item]) => [
          `${key}[${encodeField(field)}]`,
          stringify(item),
        ]);
      break;
    case "spaceDelimited":
    case "pipeDelimited":
      if (positional && !explode) {
        return [
          [
            key,
            positional
              .map(stringify)
              .join(style === "spaceDelimited" ? "%20" : "|"),
          ],
        ];
      }
      break;
  }
  throw new TypeError(
    `Unsupported OpenAPI serialization for ${location} parameter "${name}": ${style}`,
  );
}

function isJson(mediaType: string): boolean {
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

const formMediaType = "application/x-www-form-urlencoded";

function queryJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("Expected a JSON query value");
  return json;
}

function serializeWholeQuery(
  { mediaType, encoding }: WholeQuery,
  value: unknown,
): string {
  if (isJson(mediaType)) return encode(queryJson(value));
  const fields = pairs(value);
  if (mediaType !== formMediaType || fields === undefined) {
    throw new TypeError(`Unsupported whole-query value for ${mediaType}`);
  }

  const parts: [string, string][] = [];
  for (const [name, field] of fields) {
    if (field === undefined) continue;
    const rules = encoding && inputValue(encoding, name);
    if (
      rules?.style !== undefined ||
      rules?.explode !== undefined ||
      rules?.allowReserved !== undefined
    ) {
      const style = rules.style ?? "form";
      parts.push(
        ...serialize(
          {
            name,
            location: "query",
            required: false,
            style,
            explode: rules.explode ?? style === "form",
          },
          field,
          formEncode,
          rules.allowReserved
            ? (text) => encodeQueryValue(text, true).replaceAll("%20", "+")
            : formEncode,
        ),
      );
      continue;
    }

    const key = formEncode(name);
    const items = Array.isArray(field) ? field : [field];
    const contentType = rules?.contentType?.toLowerCase();
    for (const item of items) {
      const json =
        contentType === undefined
          ? item !== null && typeof item === "object"
          : isJson(contentType);
      parts.push([key, formEncode(json ? queryJson(item) : scalar(item))]);
    }
  }
  return parts.map(([key, field]) => `${key}=${field}`).join("&");
}

function isStreamable(mediaType: string): boolean {
  return !isJson(mediaType) && !mediaType.startsWith("text/");
}

function canStream(operation: FetchOperation): boolean {
  return Object.values(operation.responses).some((media) =>
    media.some(isStreamable),
  );
}

function mediaTypeOf(value: string | null): string | undefined {
  return value?.split(";", 1)[0]?.trim().toLowerCase();
}

function encodeSwaggerForm(
  mediaType: string,
  fields: readonly SwaggerFormField[],
  value: unknown,
) {
  const form =
    mediaType === formMediaType ? new URLSearchParams() : new FormData();
  if (
    (form instanceof FormData && value instanceof FormData) ||
    (form instanceof URLSearchParams && value instanceof URLSearchParams)
  ) {
    for (const field of fields) {
      if (field.required && !value.has(field.name)) {
        throw new TypeError(
          `Missing required Swagger form field "${field.name}"`,
        );
      }
    }
    return value;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected a Swagger form body");
  }
  for (const { name, required, file, collectionFormat } of fields) {
    const input = inputValue(value as Values, name);
    if (input === undefined) {
      if (required)
        throw new TypeError(`Missing required Swagger form field "${name}"`);
      continue;
    }
    if (file) {
      if (!(form instanceof FormData) || !(input instanceof Blob)) {
        throw new TypeError(`Expected a file for Swagger form field "${name}"`);
      }
      form.append(name, input);
      continue;
    }
    const items =
      collectionFormat && Array.isArray(input)
        ? collectionItems(input, collectionFormat, scalar)
        : [scalar(input)];
    for (const item of items) form.append(name, item);
  }
  return form;
}

function encodeBody(mediaType: string, value: unknown): RequestInit["body"] {
  if (isJson(mediaType)) {
    const json = JSON.stringify(value);
    if (json !== undefined) return json;
  }
  if (mediaType.startsWith("text/") && typeof value === "string") return value;
  if (
    mediaType === "application/octet-stream" &&
    (value instanceof Blob || value instanceof ArrayBuffer)
  ) {
    return value;
  }
  if (mediaType === "multipart/form-data" && value instanceof FormData)
    return value;
  if (
    mediaType === "application/x-www-form-urlencoded" &&
    value instanceof URLSearchParams
  )
    return value;
  throw new TypeError(`Unsupported request body for ${mediaType}`);
}

type InvalidResponseReason =
  | "undocumented-status"
  | "unexpected-media-type"
  | "unexpected-body"
  | "missing-body"
  | "malformed-json"
  | "schema-mismatch";

/** A Fetch response whose status, media type, or body did not match the contract. */
export class InvalidResponseError extends Error {
  public readonly status: number;
  public readonly mediaType: string | undefined;

  public constructor(
    public readonly reason: InvalidResponseReason,
    public readonly response: Response,
    public readonly matchedStatus: string | undefined,
    public readonly body: unknown = undefined,
  ) {
    super(
      `Invalid HTTP response ${response.status}: ${reason.replaceAll("-", " ")}`,
    );
    this.name = "InvalidResponseError";
    this.status = response.status;
    this.mediaType = mediaTypeOf(response.headers.get("content-type"));
  }
}

async function readResponse(
  response: Response,
  method: string,
  operation: FetchOperation,
  validators: ResponseValidators,
  stream: boolean,
) {
  const { status } = response;
  const mediaType = mediaTypeOf(response.headers.get("content-type"));
  const match = [
    String(status),
    `${Math.floor(status / 100)}XX`,
    "default",
  ].find((candidate) => Object.hasOwn(operation.responses, candidate));
  if (match === undefined) {
    throw new InvalidResponseError("undocumented-status", response, undefined);
  }
  // eslint-disable-next-line security/detect-object-injection -- match is an own response key selected above.
  const declared = operation.responses[match]!;
  const responseBody = response.body;
  const emptyBody =
    method === "head" ||
    [204, 205, 304].includes(status) ||
    responseBody === null;

  if (declared.length === 0) {
    const bytes = emptyBody ? undefined : await response.clone().arrayBuffer();
    if (bytes?.byteLength) {
      throw new InvalidResponseError("unexpected-body", response, match, bytes);
    }
    return {
      matchedStatus: match,
      status,
      mediaType: undefined,
      body: undefined,
      response,
    };
  }

  if (emptyBody) {
    throw new InvalidResponseError("missing-body", response, match);
  }
  if (mediaType === undefined || !declared.includes(mediaType)) {
    throw new InvalidResponseError("unexpected-media-type", response, match);
  }

  if (stream && isStreamable(mediaType)) {
    return {
      matchedStatus: match,
      status,
      mediaType,
      body: responseBody,
      response,
    };
  }

  const content = response.clone();
  let body: unknown;
  if (isJson(mediaType)) {
    const text = await content.text();
    try {
      body = JSON.parse(text);
    } catch {
      throw new InvalidResponseError("malformed-json", response, match, text);
    }
  } else if (mediaType.startsWith("text/")) {
    body = await content.text();
  } else {
    body = await content.arrayBuffer();
  }

  // eslint-disable-next-line security/detect-object-injection -- the status and media type were matched against declared values above.
  const schema = operation.responseSchemas?.[match]?.[mediaType];
  if (schema !== undefined) {
    const validate = Object.hasOwn(validators, schema)
      ? // eslint-disable-next-line security/detect-object-injection -- validator names come from the generated operation metadata.
        validators[schema]
      : undefined;
    if (validate?.(body) !== true) {
      throw new InvalidResponseError("schema-mismatch", response, match, body);
    }
  }
  return { matchedStatus: match, status, mediaType, body, response };
}

function inputValue<Value>(
  values: Readonly<Record<string, Value>>,
  name: string,
): Value | undefined {
  // eslint-disable-next-line security/detect-object-injection -- names come from OpenAPI and only own properties count as supplied inputs.
  return Object.hasOwn(values, name) ? values[name] : undefined;
}

function isReady(operation: FetchOperation, inputs: Inputs): boolean {
  return (
    (!operation.body?.required || inputs.body !== undefined) &&
    (!operation.querystring?.required || inputs.querystring !== undefined) &&
    operation.parameters.every(
      ({ location, name, required }) =>
        // eslint-disable-next-line security/detect-object-injection -- location is a typed parameter location and only selects a request input map.
        !required || inputValue(inputs[location], name) !== undefined,
    )
  );
}

function buildRequest(
  options: FetchClientOptions,
  routePath: string,
  method: string,
  operation: FetchOperation,
  inputs: Inputs,
  sendOptions: ClientSendOptions | undefined,
): [URL, RequestInit & { headers: Headers }] {
  const headers = new Headers(options.headers);
  const query: string[] = [];
  const cookies: string[] = [];
  let path = routePath;
  for (const parameter of operation.parameters) {
    const value = inputValue(inputs[parameter.location], parameter.name);
    if (value === undefined) continue;
    for (const [key, serialized] of serialize(parameter, value)) {
      switch (parameter.location) {
        case "path":
          path = path.replaceAll(`{${parameter.name}}`, () => serialized);
          break;
        case "query":
          query.push(`${key}=${serialized}`);
          break;
        case "headers":
          headers.set(key, serialized);
          break;
        case "cookies":
          cookies.push(`${key}=${serialized}`);
          break;
      }
    }
  }
  if (cookies.length > 0) {
    headers.set(
      "cookie",
      [headers.get("cookie"), ...cookies].filter(Boolean).join("; "),
    );
  }
  if (
    /[{}]/u.test(path) ||
    path.split("/").some((part) => /^(?:\.|%2e){1,2}$/iu.test(part))
  ) {
    throw new TypeError(
      `Cannot send an unresolved or dot-segment path: ${path}`,
    );
  }

  const url = new URL(options.baseUrl);
  url.pathname = url.pathname.replace(/\/$/u, "") + path;
  if (operation.querystring) {
    url.search =
      inputs.querystring === undefined
        ? ""
        : serializeWholeQuery(operation.querystring, inputs.querystring);
  } else if (query.length > 0) {
    url.search = [url.search.slice(1), ...query].filter(Boolean).join("&");
  }

  let body: RequestInit["body"];
  if (inputs.body !== undefined && operation.body) {
    const { mediaType, formFields } = operation.body;
    body = formFields
      ? encodeSwaggerForm(mediaType, formFields, inputs.body)
      : encodeBody(mediaType, inputs.body);
    if (mediaType === "multipart/form-data") headers.delete("content-type");
    else headers.set("content-type", mediaType);
  }
  return [
    url,
    {
      method: method.toUpperCase(),
      headers,
      body,
      signal: sendOptions?.signal,
      credentials: sendOptions?.credentials ?? options.credentials,
      redirect: sendOptions?.redirect,
    },
  ];
}

function createSendRequest(
  options: FetchClientOptions,
  validators: ResponseValidators,
  securitySchemes: Readonly<Record<string, ClientSecurityScheme>>,
) {
  const fetchRequest = options.fetch ?? globalThis.fetch.bind(globalThis);

  return async function sendRequest(
    path: string,
    method: string,
    operation: FetchOperation,
    inputs: Inputs,
    sendOptions?: ClientSendOptions,
    stream = false,
  ) {
    const [url, init] = buildRequest(
      options,
      path,
      method,
      operation,
      inputs,
      sendOptions,
    );
    if (operation.security || sendOptions?.authenticate !== undefined) {
      await applyAuthentication(
        url,
        init,
        operation.security ?? [],
        securitySchemes,
        options.auth ?? {},
        sendOptions,
        !operation.querystring ||
          operation.querystring.mediaType === formMediaType,
      );
    }
    return readResponse(
      await fetchRequest(url, init),
      method,
      operation,
      validators,
      stream,
    );
  };
}

/** Creates a browser-compatible route function from generated operation metadata. */
export function createFetchRoute<Operations extends ClientOperations>(
  operations: FetchOperations<Operations>,
  options: FetchClientOptions,
  validators: ResponseValidators = {},
  securitySchemes: Readonly<Record<string, ClientSecurityScheme>> = {},
): ClientRouteFunction<Operations> {
  const routes = new Map(
    Object.entries<Record<string, FetchOperation>>(operations).map(
      ([path, methods]) => [path, new Map(Object.entries(methods))],
    ),
  );
  const prefixes = new Set<string>(["/"]);
  for (const path of routes.keys()) {
    const segments = path.split("/");
    for (let i = 2; i <= segments.length; i++)
      prefixes.add(segments.slice(0, i).join("/"));
  }
  const sendRequest = createSendRequest(options, validators, securitySchemes);

  function request(
    path: string,
    method: string,
    operation: FetchOperation,
    inputs: Inputs,
  ): object {
    const next = (location: Location, values: Values) =>
      request(path, method, operation, {
        ...inputs,
        // eslint-disable-next-line security/detect-object-injection -- location comes from the fixed setters below.
        [location]: { ...inputs[location], ...values },
      });
    return {
      path: (values: Values) => next("path", values),
      query: operation.querystring
        ? (querystring: unknown) =>
            request(path, method, operation, { ...inputs, querystring })
        : (values: Values) => next("query", values),
      headers: (values: Values) => next("headers", values),
      cookies: (values: Values) => next("cookies", values),
      body: (body: unknown) =>
        request(path, method, operation, { ...inputs, body }),
      ...(isReady(operation, inputs) && {
        send: (sendOptions?: ClientSendOptions) =>
          sendRequest(path, method, operation, inputs, sendOptions),
        ...(canStream(operation) && {
          stream: (sendOptions?: ClientSendOptions) =>
            sendRequest(path, method, operation, inputs, sendOptions, true),
        }),
      }),
    };
  }

  function branch(path: string, bound: Values): object {
    if (!prefixes.has(path))
      throw new TypeError(`Unknown OpenAPI path: ${path}`);
    return {
      path: (values: Values) => branch(path, { ...bound, ...values }),
      segment: (fragment: string) =>
        branch(`${path === "/" ? "" : path}/${fragment}`, bound),
      method(method: string) {
        const operation = routes.get(path)?.get(method);
        if (!operation)
          throw new TypeError(`Unknown OpenAPI operation: ${method} ${path}`);
        return request(path, method, operation, { ...empty, path: bound });
      },
    };
  }

  return ((path: string) =>
    branch(path, {})) as ClientRouteFunction<Operations>;
}

export interface NamedOperation {
  readonly path: string;
  readonly method: string;
  readonly pathParameters: readonly string[];
}

export type NamedOperations = Readonly<
  Record<string, Readonly<Record<string, NamedOperation>>>
>;

type EmptyFields = Record<never, never>;

type RequiredKeys<Fields> = {
  [Key in keyof Fields]-?: EmptyFields extends Pick<Fields, Key> ? never : Key;
}[keyof Fields];

type NamedField<Name extends string, Value> = [keyof Value] extends [never]
  ? object
  : [RequiredKeys<Value>] extends [never]
    ? { [Key in Name]?: Value }
    : { [Key in Name]: Value };

type NamedRequest<Operation extends ClientOperation> = ClientSendOptions &
  (Operation["querystring"] extends {
    value: infer Value;
    required: infer Required;
  }
    ? Required extends true
      ? { query: Value }
      : { query?: Value }
    : NamedField<"query", Operation["query"]>) &
  NamedField<"headers", Operation["headers"]> &
  NamedField<"cookies", Operation["cookies"]> &
  (Operation["bodyRequired"] extends true
    ? { body: Operation["body"] }
    : [Operation["body"]] extends [never]
      ? object
      : { body?: Operation["body"] });

type NamedArguments<
  Operation extends ClientOperation,
  Parameters extends readonly string[],
  Options = NamedRequest<Operation>,
> = [
  ...{
    [Index in keyof Parameters]: Operation["path"][Parameters[Index] &
      keyof Operation["path"]];
  },
  ...(EmptyFields extends Options ? [options?: Options] : [options: Options]),
];

type NamedMethod<
  Operations extends ClientOperations,
  Entry extends NamedOperation,
> = Entry["path"] extends keyof Operations
  ? Entry["method"] extends keyof Operations[Entry["path"]]
    ? NamedCall<
        Operations[Entry["path"]][Entry["method"]],
        Entry["pathParameters"]
      >
    : never
  : never;

type NamedCall<
  Operation extends ClientOperation,
  Parameters extends readonly string[],
> = ((
  ...args: NamedArguments<Operation, Parameters>
) => Promise<ClientResult<Operation>>) &
  ([Streamable<ClientResult<Operation>>] extends [never]
    ? object
    : {
        stream(
          ...args: NamedArguments<Operation, Parameters>
        ): Promise<ClientStreamResult<Operation>>;
      });

type NamedSdk<
  Operations extends ClientOperations,
  Names extends NamedOperations,
> = {
  [Group in keyof Names]: {
    [Name in keyof Names[Group]]: NamedMethod<Operations, Names[Group][Name]>;
  };
};

type RawNamedRequest = ClientSendOptions & {
  query?: unknown;
  headers?: Values;
  cookies?: Values;
  body?: unknown;
};

/** Creates grouped, named methods that use the same contract as the fluent client. */
export function createFetchSdk<
  Operations extends ClientOperations,
  Names extends NamedOperations,
>(
  operations: FetchOperations<Operations>,
  names: Names,
  options: FetchClientOptions,
  validators: ResponseValidators = {},
  securitySchemes: Readonly<Record<string, ClientSecurityScheme>> = {},
): NamedSdk<Operations, Names> {
  const sendRequest = createSendRequest(options, validators, securitySchemes);
  const metadata: Readonly<
    Record<string, Readonly<Record<string, FetchOperation>>>
  > = operations;

  return Object.fromEntries(
    Object.entries(names).map(([group, methods]) => [
      group,
      Object.fromEntries(
        Object.entries(methods).map(
          ([name, { path, method, pathParameters }]) => {
            const operation = inputValue(
              inputValue(metadata, path) ?? {},
              method,
            );
            if (!operation)
              throw new TypeError(
                `Unknown OpenAPI operation: ${method} ${path}`,
              );
            const invoke =
              (stream: boolean) =>
              async (...args: unknown[]) => {
                const request = args.at(pathParameters.length) as
                  RawNamedRequest | undefined;
                const inputs: Inputs = {
                  ...empty,
                  path: Object.fromEntries(
                    pathParameters.map((key, index) => [key, args.at(index)]),
                  ),
                  headers: request?.headers ?? empty.headers,
                  cookies: request?.cookies ?? empty.cookies,
                  query: operation.querystring
                    ? empty.query
                    : ((request?.query as Values | undefined) ?? empty.query),
                  querystring: operation.querystring
                    ? request?.query
                    : undefined,
                  body: request?.body,
                };
                if (!isReady(operation, inputs)) {
                  throw new TypeError(
                    `Missing required inputs for OpenAPI operation: ${method} ${path}`,
                  );
                }
                return sendRequest(
                  path,
                  method,
                  operation,
                  inputs,
                  request,
                  stream,
                );
              };
            const send = invoke(false);
            return [
              name,
              canStream(operation)
                ? Object.assign(send, { stream: invoke(true) })
                : send,
            ];
          },
        ),
      ),
    ]),
  ) as NamedSdk<Operations, Names>;
}

/** Operation definitions attached to a generated SDK factory for adapters. */
export interface FetchSdkDefinition<
  Operations extends ClientOperations = ClientOperations,
  Names extends NamedOperations = NamedOperations,
> {
  readonly operations: FetchOperations<Operations>;
  readonly names: Names;
  readonly baseUrl: string;
  /** Carries the generated operation types without emitting schema values. */
  readonly contracts?: Operations;
}

/** Binds the generated contract and naming metadata to its public SDK factory. */
export function defineFetchSdk<
  Operations extends ClientOperations,
  Names extends NamedOperations,
  AdapterNames extends NamedOperations,
  Auth extends Readonly<Record<string, CredentialProvider | undefined>>,
  Default extends string | undefined = undefined,
>(
  definition: FetchSdkDefinition<Operations, AdapterNames> & {
    nativeBaseUrl?: Default;
  },
  names: Names,
  validators: ResponseValidators,
  securitySchemes: Readonly<Record<string, ClientSecurityScheme>> = {},
) {
  type Options = Default extends string
    ? [options?: FetchClientOptionsWithDefault<Auth>]
    : [options: FetchClientOptions<Auth>];
  return Object.assign(
    (...[options]: Options) => {
      const baseUrl = options?.baseUrl ?? definition.nativeBaseUrl;
      if (baseUrl === undefined) throw new TypeError("Missing API baseUrl");
      return createFetchSdk<Operations, Names>(
        definition.operations,
        names,
        { ...options, baseUrl },
        validators,
        securitySchemes,
      );
    },
    { definition },
  );
}
