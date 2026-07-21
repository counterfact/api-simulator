import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import createDebug from "debug";
import { parse } from "recast";
import typescriptParser from "recast/parsers/typescript.js";

const debug = createDebug("counterfact:server:module-dependency-graph");

type AstNode = {
  type?: unknown;
  [key: string]: unknown;
};

function isNode(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null;
}

function extractStringLiteral(value: unknown): string | undefined {
  return isNode(value) && typeof value.value === "string"
    ? value.value
    : undefined;
}

function dependencyIn(node: AstNode): string | undefined {
  if (
    node.type === "ImportDeclaration" ||
    node.type === "ExportAllDeclaration" ||
    node.type === "ExportNamedDeclaration" ||
    node.type === "ImportExpression"
  ) {
    return extractStringLiteral(node.source);
  }

  if (
    node.type === "CallExpression" &&
    isNode(node.callee) &&
    node.callee.type === "Identifier" &&
    node.callee.name === "require" &&
    Array.isArray(node.arguments)
  ) {
    return extractStringLiteral(node.arguments[0]);
  }
}

function findDependencies(value: unknown, dependencies: Set<string>) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      findDependencies(entry, dependencies);
    }
    return;
  }

  if (!isNode(value)) {
    return;
  }

  const dependency = dependencyIn(value);
  if (dependency !== undefined) {
    dependencies.add(dependency);
  }

  for (const entry of Object.values(value)) {
    findDependencies(entry, dependencies);
  }
}

function dependenciesIn(source: string): string[] {
  const dependencies = new Set<string>();

  findDependencies(parse(source, { parser: typescriptParser }), dependencies);

  return Array.from(dependencies);
}

/**
 * Tracks which route files depend on shared modules so that when a shared
 * module changes, all dependent route files can be reloaded.
 *
 * Dependency edges are extracted from the parsed module syntax and are stored
 * as a reverse map (`dependency → Set<dependent files>`).
 */
export class ModuleDependencyGraph {
  private readonly dependents = new Map<string, Set<string>>();

  private loadDependencies(path: string) {
    try {
      return dependenciesIn(readFileSync(path, "utf8"));
    } catch (error) {
      debug("could not load dependencies for %s: %o", path, error);
      return [];
    }
  }

  private clearDependents(path: string) {
    this.dependents.forEach((group) => {
      group.delete(path);
    });
  }

  /**
   * (Re-)indexes the dependency edges for `path`, replacing any previously
   * recorded edges.
   *
   * Only relative imports are tracked; node_modules dependencies are ignored.
   *
   * @param path - Absolute path of the file to analyse.
   */
  public load(path: string) {
    this.clearDependents(path);

    for (const dependency of this.loadDependencies(path)) {
      if (!dependency.startsWith(".")) {
        return;
      }

      const key = resolve(dirname(path), dependency);

      if (!this.dependents.has(key)) {
        this.dependents.set(key, new Set());
      }

      this.dependents.get(key)?.add(path);
    }
  }

  /**
   * Returns the transitive set of files that (directly or indirectly) import
   * `path`.
   *
   * Uses a BFS traversal so each dependent is returned exactly once.
   *
   * @param path - Absolute path of the changed dependency.
   * @returns A `Set` of absolute paths of all dependent files.
   */
  public dependentsOf(path: string) {
    const marked = new Set<string>();
    const dependents = new Set<string>();
    const queue = [path];

    while (queue.length > 0) {
      const file = queue.shift();

      if (file !== undefined && !marked.has(file)) {
        marked.add(file);

        const fileDependents = this.dependents.get(file);

        if (fileDependents) {
          for (const dependent of fileDependents) {
            dependents.add(dependent);
            queue.push(dependent);
          }
        }
      }
    }

    return dependents;
  }
}
