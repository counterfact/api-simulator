import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
// parseEnv exists since Node 20.12; early Node 24 labels it experimental.
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { parseArgs, parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

export const MODEL = "jev-1.14.0";
// Reviewed against https://docs.typesafe.ai/models on 2026-10-31.
// 64k input tokens * $0.042/M = $0.002688. Reserve >3x that bound.
export const RESERVE_USD = 0.01;
const INPUT_USD_PER_TOKEN = 0.042 / 1_000_000;
const PRICING_REVIEWED = "2026-10-31";

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function planRequest(request) {
  requireValue(
    request &&
      Object.keys(request).every((key) =>
        ["model", "state", "questions"].includes(key),
      ) &&
      request.model === MODEL &&
      request.state !== undefined,
    "Request must contain only model, state, and questions with the pinned model.",
  );
  const questions = Object.entries(request.questions ?? {});
  requireValue(
    questions.length > 0 && questions.length <= 8,
    "Provide 1–8 Noul questions.",
  );
  for (const [name, question] of questions) {
    requireValue(
      /^[a-z][a-z0-9_]{0,63}$/u.test(name) &&
        question?.type === "noul" &&
        typeof question.instructions === "string" &&
        question.instructions.trim().length > 0 &&
        Object.keys(question).every((key) =>
          ["type", "instructions", "criteria"].includes(key),
        ) &&
        (question.criteria === undefined ||
          (question.criteria &&
            Object.keys(question.criteria).every((key) =>
              ["true", "false"].includes(key),
            ) &&
            Object.values(question.criteria).every(
              (value) => typeof value === "string",
            ))),
      "Only named Noul questions with text instructions/criteria are supported.",
    );
  }
  const body = JSON.stringify(request);
  requireValue(Buffer.byteLength(body) <= 8192, "Request exceeds 8192 bytes.");
  return {
    body,
    digest: createHash("sha256").update(body).digest("hex"),
    bytes: Buffer.byteLength(body),
  };
}

export function validateApproval(approval, digest, now = new Date()) {
  const reviewAge = now - new Date(`${PRICING_REVIEWED}T00:00:00Z`);
  requireValue(
    reviewAge >= 0 && reviewAge <= 7 * 86_400_000,
    "Recheck official model pricing/context limits and update the helper before live use.",
  );
  requireValue(
    /^[a-z0-9-]{1,80}$/u.test(approval?.taskId ?? "") &&
      approval.dataScope === "public-counterfact-and-synthetic" &&
      typeof approval.authorization === "string" &&
      approval.authorization.trim().length > 0 &&
      Number.isFinite(approval.maxUsd) &&
      approval.maxUsd >= RESERVE_USD &&
      approval.maxUsd <= 1 &&
      Number.isInteger(approval.maxRequests) &&
      approval.maxRequests > 0 &&
      approval.maxRequests <= 100 &&
      Array.isArray(approval.requestDigests) &&
      approval.requestDigests.includes(digest) &&
      new Date(approval.expiresAt) > now &&
      new Date(approval.expiresAt) - now <= 86_400_000,
    "Need unexpired task approval, exact request digest, data scope, and budget (at most $1/100 requests).",
  );
}

export function commonGitDirectory(cwd) {
  return execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
}

export async function loadKey(envFile) {
  const metadata = await stat(envFile);
  requireValue(
    metadata.isFile() &&
      (process.platform === "win32" || (metadata.mode & 0o077) === 0),
    "Credential file must be a regular owner-only file (chmod 600).",
  );
  // Parse without sourcing shell code or exporting unrelated variables.
  const key = parseEnv(await readFile(envFile, "utf8")).TYPESAFE_API_KEY;
  requireValue(Boolean(key?.trim()), "Credential file has no TypeSafe key.");
  return key;
}

export async function runRequest({
  request,
  approval,
  ledgerDirectory,
  getKey,
  fetchImpl = fetch,
  now = new Date(),
}) {
  const plan = planRequest(request);
  validateApproval(approval, plan.digest, now);
  await mkdir(ledgerDirectory, { recursive: true });
  const ledgerPath = path.join(ledgerDirectory, `${approval.taskId}.json`);
  const lockPath = `${ledgerPath}.lock`;
  const lock = await open(lockPath, "wx", 0o600);
  try {
    let ledger = { taskId: approval.taskId, attempts: [] };
    try {
      ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    requireValue(
      ledger.taskId === approval.taskId &&
        Array.isArray(ledger.attempts) &&
        ledger.attempts.every((attempt) => attempt.reservedUsd === RESERVE_USD),
      "Invalid budget ledger; preserve it and investigate.",
    );
    requireValue(
      ledger.attempts.length < approval.maxRequests &&
        (ledger.attempts.length + 1) * RESERVE_USD <= approval.maxUsd,
      "Task request/budget limit reached. Do not reset the ledger.",
    );
    const key = await getKey();
    const attempt = {
      digest: plan.digest,
      reservedUsd: RESERVE_USD,
      startedAt: now.toISOString(),
      outcome: "uncertain",
    };
    ledger.attempts.push(attempt);
    const save = async () => {
      const file = await open(ledgerPath, "w", 0o600);
      try {
        await file.writeFile(`${JSON.stringify(ledger, null, 2)}\n`);
        await file.sync();
      } finally {
        await file.close();
      }
    };
    // Reserve before sending. Interrupted/failed calls keep their reservation.
    await save();
    try {
      const response = await fetchImpl("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: plan.body,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      requireValue(
        response.ok,
        "TypeSafe returned an unsuccessful HTTP status.",
      );
      const result = await response.json();
      requireValue(
        result.model === MODEL &&
          Number.isInteger(result.usage?.input_tokens) &&
          result.usage.input_tokens >= 0 &&
          result.usage.input_tokens <= 64_000 &&
          Number.isInteger(result.usage.output_tokens) &&
          result.usage.output_tokens >= 0,
        "Unexpected TypeSafe model or usage response.",
      );
      const answers = {};
      for (const name of Object.keys(request.questions)) {
        const answer = result.answers?.[name];
        requireValue(
          answer?.type === "noul" &&
            Number.isFinite(answer.noul) &&
            answer.noul >= 0 &&
            answer.noul <= 1,
          "Invalid TypeSafe Noul response.",
        );
        answers[name] = { type: "noul", noul: answer.noul };
      }
      // Select fields; never echo arbitrary provider text/headers or payloads.
      const summary = {
        model: MODEL,
        answers,
        usage: {
          input_tokens: result.usage.input_tokens,
          output_tokens: result.usage.output_tokens,
        },
        estimatedUsd: result.usage.input_tokens * INPUT_USD_PER_TOKEN,
        reservedUsd: RESERVE_USD,
        taskReservedUsd: ledger.attempts.length * RESERVE_USD,
        digest: plan.digest,
      };
      Object.assign(attempt, { outcome: "success", ...summary });
      await save();
      return summary;
    } catch {
      // No automatic retry; even an HTTP/network failure may be billable.
      throw new Error(
        "TypeSafe request failed or had an invalid response; reservation retained, outcome uncertain. No retry made.",
      );
    }
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      request: { type: "string" },
      approval: { type: "string" },
      "credential-file": { type: "string" },
      send: { type: "boolean", default: false },
    },
  });
  requireValue(
    values.request,
    "Usage: --request file.json [--send --approval approval.json] [--credential-file path]",
  );
  const request = JSON.parse(await readFile(values.request, "utf8"));
  const plan = planRequest(request);
  if (!values.send) {
    console.log(
      JSON.stringify(
        {
          digest: plan.digest,
          bytes: plan.bytes,
          reservedUsd: RESERVE_USD,
          sent: false,
        },
        null,
        2,
      ),
    );
    return;
  }
  requireValue(values.approval, "Live requests require --approval.");
  const approval = JSON.parse(await readFile(values.approval, "utf8"));
  const common = commonGitDirectory(process.cwd());
  const envFile =
    values["credential-file"] ??
    path.resolve(common, "..", ".env.typesafe.local");
  const summary = await runRequest({
    request,
    approval,
    ledgerDirectory: path.join(common, "typesafe-development"),
    getKey: () => loadKey(envFile),
  });
  console.log(JSON.stringify(summary, null, 2));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    // Paths, parser errors and transport diagnostics can contain sensitive text.
    console.error(
      "TypeSafe helper stopped. Check request/approval, fresh pricing, credential permissions, and the task ledger. No secret diagnostics are printed.",
    );
    process.exitCode = 1;
  });
}
