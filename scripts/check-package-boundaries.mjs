import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

export const ADR_DEPENDENCY_ALLOWLIST = Object.freeze({
  "@counterfact/client": ["@counterfact/openapi"],
  "@counterfact/generator": ["@counterfact/openapi", "@counterfact/types"],
  "@counterfact/openapi": ["@counterfact/types"],
  "@counterfact/repl": ["@counterfact/client", "@counterfact/runtime"],
  "@counterfact/runtime": ["@counterfact/openapi", "@counterfact/types"],
  "@counterfact/types": [],
  counterfact: [
    "@counterfact/client",
    "@counterfact/generator",
    "@counterfact/openapi",
    "@counterfact/repl",
    "@counterfact/runtime",
    "@counterfact/types",
  ],
});

const PRODUCTION_DEPENDENCY_FIELDS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
];
const PRODUCTION_SOURCE_DIRECTORIES = ["src", "bin"];
const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);

// Parse syntax rather than approximating JavaScript lexical rules. Computed
// module names are outside this static check; literal require() calls count.
export function extractModuleSpecifiers(source, filename = "source.ts") {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = [];

  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      specifier = node.moduleSpecifier;
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      [specifier] = node.arguments;
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      specifier = node.moduleReference.expression;
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      specifier = node.argument.literal;
    }
    if (
      specifier &&
      (ts.isStringLiteral(specifier) ||
        ts.isNoSubstitutionTemplateLiteral(specifier))
    ) {
      imports.push({
        line:
          file.getLineAndCharacterOfPosition(specifier.getStart(file)).line + 1,
        specifier: specifier.text,
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return imports;
}

async function readJson(pathname, { jsonc = false } = {}) {
  const source = await readFile(pathname, "utf8");
  if (!jsonc) return JSON.parse(source);
  const result = ts.parseConfigFileTextToJson(pathname, source);
  if (result.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(result.error.messageText, "\n"),
    );
  }
  return result.config;
}

async function collectSourceFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const pathname = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(pathname)));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(pathname);
    }
  }
  return files;
}

function productionDependencies(manifest) {
  const names = new Set();
  for (const field of PRODUCTION_DEPENDENCY_FIELDS) {
    for (const name of Object.keys(manifest[field] ?? {})) names.add(name);
  }
  return names;
}

// This is public-subpath validation, not runtime condition resolution. A
// conditional export is public if any branch exposes a target (including types).
function hasExportTarget(target) {
  if (typeof target === "string") return true;
  if (target === null || typeof target !== "object") return false;
  return Object.values(target).some(hasExportTarget);
}

function isExported(manifest, subpath) {
  const exports = manifest.exports;
  if (exports === undefined) return subpath === ".";
  if (
    exports === null ||
    typeof exports !== "object" ||
    Array.isArray(exports)
  ) {
    return subpath === "." && hasExportTarget(exports);
  }
  const keys = Object.keys(exports);
  if (!keys.some((key) => key.startsWith("."))) {
    return subpath === "." && hasExportTarget(exports);
  }
  if (Object.hasOwn(exports, subpath)) return hasExportTarget(exports[subpath]);

  // Most-specific pattern wins, even when its target is null. Do not let a
  // broader wildcard reopen a private subpath.
  const patterns = keys
    .filter((key) => {
      const star = key.indexOf("*");
      return (
        star !== -1 &&
        subpath.length >= key.length - 1 &&
        subpath.startsWith(key.slice(0, star)) &&
        subpath.endsWith(key.slice(star + 1))
      );
    })
    .sort(
      (left, right) =>
        right.indexOf("*") - left.indexOf("*") || right.length - left.length,
    );
  return patterns.length > 0 && hasExportTarget(exports[patterns[0]]);
}

