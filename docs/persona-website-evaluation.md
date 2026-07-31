# Persona website evaluation scorecard

Use this scorecard to evaluate whether counterfact.dev explains the product well enough for its target audiences to try it. It converts independent, website-only first impressions into a comparable baseline; it is not product-usage research.

## Method

For each persona, give an evaluator the persona context from `docs/personas.md`, but no Counterfact documentation or repository access. Ask them to browse only `https://counterfact.dev`, score the six dimensions **before** writing their narrative, and capture the date plus pages visited.

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
| Workflow proof | 20% | Does the site show a realistic end-to-end workflow I could follow? |
| Determinism and automation | 20% | Are seeding, reset, reproducibility, CI, and non-interactive control clear enough for my workflow? |
| Contract credibility | 15% | Are the contract guarantees, coverage, limitations, and realism boundaries credible and precise? |
| Adoption readiness | 10% | Are integration/operational basics and alternatives clear enough to start a trial? |

Calculate a persona's total as `SUM(score / 5 × weight)`, for a 0–100 result. Keep individual dimensions visible: a higher average must not hide a critical score of 1 or 2.

## Baseline: 2026-07-31

These scores were inferred from five independent qualitative reviews, so they are directional baselines rather than respondent-entered ratings.

| Persona | Value clarity | Role fit | Workflow proof | Determinism & automation | Contract credibility | Adoption readiness | Weighted total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Maya — frontend engineer | 5 | 5 | 2 | 2 | 3 | 2 | 64 |
| Devon — backend engineer | 5 | 5 | 2 | 2 | 2 | 2 | 61 |
| Priya — QA/SDET | 5 | 5 | 3 | 2 | 3 | 2 | 68 |
| Leo — staff engineer | 5 | 4 | 3 | 3 | 2 | 2 | 65 |
| Aria — AI workflow owner | 5 | 5 | 2 | 2 | 3 | 2 | 64 |
| **Mean** | **5.0** | **4.8** | **2.4** | **2.2** | **2.6** | **2.0** | **64** |

Interpretation: the current site communicates the core proposition (5.0) and role relevance (4.8) well. The test's limiting factor is adoption evidence: workflow proof, deterministic automation, contract boundaries, and practical setup all score below 3.

## Retest protocol

1. Test the same five personas independently, with the same role context and website-only constraint.
2. Record the production site URL, date/time, pages visited, and any notable site/version changes.
3. Collect six numeric scores before asking for open-ended feedback, so narratives do not anchor the ratings.
4. Compare each persona and each dimension with this baseline. Report the point delta and retain the raw scores.
5. Treat a change as successful only if the weighted mean improves and no persona's adoption readiness, workflow proof, or determinism/automation score declines.

### Suggested success criteria for the next iteration

- Weighted mean: **75+** (baseline: 64)
- Workflow proof: **3.5+** mean (baseline: 2.4)
- Determinism and automation: **3.5+** mean (baseline: 2.2)
- Adoption readiness: **3.0+** mean (baseline: 2.0)
- No individual score below **3** in those three dimensions for Maya, Priya, or Aria.

## Per-persona follow-up prompts

- **Maya:** Can you connect a browser app today, including CORS/auth and deterministic realistic data?
- **Devon:** Can you see how a spec and implementation evolve together, including proxy behavior and regeneration?
- **Priya:** Can a parallel CI test suite seed, isolate, reset, and reproduce an edge case without the REPL?
- **Leo:** Can you distinguish contract-checked guarantees from behavioral responsibility and see supported OpenAPI coverage?
- **Aria:** Can an agent start, verify readiness, seed, reset, observe, and safely automate the environment non-interactively?
