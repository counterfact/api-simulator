import { operationMethodsForPath } from "./path-operations.js";
import { RESERVED_WORDS } from "./reserved-words.js";
import type { Requirement } from "./requirement.js";
import type { Specification } from "./specification.js";

/** Options that control how generated client operations are grouped. */
export interface ClientGroupingOptions {
  /** Group operations by their first tag instead of a path segment. */
  moduleNameFirstTag?: boolean;
  /** Path segment used to group operations (default `0`). */
  moduleNameIndex?: number;
  /** Appended to every module class name, e.g. `Client` for `UsersClient`. */
  moduleClassSuffix?: string;
}

type ParameterData = Record<string, unknown> & { in: string; name: string };

/** `ContentType` enum member used to serialize a request body. */
export type ClientContentType =
  "FormData" | "Json" | "JsonApi" | "Text" | "UrlEncoded";

/** How the HTTP client should read a successful response body. */
export type ClientResponseFormat = "blob" | "json" | "text";

/** One OpenAPI operation, described the way the client generator needs it. */
export interface ClientOperation {
  /** Request body, when the operation declares one. */
  body?: {
    contentType?: ClientContentType;
    required: boolean;
    /**
     * Whether the generated route types describe this body. They do only for
     * the media types the mock server parses.
     */
    routeTyped: boolean;
  };
  deprecated: boolean;
  description?: string;
  format?: ClientResponseFormat;
  /** Lower-case HTTP method. */
  method: string;
  /** Unique method name within its module. */
  name: string;
  /** OpenAPI path key, as written in the document. */
  path: string;
  /** Path parameters in the order they appear in the path template. */
  pathParameters: Array<{ name: string; declared: boolean }>;
  /** Query parameters, when the operation declares any. */
  query?: { required: boolean };
  /** The resolved path item and operation the description came from. */
  requirements: { operation: Requirement; pathItem: Requirement };
  secure: boolean;
  summary?: string;
  tags: string[];
}

/** A generated client class and the operations it exposes. */
export interface ClientModule {
  /** Class and file name, in PascalCase. */
  name: string;
  operations: ClientOperation[];
}

/** Names that generated module classes must not use. */
export const RESERVED_MODULE_NAMES = new Set([
  "ApiConfig",
  "CancelToken",
  "ContentType",
  "FullRequestParams",
  "HttpClient",
  "HttpProvider",
  "HttpResponse",
  "Index",
  "MultipartBody",
  "MultipartField",
  "OperationBody",
  "OperationData",
  "OperationError",
  "OperationPath",
  "OperationQuery",
  "QueryParamsType",
  "RequestParams",
  "ResponseFormat",
  "Routes",
  "Schemas",
]);

/** TypeScript's predefined type names, which a class cannot use. */
const PREDEFINED_TYPE_NAMES = new Set([
  "any",
  "bigint",
  "boolean",
  "never",
  "number",
  "object",
  "string",
  "symbol",
  "undefined",
  "unknown",
]);

/** Whether `name` can name a generated class. */
export function isClassName(name: string): boolean {
  return (
    /^[A-Z_$a-z][\w$]*$/u.test(name) &&
    !RESERVED_WORDS.has(name) &&
    !PREDEFINED_TYPE_NAMES.has(name)
  );
}

/** Members of every generated module class that operations must not shadow. */
const RESERVED_MEMBER_NAMES = new Set(["constructor", "http"]);

/** `application/json`, or a structured `+json` type such as `application/problem+json`. */
function isJsonMediaType(mediaType: string): boolean {
  const essence = mediaType.split(";")[0]!.trim().toLowerCase();
  return (
    essence === "application/json" ||
    (essence.startsWith("application/") && essence.endsWith("+json"))
  );
}

function resolve(requirement: Requirement): Requirement {
  let resolved = requirement;
  while (resolved.isReference) resolved = resolved.reference();
  return resolved;
}

