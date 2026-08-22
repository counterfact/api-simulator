/** Parameter metadata consumed by the request builder. */
export interface RouteParameter {
  description?: string;
  enum?: readonly string[];
  in: "body" | "cookie" | "formData" | "header" | "path" | "query";
  name: string;
  required?: boolean;
  schema?: {
    enum?: readonly string[];
    type?: string;
  };
  type?: string;
}

/** Operation metadata consumed by request help and validation. */
export interface RouteOperation {
  description?: string;
  parameters?: readonly RouteParameter[];
  responses?: Readonly<Record<string, { description?: string }>>;
  summary?: string;
}

/**
 * The small route-discovery contract used by {@link RouteBuilder} and the
 * Counterfact REPL.
 */
export interface RouteCatalog {
  getOperation(routePath: string, method: string): RouteOperation | undefined;
  listPaths(): readonly string[];
}

/** The only OpenAPI document shape needed to create a route catalog. */
export interface OpenApiRouteDocument {
  readonly paths: Readonly<Record<string, object>>;
}

function mergeParameters(
  pathItemParameters: readonly RouteParameter[] | undefined,
  operationParameters: readonly RouteParameter[] | undefined,
): readonly RouteParameter[] | undefined {
  if (!pathItemParameters || pathItemParameters.length === 0) {
    return operationParameters;
  }

  if (!operationParameters || operationParameters.length === 0) {
    return pathItemParameters;
  }

  const parameters = new Map<string, RouteParameter>();

  for (const parameter of pathItemParameters) {
    parameters.set(`${parameter.in}:${parameter.name}`, parameter);
  }

  for (const parameter of operationParameters) {
    parameters.set(`${parameter.in}:${parameter.name}`, parameter);
  }

  return [...parameters.values()];
}

/**
 * Adapts an OpenAPI-like document to the client package's narrow route
 * catalog. The document is retained by reference so live OpenAPI reloads are
 * visible to subsequent lookups.
 */
export function createOpenApiRouteCatalog(
  document: OpenApiRouteDocument,
): RouteCatalog {
  return {
    getOperation(routePath, method) {
      const normalizedPath = routePath.toLowerCase();
      const matchingPath = Object.keys(document.paths).find(
        (path) => path.toLowerCase() === normalizedPath,
      );

      if (matchingPath === undefined) {
        return undefined;
      }

      const pathItem = document.paths[matchingPath] as
        Record<string, unknown> | undefined;

      const operation = pathItem?.[method.toLowerCase()] as
        RouteOperation | undefined;

      if (!operation) {
        return undefined;
      }

      const pathItemParameters = pathItem?.parameters as
        readonly RouteParameter[] | undefined;
      const parameters = mergeParameters(
        pathItemParameters,
        operation.parameters,
      );

      if (!pathItemParameters || pathItemParameters.length === 0) {
        return operation;
      }

      return { ...operation, parameters };
    },
    listPaths() {
      return Object.keys(document.paths);
    },
  };
}
