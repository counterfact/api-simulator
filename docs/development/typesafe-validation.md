# Jev development helper validation

On 2026-10-31, the development-only helper sent one request containing only
`scripts/typesafe/synthetic.json`, an invented documentation excerpt and two
Noul questions. No repository source, private data or credential contents were
included in the request body. The existing local key was loaded privately.

- Model: `jev-1.14.0`
- Evidence supports claim: `0.98`
- Excerpt describes authentication: `0.03`
- Reported input/output tokens: `372` / `44`
- Estimated charge at the reviewed published rate: `$0.000015624`
- Actual billed spend: not verified against provider billing

The [official pricing](https://docs.typesafe.ai/models) and
[HTTP contract](https://docs.typesafe.ai/api/system-one) were reviewed before
sending. The endpoint was `https://api.typesafe.ai/v1/systemone`, with no retries,
redirects, or long-context header. This small positive/negative check verifies
credential loading and API compatibility, not general judgment accuracy.

The helper was subsequently simplified to use Patrick's standing authorization
for public Counterfact code and synthetic examples, with provider-side spending
controls. The simplification was validated offline, without another paid call.
See the [development workflow](../../.agents/skills/typesafe-development/SKILL.md)
for request preparation, data boundaries, and worktree credential discovery.
