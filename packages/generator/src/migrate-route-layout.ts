import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { METHODS } from "node:http";
import path from "node:path";
import ts from "typescript";

/* eslint-disable security/detect-non-literal-fs-filename -- The migration enumerates and stages only validated paths inside the caller's routes tree. */

import { formatStatements } from "./ast.js";
import {
  CaseLayout,
  collisionRouteContents,
  missingRouteMapMethods,
  readRoutePaths,
} from "./route-file-layout.js";
import type { Script } from "./script.js";

type Group = ReadonlyArray<readonly [string, Script]>;
type File = { name: string; bytes: Buffer; mode: number };

export const ROUTE_MIGRATION_RECORD = ".counterfact-migrated-routes.json";
const PRIVATE_PREFIX = "_.counterfact-legacy-";
const SOURCE = /\.[cm]?[jt]s$/u;
const httpMethods = new Set(METHODS);
const tsSource = (file: File) =>
  ts.createSourceFile(
    file.name,
    file.bytes.toString("utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
const slash = (name: string) => name.split(path.sep).join("/");

async function inventory(
  root: string,
  relative = "",
  special: string[] = [],
): Promise<File[]> {
  let names: string[];
  try {
    names = await fs.readdir(path.join(root, relative));
  } catch (error) {
    if (relative === "" && (error as NodeJS.ErrnoException).code === "ENOENT")
      return [];
    throw error;
  }
  const found: File[] = [];
  for (const name of names.sort()) {
    const key = path.posix.join(relative, name);
    const full = path.join(root, key);
    const stat = await fs.lstat(full);
    if (stat.isDirectory())
      found.push(...(await inventory(root, key, special)));
    else if (stat.isFile())
      found.push({
        name: key,
        bytes: await fs.readFile(full),
        mode: stat.mode,
      });
    else special.push(key);
  }
  return found;
}

function pathMatches(files: string[], expected: string[]): boolean {
  return (
    JSON.stringify([...files].sort()) === JSON.stringify([...expected].sort())
  );
}

/**
 * Finds the route a legacy module was generated for. The generated `Route`
 * type names it exactly; the file name can be spelled like a case variant,
 * because a case-insensitive file system keeps the first spelling written.
 */
function originalPath(
  file: string,
  source: ts.SourceFile,
  group: Group,
): string {
  const routes = group.map(([route]) => route);
  const typed = routeTypePath(source);
  if (typed !== undefined && routes.includes(typed)) return typed;
  const name = "/" + file.replace(SOURCE, "");
  if (name === "/index") {
    const root = routes.includes("/");
    if (root && routes.includes("/index"))
      throw new Error(
        "Legacy routes/index.ts is ambiguous between / and /index",
      );
    return root ? "/" : name;
  }
  if (routes.includes(name)) return name;
  const variants = routes.filter(
    (route) => route.toLowerCase() === name.toLowerCase(),
  );
  return variants.length === 1 ? variants[0]! : name;
}

/** Reads the path from `type Route = Routes["/a"]["/{b}"]`. */
function routeTypePath(source: ts.SourceFile): string | undefined {
  for (const statement of source.statements) {
    if (
      !ts.isTypeAliasDeclaration(statement) ||
      statement.name.text !== "Route"
    )
      continue;
    const segments: string[] = [];
    let type: ts.TypeNode = statement.type;
    while (ts.isIndexedAccessTypeNode(type)) {
      const index = type.indexType;
      if (!ts.isLiteralTypeNode(index) || !ts.isStringLiteral(index.literal))
        return undefined;
      segments.unshift(index.literal.text);
      type = type.objectType;
    }
    if (
      !ts.isTypeReferenceNode(type) ||
      !ts.isIdentifier(type.typeName) ||
      type.typeName.text !== "Routes" ||
      segments.length === 0
    )
      return undefined;
    return segments.join("") || "/";
  }
  return undefined;
}

/** Moves `file` to `target` (a `.ts` path) while keeping its own extension. */
function retarget(file: string, target: string): string {
  return target
    .replace(/^routes\//u, "")
    .replace(SOURCE, path.posix.extname(file));
}

function archive(file: File, destination: string): string {
  const hash = createHash("sha256")
    .update(file.name)
    .digest("hex")
    .slice(0, 16);
  return slash(
    path.posix.join(
      path.posix.dirname(destination),
      PRIVATE_PREFIX + hash + path.posix.extname(file.name),
    ),
  );
}

function modulePath(from: string, to: string, asset = false): string {
  const physical = path.posix.relative(path.posix.dirname(from), to);
  const relative = asset ? physical : physical.replace(/\.ts$/u, ".js");
  return relative.startsWith(".") ? relative : "./" + relative;
}

function preservedHandlers(
  file: File,
  group: Group,
  imports: Map<string, string>,
  wrapper: string,
): ReadonlyArray<readonly [string, string, ts.Expression]> {
  if (!file.name.endsWith(".ts"))
    throw new Error(
      `Move ${file.name} manually: automatic handler migration supports TypeScript route modules`,
    );
  const source = tsSource(file);
  const declared = readRoutePaths(source);
  const physical = originalPath(file.name, source, group);
  const alias = `legacy${imports.size + 1}`;
  imports.set(alias, modulePath(wrapper, archive(file, wrapper)));
  const result: Array<readonly [string, string, ts.Expression]> = [];
  function preserve(
    bindingName: string,
    pathName: string,
    keyed: boolean,
  ): void {
    const method = bindingName.toUpperCase();
    if (result.some(([route, name]) => route === pathName && name === method))
      throw new Error(
        `Move ambiguous authored handler ${method} ${pathName} from ${file.name} manually`,
      );

    if (
      !group.some(
        ([route, script]) => route === pathName && script.exports.has(method),
      )
    ) {
      throw new Error(
        `Move unmatched authored handler ${method} ${pathName} from ${file.name} manually`,
      );
    }
    const binding = ts.factory.createPropertyAccessExpression(
      ts.factory.createIdentifier(alias),
      bindingName,
    );
    result.push([
      pathName,
      method,
      keyed
        ? ts.factory.createElementAccessExpression(
            binding,
            ts.factory.createStringLiteral(pathName),
          )
        : binding,
    ]);
  }
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      throw new Error(`Move re-exported handlers in ${file.name} manually`);
    }
    const modifiers = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)
      : undefined;
    if (
      !modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword) ||
      modifiers.some((mod) => mod.kind === ts.SyntaxKind.DefaultKeyword)
    )
      continue;
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      httpMethods.has(statement.name.text.toUpperCase())
    ) {
      const routeName = declared?.length === 1 ? declared[0]! : physical;
      if (declared && declared.length !== 1)
        throw new Error(`Ambiguous handler in ${file.name}`);
      preserve(statement.name.text, routeName, false);
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        !httpMethods.has(declaration.name.text.toUpperCase())
      )
        continue;
      const initializer = declaration.initializer;
      if (initializer && ts.isObjectLiteralExpression(initializer)) {
        if (!declared || declared.length === 0)
          throw new Error(`Add exact path metadata in ${file.name}`);
        for (const property of initializer.properties) {
          if (
            (!ts.isPropertyAssignment(property) &&
              !ts.isMethodDeclaration(property)) ||
            !ts.isStringLiteral(property.name) ||
            !declared.includes(property.name.text)
          )
            throw new Error(
              `Move computed handler maps in ${file.name} manually`,
            );
          preserve(declaration.name.text, property.name.text, true);
        }
      } else {
        const routeName = declared?.length === 1 ? declared[0]! : physical;
        if (declared && declared.length !== 1)
          throw new Error(`Ambiguous handler in ${file.name}`);
        preserve(declaration.name.text, routeName, false);
      }
    }
  }
  if (result.length === 0)
    throw new Error(`No static HTTP handler exports found in ${file.name}`);
  return result;
}

