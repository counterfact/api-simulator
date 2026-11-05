import ts from "typescript";

import {
  literalType,
  typeLiteral,
  typeProperty,
  typeReference,
} from "./ast.js";

interface RouteBranch {
  children: Map<string, RouteBranch>;
  methods: ReadonlyMap<string, ts.TypeNode>;
}

/** Preserve the leading slash on each segment, including root/trailing slashes. */
export function routeTypeSegments(path: string): string[] {
  return path.startsWith("/")
    ? path
        .slice(1)
        .split("/")
        .map((segment) => `/${segment}`)
    : [path];
}

export function routeTypeReference(name: string, path: string): ts.TypeNode {
  return routeTypeSegments(path).reduce<ts.TypeNode>(
    (type, key) =>
      ts.factory.createIndexedAccessTypeNode(type, literalType(key)),
    typeReference(name),
  );
}

/** Parent operations and child paths share a branch, regardless of input order. */
export function routesType(
  routes: ReadonlyMap<string, ReadonlyMap<string, ts.TypeNode>>,
): ts.TypeNode {
  const root: RouteBranch = { children: new Map(), methods: new Map() };
  for (const [path, methods] of routes) {
    let branch = root;
    for (const segment of routeTypeSegments(path)) {
      let child = branch.children.get(segment);
      if (!child) {
        child = { children: new Map(), methods: new Map() };
        branch.children.set(segment, child);
      }
      branch = child;
    }
    branch.methods = methods;
  }
  return branchType(root);
}

function branchType(branch: RouteBranch): ts.TypeNode {
  return typeLiteral([
    ...[...branch.methods].map(([method, type]) => typeProperty(method, type)),
    ...[...branch.children].map(([segment, child]) =>
      typeProperty(segment, branchType(child)),
    ),
  ]);
}
