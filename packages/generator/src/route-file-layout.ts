import ts from "typescript";

import { formatStatements, importDeclaration, literalType } from "./ast.js";
import type { Script } from "./script.js";

export const ROUTE_PATHS_EXPORT = "__counterfactPaths";

/** First observed spelling wins independently for every path segment. */
export class CaseLayout {
  private readonly spellings = new Map<string, string>();

  public file(logicalFile: string): string {
    let physical = "";
    for (const segment of logicalFile.split("/")) {
      const candidate = physical ? `${physical}/${segment}` : segment;
      const key = candidate.toLowerCase();
      if (!this.spellings.has(key)) this.spellings.set(key, candidate);
      physical = this.spellings.get(key)!;
    }
    return physical;
  }
}

export function requiresPathMetadata(
  route: string,
  logical: string,
  target: string,
): boolean {
  return route !== route.toLowerCase() || logical !== target;
}

function exportedConstant(
  name: string,
  value: ts.Expression,
  type?: ts.TypeNode,
): ts.VariableStatement {
  return ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [ts.factory.createVariableDeclaration(name, undefined, type, value)],
      ts.NodeFlags.Const,
    ),
  );
}

export function routePathsStatement(paths: readonly string[]): ts.Statement {
  return exportedConstant(
    ROUTE_PATHS_EXPORT,
    ts.factory.createArrayLiteralExpression(
      paths.map((path) => ts.factory.createStringLiteral(path)),
    ),
  );
}

export async function collisionRouteContents(
  entries: ReadonlyArray<readonly [string, Script]>,
  imports: ReadonlyMap<string, string> = new Map(),
  overrides: ReadonlyMap<string, ts.Expression> = new Map(),
): Promise<string> {
  const first = entries[0];
  if (!first) throw new Error("Cannot generate an empty route.");
  const methods = new Map<
    string,
    Array<readonly [string, ts.Expression, ts.TypeNode]>
  >();
  for (const [path, script] of entries) {
    for (const [method, entry] of script.exports) {
      const route = script.localTypes.get("Route");
      if (!entry.node || !ts.isExpression(entry.node) || !route)
        throw new Error(`Missing handler for ${method} ${path}.`);
      const handlers = methods.get(method) ?? [];
      handlers.push([
        path,
        overrides.get(JSON.stringify([path, method])) ?? entry.node,
        route,
      ]);
      methods.set(method, handlers);
    }
  }
  return formatStatements([
    importDeclaration(
      "Routes",
      `${first[1].relativePathToBase}/types/index.js`,
      true,
    ),
    ...[...imports].map(([local, module]) =>
      ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamespaceImport(ts.factory.createIdentifier(local)),
        ),
        ts.factory.createStringLiteral(module),
      ),
    ),
    routePathsStatement(entries.map(([path]) => path)),
    ...[...methods].map(([method, handlers]) => {
      if (entries.length === 1) {
        const [, implementation, route] = handlers[0]!;
        return exportedConstant(
          method,
          implementation,
          ts.factory.createIndexedAccessTypeNode(route, literalType(method)),
        );
      }
      return exportedConstant(
        method,
        ts.factory.createObjectLiteralExpression(
          handlers.map(([path, expression]) =>
            ts.factory.createPropertyAssignment(
              ts.factory.createStringLiteral(path),
              expression,
            ),
          ),
          true,
        ),
        ts.factory.createTypeLiteralNode(
          handlers.map(([path, , route]) =>
            ts.factory.createPropertySignature(
              undefined,
              ts.factory.createStringLiteral(path),
              undefined,
              ts.factory.createIndexedAccessTypeNode(
                route,
                literalType(method),
              ),
            ),
          ),
        ),
      );
    }),
  ]);
}

export function readRoutePaths(source: ts.SourceFile): string[] | undefined {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== ROUTE_PATHS_EXPORT
      )
        continue;
      const value = declaration.initializer;
      if (
        !value ||
        !ts.isArrayLiteralExpression(value) ||
        !value.elements.every(ts.isStringLiteral)
      )
        return [];
      return value.elements
        .filter(ts.isStringLiteral)
        .map((element) => element.text);
    }
  }
  return undefined;
}

/** Refuse shape transitions that would drop or misattribute authored code. */
export function matchesRouteMapShape(
  source: ts.SourceFile,
  entries: ReadonlyArray<readonly [string, Script]>,
): boolean {
  const methods = new Map<string, Set<string>>();
  for (const [path, script] of entries) {
    for (const name of script.exports.keys()) {
      const paths = methods.get(name) ?? new Set<string>();
      paths.add(path);
      methods.set(name, paths);
    }
  }
  for (const statement of source.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      !ts
        .getModifiers(statement)
        ?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
    )
      continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      const expected = methods.get(decl.name.text);
      if (!expected) continue;
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer))
        return false;
      const actual = new Set<string>();
      for (const property of decl.initializer.properties) {
        if (
          (!ts.isPropertyAssignment(property) &&
            !ts.isMethodDeclaration(property)) ||
          !ts.isStringLiteral(property.name)
        )
          return false;
        actual.add(property.name.text);
      }
      if (
        expected.size !== actual.size ||
        [...expected].some((key) => !actual.has(key))
      )
        return false;
      methods.delete(decl.name.text);
    }
  }
  return methods.size === 0;
}
