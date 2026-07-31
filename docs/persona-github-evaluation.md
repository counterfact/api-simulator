# Persona GitHub landing evaluation scorecard

Use this scorecard to evaluate whether Counterfact's public GitHub repository explains the project well enough for its target audiences to try it. The experience begins at `README.md` and includes only GitHub-visible materials a normal first-time visitor can reasonably discover from the README. This is a GitHub landing-experience measure, not an evaluation of counterfact.dev or product-usage research.

The GitHub baseline stands on its own. Do not compare these scores numerically with the website baseline in `docs/persona-website-evaluation.md`; the surfaces and test protocols are different.

## Method

For each persona, give an independent evaluator only that persona's context from `docs/personas.md` and the public repository landing URL. Evaluators must not visit counterfact.dev, inspect local repository files outside the README-discoverable visitor path, read prior feedback or scorecards, or coordinate with one another. Ask each evaluator to assign all six scores **before** writing narrative feedback, then capture the date, tested commit, and exact files/pages visited.

Score every dimension from 1 to 5:

| Score | Meaning |
| --- | --- |
| 1 | Missing, misleading, or a clear adoption blocker. |
| 2 | Mentioned, but the evaluator cannot confidently act on it. |
| 3 | Adequate; they understand the claim but need documentation before adopting. |
| 4 | Clear and credible; they would try it in a suitable project. |
| 5 | Concrete, compelling, and sufficient to champion the next step. |

## Dimensions and weights

| Dimension | Weight | What the evaluator is judging |
| --- | ---: | --- |
| Value clarity | 15% | Can I explain what Counterfact does and why it differs from a static mock? |
| Role fit | 20% | Does it directly solve my role's job to be done? |
| Workflow proof | 20% | Does the GitHub landing path show a realistic end-to-end workflow I could follow? |
| Determinism and automation | 20% | Are seeding, reset, reproducibility, CI, and non-interactive control clear enough for my workflow? |
| Contract credibility | 15% | Are the contract guarantees, coverage, limitations, and realism boundaries credible and precise? |
| Adoption readiness | 10% | Are integration/operational basics and alternatives clear enough to start a trial? |

Calculate a persona's total as `SUM(score / 5 x weight)`, for a 0–100 result. Keep individual dimensions visible: a higher average must not hide a critical score of 1 or 2.

## GitHub baseline: 2026-07-31

- Repository: `https://github.com/counterfact/api-simulator`
- Tested commit: `cbe773dab3c3f0ec54c552266d5ed2a5521eec8b`
- Pinned landing URL: `https://github.com/counterfact/api-simulator/tree/cbe773dab3c3f0ec54c552266d5ed2a5521eec8b`
- Evaluation date: 2026-07-31

All five evaluators reported assigning the six numeric scores before writing qualitative feedback.

| Persona | Value clarity | Role fit | Workflow proof | Determinism & automation | Contract credibility | Adoption readiness | Weighted total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Maya — frontend engineer | 5 | 5 | 4 | 4 | 4 | 4 | 87 |
| Devon — backend engineer | 4 | 4 | 4 | 4 | 3 | 3 | 75 |
| Priya — QA/SDET | 5 | 5 | 4 | 4 | 3 | 3 | 82 |
| Leo — staff engineer | 4 | 4 | 3 | 4 | 4 | 3 | 74 |
| Aria — AI workflow owner | 5 | 5 | 4 | 4 | 4 | 4 | 87 |
| **Mean** | **4.6** | **4.6** | **3.8** | **4.0** | **3.6** | **3.4** | **81** |

The strongest dimensions are value clarity and role fit (both 4.6). The lowest dimensions are adoption readiness (3.4), contract credibility (3.6), and workflow proof (3.8). Determinism and automation reaches 4.0 on average, but Priya still scores adoption readiness at 3, below the primary-persona success threshold.

## Independent evaluator records

### Maya — frontend engineer

**Files/pages visited:** repository landing page and `README.md`; `docs/getting-started.md`; `docs/comparison.md`; `docs/usage.md`; `docs/patterns/index.md`; `docs/patterns/scenario-scripts.md`; `docs/patterns/automated-integration-tests.md`.

**Evidence:** The README names the frontend problem directly and clearly differentiates a stateful simulator from static fixtures. Getting Started demonstrates the central create, retrieve, delete, then 404 workflow. Scenario and integration-test patterns show typed startup state, named reset behavior, and programmatic lifecycle control.

**Blockers:** The proof is documentation rather than a visible recorded run. A realistic stateful flow still requires writing context and handlers. There is no turnkey per-test reset/isolation primitive, `@latest` weakens reproducibility, and Node 22+ may constrain adoption.

### Devon — backend engineer

**Files/pages visited:** repository landing page and `README.md`; `docs/getting-started.md`; `docs/patterns/index.md`; `docs/personas.md`; `docs/comparison.md`; `docs/usage.md`; `docs/reference.md`; `docs/faq.md`; `docs/patterns/hybrid-proxy.md`; `docs/patterns/scenario-scripts.md`; `docs/patterns/automated-integration-tests.md`.

**Evidence:** The landing path establishes OpenAPI-derived handlers and a credible staged-backend workflow. Hybrid Proxy supplies a runnable proxy command, mock handler, default forwarding behavior, and path toggles. Scenario and integration-test docs show deterministic startup and local test lifecycle control.