function internalTarget(specifier, packageNames) {
  const segments = specifier.split("/");
  const name = specifier.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : segments[0];
  return packageNames.has(name) ? name : undefined;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function findCycles(graph) {
  const cycles = [];
  const complete = new Set();
  const active = new Set();
  const stack = [];

  function visit(name) {
    if (active.has(name)) {
      const start = stack.indexOf(name);
      cycles.push([...stack.slice(start), name]);
      return;
    }
    if (complete.has(name)) return;

    active.add(name);
    stack.push(name);
    for (const dependency of graph.get(name) ?? []) visit(dependency);
    stack.pop();
    active.delete(name);
    complete.add(name);
  }

  for (const name of graph.keys()) visit(name);
  return cycles;
}

async function discoverPackages(repositoryRoot) {
  const packagesDirectory = path.join(repositoryRoot, "packages");
  const entries = await readdir(packagesDirectory, { withFileTypes: true });
  const packages = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const root = path.join(packagesDirectory, entry.name);
    const manifestPath = path.join(root, "package.json");
    try {
      const manifest = await readJson(manifestPath);
      packages.push({
        dependencies: productionDependencies(manifest),
        manifest,
        manifestPath,
        name: manifest.name,
        root,
      });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  return packages;
}

export async function validatePackageBoundaries(
  repositoryRoot,
  { allowlist = ADR_DEPENDENCY_ALLOWLIST } = {},
) {
  const errors = [];
  const packages = await discoverPackages(repositoryRoot);
  const byName = new Map(
    packages.map((packageInfo) => [packageInfo.name, packageInfo]),
  );
  const byRoot = new Map(
    packages.map((packageInfo) => [
      path.resolve(packageInfo.root),
      packageInfo,
    ]),
  );
  const expectedNames = new Set(Object.keys(allowlist));
  const packageNames = new Set(byName.keys());

  for (const name of expectedNames) {
    if (!byName.has(name)) errors.push(`ADR package is missing: ${name}`);
  }
  for (const name of packageNames) {
    if (!expectedNames.has(name))
      errors.push(`Package has no ADR dependency policy: ${name}`);
  }

  const graph = new Map();
  for (const packageInfo of packages) {
    const allowed = new Set(allowlist[packageInfo.name] ?? []);
    const internalDependencies = new Set();

    for (const dependency of packageInfo.dependencies) {
      if (byName.has(dependency)) {
        internalDependencies.add(dependency);
        if (!allowed.has(dependency)) {
          errors.push(
            `${packageInfo.name}: disallowed dependency on ${dependency}`,
          );
        }
      } else if (
        dependency === "counterfact" ||
        dependency.startsWith("@counterfact/")
      ) {
        errors.push(
          `${packageInfo.name}: dependency names unknown Counterfact package ${dependency}`,
        );
      }
    }
    graph.set(packageInfo.name, internalDependencies);

    const tsconfigPath = path.join(packageInfo.root, "tsconfig.json");
    let tsconfig;
    try {
      tsconfig = await readJson(tsconfigPath, { jsonc: true });
    } catch (error) {
      errors.push(
        `${packageInfo.name}: cannot read tsconfig.json (${error.message})`,
      );
      continue;
    }

    const referencedPackages = new Set();
    for (const reference of tsconfig.references ?? []) {
      if (typeof reference.path !== "string") {
        errors.push(
          `${packageInfo.name}: tsconfig reference has no string path`,
        );
        continue;
      }
      let referencedRoot = path.resolve(packageInfo.root, reference.path);
      if (path.extname(referencedRoot) === ".json") {
        referencedRoot = path.dirname(referencedRoot);
      }
      const referencedPackage = byRoot.get(referencedRoot);
      if (referencedPackage === undefined) {
        errors.push(
          `${packageInfo.name}: tsconfig reference is not a workspace package: ${reference.path}`,
        );
      } else {
        referencedPackages.add(referencedPackage.name);
      }
    }

    for (const dependency of internalDependencies) {
      if (!referencedPackages.has(dependency)) {
        errors.push(
          `${packageInfo.name}: production dependency ${dependency} is missing from tsconfig references`,
        );
      }
    }
    for (const reference of referencedPackages) {
      if (!internalDependencies.has(reference)) {
        errors.push(
          `${packageInfo.name}: tsconfig references ${reference} without a production dependency`,
        );
      }
    }
  }

  for (const packageInfo of packages) {
    const sourceFiles = [];
    for (const sourceDirectory of PRODUCTION_SOURCE_DIRECTORIES) {
      sourceFiles.push(
        ...(await collectSourceFiles(
          path.join(packageInfo.root, sourceDirectory),
        )),
      );
    }

    for (const sourceFile of sourceFiles) {
      const relativeFile = path.relative(repositoryRoot, sourceFile);
      const source = await readFile(sourceFile, "utf8");
      for (const { line, specifier } of extractModuleSpecifiers(
        source,
        sourceFile,
      )) {
        if (specifier.startsWith(".")) {
          const resolved = path.resolve(path.dirname(sourceFile), specifier);
          if (!isInside(packageInfo.root, resolved)) {
            errors.push(
              `${packageInfo.name}: relative import escapes package root at ${relativeFile}:${line}: ${specifier}`,
            );
          }
          continue;
        }

        const targetName = internalTarget(specifier, packageNames);
        if (targetName === undefined) {
          if (specifier.startsWith("@counterfact/")) {
            errors.push(
              `${packageInfo.name}: import names unknown Counterfact package at ${relativeFile}:${line}: ${specifier}`,
            );
          }
          continue;
        }

        if (
          packageInfo.name !== "counterfact" &&
          targetName === "counterfact"
        ) {
          errors.push(
            `${packageInfo.name}: focused package imports counterfact at ${relativeFile}:${line}`,
          );
        }

        const targetPackage = byName.get(targetName);
        const subpath =
          specifier === targetName
            ? "."
            : `.${specifier.slice(targetName.length)}`;
        if (
          targetPackage !== undefined &&
          !isExported(targetPackage.manifest, subpath)
        ) {
          errors.push(
            `${packageInfo.name}: private/deep import is not exported by ${targetName} at ${relativeFile}:${line}: ${specifier}`,
          );
        }

        if (
          targetName !== packageInfo.name &&
          !packageInfo.dependencies.has(targetName)
        ) {
          errors.push(
            `${packageInfo.name}: import of ${targetName} is missing a production dependency at ${relativeFile}:${line}`,
          );
        }

        if (
          targetName !== packageInfo.name &&
          !(allowlist[packageInfo.name] ?? []).includes(targetName)
        ) {
          errors.push(
            `${packageInfo.name}: import violates ADR dependency direction at ${relativeFile}:${line}: ${targetName}`,
          );
        }
      }
    }
  }

  for (const cycle of findCycles(graph)) {
    errors.push(`Counterfact package dependency cycle: ${cycle.join(" -> ")}`);
  }

  return {
    errors: [...new Set(errors)].sort(),
    packageNames: [...packageNames].sort(),
  };
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const { errors, packageNames } =
    await validatePackageBoundaries(repositoryRoot);

  if (errors.length > 0) {
    process.stderr.write(
      `Package boundary check failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Package boundaries are valid for ${packageNames.length} workspaces.\n`,
    );
  }
}
