---
name: episodic-memory
description: >
  Record noteworthy repository work as selective, immutable Markdown episodes,
  including surprises, failed explanations, corrections, and tentative lessons.
  Use when an experience is worth preserving beyond the resulting code or
  consolidated guidance; not for routine task summaries or standing rules.
---

# Episodic Memory

Preserve the experience behind a decision without turning every observation
into a rule. Consolidated repository guidance remains the primary source of
instructions; episodes are historical evidence, with explicit uncertainty.

## Decide whether to record

Record an episode when the work reveals something that would be difficult to
reconstruct or easy to misinterpret later, such as:

- An observation that contradicted the initial explanation.
- A plausible approach that failed for a non-obvious reason.
- A correction that materially changed the solution.
- A decision whose circumstances would be lost in a general rule.
- A promising technique with too little evidence to promote into guidance.

Skip routine work, command transcripts, and summaries already adequately
captured by the change or commit message. Do not require an episode for every
task. A useful episode need not produce a consolidated lesson.

## Write an episode

Store repository episodes under `.agents/episodes/`. Create the directory when
recording the first real episode; do not seed it with invented history.
Use a unique filename such as `YYYY-MM-DDTHHMMSSZ-short-description.md`, using
the recording time in UTC. Distinguish the event date if recording older work.
Check for an existing related episode before creating a duplicate.

Use the template below, keeping the account as short as the evidence allows.
Record what was actually observed. Separate observations from explanations,
mark recollections and hypotheses, and identify untested conclusions. Include
relevant versions or conditions when they affect interpretation. Omit secrets
and private material that does not belong in the repository.

```markdown
# Short description of the experience

Recorded: YYYY-MM-DDTHH:MM:SSZ
Occurred: event date or range, if different; mark unknown dates
Related: PR, full commit SHA, issue, relevant paths, or none yet

## Situation
What we were trying to accomplish and the relevant circumstances.

## What happened
What we expected, what we observed, and what changed our understanding.

## Evidence
Commands and relevant results, examples, or durable links supporting the account.
Identify evidence that is unavailable or was not independently verified.

## Interpretation
What we think explains it, including uncertainty and limits of applicability.

## Consolidation
Link to resulting guidance, or explain why no rule was added at recording time.
```

Prefer reproducible details and durable references over temporary filesystem
paths or long logs. Use full commit SHAs when identifying source history.
If the episode is created alongside a change, name the relevant paths; do not
invent a commit SHA or create a self-reference to the future commit containing
the episode. A later PR or commit message can link to the episode.

## Preserve the original account

An episode may be drafted and corrected before its first commit. Once
committed, treat it as immutable: do not rewrite, rename, or delete it as routine
maintenance. Immutability is a repository convention, not a technical guarantee
or a claim that the account is true.

For later corrections, add a new episode with a `Corrects:` field containing
the original repository-relative episode path. State which observations or
interpretations changed, why, and what evidence supports the correction.
Use `Extends:` for additional findings that do not contradict the earlier account.
These fields point backward so the original file stays untouched.

## Keep evidence separate from instructions

If the work also establishes a durable lesson, update the appropriate skill or
`AGENTS.md` under the existing repository learning workflow. Recording an
episode does not replace that obligation. Keep the actionable rule in guidance
and the experience in the episode; link them when helpful.

Commit messages should explain the change and its rationale. Link an episode
when the investigation adds useful context rather than duplicating its account
in the commit message. Creating an episode does not authorize a commit, push,
PR, or any other external action beyond the user's task.

## Consult episodes selectively

Do not load the archive for every task or build an index, retrieval service, or
automation merely to start recording. When a current investigation warrants
historical context, search the relevant terms and read only matching episodes.
Before relying on one, search `.agents/episodes/` for its repository-relative
path to find corrections or extensions, following those references as needed.
Verify conditions that could have changed. Historical claims and hypotheses
must not override current evidence or maintained repository guidance.

When evaluating usefulness later, look for actual cases where an episode
supplied relevant evidence, context, or an exception absent from consolidated
guidance. Choose further recording or retrieval changes from those cases.
