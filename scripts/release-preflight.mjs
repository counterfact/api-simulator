import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function executable(name) {
  return name === "node" ? process.execPath : name;
}

async function run(command, args, { capture = false } = {}) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      shell: process.platform === "win32" && command !== process.execPath,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let stdout = "";
    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
  });
  assert.equal(
    result.code,
    0,
    `${command} ${args.join(" ")} failed with exit code ${result.code}`,
  );
  return result.stdout.trim();
}

function versionAtLeast(actual, minimum) {
  const actualParts = actual.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);
  for (let index = 0; index < minimumParts.length; index += 1) {
    const difference = (actualParts[index] ?? 0) - minimumParts[index];
    if (difference !== 0) return difference > 0;
  }
  return true;
}

assert.equal(
  Number(process.versions.node.split(".")[0]),
  24,
  `Release preflight requires Node 24; received ${process.version}`,
);
const npmVersion = await run(executable("npm"), ["--version"], {
  capture: true,
});
assert(
  versionAtLeast(npmVersion, "11.5.1"),
  `Trusted publishing requires npm 11.5.1 or newer; received ${npmVersion}`,
);

await run(executable("yarn"), [
  "install",
  "--immutable",
  "--mode",
  "skip-build",
]);
await run(process.execPath, ["scripts/check-package-boundaries.mjs"]);
await run(process.execPath, ["scripts/test-package-closures.mjs"]);
await run(process.execPath, ["scripts/check-publishable.mjs"]);
await run(process.execPath, ["node_modules/@changesets/cli/bin.js", "status"]);

process.stdout.write("Release preflight passed without publishing.\n");