/** Rewrite only moved static relative references, preserving every other source byte. */
function relocate(
  file: File,
  target: string,
  outputs: Map<string, string>,
): Buffer {
  if (!SOURCE.test(file.name)) return file.bytes;
  const source = tsSource(file);
  const edits = new Map<number, { end: number; value: string }>();
  const remap = (value: ts.Expression | undefined, asset = false) => {
    if (!value || !ts.isStringLiteralLike(value) || !value.text.startsWith("."))
      return;
    const oldPath = path.posix.normalize(
      path.posix.join(path.posix.dirname(file.name), value.text),
    );
    const withoutExtension = oldPath.replace(/\.[cm]?[jt]s$/u, "");
    const candidates = [
      oldPath,
      withoutExtension + ".ts",
      withoutExtension + ".mts",
      withoutExtension + ".cts",
      oldPath + ".ts",
      oldPath + ".js",
      path.posix.join(oldPath, "index.ts"),
    ];
    const mapped = (asset ? [oldPath] : candidates)
      .map((candidate) => outputs.get(candidate))
      .find(Boolean);
    if (!mapped) return; // external to the route tree or unresolved in the original
    const next = modulePath(target, mapped, asset);
    if (next !== value.text)
      edits.set(value.getStart(source), {
        end: value.end,
        value: JSON.stringify(next),
      });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      remap(node.moduleSpecifier);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      const reference = node.arguments[0];
      if (
        reference &&
        !ts.isStringLiteralLike(reference) &&
        target !== file.name
      )
        throw new Error(
          `Move dynamic imports in ${file.name} manually before changing the route layout`,
        );
      remap(reference);
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "URL"
    )
      remap(node.arguments?.[0], true);
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (edits.size === 0) return file.bytes;
  let text = source.text;
  for (const [start, edit] of [...edits].sort(([a], [b]) => b - a))
    text = text.slice(0, start) + edit.value + text.slice(edit.end);
  return Buffer.from(text);
}

