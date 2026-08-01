import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { startSandbox } from "./sandbox/start.mjs";

const workspace = path.resolve(process.argv[2] ?? "");
const port = Number.parseInt(process.argv[3] ?? "4399", 10);
const details = [];

async function findTests(directory) {
  const found = [];
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const location = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(location);
      else if (/\.(?:test|spec)\.[cm]?[jt]s$/.test(entry.name)) {
        found.push(path.relative(directory, location));
      }
    }
  }
  await visit(directory);
  return found;
}

async function runCandidateTests() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test"], {
      cwd: workspace,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const timer = setTimeout(() => child.kill("SIGTERM"), 30_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, output: output.slice(-4_000) });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: -1, output: error.stack });
    });
  });
}

function result(name, points, passed, evidence = "") {
  details.push({ name, points, earned: passed ? points : 0, passed, evidence });
}

async function reset(baseUrl, scenario) {
  const response = await fetch(`${baseUrl}/control/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  if (response.status !== 204) throw new Error(`Could not reset ${scenario}`);
}

async function stats(baseUrl) {
  return (await fetch(`${baseUrl}/control/stats`)).json();
}

let sandbox;
try {
  sandbox = await startSandbox(port);
  const moduleUrl = pathToFileURL(path.join(workspace, "src", "client.mjs"));
  moduleUrl.searchParams.set("run", String(Date.now()));
  const candidate = await import(moduleUrl.href);
  const fetchAllTickets = candidate.fetchAllTickets;
  if (typeof fetchAllTickets !== "function") {
    throw new TypeError("src/client.mjs must export fetchAllTickets");
  }

  const invoke = (overrides = {}) =>
    fetchAllTickets({ baseUrl: sandbox.baseUrl, ...overrides });

  await reset(sandbox.baseUrl, "happy");
  const happy = await invoke();
  result(
    "fetches all pages",
    25,
    JSON.stringify(happy?.map((ticket) => ticket.id)) ===
      JSON.stringify(["T-1", "T-2", "T-3", "T-4"]),
    `ids=${JSON.stringify(happy?.map?.((ticket) => ticket.id))}`,
  );
  result(
    "deduplicates by ticket id",
    10,
    happy?.length === 4 && happy?.[1]?.title === "Invoice missing",
    `count=${happy?.length}`,
  );

  await reset(sandbox.baseUrl, "rate-limit");
  const sleeps = [];
  const limited = await invoke({
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  });
  result("recovers from 429", 20, limited?.length === 4);
  result(
    "honors Retry-After",
    10,
    sleeps.some((milliseconds) => milliseconds >= 20),
    `sleep calls=${JSON.stringify(sleeps)}`,
  );

  await reset(sandbox.baseUrl, "transient-503");
  const transient = await invoke({ sleep: async () => {} });
  result("recovers from transient 503", 15, transient?.length === 4);

  await reset(sandbox.baseUrl, "permanent-429");
  let permanentThrew = false;
  try {
    await invoke({ maxRetries: 2, sleep: async () => {} });
  } catch {
    permanentThrew = true;
  }
  const permanentStats = await stats(sandbox.baseUrl);
  result(
    "bounds persistent retries",
    10,
    permanentThrew && permanentStats.requests.length === 3,
    `requests=${permanentStats.requests.length}`,
  );

  await reset(sandbox.baseUrl, "bad-request");
  let badRequestThrew = false;
  try {
    await invoke({ sleep: async () => {} });
  } catch {
    badRequestThrew = true;
  }
  const badRequestStats = await stats(sandbox.baseUrl);
  result(
    "does not retry ordinary 4xx",
    10,
    badRequestThrew && badRequestStats.requests.length === 1,
    `requests=${badRequestStats.requests.length}`,
  );
} catch (error) {
  details.push({
    name: "candidate loads and executes",
    points: 100,
    earned: 0,
    passed: false,
    evidence: error instanceof Error ? error.stack : String(error),
  });
} finally {
  await sandbox?.stop();
}

const report = {
  score: details.reduce((sum, item) => sum + item.earned, 0),
  possible: 100,
  details,
  verification: { testFiles: [], testExitCode: null, durableTests: false },
};
try {
  report.verification.testFiles = await findTests(workspace);
  if (report.verification.testFiles.length > 0) {
    const testRun = await runCandidateTests();
    report.verification.testExitCode = testRun.exitCode;
    report.verification.durableTests = testRun.exitCode === 0;
    report.verification.output = testRun.output;
  }
} catch (error) {
  report.verification.error =
    error instanceof Error ? error.stack : String(error);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
