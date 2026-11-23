import type {
  ClientOperations,
  ClientRouteFunction,
  ClientSendOptions,
  ClientSecurityScheme,
} from "@counterfact/types/client-route";

import {
  applyAuthentication,
  type CredentialProvider,
  type SecurityRequirement,
} from "./fetch-auth.js";

export { RequestAuthenticationError } from "./fetch-auth.js";
export type { CookieCredential, CredentialProvider } from "./fetch-auth.js";

export type {
  ClientOperations,
  ClientResult,
  ClientRouteFunction,
} from "@counterfact/types/client-route";

type ResponseValidators = Readonly<Record<string, (body: unknown) => boolean>>;

type Location = "path" | "query" | "headers" | "cookies";

export interface FetchParameter {
  name: string;
  location: Location;
  required: boolean;
  style: string;
  explode: boolean;
  allowReserved?: boolean;
  contentType?: string;
}

export interface FetchOperation {
  parameters: readonly FetchParameter[];
  body?: { required: boolean; mediaType: string };
  responses: Readonly<Record<string, readonly string[]>>;
  security?: readonly SecurityRequirement[];
  responseSchemas?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

type FetchOperations<Operations extends ClientOperations> = {
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

type Values = Readonly<Record<string, unknown>>;
type Inputs = Record<Location, Values> & { body: unknown };
const empty: Inputs = {
  path: {},
  query: {},
  headers: {},
  cookies: {},
  body: undefined,
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

function serialize(
  parameter: FetchParameter,
  value: unknown,
): [string, string][] {
  const { name, location, style, explode } = parameter;
  const encodeValue =
    location === "headers"
      ? (text: string) => text
      : (text: string) =>
          encodeQueryValue(
            text,
            location === "query" && parameter.allowReserved,
          );
  const key = location === "headers" ? name : encode(name);
  const stringify = (item: unknown) => encodeValue(scalar(item));

  if (parameter.contentType !== undefined) {
    if (!isJson(parameter.contentType)) {
      throw new TypeError(
        `Unsupported parameter content type: ${parameter.contentType}`,
      );
    }
    return [[key, encodeValue(JSON.stringify(value))]];
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
          `${key}[${encode(field)}]`,
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

function mediaTypeOf(value: string | null): string | undefined {
  return value?.split(";", 1)[0]?.trim().toLowerCase();
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
  const emptyBody =
    method === "head" ||
    [204, 205, 304].includes(status) ||
    response.body === null;

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

function inputValue(values: Values, name: string): unknown {
  // eslint-disable-next-line security/detect-object-injection -- names come from OpenAPI and only own properties count as supplied inputs.
  return Object.hasOwn(values, name) ? values[name] : undefined;
}

function isReady(operation: FetchOperation, inputs: Inputs): boolean {
  return (
    (!operation.body?.required || inputs.body !== undefined) &&
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
  if (query.length > 0) {
    url.search = [url.search.slice(1), ...query].filter(Boolean).join("&");
  }

  let body: RequestInit["body"];
  if (inputs.body !== undefined && operation.body) {
    const { mediaType } = operation.body;
    body = encodeBody(mediaType, inputs.body);
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
  const fetchRequest = options.fetch ?? globalThis.fetch.bind(globalThis);

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
      query: (values: Values) => next("query", values),
      headers: (values: Values) => next("headers", values),
      cookies: (values: Values) => next("cookies", values),
      body: (body: unknown) =>
        request(path, method, operation, { ...inputs, body }),
      ...(isReady(operation, inputs) && {
        async send(sendOptions?: ClientSendOptions) {
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
            );
          }
          return readResponse(
            await fetchRequest(url, init),
            method,
            operation,
            validators,
          );
        },
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

  // The generated types refine the runtime builder according to the same operation metadata.
  return ((path: string) =>
    branch(path, {})) as ClientRouteFunction<Operations>;
}
