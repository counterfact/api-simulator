# Counterfact agentic coding benchmark

This benchmark measures whether access to a live Counterfact sandbox helps a
coding agent implement a resilient API client. It also provides a small,
auditable example of agent orchestration: the conductor prepares isolated
workspaces, starts and resets dependencies, dispatches agent runs, grades the
result, and aggregates structured evidence.

## Experimental design

Every run receives the same task, starter repository, and OpenAPI document.

- **control** — the agent works from the task and contract only.
- **counterfact** — the agent also receives a URL for a live, stateful
  Counterfact server and instructions for selecting deterministic scenarios.

The conductor keeps Codex in `workspace-write` mode. For the Counterfact arm it
enables command networking through Codex's network proxy with only
`127.0.0.1` allowlisted, so the agent can reach the local sandbox without
opening general outbound network access.

After the agent exits, both conditions are graded against fresh Counterfact
instances using the same six scenarios. The grader, not the agent, controls
server state. A run receives a functional score from 0 to 100. The report also
records whether the agent left a passing test suite and, for the treatment,
which sandbox scenarios it actually exercised.

This is a comparative benchmark, not a security boundary. Agents should run in
the isolated workspace created by the conductor, but a locally executed agent
may still be able to inspect other readable files on the machine.

## Run it

Prerequisites are Node.js 22+, this repository's installed dependencies, and an
authenticated `codex` CLI. The benchmark runs Counterfact directly from source,
so a separate package build is not required.

```sh
node --import tsx benchmarks/agentic-coding/run.mjs --runs 3 --parallel 2
```

For a quick smoke run:

```sh
node --import tsx benchmarks/agentic-coding/run.mjs --runs 1 --condition counterfact
```

Results are written beneath `benchmarks/agentic-coding/results/`. Each run keeps
the agent event log, final response, modified workspace, grading details, and
metadata. The experiment directory also contains `summary.json` and
`summary.md`.

Useful options:

```text
--condition both|control|counterfact
--runs N
--parallel N
--model MODEL
--codex PATH
--timeout-ms N
```

Use at least five paired runs before making a product claim. Keep the agent,
model, prompt, task, and grader fixed while changing Counterfact. Report raw
scores and failures alongside averages; do not select only favorable runs.

The initial preflight and the changes it motivated are recorded in
[`baselines/2026-07-31-preflight.md`](./baselines/2026-07-31-preflight.md).

## What is scored

| Capability | Points |
| --- | ---: |
| Fetch all pages | 25 |
| Recover from a 429 | 20 |
| Respect `Retry-After` | 10 |
| Recover from transient 503s | 15 |
| Deduplicate records across pages | 10 |
| Bound persistent retries | 10 |
| Avoid retrying ordinary 4xx errors | 10 |

The task intentionally describes the desired outcome without spelling out all
the sandbox behavior. In the Counterfact condition, the agent can discover and
reproduce those behaviors through real HTTP calls.

## Reading the result

The headline metric is the paired score difference:

```text
mean(counterfact score) - mean(control score)
```

Also compare durable-test rate, scenarios exercised, completion rate, elapsed
time, and token usage. Counterfact is useful when it raises correctness or
reproducibility enough to justify any extra interaction cost. The evidence is
stronger if the advantage persists across models and after the benchmark is
rerun from a clean checkout. A 100/100 tie is a saturated benchmark, not proof
that the tool has no value; increase task realism before drawing conclusions.
