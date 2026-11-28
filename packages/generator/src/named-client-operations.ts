import { RESERVED_WORDS } from "./reserved-words.js";

export interface ClientGroupingOptions {
  moduleNameFirstTag?: boolean | undefined;
  moduleNameIndex?: number | undefined;
}

interface NamedOperation {
  path: string;
  method: string;
  pathParameters: string[];
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
function camelCase(value: string, fallback = "_"): string {
  const [first = "", ...rest] = words(value);
  return safeIdentifier(
    first.charAt(0).toLowerCase() +
      first.slice(1) +
      rest.map(capitalize).join(""),
    fallback,
  );
}

/** Converts arbitrary text such as `explodable-parameters` to `ExplodableParameters`. */
function pascalCase(value: string, fallback = "_"): string {
  return safeIdentifier(words(value).map(capitalize).join(""), fallback);
}

/** Reserves `name`, appending a counter when it is already taken. */
function uniqueName(name: string, taken: Set<string>): string {
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

type ClientPaths = readonly {
  path: string;
  operations: readonly {
    method: string;
    operationId: string | undefined;
    tags: string[];
  }[];
}[];

export function namedOperations(
  paths: ClientPaths,
  options: ClientGroupingOptions,
): Record<string, Record<string, NamedOperation>> {
  const groups = new Map<
    string,
    { name: string; used: Set<string>; operations: Map<string, NamedOperation> }
  >();

  for (const { path, operations } of paths) {
    const pathParameters = Array.from(
      path.matchAll(/\{(?<name>[^}]+)\}/gu),
      (match) => match.groups!["name"]!,
    );
    for (const { method, operationId, tags } of operations) {
      const name = camelCase(moduleNameFor(path, tags, options), "root");
      const key = name.toLowerCase();
      let group = groups.get(key);
      if (!group) {
        group = {
          name,
          used: new Set(["constructor", "http"]),
          operations: new Map(),
        };
        groups.set(key, group);
      }
      const methodName = uniqueName(
        (operationId && camelCase(operationId, "")) ||
          fallbackOperationName(path, method),
        group.used,
      );
      group.operations.set(methodName, { path, method, pathParameters });
    }
  }

  return Object.fromEntries(
    Array.from(groups.values(), ({ name, operations }) => [
      name,
      Object.fromEntries(operations),
    ]),
  );
}

function staCase(value: string): string {
  return words(
    value
      .normalize("NFD")
      .replaceAll(/\p{M}/gu, "")
      .replaceAll(
        /(?<acronym>[A-Z])(?<next>[A-Z][a-z])/gu,
        "$<acronym> $<next>",
      ),
  )
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : capitalize(word.toLowerCase()),
    )
    .join("");
}

function staFallback(path: string, method: string, group: string): string {
  if (path === "/") return staCase(`${method} Root`);
  const segments = path
    .replaceAll(/\{\w+\}/gu, "")
    .split("/")
    .filter(Boolean);
  const routeName = (segments.length > 1 ? segments.slice(1) : segments).join(
    "_",
  );
  if (
    routeName.length > 3 &&
    ["get", "post", "put", "patch", "delete"].includes(method)
  ) {
    return fallbackOperationName(
      `/${routeName}${/\{\w+\}$/u.test(path) ? "/{id}" : ""}`,
      method,
    );
  }
  return staCase(`${method} ${group}`);
}

/** STA names differ from native names for root operations and nested paths. */
export function staOperations(
  paths: ClientPaths,
  options: ClientGroupingOptions,
): Record<string, Record<string, NamedOperation>> {
  const groups = new Map<string, Map<string, NamedOperation>>();

  for (const { path, operations } of paths) {
    const pathParameters = Array.from(
      path.matchAll(/\{(?<name>[^}]+)\}/gu),
      (match) => match.groups!["name"]!,
    );
    for (const { method, operationId, tags } of operations) {
      const segments = path.split("/").filter(Boolean);
      const group =
        (options.moduleNameFirstTag && staCase(tags[0] ?? "")) ||
        staCase(segments.at(options.moduleNameIndex ?? 0) ?? "");
      let names = groups.get(group);
      if (!names) {
        names = new Map();
        groups.set(group, names);
      }
      const base =
        staCase(operationId ?? "") || staFallback(path, method, group);
      let name = base;
      for (let index = 2; names.has(name); index += 1) name = `${base}${index}`;
      names.set(name, { path, method, pathParameters });
    }
  }

  return Object.fromEntries(
    Array.from(groups, ([group, operations]) => [
      group,
      Object.fromEntries(operations),
    ]),
  );
}
