---
name: typesafe-development
description: Use Jev for optional bounded classification or evidence checks during Counterfact development, with explicit task-specific data and budget approval. Does not add AI to the shipped product.
---

# Jev development judgments

Use when a development task benefits from a narrow semantic judgment: does an
excerpt support a documentation claim, or does an example describe a behavior?
Use code/tests for exact facts. Jev supplies evidence, never authority to merge,
approve, or replace testing. Keep questions and criteria together in a request.
Noul answers above 0.7/below 0.3 are useful starting yes/no thresholds; treat the
middle as unresolved and inspect evidence yourself.

## Before sending

1. Read the installed TypeSafe skill (`~/.agents/skills/typesafe-ai/SKILL.md` if
   available) and current [API](https://docs.typesafe.ai/api/system-one),
   [SDK](https://docs.typesafe.ai/sdk/javascript), and
   [model/pricing](https://docs.typesafe.ai/models) documentation. If that skill
   is unavailable, use those official sources. Do not install a duplicate skill.
2. Obtain task-specific permission to use `TYPESAFE_API_KEY`, a total dollar cap,
   and the exact permitted data categories. A previous task's permission does
   not carry forward. No API calls simply because a key exists. The approval
   record is a record of user authorization, not a substitute for it.
3. Use only synthetic examples and explicitly approved public Counterfact code.
   Before including code, verify the GitHub repository is PUBLIC and verify the
   exact revision/path/snippet against the public remote. Record its public
   permalink and commit in task notes. A public repository does not make local
   edits, untracked files, or private branches public. Never send private files,
   credentials, personal data, email, env dumps, or unpublished code. Review
   **all** state, instructions and criteria; the helper cannot establish privacy.
4. Recheck the pinned model's price, default context limit, and output pricing.
   The helper refuses live use seven days after its pricing review; refresh its
   reviewed constants from official docs before subsequent use. Stop if pricing
   or context behavior cannot be bounded. Do not enable long context or retries.

## Helper

`node scripts/typesafe/development.mjs --request request.json` validates and
prints only a digest, byte count, and reservation; it reads no key and sends
nothing. `scripts/typesafe/synthetic.json` is a purely invented two-question
example. The helper supports 1–8 text Noul questions, an 8 KiB JSON request, and
pinned `jev-1.14.0`, via Node's built-in fetch. No SDK dependency is needed.

After reviewing the payload and obtaining permission, create a temporary task
approval JSON outside tracked files. Fill this template with the **actual**
authorization reference, printed request digest, and expiry within 24 hours:

```json
{
  "taskId": "unique-task-id",
  "authorization": "Reference to user approval for this task and permitted data",
  "dataScope": "public-counterfact-and-synthetic",
  "maxUsd": 0.01,
  "maxRequests": 1,
  "requestDigests": ["digest from dry run"],
  "expiresAt": "replace with an ISO UTC timestamp within 24 hours"
}
```

Then run (paths are illustrative):

```sh
node scripts/typesafe/development.mjs --request request.json --send --approval /tmp/task-approval.json
```

The key file defaults to `.env.typesafe.local` beside the **common Git directory**
(`git rev-parse --path-format=absolute --git-common-dir`), so linked worktrees
reuse the original checkout file without copying credentials. On Patrick's Mac
this is `/Users/pmcelhaney/code/counterfact/.env.typesafe.local`. For an unusual
Git layout or another credential location, pass `--credential-file /absolute/path`.
The existing file must have owner-only permissions (`chmod 600` on POSIX).
Windows users must restrict its ACL themselves. The helper parses only the key;
it does not source shell code, modify `process.env`, or use an ambient exported
key. Terminal exports do not configure separately launched agents. Sandboxed
agents still need filesystem/network access; do not circumvent a denial.

## Accounting and failure handling

Each call reserves $0.01 before transmission in the common Git directory under
`typesafe-development/<taskId>.json`; linked worktrees share this ledger. The
reviewed price is $0.042/M input tokens, free output, with 64k default request
context: $0.002688 maximum at those published limits. The reservation exceeds
that bound; it is **not** a provider-side billing cap. No long-context header is
sent. Approvals are capped at $1 and 100 requests; smaller user caps take priority.
Keep one task ID and its ledger across agents, revisions, failures and reruns.
Do not delete/reset ledgers or mint new task IDs to evade a total task budget.
Record any calls made by other tools against the same budget before proceeding;
prefer this helper exclusively. These local controls do not constrain unrelated
processes or protect against deliberate ledger/approval tampering.

An exclusive lock prevents concurrent reservations. Interrupted writes fail
closed; stale locks require inspecting the ledger and resolving the uncertain
outcome before any retry. A failed/timed-out call retains its reservation and
never becomes a "false" judgment. There are no automatic retries. CLI errors
suppress diagnostics to avoid leaking secrets; inspect only nonsecret approval,
permissions, schema and ledger metadata. Do not print key files, request headers,
raw network errors, environment variables or raw provider error bodies.

Success prints only validated Noul answers, model, usage, digest, estimated USD
from reported input tokens, and cumulative reserved USD. The ledger records the
same nonsecret summary, without payloads or credentials. Report estimates as
estimates; actual billed spend requires provider billing evidence. Keep task
results outside source control unless deliberately publishing synthetic/public
results. Normal tests (`yarn test:typesafe`) inject fake transport and keys, make
no API calls, and require no real credential.
