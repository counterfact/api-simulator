import { Requirement } from "./requirement.js";

const methods = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

export function pathOperations(pathItem: Requirement): [Requirement, string][] {
  let resolved = pathItem;
  while (resolved.isReference) resolved = resolved.reference();

  const operations = resolved.flatMap(
    (operation, name): [Requirement, string][] => {
      if (name === "additionalOperations") {
        return operation.map((additional, method) => [
          additional,
          method.toLowerCase(),
        ]);
      }
      return methods.has(name) ? [[operation, name]] : [];
    },
  );

  return operations.map(([operation, method]) => {
    // A referenced operation still belongs to the endpoint and its path-item parameters.
    const logical = new Requirement(
      operation.data,
      `${pathItem.url}/${method}`,
      pathItem.specification,
    );
    logical.parent = pathItem;
    return [logical, method];
  });
}
