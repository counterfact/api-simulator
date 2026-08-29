import { randomBytes } from "node:crypto";

import { RawHttpClient } from "./raw-http-client.js";
import type { RouteCatalog, RouteOperation } from "./route-catalog.js";

export type RouteParams = Record<string, boolean | number | string>;

export interface MissingParam {
  description?: string;
  name: string;
  type?: string;
}

export interface MissingParams {
  body?: MissingParam[];
  cookie?: MissingParam[];
  formData?: MissingParam[];
  header?: MissingParam[];
  path?: MissingParam[];
  query?: MissingParam[];
}

export interface RouteBuilderOptions {
  body?: unknown;
  cookieParams?: RouteParams;
  formParams?: RouteParams;
  headerParams?: RouteParams;
  host?: string;
  method?: string;
  pathParams?: RouteParams;
  port: number;
  queryParams?: RouteParams;
  routeCatalog?: RouteCatalog;
}

const FORM_URLENCODED = "application/x-www-form-urlencoded";
const FORM_MULTIPART = "multipart/form-data";

function isFormContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();

  return normalized === FORM_URLENCODED || normalized === FORM_MULTIPART;
}

function getRequestBodyContentTypes(operation: RouteOperation): string[] {
  return Object.keys(operation.requestBody?.content ?? {});
}

function getFormContentType(operation: RouteOperation | undefined): string {
  if (!operation) return FORM_URLENCODED;

  const declared = [
    ...(operation.consumes ?? []),
    ...getRequestBodyContentTypes(operation),
  ].map((contentType) => contentType.toLowerCase());

  if (declared.includes(FORM_URLENCODED)) return FORM_URLENCODED;
  if (declared.includes(FORM_MULTIPART)) return FORM_MULTIPART;

  return FORM_URLENCODED;
}

function findHeaderKey(
  headers: RouteParams,
  target: string,
): string | undefined {
  const normalizedTarget = target.toLowerCase();

  return Object.keys(headers).find(
    (name) => name.toLowerCase() === normalizedTarget,
  );
}

function setHeader(
  headers: Record<string, string>,
  name: string,
  value: string,
): void {
  const existing = Object.keys(headers).find(
    (headerName) => headerName.toLowerCase() === name.toLowerCase(),
  );

  headers[existing ?? name] = value;
}

