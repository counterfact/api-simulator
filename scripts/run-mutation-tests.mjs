import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mutablePackages = new Set([
  "client",
  "counterfact",
  "generator",
  "openapi",
  "repl",
  "runtime",
]);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function usage() {
  return [
    "Usage: yarn test:mutation [--package <name>] [--dry-run] [--incremental] [--force]",
    "",
    `Packages: ${[...mutablePackages].join(", ")}`,
  ].join("\n");
}

function readArguments(args) {
  const remainingArguments = [...args];
  const options = {
    dryRun: false,
    force: false,
    incremental: false,
    packageName: undefined,
  };

  while (remainingArguments.length > 0) {
    const argument = remainingArguments.shift();

    if (argument === "--help" || argument === "-h") {
      process.stdout.write(`${usage()}\n`);
      return undefined;
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--force") {
      options.force = true;
      continue;
    }
    if (argument === "--incremental") {
      options.incremental = true;
      continue;
    }
    if (argument === "--package") {
      options.packageName = remainingArguments.shift();
      if (options.packageName === undefined) {
        throw new Error(`--package requires a value.\n\n${usage()}`);
      }
      continue;
    }
    if (argument?.startsWith("--package=")) {
      options.packageName = argument.slice("--package=".length);
      continue;
    }

    throw new Error(`Unknown argument "${argument}".\n\n${usage()}`);
  }

  if (
    options.packageName !== undefined &&
    !mutablePackages.has(options.packageName)
  ) {
    throw new Error(
      `Unknown package "${options.packageName}". Expected one of: ${[...mutablePackages].join(", ")}.`,
    );
  }
  if (options.force && !options.incremental) {
    throw new Error("--force requires --incremental.");
  }

  return options;
}

async function run(options) {
  const cli = path.join(
    repositoryRoot,
    "node_modules",
    "@stryker-mutator",
    "core",
    "bin",
    "stryker.js",
  );
  const args = [cli, "run"];

  if (options.dryRun) args.push("--dryRunOnly");
  if (options.incremental) args.push("--incremental");
  if (options.force) args.push("--force");

  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        ...(process.platform === "darwin" &&
        process.env.CHOKIDAR_USEPOLLING === undefined
          ? { CHOKIDAR_USEPOLLING: "1" }
          : {}),
        ...(options.packageName
          ? { COUNTERFACT_MUTATION_PACKAGE: options.packageName }
          : {}),
      },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (code !== 0) {
    throw new Error(`Stryker exited with code ${String(code)}.`);
  }
}

const options = readArguments(process.argv.slice(2));
if (options) await run(options);
