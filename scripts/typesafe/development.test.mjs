import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { usingTemporaryFiles } from "using-temporary-files";

import {
  commonGitDirectory,
  loadKey,
  MODEL,
  planRequest,
  RESERVE_USD,
  runRequest,
  validateApproval,
} from "./development.mjs";

const now = new Date("2026-10-31T12:00:00Z");
const request = {
  model: MODEL,
  state: "Synthetic evidence: the reset restores initial state.",
  questions: {
    supports_reset: {
      type: "noul",
      instructions: "Does the evidence describe resetting state?",
    },
  },
};
const digest = planRequest(request).digest;
function approval(overrides = {}) {
  return {
    taskId: "synthetic-test",
    authorization: "Synthetic offline test authorization; no live calls.",
    dataScope: "public-counterfact-and-synthetic",
    maxUsd: 0.02,
    maxRequests: 2,
    requestDigests: [digest],
    expiresAt: "2026-10-31T23:00:00Z",
    ...overrides,
  };
}
const result = {
  model: MODEL,
  answers: { supports_reset: { type: "noul", noul: 0.95 } },
  usage: { input_tokens: 100, output_tokens: 2 },
};

function offline(name, run) {
  test(name, () => usingTemporaryFiles(run));
}

for (const invalid of [
  { ...request, model: "jev-latest" },
  { ...request, state: "x".repeat(8192) },
  { ...request, endpoint: "https://example.invalid" },
  { ...request, questions: {} },
  {
    ...request,
    questions: { test: { type: "choice", instructions: "Choose" } },
  },
]) {
  test("rejects unsupported/unbounded request shape", () => {
    assert.throws(() => planRequest(invalid));
  });
}

for (const invalid of [
  { maxUsd: 0 },
  { maxUsd: 2 },
  { maxRequests: 0 },
  { taskId: "../escape" },
  { requestDigests: ["other"] },
  { dataScope: "private" },
  { expiresAt: "2026-10-30T23:00:00Z" },
  { expiresAt: "2027-10-30T23:00:00Z" },
]) {
  test("rejects missing/out-of-scope approval", () => {
    assert.throws(() => validateApproval(approval(invalid), digest, now));
  });
}
test("stale pricing prevents later live calls", () => {
  assert.throws(
    () => validateApproval(approval(), digest, new Date("2026-11-08")),
    /Recheck official/u,
  );
});

offline(
  "success records usage and strips arbitrary provider fields",
  async ($) => {
    const summary = await runRequest({
      request,
      approval: approval(),
      ledgerDirectory: $.path("ledger"),
      now,
      getKey: async () => "synthetic-test-key",
      fetchImpl: async (url, options) => {
        assert.equal(url, "https://api.typesafe.ai/v1/systemone");
        assert.equal(options.redirect, "error");
        assert.equal(options.body, planRequest(request).body);
        assert.equal(
          options.headers.Authorization === "Bearer synthetic-test-key",
          true,
        );
        return {
          ok: true,
          json: async () => ({ ...result, diagnostic: "must-not-echo" }),
        };
      },
    });
    assert.deepEqual(summary.answers, result.answers);
    assert.equal(summary.estimatedUsd, (100 * 0.042) / 1_000_000);
    assert.equal(summary.taskReservedUsd, RESERVE_USD);
    const ledger = await $.read("ledger/synthetic-test.json");
    assert.doesNotMatch(
      ledger,
      /synthetic-test-key|must-not-echo|Synthetic evidence/u,
    );
    assert.equal(JSON.parse(ledger).attempts[0].outcome, "success");
  },
);

offline(
  "uncertain failure reserves budget and next call stops before credentials/network",
  async ($) => {
    let calls = 0;
    const args = {
      request,
      approval: approval({ maxUsd: 0.01, maxRequests: 1 }),
      ledgerDirectory: $.path("ledger"),
      now,
      getKey: async () => "synthetic-test-key",
      fetchImpl: async () => {
        calls += 1;
        throw new Error("sensitive diagnostic");
      },
    };
    await assert.rejects(runRequest(args), /outcome uncertain/u);
    await assert.rejects(
      runRequest({
        ...args,
        getKey: () => assert.fail("key read after budget exhausted"),
      }),
      /limit reached/u,
    );
    assert.equal(calls, 1);
    const ledger = JSON.parse(await $.read("ledger/synthetic-test.json"));
    assert.equal(ledger.attempts[0].outcome, "uncertain");
  },
);