function decodeCookieName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function escapeMultipartName(name: string): string {
  return name
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function encodeMultipartForm(params: RouteParams, boundary: string): string {
  const parts = Object.entries(params).map(
    ([name, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${escapeMultipartName(name)}"\r\n\r\n${String(value)}\r\n`,
  );

  return `${parts.join("")}--${boundary}--\r\n`;
}

/**
 * Immutable fluent builder for constructing and sending HTTP requests from the
 * Counterfact REPL.
 *
 * Each builder method returns a **new** `RouteBuilder` instance with the
 * updated field — the original is never mutated.  When all required parameters
 * are set, call {@link send} to execute the request.
 *
 * ```ts
 * // Inside the REPL:
 * route("/pets/{petId}").method("get").path({ petId: 1 }).send();
 * ```
 */
export class RouteBuilder {
  public readonly routePath: string;

  private readonly _body: unknown;

  private readonly _bodySet: boolean;

  private readonly _cookieParams: RouteParams;

  private readonly _formParams: RouteParams;

  private readonly _formSet: boolean;

  private readonly _headerParams: RouteParams;

  private readonly _host: string;

  private readonly _method: string | undefined;

  private readonly _routeCatalog: RouteCatalog | undefined;

  private readonly _pathParams: RouteParams;

  private readonly _port: number;

  private readonly _queryParams: RouteParams;

  private readonly _operation: RouteOperation | undefined;

  public constructor(routePath: string, options: RouteBuilderOptions) {
    this.routePath = routePath;
    this._method = options.method;
    this._pathParams = options.pathParams ?? {};
    this._queryParams = options.queryParams ?? {};
    this._headerParams = options.headerParams ?? {};
    this._cookieParams = options.cookieParams ?? {};
    this._body = options.body;
    this._formParams = options.formParams ?? {};
    this._formSet = "formParams" in options;
    this._bodySet = "body" in options && !this._formSet;
    this._port = options.port;
    this._host = options.host ?? "localhost";
    this._routeCatalog = options.routeCatalog;
    this._operation = this._resolveOperation();
  }

  private _resolveOperation(): RouteOperation | undefined {
    if (!this._routeCatalog || !this._method) return undefined;

    return this._routeCatalog.getOperation(this.routePath, this._method);
  }

  private clone(overrides: {
    body?: unknown;
    cookieParams?: RouteParams;
    formParams?: RouteParams;
    headerParams?: RouteParams;
    method?: string;
    pathParams?: RouteParams;
    queryParams?: RouteParams;
  }): RouteBuilder {
    const options: RouteBuilderOptions = {
      cookieParams: overrides.cookieParams ?? this._cookieParams,
      headerParams: overrides.headerParams ?? this._headerParams,
      host: this._host,
      method: overrides.method ?? this._method,
      pathParams: overrides.pathParams ?? this._pathParams,
      port: this._port,
      queryParams: overrides.queryParams ?? this._queryParams,
      routeCatalog: this._routeCatalog,
    };

    if ("formParams" in overrides) {
      options.formParams = overrides.formParams;
    } else if ("body" in overrides) {
      options.body = overrides.body;
    } else if (this._formSet) {
      options.formParams = this._formParams;
    } else if (this._bodySet) {
      options.body = this._body;
    }

    return new RouteBuilder(this.routePath, options);
  }

  /**
   * Returns a new builder with the HTTP method set.
   *
   * @param method - HTTP method name (case-insensitive, e.g. `"get"`, `"POST"`).
   */
  public method(method: string): RouteBuilder {
    return this.clone({ method: method.toUpperCase() });
  }

  /**
   * Returns a new builder with additional path parameters merged in.
   *
   * @param params - Key/value map of path variable names to values.
   */
  public path(params: RouteParams): RouteBuilder {
    return this.clone({ pathParams: { ...this._pathParams, ...params } });
  }

  /**
   * Returns a new builder with additional query parameters merged in.
   *
   * @param params - Key/value map of query parameter names to values.
   */
  public query(params: RouteParams): RouteBuilder {
    return this.clone({ queryParams: { ...this._queryParams, ...params } });
  }

  /**
   * Returns a new builder with additional request headers merged in.
   *
   * @param params - Key/value map of header names to values.
   */
  public headers(params: RouteParams): RouteBuilder {
    return this.clone({ headerParams: { ...this._headerParams, ...params } });
  }

  /**
   * Returns a new builder with additional request cookies merged in.
   *
   * Cookie names and values are percent-encoded when the request is sent.
   *
   * @param params - Key/value map of cookie names to values.
   */
  public cookies(params: RouteParams): RouteBuilder {
    return this.clone({ cookieParams: { ...this._cookieParams, ...params } });
  }

  /**
   * Returns a new builder with the request body set.
   *
   * @param body - The request body (will be serialised to JSON or sent as-is).
   */
  public body(body: unknown): RouteBuilder {
    return this.clone({ body });
  }

  /**
   * Returns a new builder with additional text form fields merged in.
   *
   * Calling `form()` after `body()` clears the body. Calling `body()` after
   * `form()` clears the form, so the last entity method wins.
   *
   * @param params - Key/value map of form field names to text values.
   */
  public form(params: RouteParams): RouteBuilder {
    const current = this._formSet ? this._formParams : {};

    return this.clone({ formParams: { ...current, ...params } });
  }

  private getOperation(): RouteOperation | undefined {
    return this._operation;
  }

  private getHeaderValue(name: string): RouteParams[string] | undefined {
    const key = findHeaderKey(this._headerParams, name);

    return key === undefined ? undefined : this._headerParams[key];
  }

  private getHeaderCookies(): Map<string, string> {
    const cookieHeader = this.getHeaderValue("cookie");
    const cookies = new Map<string, string>();

    if (cookieHeader === undefined) return cookies;

    for (const pair of String(cookieHeader).split(";")) {
      const separator = pair.indexOf("=");
      if (separator === -1) continue;

      const name = decodeCookieName(pair.slice(0, separator).trim());
      const value = pair.slice(separator + 1).trim();
      cookies.set(name, value);
    }

    return cookies;
  }

  private getCookieValue(name: string): RouteParams[string] | undefined {
    if (name in this._cookieParams) return this._cookieParams[name];

    return this.getHeaderCookies().get(name);
  }

  private requestBodyIsSet(operation: RouteOperation): boolean {
    const contentTypes = getRequestBodyContentTypes(operation);

    if (this._formSet) {
      return contentTypes.some(isFormContentType);
    }

    if (this._bodySet) {
      return (
        contentTypes.length === 0 ||
        contentTypes.some((contentType) => !isFormContentType(contentType))
      );
    }

    return false;
  }

  /**
   * Returns `true` when a method is set and no required parameters are
   * missing.
   */
  public ready(): boolean {
    if (!this._method) return false;

    return this.missing() === undefined;
  }

  /**
   * Returns a {@link MissingParams} object describing all required parameters
   * that have not yet been set, or `undefined` when nothing is missing (or
   * when the operation has no required inputs).
   */
  public missing(): MissingParams | undefined {
    const operation = this.getOperation();

    if (!operation) return undefined;

    const missingParams: MissingParams = {};

    for (const param of operation.parameters ?? []) {
      if (!param.required) continue;

      const paramType =
        param.type ??
        param.schema?.type ??
        (param.in === "body" ? "object" : "string");
      const paramInfo: MissingParam = {
        description: param.description,
        name: param.name,
        type: paramType,
      };

      if (param.in === "path" && !(param.name in this._pathParams)) {
        missingParams.path = [...(missingParams.path ?? []), paramInfo];
      } else if (param.in === "query" && !(param.name in this._queryParams)) {
        missingParams.query = [...(missingParams.query ?? []), paramInfo];
      } else if (
        param.in === "header" &&
        this.getHeaderValue(param.name) === undefined
      ) {
        missingParams.header = [...(missingParams.header ?? []), paramInfo];
      } else if (
        param.in === "cookie" &&
        this.getCookieValue(param.name) === undefined
      ) {
        missingParams.cookie = [...(missingParams.cookie ?? []), paramInfo];
      } else if (param.in === "body" && !this._bodySet) {
        missingParams.body = [...(missingParams.body ?? []), paramInfo];
      } else if (
        param.in === "formData" &&
        (!this._formSet || !(param.name in this._formParams))
      ) {
        missingParams.formData = [...(missingParams.formData ?? []), paramInfo];
      }
    }

    if (operation.requestBody?.required && !this.requestBodyIsSet(operation)) {
      const schemas = Object.values(operation.requestBody.content ?? {});
      missingParams.body = [
        ...(missingParams.body ?? []),
        {
          description: operation.requestBody.description,
          name: "requestBody",
          type:
            schemas.find((media) => media.schema?.type)?.schema?.type ??
            "object",
        },
      ];
    }

    if (Object.keys(missingParams).length === 0) return undefined;

    return missingParams;
  }

  /**
   * Returns a human-readable help string describing the operation, its
   * parameters, and the expected responses.
   */
  public help(): string {
    const method = this._method ?? "[no method set]";
    const operation = this.getOperation();
    const lines: string[] = [];

    lines.push(`${method} ${this.routePath}`);

    if (operation?.summary) {
      lines.push("");
      lines.push("Summary:");
      lines.push(`  ${operation.summary}`);
    }

    if (operation?.description) {
      lines.push("");
      lines.push("Description:");
      lines.push(`  ${operation.description}`);
    }

    if (operation?.parameters && operation.parameters.length > 0) {
      const pathParams = operation.parameters.filter((p) => p.in === "path");
      const queryParams = operation.parameters.filter((p) => p.in === "query");
      const headerParams = operation.parameters.filter(
        (p) => p.in === "header",
      );
      const cookieParams = operation.parameters.filter(
        (p) => p.in === "cookie",
      );
      const bodyParams = operation.parameters.filter((p) => p.in === "body");
      const formParams = operation.parameters.filter(
        (p) => p.in === "formData",
      );

      if (pathParams.length > 0) {
        lines.push("");
        lines.push("Path Parameters:");

        for (const p of pathParams) {
          const paramType = p.type ?? p.schema?.type ?? "string";
          const required = p.required ? "required" : "optional";
          lines.push(`  ${p.name} (${paramType}, ${required})`);
          if (p.description) lines.push(`    Description: ${p.description}`);
          if (p.enum) lines.push(`    Allowed values: ${p.enum.join(" | ")}`);
        }
      }

      if (queryParams.length > 0) {
        lines.push("");
        lines.push("Query Parameters:");

        for (const p of queryParams) {
          const paramType = p.type ?? p.schema?.type ?? "string";
          const required = p.required ? "required" : "optional";
          lines.push(`  ${p.name} (${paramType}, ${required})`);
          if (p.description) lines.push(`    Description: ${p.description}`);

          const enumValues = p.enum ?? p.schema?.enum;
          if (enumValues)
            lines.push(`    Allowed values: ${enumValues.join(" | ")}`);
        }
      }

      if (headerParams.length > 0) {
        lines.push("");
        lines.push("Headers:");

        for (const p of headerParams) {
          const paramType = p.type ?? p.schema?.type ?? "string";
          const required = p.required ? "required" : "optional";
          lines.push(`  ${p.name} (${paramType}, ${required})`);
          if (p.description) lines.push(`    Description: ${p.description}`);
        }
      }

      if (cookieParams.length > 0) {
        lines.push("");
        lines.push("Cookies:");

        for (const p of cookieParams) {
          const paramType = p.type ?? p.schema?.type ?? "string";
          const required = p.required ? "required" : "optional";
          lines.push(`  ${p.name} (${paramType}, ${required})`);
          if (p.description) lines.push(`    Description: ${p.description}`);
        }
      }

      if (formParams.length > 0) {
        lines.push("");
        lines.push("Form Fields:");

        for (const p of formParams) {
          const paramType = p.type ?? p.schema?.type ?? "string";
          const required = p.required ? "required" : "optional";
          lines.push(`  ${p.name} (${paramType}, ${required})`);
          if (p.description) lines.push(`    Description: ${p.description}`);
        }
      }

      if (bodyParams.length > 0) {
        lines.push("");
        lines.push("Request Body:");

        for (const p of bodyParams) {
          const paramType = p.type ?? p.schema?.type ?? "object";
          const required = p.required ? "required" : "optional";
          lines.push(`  ${p.name} (${paramType}, ${required})`);
          if (p.description) lines.push(`    Description: ${p.description}`);
        }
      }
    }

    if (operation?.requestBody) {
      const required = operation.requestBody.required ? "required" : "optional";
      const contentTypes = getRequestBodyContentTypes(operation);
      lines.push("");
      lines.push("Request Body:");
      lines.push(`  requestBody (${required})`);
      if (operation.requestBody.description) {
        lines.push(`    Description: ${operation.requestBody.description}`);
      }
      if (contentTypes.length > 0) {
        lines.push(`    Content types: ${contentTypes.join(" | ")}`);
      }
    }

    if (operation?.responses) {
      lines.push("");
      lines.push("Responses:");

      for (const [status, response] of Object.entries(operation.responses)) {
        lines.push(`  ${status}`);
        if (response.description) {
          lines.push(`    Description: ${response.description}`);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Executes the HTTP request and returns the parsed response body.
   *
   * @throws When no HTTP method has been set.
   * @throws When required parameters are missing.
   * @throws When an unsupported HTTP method is used.
   */
  public async send(): Promise<unknown> {
    if (!this._method) {
      throw new Error(
        'No HTTP method set. Use .method("get") to set the method.',
      );
    }

    const missing = this.missing();

    if (missing) {
      const lines = [
        "Cannot execute request.",
        "",
        "Missing required parameters:",
      ];

      if (missing.path) {
        lines.push("  path:");
        for (const p of missing.path) {
          lines.push(`    - ${p.name} (${p.type ?? "string"})`);
        }
      }

      if (missing.query) {
        lines.push("  query:");
        for (const p of missing.query) {
          lines.push(`    - ${p.name} (${p.type ?? "string"})`);
        }
      }

      if (missing.header) {
        lines.push("  header:");
        for (const p of missing.header) {
          lines.push(`    - ${p.name} (${p.type ?? "string"})`);
        }
      }

      if (missing.cookie) {
        lines.push("  cookie:");
        for (const p of missing.cookie) {
          lines.push(`    - ${p.name} (${p.type ?? "string"})`);
        }
      }

      if (missing.formData) {
        lines.push("  formData:");
        for (const p of missing.formData) {
          lines.push(`    - ${p.name} (${p.type ?? "string"})`);
        }
      }

      if (missing.body) {
        lines.push("  body:");
        for (const p of missing.body) {
          lines.push(`    - ${p.name} (${p.type ?? "object"})`);
        }
      }

      throw new Error(lines.join("\n"));
    }

    // Build URL with path parameters substituted
    let url = this.routePath;

    for (const [key, value] of Object.entries(this._pathParams)) {
      url = url.replaceAll(`{${key}}`, encodeURIComponent(String(value)));
    }

    // Append query string
    const queryEntries = Object.entries(this._queryParams);

    if (queryEntries.length > 0) {
      const qs = new URLSearchParams(
        queryEntries.map(([k, v]) => [k, String(v)] as [string, string]),
      ).toString();
      url = `${url}?${qs}`;
    }

    const client = new RawHttpClient(this._host, this._port);
    const headers = Object.fromEntries(
      Object.entries(this._headerParams).map(([k, v]) => [k, String(v)]),
    );
    const cookiePairs = Object.entries(this._cookieParams).map(
      ([name, value]) =>
        `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`,
    );

    if (cookiePairs.length > 0) {
      const cookieHeaderKey = Object.keys(headers).find(
        (name) => name.toLowerCase() === "cookie",
      );
      let existingCookies: string | undefined;
      if (cookieHeaderKey !== undefined) {
        // eslint-disable-next-line security/detect-object-injection -- The key was selected from this inert header map.
        existingCookies = headers[cookieHeaderKey];
      }
      setHeader(
        headers,
        "Cookie",
        [existingCookies, ...cookiePairs].filter(Boolean).join("; "),
      );
    }

    let entity = this._body;

    if (this._formSet) {
      const formContentType = getFormContentType(this.getOperation());

      if (formContentType === FORM_MULTIPART) {
        const boundary = `counterfact-${randomBytes(16).toString("hex")}`;
        entity = encodeMultipartForm(this._formParams, boundary);
        setHeader(
          headers,
          "Content-Type",
          `${FORM_MULTIPART}; boundary=${boundary}`,
        );
      } else {
        entity = new URLSearchParams(
          Object.entries(this._formParams).map(
            ([name, value]) => [name, String(value)] as [string, string],
          ),
        ).toString();
        setHeader(headers, "Content-Type", FORM_URLENCODED);
      }
    }

    const method = this._method.toLowerCase();

    switch (method) {
      case "get":
        return client.get(url, headers);
      case "head":
        return client.head(url, headers);
      case "delete":
        return client.delete(url, headers);
      case "options":
        return client.options(url, headers);
      case "trace":
        return client.trace(url, headers);
      case "post":
        return client.post(url, entity as string | object, headers);
      case "put":
        return client.put(url, entity as string | object, headers);
      case "patch":
        return client.patch(url, entity as string | object, headers);
      default:
        throw new Error(`Unsupported HTTP method: ${this._method}`);
    }
  }

  public [Symbol.for("nodejs.util.inspect.custom")](): string {
    const method = this._method ?? "[no method set]";
    const operation = this.getOperation();
    const lines: string[] = [];

    lines.push(`${method} ${this.routePath}`);

    if (operation?.parameters) {
      const pathParams = operation.parameters.filter((p) => p.in === "path");
      const queryParams = operation.parameters.filter((p) => p.in === "query");
      const headerParams = operation.parameters.filter(
        (p) => p.in === "header",
      );
      const cookieParams = operation.parameters.filter(
        (p) => p.in === "cookie",
      );
      const formParams = operation.parameters.filter(
        (p) => p.in === "formData",
      );
      const bodyParams = operation.parameters.filter((p) => p.in === "body");

      if (pathParams.length > 0) {
        lines.push("");
        lines.push("Path:");

        for (const p of pathParams) {
          const value = this._pathParams[p.name];
          lines.push(
            `  ${p.name}: ${value !== undefined ? String(value) : "[missing]"}`,
          );
        }
      }

      if (queryParams.length > 0) {
        lines.push("");
        lines.push("Query:");

        for (const p of queryParams) {
          const value = this._queryParams[p.name];
          const label = p.required ? "[missing]" : "[optional]";
          lines.push(
            `  ${p.name}: ${value !== undefined ? String(value) : label}`,
          );
        }
      }

      if (headerParams.length > 0) {
        lines.push("");
        lines.push("Headers:");

        for (const p of headerParams) {
          const value = this.getHeaderValue(p.name);
          const label = p.required ? "[missing]" : "[optional]";
          lines.push(
            `  ${p.name}: ${value !== undefined ? String(value) : label}`,
          );
        }
      }

      if (cookieParams.length > 0) {
        lines.push("");
        lines.push("Cookies:");

        for (const p of cookieParams) {
          const value = this.getCookieValue(p.name);
          const label = p.required ? "[missing]" : "[optional]";
          lines.push(
            `  ${p.name}: ${value !== undefined ? String(value) : label}`,
          );
        }
      }

      if (formParams.length > 0) {
        lines.push("");
        lines.push("Form:");

        for (const p of formParams) {
          const value = this._formSet ? this._formParams[p.name] : undefined;
          const label = p.required ? "[missing]" : "[optional]";
          lines.push(
            `  ${p.name}: ${value !== undefined ? String(value) : label}`,
          );
        }
      }

      if (bodyParams.length > 0) {
        lines.push("");
        lines.push("Body:");

        for (const p of bodyParams) {
          const label = p.required ? "[missing]" : "[optional]";
          lines.push(`  ${p.name}: ${this._bodySet ? "[set]" : label}`);
        }
      }
    }

    if (operation?.requestBody) {
      const label = operation.requestBody.required ? "[missing]" : "[optional]";
      const entityKind = this._formSet ? "form" : "body";
      lines.push("");
      lines.push("Body:");
      lines.push(
        `  requestBody: ${this.requestBodyIsSet(operation) ? `[set with ${entityKind}()]` : label}`,
      );
    }

    lines.push("");
    lines.push(`Ready: ${this.ready()}`);

    return lines.join("\n");
  }
}

/**
 * Creates a factory function that constructs a {@link RouteBuilder} for a
 * given route path, pre-configured with the server's host, port, and OpenAPI
 * route catalog.
 *
 * @param port - The port the Counterfact server is listening on.
 * @param host - The server hostname (default `"localhost"`).
 * @param routeCatalog - Optional route catalog for parameter introspection.
 * @returns A function `(routePath: string) => RouteBuilder`.
 */
export function createRouteFunction(
  port: number,
  host?: string,
  routeCatalog?: RouteCatalog,
) {
  return (routePath: string) =>
    new RouteBuilder(routePath, { host, port, routeCatalog });
}