async function middlewareWrapper(
  target: string,
  files: File[],
): Promise<string> {
  const entries: ts.PropertyAssignment[] = [];
  const imports: ts.ImportDeclaration[] = [];
  for (const file of files) {
    if (!file.name.endsWith(".ts"))
      throw new Error(
        `Move middleware ${file.name} manually before changing the route layout`,
      );
    const source = tsSource(file);
    const declarations = source.statements.flatMap((statement) =>
      ts.isVariableStatement(statement)
        ? [...statement.declarationList.declarations]
        : [],
    );
    if (
      declarations.some(
        (entry) =>
          ts.isIdentifier(entry.name) &&
          entry.name.text === "middleware" &&
          entry.initializer &&
          ts.isObjectLiteralExpression(entry.initializer),
      )
    )
      throw new Error(
        `Combine already case-keyed middleware in ${file.name} manually`,
      );
    const alias = `legacy${imports.length + 1}`;
    imports.push(
      ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamespaceImport(ts.factory.createIdentifier(alias)),
        ),
        ts.factory.createStringLiteral(
          modulePath(target, archive(file, target)),
        ),
      ),
    );
    const directory = path.posix.dirname(file.name);
    entries.push(
      ts.factory.createPropertyAssignment(
        ts.factory.createStringLiteral(
          directory === "." ? "/" : "/" + directory,
        ),
        ts.factory.createPropertyAccessExpression(
          ts.factory.createIdentifier(alias),
          "middleware",
        ),
      ),
    );
  }
  return formatStatements([
    ...imports,
    ts.factory.createVariableStatement(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            "middleware",
            undefined,
            undefined,
            ts.factory.createObjectLiteralExpression(entries, true),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  ]);
}