for (const response of [
  { ok: false },
  { ok: true, json: async () => ({ ...result, model: "unexpected" }) },
  {
    ok: true,
    json: async () => ({
      ...result,
      answers: { supports_reset: { type: "noul", noul: 3 } },
    }),
  },
  {
    ok: true,
    json: async () => ({
      ...result,
      usage: { input_tokens: 64001, output_tokens: 1 },
    }),
  },
]) {
  offline("provider errors never become a judgment or refund", async ($) => {
    await assert.rejects(
      runRequest({
        request,
        approval: approval(),
        ledgerDirectory: $.path("ledger"),
        now,
        getKey: async () => "synthetic-test-key",
        fetchImpl: async () => response,
      }),
      /outcome uncertain/u,
    );
    assert.equal(
      JSON.parse(await $.read("ledger/synthetic-test.json")).attempts[0]
        .outcome,
      "uncertain",
    );
  });
}

offline(
  "existing lock fails closed without key or network access",
  async ($) => {
    await $.add("ledger/synthetic-test.json.lock", "");
    await assert.rejects(
      runRequest({
        request,
        approval: approval(),
        ledgerDirectory: $.path("ledger"),
        now,
        getKey: () => assert.fail("key read with lock held"),
        fetchImpl: () => assert.fail("network with lock held"),
      }),
      { code: "EEXIST" },
    );
  },
);

offline("malformed ledger fails closed", async ($) => {
  await $.add("ledger/synthetic-test.json", "interrupted write");
  await assert.rejects(
    runRequest({
      request,
      approval: approval(),
      ledgerDirectory: $.path("ledger"),
      now,
      getKey: () => assert.fail("key read with invalid ledger"),
    }),
  );
});

offline(
  "key parser only returns key, never executes env contents",
  async ($) => {
    await $.add(
      "credentials",
      "TYPESAFE_API_KEY=synthetic-test-key\nOTHER=$(exit 1)\n",
    );
    if (process.platform !== "win32")
      execFileSync("chmod", ["600", $.path("credentials")]);
    assert.equal(
      (await loadKey($.path("credentials"))) === "synthetic-test-key",
      true,
    );
    if (process.platform !== "win32") {
      execFileSync("chmod", ["644", $.path("credentials")]);
      await assert.rejects(loadKey($.path("credentials")), /owner-only/u);
    }
  },
);

offline(
  "worktrees share the original checkout credential/ledger location",
  async ($) => {
    await $.addDirectory("original");
    execFileSync("git", ["init", "--quiet", $.path("original")]);
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Synthetic",
        "-c",
        "user.email=synthetic@example.invalid",
        "commit",
        "--allow-empty",
        "-m",
        "synthetic",
      ],
      { cwd: $.path("original"), stdio: "ignore" },
    );
    execFileSync(
      "git",
      ["worktree", "add", "--quiet", "-b", "synthetic", $.path("linked")],
      { cwd: $.path("original") },
    );
    const original = commonGitDirectory($.path("original"));
    assert.equal(commonGitDirectory($.path("linked")), original);
    await $.add(
      "original/.env.typesafe.local",
      "TYPESAFE_API_KEY=synthetic-worktree-key\n",
    );
    if (process.platform !== "win32")
      execFileSync("chmod", ["600", $.path("original/.env.typesafe.local")]);
    assert.equal(
      (await loadKey(path.resolve(original, "..", ".env.typesafe.local"))) ===
        "synthetic-worktree-key",
      true,
    );
  },
);

for (const limits of [
  { maxUsd: 0.01, maxRequests: 2 },
  { maxUsd: 0.02, maxRequests: 1 },
]) {
  offline(
    "dollar and request caps independently prevent a second send",
    async ($) => {
      const args = {
        request,
        approval: approval(limits),
        ledgerDirectory: $.path("ledger"),
        now,
        getKey: async () => "synthetic-test-key",
        fetchImpl: async () => ({ ok: true, json: async () => result }),
      };
      await runRequest(args);
      await assert.rejects(
        runRequest({
          ...args,
          getKey: () => assert.fail("key read after cap"),
        }),
        /limit reached/u,
      );
    },
  );
}

offline(
  "unapproved payload cannot read credentials or create a reservation",
  async ($) => {
    await assert.rejects(
      runRequest({
        request: { ...request, state: "Changed synthetic evidence" },
        approval: approval(),
        ledgerDirectory: $.path("ledger"),
        now,
        getKey: () => assert.fail("key read without approval"),
        fetchImpl: () => assert.fail("unapproved network call"),
      }),
      /Need unexpired/u,
    );
  },
);

offline(
  "dry-run CLI needs no key, approval, Git checkout or network",
  async ($) => {
    await $.add("request.json", JSON.stringify(request));
    const script = new URL("./development.mjs", import.meta.url);
    const output = execFileSync(
      process.execPath,
      [
        fileURLToPath(script),
        "--request",
        $.path("request.json"),
        "--credential-file",
        $.path("does-not-exist"),
      ],
      { cwd: $.path("."), encoding: "utf8" },
    );
    assert.deepEqual(JSON.parse(output), {
      digest,
      bytes: planRequest(request).bytes,
      reservedUsd: RESERVE_USD,
      sent: false,
    });
  },
);
