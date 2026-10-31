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
  runRequest,
} from "./development.mjs";

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
  test("rejects unsupported request before credentials or network access", async () => {
    await assert.rejects(
      runRequest({
        request: invalid,
        getKey: () => assert.fail("invalid request read credentials"),
        fetchImpl: () => assert.fail("invalid request sent"),
      }),
    );
  });
}

test("sends a valid request directly and returns only typed answers and usage", async () => {
  let calls = 0;
  const summary = await runRequest({
    request,
    getKey: async () => "synthetic-test-key",
    fetchImpl: async (url, options) => {
      calls += 1;
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
  assert.equal(calls, 1);
  assert.deepEqual(summary, result);
  assert.doesNotMatch(
    JSON.stringify(summary),
    /synthetic-test-key|must-not-echo|Synthetic evidence/u,
  );
});

for (const response of [
  { ok: false },
  {
    ok: true,
    json: async () => {
      throw new Error("private diagnostic");
    },
  },
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
      usage: { input_tokens: -1, output_tokens: 1 },
    }),
  },
]) {
  test("provider errors fail safely instead of becoming a judgment", async () => {
    let calls = 0;
    await assert.rejects(
      runRequest({
        request,
        getKey: async () => "synthetic-test-key",
        fetchImpl: async () => {
          calls += 1;
          return response;
        },
      }),
      {
        message:
          "TypeSafe request failed or had an invalid response. No retry made.",
      },
    );
    assert.equal(calls, 1);
  });
}

test("network failures suppress diagnostics without retrying", async () => {
  let calls = 0;
  await assert.rejects(
    runRequest({
      request,
      getKey: async () => "synthetic-test-key",
      fetchImpl: async () => {
        calls += 1;
        throw new Error("private diagnostic");
      },
    }),
    {
      message:
        "TypeSafe request failed or had an invalid response. No retry made.",
    },
  );
  assert.equal(calls, 1);
});

test("missing credentials prevent network access", async () => {
  await assert.rejects(
    runRequest({
      request,
      getKey: async () => {
        throw new Error("No key");
      },
      fetchImpl: () => assert.fail("missing key sent a request"),
    }),
    /No key/u,
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
  "empty credential files fail without disclosing their contents",
  async ($) => {
    await $.add("credentials", "TYPESAFE_API_KEY=\n");
    if (process.platform !== "win32")
      execFileSync("chmod", ["600", $.path("credentials")]);
    await assert.rejects(loadKey($.path("credentials")), /no TypeSafe key/u);
  },
);

offline(
  "worktrees discover the original checkout credential location",
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

offline("dry-run CLI needs no key, Git checkout, or network", async ($) => {
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
    bytes: planRequest(request).bytes,
    sent: false,
  });
});