/** Keep an existing canonical wrapper stable across OpenAPI declaration reordering. */
export async function managedRouteSpellings(
  destination: string,
  logicalFiles: Iterable<string>,
): Promise<string[]> {
  const folded = new Set([...logicalFiles].map((file) => file.toLowerCase()));
  const result: string[] = [];
  const visit = async (dir: string) => {
    let entries;
    try {
      entries = await fs.readdir(path.join(destination, dir), {
        withFileTypes: true,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = dir + "/" + entry.name;
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile() && folded.has(name.toLowerCase())) {
        const bytes = await fs.readFile(path.join(destination, name));
        if (
          bytes.includes("__counterfactPaths") &&
          readRoutePaths(tsSource({ name, bytes, mode: 0 }))?.length
        )
          result.push(name);
      }
    }
  };
  await visit("routes");
  return result;
}

/** Plan entirely in memory, then swap in a staged tree and retain the original. */
export async function migrateLegacyRoutes(
  destination: string,
  groups: ReadonlyMap<string, Group>,
): Promise<void> {
  const root = path.join(destination, "routes");
  if (groups.size === 0) return;
  const special: string[] = [];
  const files = await inventory(root, "", special);
  if (files.length === 0) return;
  const caseFiles = new Map<string, File[]>();
  const groupTargets = new Map(
    [...groups.keys()].map((name) => [name.toLowerCase(), name]),
  );
  for (const file of files) {
    const key = "routes/" + file.name.replace(SOURCE, ".ts").toLowerCase();
    const canonical = groupTargets.get(key);
    if (!canonical) continue;
    const peers = caseFiles.get(canonical) ?? [];
    peers.push(file);
    caseFiles.set(canonical, peers);
  }
  const layout = new CaseLayout();
  for (const target of groups.keys())
    layout.file(target.slice("routes/".length));
  const canonicalDirectory = (name: string) => {
    const parent = path.posix.dirname(name);
    return path.posix.join(
      parent === "." ? "" : layout.file(parent),
      path.posix.basename(name),
    );
  };
  const outputs = new Map(
    files.map((file) => [file.name, canonicalDirectory(file.name)]),
  );
  const wrappers = new Map<string, string>();
  const migrateGroups = [...groups].filter(([target, group]) => {
    const candidates = caseFiles.get(target) ?? [];
    if (candidates.length === 0) return false;
    const candidate =
      candidates.find((file) => file.name.endsWith(".ts")) ?? candidates[0]!;
    const source = tsSource(candidate);
    const declared = readRoutePaths(source);
    const expected = group.map(([route]) => route);
    // A route without a collision keeps its module as-is. When the module is
    // spelled differently (it sits in a directory a case variant created), it
    // only moves to the chosen spelling.
    if (!declared && group.length === 1 && candidates.length === 1) {
      outputs.set(candidate.name, retarget(candidate.name, target));
      return false;
    }
    // Files that differ only by extension (pet.js beside pet.ts) are not case
    // variants and stay where they are.
    if (
      candidates.some(
        (file) => "routes/" + file.name.replace(SOURCE, ".ts") !== target,
      )
    )
      return true;
    if (!declared && group.length === 1) return false;
    return (
      !declared ||
      !pathMatches(declared, expected) ||
      (group.length > 1 && !missingRouteMapMethods(source, group))
    );
  });
  const shouldMoveDirectories = files.some(
    (file) => outputs.get(file.name) !== file.name,
  );
  if (migrateGroups.length === 0 && !shouldMoveDirectories) return;
  if (special.length > 0) {
    throw new Error(
      `Cannot migrate routes containing a symlink or special file: ${special.join(", ")}`,
    );
  }
  for (const [target, group] of migrateGroups) {
    const wrapper = target.slice("routes/".length);
    const imported = new Map<string, string>();
    const handlers = new Map<string, ts.Expression>();
    for (const file of caseFiles.get(target) ?? []) {
      for (const [route, method, implementation] of preservedHandlers(
        file,
        group,
        imported,
        wrapper,
      )) {
        const key = JSON.stringify([route, method]);
        if (handlers.has(key))
          throw new Error(`Multiple authored handlers for ${method} ${route}`);
        handlers.set(key, implementation);
      }
      outputs.set(file.name, archive(file, wrapper));
    }
    wrappers.set(
      wrapper,
      await collisionRouteContents(group, imported, handlers),
    );
  }
  const middleware = new Map<string, File[]>();
  for (const file of files) {
    if (!/^_\.middleware\.[cm]?[jt]s$/u.test(path.posix.basename(file.name)))
      continue;
    const target = canonicalDirectory(file.name).replace(SOURCE, ".ts");
    const peers = middleware.get(target) ?? [];
    peers.push(file);
    middleware.set(target, peers);
  }
  for (const [target, candidates] of middleware) {
    if (candidates.every((file) => file.name.replace(SOURCE, ".ts") === target))
      continue;
    if (candidates.length === 1) {
      outputs.set(candidates[0]!.name, retarget(candidates[0]!.name, target));
      continue;
    }
    for (const file of candidates)
      outputs.set(file.name, archive(file, target));
    wrappers.set(target, await middlewareWrapper(target, candidates));
  }
  const taken = new Set([...wrappers.keys()].map((name) => name.toLowerCase()));
  const staged = files.map((file) => {
    const target = outputs.get(file.name)!;
    const key = target.toLowerCase();
    if (taken.has(key))
      throw new Error(
        `Route layout migration would overwrite ${target}; resolve aliases manually`,
      );
    taken.add(key);
    return { ...file, name: target, bytes: relocate(file, target, outputs) };
  });
  const stage = await fs.mkdtemp(
    path.join(destination, ".counterfact-route-migration-"),
  );
  const backup = stage + "-original";
  try {
    for (const [name, content] of wrappers) {
      const full = path.join(stage, name);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, { flag: "wx" });
    }
    for (const file of staged) {
      const full = path.join(stage, file.name);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, file.bytes, { mode: file.mode, flag: "wx" });
    }
    await fs.writeFile(
      path.join(stage, ROUTE_MIGRATION_RECORD),
      JSON.stringify({
        backup: path.basename(backup),
        message:
          "Retain authored dependencies until the migrated tree has been reviewed.",
      }) + "\n",
    );
    const latestSpecial: string[] = [];
    const latest = await inventory(root, "", latestSpecial);
    const prior = new Map(files.map((file) => [file.name, file.bytes]));
    if (
      latestSpecial.length > 0 ||
      latest.length !== files.length ||
      latest.some((file) => !prior.get(file.name)?.equals(file.bytes))
    )
      throw new Error(
        "Route files changed concurrently; migration stopped without replacing the original tree",
      );
    await fs.rename(root, backup);
    try {
      await fs.rename(stage, root);
    } catch (error) {
      try {
        await fs.rename(backup, root);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Could not install or restore the migrated routes. Original files remain in ${backup}.`,
          { cause: rollbackError },
        );
      }
      throw error;
    }
    process.stdout.write(
      `Migrated route layout. Original route files are backed up in ${backup}.\n`,
    );
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}
