import { normalizeOpenApiPath } from "./openapi-path.js";
import { sanitizeIdentifier } from "./sanitize-identifier.js";
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
  "TRACE",
]);

export type OperationTypeNameMapping = Map<string, Map<string, string>>;

function openApiPathToFilePath(openApiPath: string): string {
  openApiPath = normalizeOpenApiPath(openApiPath);
  if (openApiPath === "/") {
    return "index";
  }

  return openApiPath.startsWith("/") ? openApiPath.slice(1) : openApiPath;
}

/**
 * Resolves the generated operation type name for each route and HTTP method.
 * This is the migration-facing API; concrete coder and specification classes
 * remain internal implementation details. Set legacyNames only when migrating
 * operationId-based imports from older generated projects.
 */
export async function buildOperationTypeNameMapping(
  source: string,
  overlays: readonly string[] = [],
  legacyNames = false,
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

    const operations = pathDefinition.flatMap((operation, method) => {
      if (method === "additionalOperations") {
        return operation.map((additionalOperation, additionalMethod) => ({
          operation: additionalOperation,
          method: additionalMethod.toUpperCase(),
        }));
      }
      return HTTP_METHODS.has(method.toUpperCase())
        ? [{ operation, method: method.toUpperCase() }]
        : [];
    });
    for (const { operation, method } of operations) {
      const typeName = new OperationTypeCoder(
        operation,
        "",
        method.toLowerCase(),
        securitySchemes,
      )
        .names()
        .next().value as string;

      const operationId = operation.get("operationId")?.data as
        string | undefined;
      methodMap.set(
        method,
        legacyNames && operationId ? sanitizeIdentifier(operationId) : typeName,
      );
    }

    if (methodMap.size > 0) {
      mapping.set(openApiPathToFilePath(openApiPath), methodMap);
    }
  });

  return mapping;
}