**Blockers:** Devon's role fit is buried. The proxy guide does not show the exact real `/users` plus simulated `/payments` sequence or explicitly prove that the client base URL stays unchanged. Runtime response validation is described less precisely than compile-time type checks, and removal/retirement guidance is absent.

### Priya — QA/SDET

**Files/pages visited:** repository landing page and `README.md`; `docs/getting-started.md`; `docs/patterns/index.md`; `docs/personas.md`; `docs/comparison.md`; `docs/usage.md`; `docs/reference.md`; `docs/faq.md`; `docs/patterns/scenario-scripts.md`; `docs/patterns/simulate-failures.md`; `docs/patterns/simulate-latency.md`; `docs/patterns/automated-integration-tests.md`; `docs/patterns/test-context-not-handlers.md`; `docs/patterns/repl-inspection.md`; linked example-petstore README.

**Evidence:** The landing path closely matches Priya's state, failure, reset, and reproducibility needs. Linked patterns demonstrate typed startup/reset scenarios, flag-controlled failures, configurable latency, clean process restarts, and real-HTTP test control.

**Blockers:** No single runnable workflow proves empty state, failure, and successful retry. The example repository emphasizes random handlers and has a conflicting Node requirement. Outgoing response validation is advisory, random defaults are unsuitable for deterministic suites without customization, and ready-made reset-per-test or CI examples are missing.

### Leo — staff engineer

**Files/pages visited:** repository landing page and `README.md`; `docs/getting-started.md`; `docs/patterns/index.md`; `docs/personas.md`; `docs/comparison.md`; `docs/usage.md`; `docs/reference.md`; `docs/faq.md`; `docs/patterns/executable-spec.md`; `docs/patterns/automated-integration-tests.md`; `docs/patterns/scenario-scripts.md`.

**Evidence:** The OpenAPI-native generation story, spec watch/regeneration flow, typed handlers, request validation, response checks, version support, and overlays are substantial. The executable-spec pattern shows schema changes updating generated types and surfacing handler mismatches.

**Blockers:** There is no copyable CI check showing a contract change fail across simulated handlers and a client. Response-checking boundaries are not prominent enough, contract governance is buried, and stale repository links plus a README typo reduce trust. Pinned-install guidance is also absent.

### Aria — AI workflow owner

**Files/pages visited:** repository landing page and `README.md`; `docs/getting-started.md`; `docs/patterns/ai-assisted-implementation.md`; `docs/reference.md`; `docs/faq.md`; `docs/usage.md`; `docs/comparison.md`; `docs/personas.md`; `docs/features/programmatic-api.md`; `docs/features/repl.md`; `docs/patterns/test-context-not-handlers.md`; `docs/patterns/reference-implementation.md`.

**Evidence:** The README names the agent use case, while AI-Assisted Implementation supplies a concrete prompt and typed feedback loop. Scenario files and the programmatic API make local state and test lifecycle controllable, reusable, and reviewable.

**Blockers:** No single agent-oriented workflow covers implementation, deterministic scenario execution, verification, and a human-reviewable artifact. Random defaults obscure determinism, CI enforcement is recommended but not copy-ready, and the targeted real-backend safeguard is not demonstrated. `@latest` is also a weak default for durable agent workflows.

## Recurring blockers and priorities

1. **No role-specific first-10-minute path.** Useful pieces exist, but visitors must assemble setup, state, scenario/reset, test, proxy, and contract-boundary guidance across several pages.
2. **Deterministic automation is discoverable but not turnkey.** Scenario scripts and the programmatic API are credible, yet there is no concise copyable reset-per-test/CI workflow near the README.
3. **Contract boundaries need sharper language.** Generated types and request validation check contract shape; they do not supply realistic business behavior. Outgoing response checks are advisory and should not be presented as equivalent to runtime enforcement.
4. **Adoption details are incomplete.** The quickstart uses `@latest`, lacks a compact lifecycle/cleanup path, and leaves version pinning, CI, ports, and retirement to deeper discovery.
5. **Trust polish has visible defects.** The README contains a malformed closing `div` and a typo, some badges/community links point at older repository identities, and the linked example reports an inconsistent Node requirement.

## Retest protocol and success criteria

1. Test Maya, Devon, Priya, Leo, and Aria independently with only their persona context and the updated GitHub landing URL.
2. Record URL, commit SHA, date, exact pages/files visited, and all six numeric scores before narrative feedback.
3. Compare each cycle with this committed GitHub baseline and the immediately prior cycle. Retain raw persona scores and report dimension means, weighted mean, and deltas.
4. Do not count a cycle as successful solely because its overall mean rises. Flag or reverse a change if workflow proof, determinism/automation, or adoption readiness declines for Maya, Priya, or Aria.

Target:

- Weighted mean: **90 or higher** (baseline: 81)
- Workflow proof: **4 or higher** mean (baseline: 3.8)
- Determinism and automation: **4 or higher** mean (baseline: 4.0)
- Adoption readiness: **3.5 or higher** mean (baseline: 3.4)
- No score below **3.5** in those three dimensions for Maya, Priya, or Aria
