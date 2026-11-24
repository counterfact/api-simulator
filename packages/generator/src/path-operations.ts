import type { Requirement } from "./requirement.js";

const HTTP_VERBS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

/**
 * Lists the operations declared by a Path Item as `[operation, method]` pairs
 * with lower-case methods.
 *
 * Follows a referenced Path Item and includes OpenAPI 3.2
 * `additionalOperations`.
 */
export function operationMethodsForPath(
  pathDefinition: Requirement,
): Array<[Requirement, string]> {
  let resolved = pathDefinition;
  while (resolved.isReference) resolved = resolved.reference();
  return resolved.flatMap((operation, requestMethod) => {
    if (requestMethod === "additionalOperations") {
      return operation.map(
        (additionalOperation, additionalMethod): [Requirement, string] => [
          additionalOperation,
          additionalMethod.toLowerCase(),
        ],
      );
    }

    if (!HTTP_VERBS.has(requestMethod)) {
      return [];
    }

    return [[operation, requestMethod]];
  });
}
