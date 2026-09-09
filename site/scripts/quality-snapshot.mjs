import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const ref = process.argv[2];

if (!ref) {
  console.error("Usage: npm --prefix site run snapshot:audit -- <git-ref>");
  process.exit(1);
}

const testSourceFile =
  /(^|\/)(test|tests)\/.*\.(js|jsx|mjs|cjs|ts|tsx|py)$|(^|\/)[^/]+\.(test|spec)\.(js|jsx|mjs|cjs|ts|tsx|py)$|(^|\/)test_[^/]+\.py$/;
const pythonTestFile = /(^|\/)test_[^/]+\.py$/;
const explicitTestDeclaration =
  /(^|[^A-Za-z])(it|test)(\.(each|skip|only|todo))?\(/;

const { stdout: repoRoot } = await run("git", ["rev-parse", "--show-toplevel"]);
const gitOptions = {
  cwd: repoRoot.trim(),
  maxBuffer: 10 * 1024 * 1024,
};
const { stdout } = await run(
  "git",
  ["ls-tree", "-r", "--name-only", ref],
  gitOptions,
);
const testSources = stdout
  .split("\n")
  .filter(Boolean)
  .filter((path) => testSourceFile.test(path));

let testDeclarations = 0;
let testFiles = 0;
for (const path of testSources) {
  if (pythonTestFile.test(path)) {
    testFiles += 1;
    continue;
  }
  const { stdout: source } = await run(
    "git",
    ["show", `${ref}:${path}`],
    gitOptions,
  );
  const declarations = source
    .split(/\r?\n/)
    .filter((line) => explicitTestDeclaration.test(line)).length;
  if (declarations > 0) testFiles += 1;
  testDeclarations += declarations;
}

console.log(
  JSON.stringify(
    {
      commit: ref,
      testFiles,
      testDeclarations,
    },
    null,
    2,
  ),
);
