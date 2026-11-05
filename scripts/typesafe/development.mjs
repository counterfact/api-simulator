import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
// parseEnv exists since Node 20.12; early Node 24 labels it experimental.
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { parseArgs, parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

export const MODEL = "jev-1.14.0";
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
    bytes: Buffer.byteLength(body),
  };
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

export async function runRequest({ request, getKey, fetchImpl = fetch }) {
  const plan = planRequest(request);
  const key = await getKey();
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
    requireValue(response.ok, "TypeSafe returned an unsuccessful HTTP status.");
    const result = await response.json();
    requireValue(
      result.model === MODEL &&
        Number.isInteger(result.usage?.input_tokens) &&
        result.usage.input_tokens >= 0 &&
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
    return {
      model: MODEL,
      answers,
      usage: {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
      },
    };
  } catch {
    // A failed call is not a false judgment; avoid duplicate calls on uncertainty.
    throw new Error(
      "TypeSafe request failed or had an invalid response. No retry made.",
    );
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      request: { type: "string" },
      "credential-file": { type: "string" },
      send: { type: "boolean", default: false },
    },
  });
  requireValue(
    values.request,
    "Usage: --request file.json [--send] [--credential-file path]",
  );
  const request = JSON.parse(await readFile(values.request, "utf8"));
  const plan = planRequest(request);
  if (!values.send) {
    console.log(
      JSON.stringify(
        {
          bytes: plan.bytes,
          sent: false,
        },
        null,
        2,
      ),
    );
    return;
  }
  const common = commonGitDirectory(process.cwd());
  const envFile =
    values["credential-file"] ??
    path.resolve(common, "..", ".env.typesafe.local");
  const summary = await runRequest({
    request,
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
      "TypeSafe helper stopped. Check request schema, credential permissions, and API availability. No secret diagnostics are printed.",
    );
    process.exitCode = 1;
  });
}