function words(value: string): string[] {
  return value
    .replaceAll(/(?<lower>[a-z\d])(?<upper>[A-Z])/gu, "$<lower> $<upper>")
    .split(/[^A-Za-z\d]+/u)
    .filter(Boolean);
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function safeIdentifier(name: string, fallback: string): string {
  if (name === "") return fallback;
  if (/^\d/u.test(name)) return `_${name}`;
  return RESERVED_WORDS.has(name) ? `${name}_` : name;
}

/** Converts arbitrary text such as `list_users` to `listUsers`. */
export function camelCase(value: string, fallback = "_"): string {
  const [first = "", ...rest] = words(value);
  return safeIdentifier(
    first.charAt(0).toLowerCase() +
      first.slice(1) +
      rest.map(capitalize).join(""),
    fallback,
  );
}

/** Converts arbitrary text such as `explodable-parameters` to `ExplodableParameters`. */
export function pascalCase(value: string, fallback = "_"): string {
  return safeIdentifier(words(value).map(capitalize).join(""), fallback);
}

/** Reserves `name`, appending a counter when it is already taken. */
export function uniqueName(name: string, taken: Set<string>): string {
  let candidate = name;
  for (let index = 2; taken.has(candidate.toLowerCase()); index += 1) {
    candidate = `${name}${index}`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

function isPathParameterSegment(segment: string): boolean {
  return /^\{[^}]+\}$/u.test(segment);
}

/**
 * Names an operation that has no `operationId` from its path and method,
 * for example `GET /pets` → `petsList` and `GET /pets/{id}` → `petsDetail`.
 */
function fallbackOperationName(path: string, method: string): string {
  const segments = path.split("/").filter(Boolean);
  const base = camelCase(
    segments.filter((segment) => !isPathParameterSegment(segment)).join(" "),
    "root",
  );
  const endsWithParameter = isPathParameterSegment(segments.at(-1) ?? "");
  const suffixes: Record<string, string> = {
    delete: "Delete",
    get: endsWithParameter ? "Detail" : "List",
    patch: "PartialUpdate",
    post: "Create",
    put: "Update",
  };

  // eslint-disable-next-line security/detect-object-injection -- method is an OpenAPI operation key; unknown methods fall back below.
  return `${base}${suffixes[method] ?? pascalCase(method)}`;
}

function moduleNameFor(
  path: string,
  tags: readonly string[],
  options: ClientGroupingOptions,
): string {
  const tag = tags[0];

  if (options.moduleNameFirstTag && tag !== undefined) {
    const name = pascalCase(tag, "");
    if (name !== "") return name;
  }

  const segment = path.split("/").filter(Boolean)[options.moduleNameIndex ?? 0];

  return segment === undefined
    ? "Root"
    : pascalCase(segment.replaceAll(/[{}]/gu, ""), "Root");
}

function mergedParameters(
  pathItem: Requirement,
  operation: Requirement,
): ParameterData[] {
  const byLocation = new Map<string, ParameterData>();

  for (const parameters of [
    pathItem.get("parameters"),
    operation.get("parameters"),
  ]) {
    parameters?.forEach((parameter) => {
      const data = resolve(parameter).data as ParameterData;
      byLocation.set(`${data.in}:${data.name}`, data);
    });
  }

  return [...byLocation.values()];
}

function contentTypeFor(
  mediaTypes: readonly string[],
): ClientContentType | undefined {
  const normalized = mediaTypes.map((mediaType) => mediaType.toLowerCase());

  if (
    normalized.some((mediaType) =>
      mediaType.startsWith("application/vnd.api+json"),
    )
  ) {
    return "JsonApi";
  }
  if (normalized.some(isJsonMediaType)) {
    return "Json";
  }
  if (
    normalized.some((mediaType) => mediaType.startsWith("multipart/form-data"))
  ) {
    return "FormData";
  }
  if (
    normalized.some((mediaType) =>
      mediaType.startsWith("application/x-www-form-urlencoded"),
    )
  ) {
    return "UrlEncoded";
  }
  if (normalized.some((mediaType) => mediaType.startsWith("text/plain"))) {
    return "Text";
  }

  return undefined;
}

function formatFor(
  mediaTypes: readonly string[],
): ClientResponseFormat | undefined {
  if (mediaTypes.length === 0) return undefined;
  if (mediaTypes.some(isJsonMediaType)) {
    return "json";
  }
  if (
    mediaTypes.some((mediaType) => mediaType.toLowerCase().startsWith("text/"))
  ) {
    return "text";
  }
  return "blob";
}

function stringList(requirement: Requirement | undefined): string[] {
  const data = requirement?.data as unknown;
  return Array.isArray(data)
    ? data.filter((item): item is string => typeof item === "string")
    : [];
}

function hasSecurity(requirement: Requirement | undefined): boolean {
  const data = requirement?.data as unknown;
  return (
    Array.isArray(data) &&
    data.some(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        Object.keys(entry).length > 0,
    )
  );
}

function successResponses(operation: Requirement): Requirement[] {
  return (
    operation
      .get("responses")
      ?.flatMap((response, status) =>
        /^2(?:\d\d|XX)$/iu.test(status) ? [resolve(response)] : [],
      ) ?? []
  );
}

/** The request body media types that the generated route types describe. */
const ROUTE_BODY_MEDIA_TYPES = [
  "application/json",
  "application/x-www-form-urlencoded",
  "multipart/form-data",
];

function describeBody(
  specification: Specification,
  operation: Requirement,
  parameters: readonly ParameterData[],
): ClientOperation["body"] {
  const requestBody = operation.get("requestBody");

  if (requestBody !== undefined) {
    const resolved = resolve(requestBody);
    const content = resolved.get("content");
    return {
      contentType: contentTypeFor(
        content?.map((_, mediaType) => mediaType) ?? [],
      ),
      required: resolved.get("required")?.data === true,
      routeTyped: ROUTE_BODY_MEDIA_TYPES.some(
        (mediaType) => content?.get(mediaType)?.has("schema") === true,
      ),
    };
  }

  // Swagger 2.0 declares bodies as parameters.
  const consumes = operation.has("consumes")
    ? stringList(operation.get("consumes"))
    : stringList(specification.getRequirement("#/consumes"));
  // Route types describe the first body or form parameter's schema, and only
  // when the document declares `consumes`.
  const routeTyped =
    (operation.has("consumes") ||
      specification.getRequirement("#/consumes") !== undefined) &&
    parameters.find((parameter) =>
      ["body", "formData"].includes(parameter.in),
    )?.["schema"] !== undefined;

  const bodyParameters = parameters.filter(
    (parameter) => parameter.in === "body",
  );
  const formParameters = parameters.filter(
    (parameter) => parameter.in === "formData",
  );
  const required = (list: readonly ParameterData[]) =>
    list.some((parameter) => parameter["required"] === true);

  if (bodyParameters.length > 0) {
    return {
      contentType: consumes.length === 0 ? "Json" : contentTypeFor(consumes),
      required: required(bodyParameters),
      routeTyped,
    };
  }

  if (formParameters.length > 0) {
    return {
      contentType: consumes.some((mediaType) =>
        mediaType.toLowerCase().startsWith("multipart/form-data"),
      )
        ? "FormData"
        : "UrlEncoded",
      required: required(formParameters),
      routeTyped,
    };
  }

  return undefined;
}

function describeFormat(
  specification: Specification,
  operation: Requirement,
): ClientResponseFormat | undefined {
  const responses = successResponses(operation);
  const mediaTypes = responses.flatMap(
    (response) =>
      response.get("content")?.map((_, mediaType) => mediaType) ?? [],
  );

  if (mediaTypes.length > 0) return formatFor(mediaTypes);

  // Swagger 2.0 declares a response schema plus document-level `produces`.
  if (!responses.some((response) => response.has("schema"))) return undefined;

  const produces = operation.has("produces")
    ? stringList(operation.get("produces"))
    : stringList(specification.getRequirement("#/produces"));

  return produces.length === 0 ? "json" : formatFor(produces);
}

/**
 * Reads every operation in `specification` and groups them into client
 * modules, named and ordered deterministically.
 */
export function collectClientModules(
  specification: Specification,
  options: ClientGroupingOptions = {},
): ClientModule[] {
  const modules = new Map<string, ClientModule>();
  const takenNames = new Map<string, Set<string>>();
  const paths = specification.getRequirement("#/paths");
  const documentSecure = hasSecurity(
    specification.getRequirement("#/security"),
  );

  paths?.forEach((pathDefinition, path) => {
    const pathItem = resolve(pathDefinition);

    for (const [operation, method] of operationMethodsForPath(pathDefinition)) {
      const parameters = mergedParameters(pathItem, operation);
      const tags = stringList(operation.get("tags"));
      const operationId = operation.get("operationId")?.data;
      let moduleName = `${moduleNameFor(path, tags, options)}${options.moduleClassSuffix ?? ""}`;

      if (RESERVED_MODULE_NAMES.has(moduleName))
        moduleName = `${moduleName}Module`;

      // Module names become file names, which are case-insensitive on some
      // file systems, so `/CompanyAccounts` and `/companyaccounts` share a
      // module named after whichever comes first.
      const moduleKey = moduleName.toLowerCase();
      const module = modules.get(moduleKey) ?? {
        name: moduleName,
        operations: [],
      };
      modules.set(moduleKey, module);

      const taken =
        takenNames.get(moduleKey) ??
        new Set([...RESERVED_MEMBER_NAMES].map((name) => name.toLowerCase()));
      takenNames.set(moduleKey, taken);

      const queryParameters = parameters.filter(
        (parameter) => parameter.in === "query",
      );
      const pathParameterNames = [...path.matchAll(/\{(?<name>[^}]+)\}/gu)].map(
        (match) => match.groups!["name"]!,
      );

      module.operations.push({
        body: describeBody(specification, operation, parameters),
        deprecated: operation.get("deprecated")?.data === true,
        description: operation.get("description")?.data as string | undefined,
        format: describeFormat(specification, operation),
        method,
        name: uniqueName(
          typeof operationId === "string" && camelCase(operationId, "") !== ""
            ? camelCase(operationId)
            : fallbackOperationName(path, method),
          taken,
        ),
        path,
        requirements: { operation, pathItem },
        pathParameters: pathParameterNames.map((name) => ({
          name,
          declared: parameters.some(
            (parameter) => parameter.in === "path" && parameter.name === name,
          ),
        })),
        query:
          queryParameters.length === 0
            ? undefined
            : {
                required: queryParameters.some(
                  (parameter) => parameter["required"] === true,
                ),
              },
        secure: operation.has("security")
          ? hasSecurity(operation.get("security"))
          : documentSecure,
        summary: operation.get("summary")?.data as string | undefined,
        tags,
      });
    }
  });

  return [...modules.values()];
}
