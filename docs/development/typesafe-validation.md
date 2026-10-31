# Jev development helper validation

On 2026-10-31, the development-only helper sent one request containing only
`scripts/typesafe/synthetic.json`, an invented documentation excerpt and two
Noul questions. No repository source, private data or credential contents were
included in the request body. The existing local key was loaded privately.

- Model: `jev-1.14.0`
- Payload SHA-256: `a55a13485ac0856c1224628b43468b38ebe84977320fc94ea3c175b1a1f1d72c`
- Evidence supports claim: `0.98`
- Excerpt describes authentication: `0.03`
- Reported input/output tokens: `372` / `44`
- Estimated charge: `$0.000015624` (372 × $0.042 / 1,000,000; output free)
- Conservative task reservation: `$0.01` of the user-approved `$1` total
- Actual billed spend: not verified against provider billing

The [official pricing](https://docs.typesafe.ai/models) and
[HTTP contract](https://docs.typesafe.ai/api/system-one) were reviewed before
sending. The endpoint was `https://api.typesafe.ai/v1/systemone`, with no retries,
redirects, or long-context header. GitHub reported `counterfact/api-simulator`
PUBLIC; no source snippets were sent, so no source-publication assumption was
needed for this check. This small positive/negative check verifies credential
loading, API compatibility and accounting, not general judgment accuracy.

The task-specific approval allowed only one request and expires within hours.
The original approval/ledger remain local, outside tracked files. This report is
not standing authorization: a subsequent task needs its own bounded permission.
See the [development workflow](../../.agents/skills/typesafe-development/SKILL.md)
for safe request preparation, worktree credential discovery, and budget controls.
