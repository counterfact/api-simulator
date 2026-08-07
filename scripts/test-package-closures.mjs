import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const packagesRoot = path.join(repositoryRoot, "packages");
const typeScriptCli = path.join(
  repositoryRoot,
  "node_modules",
  "typescript",
  "bin",
  "tsc",
);
const dependencyFields = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
];
const examples = new Map([
  ["@counterfact/client", "examples/reusable-request.mjs"],
  ["@counterfact/generator", "examples/generate-routes.mjs"],
  ["@counterfact/openapi", "examples/load-local-spec.mjs"],
  ["@counterfact/repl", "examples/complete-routes.mjs"],
  ["@counterfact/runtime", "examples/registries.mjs"],
  ["@counterfact/types", "examples/middleware.ts"],
]);

function executable(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

async function run(command, args, cwd, env = process.env) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });

  if (result.code !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.code})\n${result.stdout}\n${result.stderr}`,
    );
  }

  return result;
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadPackages() {
  const directories = await readdir(packagesRoot, { withFileTypes: true });
  const packages = [];

  for (const directory of directories) {
    if (!directory.isDirectory()) continue;
    const packageRoot = path.join(packagesRoot, directory.name);
    const manifestPath = path.join(packageRoot, "package.json");
    if (!(await pathExists(manifestPath))) continue;

    packages.push({
      manifest: JSON.parse(await readFile(manifestPath, "utf8")),
      root: packageRoot,
    });
  }

  return new Map(
    packages.map((workspace) => [workspace.manifest.name, workspace]),
  );
}

function internalDependencies(workspace, workspaces) {
  const dependencies = new Set();

  for (const field of dependencyFields) {
    for (const name of Object.keys(workspace.manifest[field] ?? {})) {
      if (workspaces.has(name)) dependencies.add(name);
    }
  }

  return dependencies;
}

function topologicallySort(workspaces) {
  const visiting = new Set();
  const visited = new Set();
  const result = [];

  function visit(name, trail = []) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(
        `Workspace dependency cycle: ${[...trail, name].join(" -> ")}`,
      );
    }

    visiting.add(name);
    const workspace = workspaces.get(name);
    assert(workspace, `Unknown workspace ${name}`);
    for (const dependency of internalDependencies(workspace, workspaces)) {
      visit(dependency, [...trail, name]);
    }
    visiting.delete(name);
    visited.add(name);
    result.push(name);
  }

  for (const name of [...workspaces.keys()].sort()) visit(name);
  return result;
}

function dependencyClosure(name, workspaces) {
  const closure = new Set();

  function collect(currentName) {
    if (closure.has(currentName)) return;
    closure.add(currentName);
    const workspace = workspaces.get(currentName);
    assert(workspace, `Unknown workspace ${currentName}`);
    for (const dependency of internalDependencies(workspace, workspaces)) {
      collect(dependency);
    }
  }

  collect(name);
  return closure;
}

function parsePackOutput(stdout) {
  const jsonStart = Math.max(
    stdout.lastIndexOf("\n["),
    stdout.startsWith("[") ? 0 : -1,
  );
  const [metadata] = JSON.parse(
    stdout.slice(jsonStart === 0 ? 0 : jsonStart + 1),
  );
  assert(metadata, "npm pack did not describe a tarball");
  return metadata;
}

async function packWorkspace(workspace, tarballDirectory, cacheDirectory) {
  const result = await run(
    executable("npm"),
    [
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      tarballDirectory,
      "--cache",
      cacheDirectory,
    ],
    workspace.root,
  );
  const metadata = parsePackOutput(result.stdout);
  return path.join(tarballDirectory, metadata.filename);
}

function exportSpecifiers(manifest) {
  assert(manifest.exports, `${manifest.name} must declare package exports`);
  return Object.keys(manifest.exports).map((subpath) =>
    subpath === "." ? manifest.name : `${manifest.name}${subpath.slice(1)}`,
  );
}

function representativeDeepImport(manifest) {
  const rootExport = manifest.exports["."];
  const target =
    typeof rootExport === "string"
      ? rootExport
      : (rootExport.import ?? rootExport.default);
  assert.equal(
    typeof target,
    "string",
    `${manifest.name} needs an import export`,
  );
  return `${manifest.name}/${target.replace(/^\.\//u, "")}`;
}

async function verifyPackageContents(packageDirectory, packageName) {
  const requiredPaths = ["README.md", "License.md", "dist"];
  const examplePath = examples.get(packageName);
  if (examplePath !== undefined) requiredPaths.push(examplePath);

  for (const required of requiredPaths) {
    assert(
      await pathExists(path.join(packageDirectory, required)),
      `${packageName} is missing ${required}`,
    );
  }

  for (const forbidden of ["src", "test"]) {
    assert(
      !(await pathExists(path.join(packageDirectory, forbidden))),
      `${packageName} unexpectedly contains ${forbidden}/`,
    );
  }

  async function findBuildInfo(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.name.endsWith(".tsbuildinfo")) return entryPath;
      if (entry.isDirectory()) {
        const nested = await findBuildInfo(entryPath);
        if (nested !== undefined) return nested;
      }
    }
    return undefined;
  }

  assert.equal(
    await findBuildInfo(packageDirectory),
    undefined,
    `${packageName} unexpectedly contains TypeScript build metadata`,
  );
}

