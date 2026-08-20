import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function isIdentifierStart(character) {
  return /[A-Z_a-z$]/u.test(character);
}

function isIdentifierPart(character) {
  return /[\w$]/u.test(character);
}

function tokenize(source) {
  const tokens = [];
  let index = 0;
  let line = 1;

  function canStartRegularExpression() {
    const previous = tokens[tokens.length - 1];
    if (previous === undefined) return true;
    if (previous.kind === "identifier") {
      return ["case", "return", "throw"].includes(previous.value);
    }
    return (
      previous.kind === "punctuation" &&
      ["(", "[", "{", ":", ",", ";", "=", "!", "?", "&", "|"].includes(
        previous.value,
      )
    );
  }

  function advance() {
    if (source[index] === "\n") line += 1;
    index += 1;
  }

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (character === undefined) break;
    if (/\s/u.test(character)) {
      advance();
      continue;
    }

    if (character === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") advance();
      continue;
    }

    if (character === "/" && next === "*") {
      advance();
      advance();
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        advance();
      }
      if (index < source.length) {
        advance();
        advance();
      }
      continue;
    }

    if (character === "/" && canStartRegularExpression()) {
      let inCharacterClass = false;
      advance();
      while (index < source.length) {
        if (source[index] === "\\") {
          advance();
          if (index < source.length) advance();
          continue;
        }
        if (source[index] === "[") inCharacterClass = true;
        if (source[index] === "]") inCharacterClass = false;
        if (source[index] === "/" && !inCharacterClass) {
          advance();
          while (/[A-Z_a-z]/u.test(source[index] ?? "")) advance();
          break;
        }
        advance();
      }
      continue;
    }

    if (character === '"' || character === "'") {
      const quote = character;
      const tokenLine = line;
      let value = "";
      advance();
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\") {
          advance();
          if (index < source.length) {
            value += source[index];
            advance();
          }
          continue;
        }
        value += source[index];
        advance();
      }
      if (source[index] === quote) advance();
      tokens.push({ kind: "string", line: tokenLine, value });
      continue;
    }

    if (character === "`") {
      advance();
      while (index < source.length && source[index] !== "`") {
        if (source[index] === "\\") {
          advance();
          if (index < source.length) advance();
          continue;
        }
        advance();
      }
      if (source[index] === "`") advance();
      continue;
    }

    if (isIdentifierStart(character)) {
      const tokenLine = line;
      let value = character;
      advance();
      while (
        index < source.length &&
        source[index] !== undefined &&
        isIdentifierPart(source[index])
      ) {
        value += source[index];
        advance();
      }
      tokens.push({ kind: "identifier", line: tokenLine, value });
      continue;
    }

    tokens.push({ kind: "punctuation", line, value: character });
    advance();
  }

  return tokens;
}

export function extractModuleSpecifiers(source) {
  const tokens = tokenize(source);
  const imports = [];

  function record(token) {
    if (token?.kind === "string") {
      imports.push({ line: token.line, specifier: token.value });
    }
  }

  function findFrom(startIndex) {
    for (let index = startIndex; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token?.value === ";") return;
      if (token?.kind === "identifier" && token.value === "from") {
        record(tokens[index + 1]);
        return;
      }
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "identifier") continue;

    if (token.value === "require" && tokens[index + 1]?.value === "(") {
      record(tokens[index + 2]);
      continue;
    }

    if (token.value === "import") {
      if (tokens[index - 1]?.value === ".") continue;
      if (tokens[index + 1]?.kind === "string") {
        record(tokens[index + 1]);
      } else if (tokens[index + 1]?.value === "(") {
        record(tokens[index + 2]);
      } else {
        findFrom(index + 1);
      }
      continue;
    }

    if (token.value === "export") {
      const nextToken = tokens[index + 1];
      const canReexport =
        nextToken?.value === "*" ||
        nextToken?.value === "{" ||
        (nextToken?.value === "type" &&
          ["*", "{"].includes(tokens[index + 2]?.value));
      if (canReexport) findFrom(index + 1);
    }
  }

  return imports;
}

function stripJsonComments(source) {
  let output = "";
  let index = 0;
  let quote;

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (quote !== undefined) {
      output += character;
      if (character === "\\") {
        index += 1;
        if (index < source.length) output += source[index];
      } else if (character === quote) {
        quote = undefined;
      }
      index += 1;
      continue;
    }

    if (character === '"') {
      quote = character;
      output += character;
      index += 1;
      continue;
    }

    if (character === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      output += "\n";
      index += 1;
      continue;
    }

    if (character === "/" && next === "*") {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        output += source[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      index += 2;
      continue;
    }

    output += character;
    index += 1;
  }

  return output.replaceAll(/,\s*([}\]])/gu, "$1");
}

async function readJson(pathname, { jsonc = false } = {}) {
  const source = await readFile(pathname, "utf8");
  return JSON.parse(jsonc ? stripJsonComments(source) : source);
}

async function directoryExists(pathname) {
  try {
    return (await readdir(pathname)).length >= 0;
  } catch {
    return false;
  }
}

async function collectSourceFiles(directory) {
  if (!(await directoryExists(directory))) return [];

  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
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

function exportKeys(manifest) {
  if (manifest.exports === undefined) return new Set(["."]);
  if (typeof manifest.exports === "string") return new Set(["."]);

  const keys = Object.keys(manifest.exports);
  return keys.some((key) => key.startsWith("."))
    ? new Set(keys)
    : new Set(["."]);
}

function exportMatches(keys, subpath) {
  if (keys.has(subpath)) return true;
  for (const key of keys) {
    if (!key.includes("*")) continue;
    const [prefix = "", suffix = ""] = key.split("*");
    if (subpath.startsWith(prefix) && subpath.endsWith(suffix)) return true;
  }
  return false;
}

function internalTarget(specifier, packageNames) {
  const candidates = [...packageNames].sort(
    (left, right) => right.length - left.length,
  );
  return candidates.find(
    (name) => specifier === name || specifier.startsWith(`${name}/`),
  );
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
        exportKeys: exportKeys(manifest),
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
      for (const { line, specifier } of extractModuleSpecifiers(source)) {
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
          !exportMatches(targetPackage.exportKeys, subpath)
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
