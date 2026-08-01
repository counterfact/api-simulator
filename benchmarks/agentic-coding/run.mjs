import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSandbox } from "./sandbox/start.mjs";

const benchmarkDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(benchmarkDir, "..", "..");

function parseArgs(argv) {
  const options = {
    condition: "both",
    runs: 1,
    parallel: 1,
    model: "",
    codex: "codex",
    timeoutMs: 20 * 60 * 1000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--condition") ((options.condition = value), (index += 1));
    else if (key === "--runs") ((options.runs = Number(value)), (index += 1));
    else if (key === "--parallel")
      ((options.parallel = Number(value)), (index += 1));
    else if (key === "--model") ((options.model = value), (index += 1));
    else if (key === "--codex") ((options.codex = value), (index += 1));
    else if (key === "--timeout-ms")
      ((options.timeoutMs = Number(value)), (index += 1));
    else throw new Error(`Unknown option: ${key}`);
  }
  if (!["both", "control", "counterfact"].includes(options.condition)) {
    throw new Error("--condition must be both, control, or counterfact");
  }
  if (
    ![options.runs, options.parallel, options.timeoutMs].every((n) => n > 0)
  ) {
    throw new Error("--runs, --parallel, and --timeout-ms must be positive");
  }
  return options;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function runProcess(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}${error.stack}\n` });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, signal, stdout, stderr });
    });
  });
}

function extractUsage(jsonl) {
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  for (const line of jsonl.split("\n")) {
    try {
      const event = JSON.parse(line);
      if (event.type === "turn.completed" && event.usage) {
        inputTokens += event.usage.input_tokens ?? 0;
        cachedInputTokens += event.usage.cached_input_tokens ?? 0;
        outputTokens += event.usage.output_tokens ?? 0;
      }
    } catch {
      // Preserve logs verbatim even if a CLI version emits a non-JSON line.
    }
  }
  return { inputTokens, cachedInputTokens, outputTokens };
}

async function sha256(file) {
  return createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex");
}

async function executeRun(job, experimentDir, options) {
  const label = `${job.condition}-${String(job.replication).padStart(2, "0")}`;
  const runDir = path.join(experimentDir, label);
  const workspace = path.join(runDir, "workspace");
  await fs.mkdir(path.join(workspace, "src"), { recursive: true });
  await fs.copyFile(
    path.join(benchmarkDir, "candidate", "package.json"),
    path.join(workspace, "package.json"),
  );
  await fs.copyFile(
    path.join(benchmarkDir, "candidate", "src", "client.mjs"),
    path.join(workspace, "src", "client.mjs"),
  );
  await fs.copyFile(
    path.join(benchmarkDir, "TASK.md"),
    path.join(workspace, "TASK.md"),
  );
  await fs.copyFile(
    path.join(benchmarkDir, "openapi.yaml"),
    path.join(workspace, "openapi.yaml"),
  );

  let sandbox;
  let prompt = await fs.readFile(path.join(benchmarkDir, "TASK.md"), "utf8");
  prompt +=
    "\nWork autonomously in the current workspace. Implement the task and verify your work.\n";
  if (job.condition === "counterfact") {
    sandbox = await startSandbox(await freePort());
    prompt += `\nA Counterfact sandbox is running at ${sandbox.baseUrl}. You may make real HTTP requests to it. Select a deterministic behavior with POST /control/reset and JSON {"scenario":"SCENARIO"}; available scenarios are happy, rate-limit, transient-503, permanent-429, and bad-request. Inspect GET /control/stats when useful. Exercise the sandbox before finishing.\n`;
  }

  await fs.writeFile(path.join(runDir, "prompt.md"), prompt);
  const finalMessage = path.join(runDir, "final.txt");
  const args = [
    "exec",
    "--ephemeral",
    "--json",
    "--sandbox",
    "workspace-write",
    "--skip-git-repo-check",
    "-C",
    workspace,
    "-o",
    finalMessage,
  ];
  if (job.condition === "counterfact") {
    args.push(
      "-c",
      "sandbox_workspace_write.network_access=true",
      "-c",
      "features.network_proxy.enabled=true",
      "-c",
      'features.network_proxy.domains={ "127.0.0.1" = "allow" }',
    );
  }
  if (options.model) args.push("--model", options.model);
  args.push(prompt);

  const startedAt = new Date();
  const started = performance.now();
  const agent = await runProcess(options.codex, args, {
    cwd: workspace,
    env: process.env,
    timeoutMs: options.timeoutMs,
  });
  const elapsedMs = Math.round(performance.now() - started);
  let sandboxEvidence = null;
  if (sandbox) {
    try {
      const response = await fetch(`${sandbox.baseUrl}/control/audit`);
      sandboxEvidence = await response.json();
    } catch (error) {
      sandboxEvidence = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  await sandbox?.stop();
  await fs.writeFile(path.join(runDir, "events.jsonl"), agent.stdout);
  await fs.writeFile(path.join(runDir, "agent.stderr.txt"), agent.stderr);

  const gradePort = await freePort();
  const grading = await runProcess(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(benchmarkDir, "grade.mjs"),
      workspace,
      String(gradePort),
    ],
    { cwd: repoRoot, env: process.env, timeoutMs: 60_000 },
  );
  await fs.writeFile(path.join(runDir, "grade.stdout.json"), grading.stdout);
  await fs.writeFile(path.join(runDir, "grade.stderr.txt"), grading.stderr);
  let grade = { score: 0, possible: 100, details: [], parseError: true };
  try {
    grade = JSON.parse(grading.stdout);
  } catch {
    // The raw grader output is retained for diagnosis.
  }

  const metadata = {
    label,
    condition: job.condition,
    replication: job.replication,
    startedAt: startedAt.toISOString(),
    elapsedMs,
    agentExitCode: agent.code,
    agentSignal: agent.signal ?? null,
    graderExitCode: grading.code,
    score: grade.score,
    possible: grade.possible,
    verification: grade.verification,
    sandboxEvidence,
    usage: extractUsage(agent.stdout),
    taskSha256: await sha256(path.join(benchmarkDir, "TASK.md")),
    contractSha256: await sha256(path.join(benchmarkDir, "openapi.yaml")),
  };
  await fs.writeFile(
    path.join(runDir, "metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  process.stdout.write(
    `${label}: ${metadata.score}/${metadata.possible} in ${elapsedMs}ms\n`,
  );
  return { ...metadata, grade };
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function standardDeviation(values) {
  if (values.length < 2) return null;
  const average = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function summarize(results) {
  const byCondition = Object.fromEntries(
    ["control", "counterfact"].map((condition) => {
      const rows = results.filter((result) => result.condition === condition);
      return [
        condition,
        {
          runs: rows.length,
          meanScore: mean(rows.map((row) => row.score)),
          completionRate: mean(
            rows.map((row) => Number(row.agentExitCode === 0)),
          ),
          meanElapsedMs: mean(rows.map((row) => row.elapsedMs)),
          meanOutputTokens: mean(rows.map((row) => row.usage.outputTokens)),
          durableTestRate: mean(
            rows.map((row) => Number(row.verification?.durableTests === true)),
          ),
          meanSandboxScenariosExercised: mean(
            rows
              .filter((row) => row.sandboxEvidence)
              .map(
                (row) =>
                  new Set(
                    row.sandboxEvidence?.requests?.map((item) => item.scenario),
                  ).size,
              ),
          ),
        },
      ];
    }),
  );
  const effect =
    byCondition.control.meanScore === null ||
    byCondition.counterfact.meanScore === null
      ? null
      : byCondition.counterfact.meanScore - byCondition.control.meanScore;
  const pairedEffects = [];
  for (const replication of new Set(results.map((row) => row.replication))) {
    const control = results.find(
      (row) => row.condition === "control" && row.replication === replication,
    );
    const counterfact = results.find(
      (row) =>
        row.condition === "counterfact" && row.replication === replication,
    );
    if (control && counterfact) {
      pairedEffects.push({
        replication,
        controlScore: control.score,
        counterfactScore: counterfact.score,
        difference: counterfact.score - control.score,
      });
    }
  }
  return {
    byCondition,
    scoreEffect: effect,
    pairedEffects,
    pairedEffectStandardDeviation: standardDeviation(
      pairedEffects.map((row) => row.difference),
    ),
    results,
  };
}

function markdown(summary) {
  const format = (value) => (value === null ? "—" : value.toFixed(1));
  const percent = (value) =>
    value === null ? "—" : `${(value * 100).toFixed(1)}%`;
  const lines = [
    "# Agentic coding benchmark results",
    "",
    "| Condition | Runs | Mean score | Durable tests | Sandbox scenarios | Mean seconds | Mean output tokens |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const condition of ["control", "counterfact"]) {
    const row = summary.byCondition[condition];
    lines.push(
      `| ${condition} | ${row.runs} | ${format(row.meanScore)} | ${percent(row.durableTestRate)} | ${format(row.meanSandboxScenariosExercised)} | ${format(row.meanElapsedMs === null ? null : row.meanElapsedMs / 1000)} | ${format(row.meanOutputTokens)} |`,
    );
  }
  lines.push(
    "",
    `Counterfact score effect: **${format(summary.scoreEffect)} points**`,
    `Paired-effect standard deviation: **${format(summary.pairedEffectStandardDeviation)} points**`,
    "",
    "## Runs",
    "",
  );
  for (const row of summary.results) {
    lines.push(
      `- ${row.label}: ${row.score}/${row.possible}, ${(row.elapsedMs / 1000).toFixed(1)}s, exit ${row.agentExitCode}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

const options = parseArgs(process.argv.slice(2));
const timestamp = new Date()
  .toISOString()
  .replaceAll(":", "-")
  .replace(".", "-");
const experimentDir = path.join(benchmarkDir, "results", timestamp);
await fs.mkdir(experimentDir, { recursive: true });
const conditions =
  options.condition === "both"
    ? ["control", "counterfact"]
    : [options.condition];
const jobs = Array.from(
  { length: options.runs },
  (_, index) => index + 1,
).flatMap((replication) => {
  const balancedConditions =
    replication % 2 === 0 ? [...conditions].reverse() : conditions;
  return balancedConditions.map((condition) => ({ condition, replication }));
});

const [codexVersion, gitRevision, gitStatus] = await Promise.all([
  runProcess(options.codex, ["--version"], {
    cwd: repoRoot,
    env: process.env,
    timeoutMs: 10_000,
  }),
  runProcess("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    env: process.env,
    timeoutMs: 10_000,
  }),
  runProcess("git", ["status", "--short"], {
    cwd: repoRoot,
    env: process.env,
    timeoutMs: 10_000,
  }),
]);
await fs.writeFile(
  path.join(experimentDir, "manifest.json"),
  `${JSON.stringify(
    {
      benchmarkVersion: 1,
      createdAt: new Date().toISOString(),
      options,
      runtime: { node: process.version, platform: process.platform },
      agentCliVersion: codexVersion.stdout.trim(),
      gitRevision: gitRevision.stdout.trim(),
      worktreeDirty: gitStatus.stdout.trim().length > 0,
      taskSha256: await sha256(path.join(benchmarkDir, "TASK.md")),
      contractSha256: await sha256(path.join(benchmarkDir, "openapi.yaml")),
    },
    null,
    2,
  )}\n`,
);
const results = [];
let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    results.push(await executeRun(job, experimentDir, options));
  }
}
await Promise.all(
  Array.from({ length: Math.min(options.parallel, jobs.length) }, worker),
);
results.sort((a, b) => a.label.localeCompare(b.label));
const summary = summarize(results);
await fs.writeFile(
  path.join(experimentDir, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
await fs.writeFile(path.join(experimentDir, "summary.md"), markdown(summary));
process.stdout.write(`Results: ${path.join(experimentDir, "summary.md")}\n`);
