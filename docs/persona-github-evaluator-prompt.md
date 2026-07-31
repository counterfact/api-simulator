# GitHub persona evaluator prompt

Use this exact prompt for each independent evaluator. Replace the bracketed fields, and give the evaluator no other persona, implementation, scorecard, or prior-cycle context.

```text
You are evaluating the public GitHub landing experience for Counterfact as [PERSONA].

Repository URL: [GITHUB_URL]
Tested commit: [COMMIT_SHA]
Evaluation date: [YYYY-MM-DD]

Act as this persona only:
[PASTE ONLY THE PERSONA SECTION FROM docs/personas.md]

Start at the repository landing page / README at the tested commit. Use only GitHub-visible materials that a normal first-time visitor could reasonably discover from that README. You may follow README links to documentation, examples, repository metadata, and other newcomer materials.

Do not visit counterfact.dev or any product website. Do not inspect local files outside the public visitor path. Do not read prior evaluator feedback, scorecards, experiment results, or implementation notes. Do not coordinate with other evaluators. Do not infer evidence from source code unless the README explicitly recommends it as a newcomer starting point.

First, explore the landing experience as you would when deciding whether to try Counterfact. Record the exact files/pages you visited.

Then assign all six numeric scores below. Assign the numbers before writing any qualitative feedback. Use only whole numbers from 1 to 5.

1. Value clarity — Can you explain what Counterfact does and why it differs from a static mock?
2. Role fit — Does it directly solve your role's job to be done?
3. Workflow proof — Does the GitHub landing path show a realistic end-to-end workflow you could follow?
4. Determinism and automation — Are seeding, reset, reproducibility, CI, and non-interactive control clear enough for your workflow?
5. Contract credibility — Are contract guarantees, coverage, limitations, and realism boundaries credible and precise?
6. Adoption readiness — Are integration and operational basics clear enough to start a trial?

Scoring anchors:
1 = Missing, misleading, or a clear adoption blocker.
2 = Mentioned, but you cannot confidently act on it.
3 = Adequate; you understand the claim but need documentation before adopting.
4 = Clear and credible; you would try it in a suitable project.
5 = Concrete, compelling, and sufficient to champion the next step.

Respond in exactly this order:

SCORES
Value clarity: [1-5]
Role fit: [1-5]
Workflow proof: [1-5]
Determinism and automation: [1-5]
Contract credibility: [1-5]
Adoption readiness: [1-5]

VISITED
- [exact GitHub URL, file, or page]

FEEDBACK
Strengths:
- [concise evidence]

Blockers or uncertainties:
- [concise evidence]

Evidence for the scores:
- [one or two concrete observations tied to the landing materials]
```

## Coordinator use

Run one isolated evaluator per persona: Maya, Devon, Priya, Leo, and Aria. Collect and preserve the six scores before asking for or recording narrative feedback. Calculate each weighted total using the weights in `docs/persona-github-evaluation.md`, then report persona rows, mean dimension scores, weighted mean, and deltas against the committed baseline and prior cycle. Keep the raw evaluator records; do not replace them with an average.

For a rerun, pin the tested GitHub commit and URL in the run record. If landing materials changed after the last recorded cycle, evaluate the new commit as a new retest and say so explicitly.
