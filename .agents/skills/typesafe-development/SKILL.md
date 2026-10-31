---
name: typesafe-development
description: Use Jev for routine classification or evidence checks during Counterfact development with public Counterfact code and synthetic examples. Does not add AI to the shipped product.
---

# Jev development judgments

Patrick has authorized TypeSafe/Jev as a development tool for this public
Counterfact repository, using its public code and synthetic examples. Use it
when a narrow semantic judgment helps: does an excerpt support a documentation
claim, or does an example describe a behavior? Do not ask again for routine use
within this scope or repeatedly check that this known repository is public.
Patrick manages spending through TypeSafe's provider-side controls; do not add
client-side budget ledgers, reservations, spending limits, or approval files.

Use code/tests for exact facts. Jev supplies evidence, never authority to merge,
approve, or replace testing. Keep questions and criteria together in a request.
Noul answers above 0.7/below 0.3 are useful starting yes/no thresholds; treat the
middle as unresolved and inspect evidence yourself.

## Data scope

Use public Counterfact source and invented examples relevant to the development
task. A public repository does not make every local file public. Never send
credentials, environment dumps, ignored files, private/untracked files, personal
data, email, other repositories, or unrelated content. Do not treat unpublished
local changes or private branches as public. Prefer source from known published
revisions; there is no need to reverify remote visibility or every snippet for
routine work. If a particular file's provenance is uncertain, omit it or resolve
that uncertainty before sending it. Review state, questions and criteria for
sensitive content; do not recursively bundle a checkout or collect ambient
application state. The helper reads only the explicitly supplied request file
and credential file, and does not collect source or local files automatically.

This permission covers Counterfact development through this workflow; it does
not grant unrelated third-party agents general access or authorize sending
private data. Obtain approval before expanding these boundaries. The user's
standing authorization here supersedes generic skill advice to ask permission
and obtain an experimentation budget each time.

## Helper

Read the installed TypeSafe integration skill
(`~/.agents/skills/typesafe-ai/SKILL.md` if available) for question design, and use
current official [API](https://docs.typesafe.ai/api/system-one),
[SDK](https://docs.typesafe.ai/sdk/javascript), and
[model](https://docs.typesafe.ai/models) documentation when changing the
integration. Do not install a duplicate skill.

Prepare a JSON request containing `model`, `state`, and named Noul `questions`.
`scripts/typesafe/synthetic.json` is an invented two-question example. The helper
supports 1–8 text Noul questions and an 8 KiB request, using pinned
`jev-1.14.0` and Node's built-in fetch. These are request-shape limits, not budget
controls. No SDK dependency is needed.

Validate locally (no credential access or network):

```sh
node scripts/typesafe/development.mjs --request scripts/typesafe/synthetic.json
```

Send the prepared request directly, without a separate approval/hash step:

```sh
node scripts/typesafe/development.mjs --request scripts/typesafe/synthetic.json --send
```

The key file defaults to `.env.typesafe.local` beside the **common Git directory**
(`git rev-parse --path-format=absolute --git-common-dir`), so linked worktrees
reuse the original checkout file without copying credentials. On Patrick's Mac
this is `/Users/pmcelhaney/code/counterfact/.env.typesafe.local`. For another
credential location or unusual Git layout, pass `--credential-file /absolute/path`.
The existing file must have owner-only permissions (`chmod 600` on POSIX).
Windows users must restrict its ACL themselves. The helper parses only the key;
it does not source shell code, modify `process.env`, or use an ambient exported
key. Terminal exports do not configure separately launched agents. Sandboxed
agents still need filesystem/network access; do not circumvent a denial.

## Results and failures

Success prints only validated Noul answers, model and token usage. It does not
write ledgers, approvals, or payload logs. Provider billing is the source of
truth for spend; do not infer actual billed cost from usage alone.

A failed/timed-out call never becomes a "false" judgment. There are no automatic
retries. CLI errors suppress diagnostics to avoid leaking secrets; inspect only
nonsecret request schema, credential permissions, and service availability.
Do not print key files, request headers, environment variables, raw network
errors or raw provider error bodies. Normal tests (`yarn test:typesafe`) use
synthetic keys and fake transport, make no API calls, and require no real key.
Ordinary Counterfact builds, tests and runtime do not invoke TypeSafe.
