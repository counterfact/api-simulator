import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
// Yarn adds its executable shims to PATH for package scripts. npm_execpath
// may itself point to a shell wrapper, so do not execute it as JavaScript.
const elapsed = (start) =>
  `${((performance.now() - start) / 1000).toFixed(1)}s`;

// Keep this order aligned with the counterfact workspace's build script.
// That script remains self-contained for prepack and published-package builds.
const stages = [
  {
    label: "Generator (including shared types and OpenAPI)",
    workspace: "@counterfact/generator",
    commands: [["build"]],
  },
  {
    label: "Runtime",
    workspace: "@counterfact/runtime",
    commands: [["build"]],
  },
  { label: "Client", workspace: "@counterfact/client", commands: [["build"]] },
  { label: "REPL", workspace: "@counterfact/repl", commands: [["build"]] },
  {
    label: "Tutorials",
    workspace: "@counterfact/tutorials",
    commands: [
      ["exec", "rimraf", "dist"],
      ["exec", "tsc", "--build", "--force"],
    ],
  },
  {
    label: "Counterfact CLI",
    workspace: "counterfact",
    commands: [
      ["exec", "rimraf", "dist"],
      ["exec", "tsc", "--build", "--force"],
    ],
  },
];

async function run(workspace, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("yarn", ["workspace", workspace, ...args], {
      cwd: repositoryRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal !== null) {
        reject(new Error(`Build process stopped by ${signal}`));
      } else {
        resolve(code ?? 1);
      }
    });
  });
}

async function build() {
  const buildStart = performance.now();
  process.stdout.write("Building Counterfact development workspaces\n\n");
  for (const [index, stage] of stages.entries()) {
    const stageStart = performance.now();
    process.stdout.write(
      `→ [${index + 1}/${stages.length}] Building ${stage.label}…\n`,
    );
    try {
      for (const args of stage.commands) {
        const code = await run(stage.workspace, args);
        if (code !== 0) {
          process.stderr.write(
            `✗ ${stage.label} failed (${elapsed(stageStart)})\n`,
          );
          return code;
        }
      }
    } catch (error) {
      process.stderr.write(
        `✗ ${stage.label} failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      return 1;
    }
    process.stdout.write(`✓ ${stage.label} built (${elapsed(stageStart)})\n`);
  }
  process.stdout.write(`\n✓ Build complete (${elapsed(buildStart)})\n`);

  return 0;
}

process.exitCode = await build();
