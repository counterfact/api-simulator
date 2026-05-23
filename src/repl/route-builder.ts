import type { OpenApiDocument } from "../server/dispatcher.js";

import { RawHttpClient } from "./raw-http-client.js";

type Params = Record<string, boolean | number | string>;

interface OpenApiParameterExtended {
  description?: string;
  enum?: string[];
  in: "body" | "cookie" | "formData" | "header" | "path" | "query";
  name: string;
  required?: boolean;
  schema?: { enum?: string[]; type?: string };
  type?: string;
}

interface OpenApiOperationExtended {
  description?: string;
  parameters?: OpenApiParameterExtended[];
  responses?: Record<string, { description?: string }>;
  summary?: string;
}

interface MissingParam {
  description?: string;
  name: string;
  type?: string;
}

export interface MissingParams {
  header?: MissingParam[];
  path?: MissingParam[];
  query?: MissingParam[];
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

  private readonly _headerParams: Params;

  private readonly _host: string;

  private readonly _method: string | undefined;

  private readonly _openApiDocument: OpenApiDocument | undefined;

  private readonly _pathParams: Params;

  private readonly _port: number;

  private readonly _queryParams: Params;

  private readonly _operation: OpenApiOperationExtended | undefined;

  public constructor(
    routePath: string,
    options: {
      body?: unknown;
      headerParams?: Params;
      host?: string;
      method?: string;
      openApiDocument?: OpenApiDocument;
      pathParams?: Params;
      port: number;
      queryParams?: Params;
    },
  ) {
    this.routePath = routePath;
    this._method = options.method;
    this._pathParams = options.pathParams ?? {};
    this._queryParams = options.queryParams ?? {};
    this._headerParams = options.headerParams ?? {};
    this._body = options.body;
    this._port = options.port;
    this._host = options.host ?? "localhost";
    this._openApiDocument = options.openApiDocument;
    this._operation = this._resolveOperation();
  }

  private _resolveOperation(): OpenApiOperationExtended | undefined {
    if (!this._openApiDocument || !this._method) return undefined;

    const method = this._method.toLowerCase();
    const normalizedPath = this.routePath.toLowerCase();

    for (const key of Object.keys(this._openApiDocument.paths)) {
      if (key.toLowerCase() === normalizedPath) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (this._openApiDocument.paths[key] as any)[
          method
        ] as OpenApiOperationExtended;
      }
    }

    return undefined;
  }

  private clone(overrides: {
    body?: unknown;
    headerParams?: Params;
    method?: string;
    pathParams?: Params;
    queryParams?: Params;
  }): RouteBuilder {
    return new RouteBuilder(this.routePath, {
      body: "body" in overrides ? overrides.body : this._body,
      headerParams: overrides.headerParams ?? this._headerParams,
      host: this._host,
      method: overrides.method ?? this._method,
      openApiDocument: this._openApiDocument,
      pathParams: overrides.pathParams ?? this._pathParams,
      port: this._port,
      queryParams: overrides.queryParams ?? this._queryParams,
    });
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
  public path(params: Params): RouteBuilder {
    return this.clone({ pathParams: { ...this._pathParams, ...params } });
  }

  /**
   * Returns a new builder with additional query parameters merged in.
   *
   * @param params - Key/value map of query parameter names to values.
   */
  public query(params: Params): RouteBuilder {
    return this.clone({ queryParams: { ...this._queryParams, ...params } });
  }

  /**
   * Returns a new builder with additional request headers merged in.
   *
   * @param params - Key/value map of header names to values.
   */
  public headers(params: Params): RouteBuilder {
    return this.clone({ headerParams: { ...this._headerParams, ...params } });
  }

  /**
   * Returns a new builder with the request body set.
   *
   * @param body - The request body (will be serialised to JSON or sent as-is).
   */
  public body(body: unknown): RouteBuilder {
    return this.clone({ body });
  }

  private getOperation(): OpenApiOperationExtended | undefined {
    return this._operation;
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
   * when the operation has no parameters).
   */
  public missing(): MissingParams | undefined {
    const operation = this.getOperation();

    if (!operation?.parameters) return undefined;

    const missingParams: MissingParams = {};

    for (const param of operation.parameters) {
      if (!param.required) continue;

      const paramType = param.type ?? param.schema?.type ?? "string";
      const paramInfo: MissingParam = {
        description: param.description,
        name: param.name,
        type: paramType,
      };

      if (param.in === "path" && !(param.name in this._pathParams)) {
        missingParams.path = [...(missingParams.path ?? []), paramInfo];
      } else if (param.in === "query" && !(param.name in this._queryParams)) {
        missingParams.query = [...(missingParams.query ?? []), paramInfo];
      } else if (param.in === "header" && !(param.name in this._headerParams)) {
        missingParams.header = [...(missingParams.header ?? []), paramInfo];
      }
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

      throw new Error(lines.join("\n"));
    }

    // Build URL with path parameters substituted
    let url = this.routePath;

    for (const [key, value] of Object.entries(this._pathParams)) {
      url = url.replaceAll(`{${key}}`, String(value));
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
        return client.post(url, this._body as string | object, headers);
      case "put":
        return client.put(url, this._body as string | object, headers);
      case "patch":
        return client.patch(url, this._body as string | object, headers);
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
    }

    lines.push("");
    lines.push(`Ready: ${this.ready()}`);

    return lines.join("\n");
  }
}

/**
 * Creates a factory function that constructs a {@link RouteBuilder} for a
 * given route path, pre-configured with the server's host, port, and OpenAPI
 * document.
 *
 * @param port - The port the Counterfact server is listening on.
 * @param host - The server hostname (default `"localhost"`).
 * @param openApiDocument - Optional OpenAPI document for parameter introspection.
 * @returns A function `(routePath: string) => RouteBuilder`.
 */
export function createRouteFunction(
  port: number,
  host?: string,
  openApiDocument?: OpenApiDocument,
) {
  return (routePath: string) =>
    new RouteBuilder(routePath, { host, openApiDocument, port });
}
