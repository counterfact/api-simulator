---
name: github-landing-experiment
description: Run or document repeatable, GitHub-only Counterfact landing-experience experiments with isolated persona evaluators, fixed scoring, baseline deltas, and hypothesis-driven retests. Use when evaluating README, linked docs, examples, or repository metadata for first-time adoption.
---

# GitHub landing experiment

Use this skill to run a comparable newcomer evaluation of Counterfact’s public GitHub repository. Keep the experiment about the GitHub landing experience, not counterfact.dev.

## Read before acting

1. Read `docs/personas.md` for the five persona contexts.
2. Read `docs/persona-github-evaluation.md` for the committed baseline, weights, success criteria, and prior results.
3. Read `docs/persona-github-evaluator-prompt.md` and use its prompt verbatim for each evaluator.

## Preserve evaluator independence

- Give each evaluator only its persona section, the public GitHub URL, the tested commit, and the shared prompt.
- Do not provide prior scores, feedback, hypotheses, implementation details, or other evaluators’ output.
- Require all six numeric scores before narrative feedback.
- Restrict exploration to README-discoverable GitHub materials. Never use counterfact.dev.

## Run and record a test

1. Pin the repository URL, commit SHA, and date.
2. Run Maya, Devon, Priya, Leo, and Aria independently.
3. Preserve each evaluator’s exact visited-pages list, six raw scores, weighted total, and feedback.
4. Calculate mean dimension scores and weighted mean using the scorecard weights.
5. Report deltas against the committed GitHub baseline and the immediately prior cycle.
6. Compare results with the success criteria; flag any protected-persona regression even if the overall mean rises.

## Retest discipline

Propose only a small, testable hypothesis for the next cycle. Change GitHub-visible newcomer materials, verify links and relevant checks, commit the focused change, and retest the new commit. Stop when the target is met, results plateau, a change regresses a protected dimension, or no focused hypothesis remains. Update `docs/persona-github-evaluation.md` with the run record so the next conversation can reproduce it.