function collectInstalledWorkspaces(tree, workspaceNames, found = new Set()) {
  for (const [name, dependency] of Object.entries(tree.dependencies ?? {})) {
    if (workspaceNames.has(name)) found.add(name);
    collectInstalledWorkspaces(dependency, workspaceNames, found);
  }
  return found;
}

async function verifyImports(consumerDirectory, manifest) {
  const specifiers = exportSpecifiers(manifest);
  const deepImport = representativeDeepImport(manifest);
  await writeFile(
    path.join(consumerDirectory, "verify-imports.mjs"),
    `import assert from "node:assert/strict";
for (const specifier of ${JSON.stringify(specifiers)}) {
  await import(specifier);
}
try {
  await import(${JSON.stringify(deepImport)});
  assert.fail("deep import unexpectedly succeeded");
} catch (error) {
  assert.equal(error?.code, "ERR_PACKAGE_PATH_NOT_EXPORTED");
}
`,
  );
  await run(executable("node"), ["verify-imports.mjs"], consumerDirectory);
}

async function verifyDeclarations(consumerDirectory, manifest, examplePath) {
  const imports = exportSpecifiers(manifest)
    .map(
      (specifier, index) =>
        `import type * as PackageExport${index} from ${JSON.stringify(specifier)};`,
    )
    .join("\n");
  await writeFile(path.join(consumerDirectory, "contract.ts"), `${imports}\n`);
  const files = ["contract.ts"];

  if (examplePath?.endsWith(".ts")) {
    files.push(examplePath);
  }

  await writeFile(
    path.join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          lib: ["ES2022"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2022",
          typeRoots: [path.join(repositoryRoot, "node_modules", "@types")],
          types: ["node"],
        },
        files,
      },
      undefined,
      2,
    )}\n`,
  );
  await run(
    process.execPath,
    [typeScriptCli, "--project", "tsconfig.json", "--pretty", "false"],
    consumerDirectory,
  );
}

async function runExample(consumerDirectory, examplePath) {
  if (examplePath === undefined || examplePath.endsWith(".ts")) return;
  await run(executable("node"), [examplePath], consumerDirectory);
}

async function verifyConsumer({
  cacheDirectory,
  manifest,
  name,
  tarballs,
  temporaryRoot,
  topologicalOrder,
  workspaces,
}) {
  const slug = name.replaceAll("@", "").replaceAll("/", "-");
  const consumerDirectory = path.join(temporaryRoot, "consumers", slug);
  await mkdir(consumerDirectory, { recursive: true });
  await writeFile(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: `${slug}-closure-consumer`, private: true, type: "module" }, undefined, 2)}\n`,
  );

  const closure = dependencyClosure(name, workspaces);
  const closureTarballs = topologicalOrder
    .filter((packageName) => closure.has(packageName))
    .map((packageName) => tarballs.get(packageName));
  assert(
    closureTarballs.every(Boolean),
    `${name} closure has an unpacked package`,
  );
  await run(
    executable("npm"),
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--cache",
      cacheDirectory,
      ...closureTarballs,
    ],
    consumerDirectory,
  );

  const listResult = await run(
    executable("npm"),
    ["ls", "--all", "--json"],
    consumerDirectory,
  );
  const installedWorkspaces = collectInstalledWorkspaces(
    JSON.parse(listResult.stdout),
    new Set(workspaces.keys()),
  );
  assert.deepEqual(
    [...installedWorkspaces].sort(),
    [...closure].sort(),
    `${name} installed Counterfact-package closure differs from its manifest closure`,
  );

  const packageDirectory = path.join(consumerDirectory, "node_modules", name);
  await verifyPackageContents(packageDirectory, name);
  await verifyImports(consumerDirectory, manifest);
  const example = examples.get(name);
  const examplePath = example
    ? path.join(packageDirectory, example)
    : undefined;
  await verifyDeclarations(consumerDirectory, manifest, examplePath);
  await runExample(consumerDirectory, examplePath);
  process.stdout.write(
    `Verified ${name} with ${closure.size} package tarball(s).\n`,
  );
}

const temporaryRoot = await mkdtemp(
  path.join(tmpdir(), "counterfact-package-closures-"),
);

try {
  const cacheDirectory = path.join(temporaryRoot, "npm-cache");
  const tarballDirectory = path.join(temporaryRoot, "tarballs");
  await Promise.all([
    mkdir(cacheDirectory),
    mkdir(tarballDirectory),
    mkdir(path.join(temporaryRoot, "consumers")),
  ]);

  const workspaces = await loadPackages();
  const topologicalOrder = topologicallySort(workspaces);
  process.stdout.write(`Workspace order: ${topologicalOrder.join(" -> ")}\n`);
  await rm(path.join(repositoryRoot, "node_modules", ".cache", "counterfact"), {
    force: true,
    recursive: true,
  });
  process.stdout.write("Building the monorepo once before packing...\n");
  await run(executable("npm"), ["run", "build"], repositoryRoot);

  const tarballs = new Map();
  for (const name of topologicalOrder) {
    const workspace = workspaces.get(name);
    assert(workspace);
    tarballs.set(
      name,
      await packWorkspace(workspace, tarballDirectory, cacheDirectory),
    );
  }

  for (const name of topologicalOrder) {
    const workspace = workspaces.get(name);
    assert(workspace);
    await verifyConsumer({
      cacheDirectory,
      manifest: workspace.manifest,
      name,
      tarballs,
      temporaryRoot,
      topologicalOrder,
      workspaces,
    });
  }

  process.stdout.write("All isolated package closures passed.\n");
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
