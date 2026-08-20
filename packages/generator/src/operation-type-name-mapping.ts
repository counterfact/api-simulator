import createDebug from "debug";

import {
  OperationTypeCoder,
  type SecurityScheme,
} from "./operation-type-coder.js";
import { Specification } from "./specification.js";

const debug = createDebug(
  "counterfact:typescript-generator:operation-type-name-mapping",
);

const HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
  "QUERY",
]);

export type OperationTypeNameMapping = Map<string, Map<string, string>>;

function openApiPathToFilePath(openApiPath: string): string {
  if (openApiPath === "/") {
    return "index";
  }

  return openApiPath.startsWith("/") ? openApiPath.slice(1) : openApiPath;
}

/**
 * Resolves the generated operation type name for each route and HTTP method.
 * This is the migration-facing API; concrete coder and specification classes
 * remain internal implementation details.
 */
export async function buildOperationTypeNameMapping(
  source: string,
  overlays: readonly string[] = [],
): Promise<OperationTypeNameMapping> {
  debug("building operation type name mapping from %s", source);

  const specification = await Specification.fromFile(source, overlays);
  const mapping: OperationTypeNameMapping = new Map();
  const paths = specification.getRequirement("#/paths");

  if (!paths) {
    return mapping;
  }

  const securityRequirement = specification.getRequirement(
    "#/components/securitySchemes",
  );
  const securitySchemes = Object.values(
    (securityRequirement?.data as Record<string, unknown>) ?? {},
  ) as SecurityScheme[];

  paths.forEach((pathDefinition, openApiPath: string) => {
    const methodMap = new Map<string, string>();

    pathDefinition.forEach((operation, requestMethod: string) => {
      const method = requestMethod.toUpperCase();

      if (!HTTP_METHODS.has(method)) {
        return;
      }

      const typeName = new OperationTypeCoder(
        operation,
        "",
        requestMethod,
        securitySchemes,
      )
        .names()
        .next().value as string;

      methodMap.set(method, typeName);
    });

    if (methodMap.size > 0) {
      mapping.set(openApiPathToFilePath(openApiPath), methodMap);
    }
  });

  return mapping;
}
