import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packagesRoot = path.join(repositoryRoot, "packages");

function executable(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function publicWorkspaces() {
  const entries = await fs.readdir(packagesRoot, { withFileTypes: true });
  const workspaces = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const directory = path.join(packagesRoot, entry.name);
        const packageJson = await readJson(
          path.join(directory, "package.json"),
        );
        return { directory, packageJson };
      }),
  );

  return workspaces
    .filter(({ packageJson }) => !packageJson.private)
    .sort((left, right) =>
      left.packageJson.name.localeCompare(right.packageJson.name),
    );
}

async function checkWorkspace({ directory, packageJson }) {
  const versionResult = await runNpm(
    ["view", `${packageJson.name}@${packageJson.version}`, "version", "--json"],
    directory,
  );
  const versionIsPublished =
    versionResult.code === 0 &&
    JSON.parse(versionResult.stdout) === packageJson.version;
  const command = versionIsPublished ? "pack" : "publish";
  const args = versionIsPublished
    ? ["pack", "--dry-run", "--ignore-scripts", "--json"]
    : [
        "publish",
        "--dry-run",
        "--access",
        "public",
        "--ignore-scripts",
        "--provenance=false",
        "--json",
      ];
  const result = await runNpm(args, directory);

  assert.equal(
    result.code,
    0,
    `${packageJson.name} failed npm ${command} --dry-run:\n${result.stderr}${result.stdout}`,
  );

  const parsedReport = JSON.parse(result.stdout);
  const packageReport = versionIsPublished
    ? parsedReport[0]
    : parsedReport[packageJson.name];
  assert(
    packageReport,
    `${packageJson.name} was missing from npm's dry-run report`,
  );
  assert.equal(packageReport.name, packageJson.name);
  assert.equal(packageReport.version, packageJson.version);
  assert(
    packageReport.entryCount > 0,
    `${packageJson.name} would publish no files`,
  );

  const status = versionIsPublished ? "packed" : "publishable";
  process.stdout.write(
    `${packageJson.name}@${packageJson.version}: ${status}, ${packageReport.entryCount} files, ${packageReport.size} packed bytes\n`,
  );
}

async function runNpm(args, directory) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable("npm"), args, {
      cwd: directory,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });
  return result;
}

for (const workspace of await publicWorkspaces()) {
  await checkWorkspace(workspace);
}

process.stdout.write("All public workspaces passed npm packaging dry runs.\n");
