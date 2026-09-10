# Evidence review of the normalized case-study census

Reviewed 2026-09-09 against `protocol.md`, the archived version-3 manifest, `external.json`, `internal.json`, `delivery.json`, `repair-chronology.json`, the retained GitHub snapshots, npm publication metadata, and pinned local Git history. This review is limited to classification, deduplication, and chronology. It does not approve publication or broaden the study.

## Material findings requiring correction

### 1. Issue #1105 is a separate released defect with a demonstrated repair chronology

The earlier normalization deduplicated issue #1105 to issue #1971 because both reports produce `path: never`. The inputs and repairs demonstrate different faults:

- `github-issue-1105` uses an **operation-level** parameter whose value is `$ref: '#/components/parameters/SomeId'`. The failure is that `ParametersTypeCoder` reads `parameter.in`, `parameter.name`, and `parameter.required` directly without following the reference.
- `github-issue-1971` uses an **inline path-item-level** parameter. PR #1972 changes the generator and runtime to combine `pathItem.parameters` with operation-level parameters.

The correction that makes #1105 distinct from #1971 is necessary but insufficient. The repository contains exact repair evidence that resolves #1105's currently unknown delivery chronology:

- Issue source: `github-issue-1105`, immutable GitHub node `I_kwDOHJTTqM6deupy`, created `2024-11-07T20:16:50Z`.
- Affected bound: `v1.1.3`, tag commit `37c07a6912dc8e1165a9eac0a3248bc68d426306`, published `2024-10-17T16:23:51.456Z`. `src/typescript-generator/parameters-type-coder.js` is byte-identical in tags `v1.1.3`, `v1.1.4`, `v1.1.5`, and `v1.1.6` (SHA-256 `97fc990ecb1ff00dc38e1fe5fe543d1ca8664e7fb61e1c17f61d73d76df1fac8`). This is an earliest-confirmed affected bound, not proof of exact origin.
- Repair: PR #1165, merge commit `3b0bab4442db668db1a8d940720476f05954531b`. Its title is `update ParametersTypeCoder to follow references (#1105)`; `.changeset/cool-emus-repeat.md` says `follow $refs in parameters (fixes #1105)`; the code changes parameter traversal to use `Requirement#get`, which follows `$ref`.
- Corrected release: `v1.1.7`, tag commit `278dcbd48c310666c6a80982c829202bf9efb4a9`, published `2025-01-18T21:28:35.322Z`. PR #1165 is an ancestor of `v1.1.7` and is not an ancestor of `v1.1.6`.

Required fix: classify #1105 as a confirmed released defect, retain it as distinct from #1971, set `firstAffectedRelease: "1.1.3"`, `firstAffectedPrecision: "bound"`, `fixedRelease: "1.1.7"`, and add #1165 plus immutable tag/commit evidence. Override the `internal.json` screening-ledger false negative for PR #1165 (`not_confirmed_after_normalized_body_screen`). Recompute November 2024 reports, the known backlog, January 2025 corrections, period totals, and any downstream prose.

### 2. PR #1540 is sourced from pre-window issue #718 and is not evidence of a new post-adoption defect report

The combined census currently uses PR #1540's creation at `2026-03-18T18:24:03Z` as the report time and counts it as a released post-adoption defect. The PR's original prompt was only `Find a low hanging fruit in the issues and fix it`. The underlying issue is #718, created `2024-01-17T15:54:46Z`, before the case-study observation interval. Its text specifies desired 405 behavior (and mistakenly says 406 in the body); it does not document a regression or an observed failure against a stated Counterfact contract.

Required fix: do not treat repair-PR creation as a new report. Adjudicate #718 as either a pre-window feature/enhancement and exclude it from the defect census, or supply evidence that the old 404 behavior violated an existing product promise and retain it only as a pre-window carry-in. In neither case may `pr-1540` contribute a new post-adoption report. Sources: `github-issue-718`, PR #1540, merge commit `297f6bee5d0767192780a81889d3a0665f407643`.

### 3. The #1370 recurrence has a known reintroduction and report event; its public-release status needs an explicit boundary rule

The original issue #1370 and the later PR #1569 are not the same occurrence. The version-3 manifest already states that the first fix shipped in 1.4.2, a later release reverted it, and a separate 2026 repair restored it. The expanded record currently uses PR #1569's March creation as the report time and leaves origin/release status unresolved.

The retained evidence establishes:

- Reintroduction commit: `89acaa14b34c65b40060c2cce35f27f8ae9b92d9`, committed `2026-01-13T17:14:23Z`, subject `revert change in #1372 which broke type shortcuts like .json(), .html(), etc.`
- Recurrence report: issue comment `https://github.com/counterfact/api-simulator/issues/1370#issuecomment-3751824219`, created `2026-01-14T21:35:48Z`, saying the latest release reverted the change.
- First npm publication containing the revert: `v1.4.9`, published `2026-01-14T21:40:37.731Z`, 4 minutes 49 seconds after the retained comment timestamp.
- Repair: PR #1569 / merge commit `7913a9c4587419ed4fe2f6140d8ea4f30aed0ccc`; corrected release 2.4.0 at `2026-03-30T22:55:09.435Z`.

Required fix: model the recurrence separately from the original 2025 defect, use the January reopening comment as the recurrence report, and set the exact reintroduction commit. Under the study's npm-publication definition, it is a pre-release finding at report time; however, the comment's phrase `latest release` conflicts with the registry timestamp by several minutes. Preserve that source tension and state the release boundary used rather than claiming that the recurrence never escaped. Recompute monthly and pre/post-adoption placement.

### 4. PR #1099 inherits its report date from issue #1089

PR #1099 is currently dated by PR creation (`2024-11-02T15:29:15Z`). Its changeset explicitly says it fixes issue #1089, and issue #1089 was created `2024-10-19T21:11:22Z` with the concrete statement that `Requirement#has` and `Requirement#get` fail on `$ref` nodes.

Required fix: link `issue-1089` to `pr-1099`, retain the existing conservative affected bound (`v1.1.3`) and corrected release (`v1.1.4`), and use the issue timestamp as the first report. This moves the report from November to October 2024 and changes the October-to-November backlog/correction sequence. Sources: `github-issue-1089`, PR #1099, merge commit `aa4dec60c1a316c68ba886b63227274d1331ecda`.

## Confirmed manual chronology claims

- `pr-1567`: supported as an exact post-adoption regression. PR #1524 merge commit `a987fde68aa5d07f0695f99bc70a734cd6ca629e` changed root recursion from `""` to `"/"` at `2026-03-10T16:45:24Z`, seven minutes after the frozen adoption boundary. The faulty code shipped in 2.2.0 and 2.2.1. PR #1567 explicitly says the earlier root-middleware fix broke all responses and restores the empty-string root; merge commit `f5c6cdc510bba23abcaf1d0a5591643694bd14ad`, corrected release 2.3.0.
- `pr-1591`: supported as pre-release. Commit `861c4dbb348fd45f47de104f7f0f3f5354dce2bf` introduced the custom completer and commit `578faab7721445884834a8103aa4a1c079fa4100` restored fallback behavior within the same PR branch. Main received the fixed state in merge commit `cf1ae286e62296f1d883759bfef8036588d43a96`; 2.4.0 was published later. Issue #1590 is the first retained report and is correctly linked to this record.
- `pr-2263`: supported as pre-release. The syntax error existed on the PR #2262 durable-context branch, was repaired by PR #2263 before PR #2262 reached main, and main merge commit `973b198e4f7c4deca99719f763bc4b51b78e53ca` therefore contains the repair. The first later npm release was 2.15.0. The PR body links the failing CI job and identifies an automated commit; that supports the combined `automated-agent` channel used by this protocol, but it should not be restated as proof of autonomous discovery beyond the recorded CI failure.
- `issue-1056`: the downstream adjudication to `v1.0.1` is supported. The issue explicitly reports Counterfact 1.0.1, published `2024-08-03T18:18:17.727Z`; the pinned 1.0.1 source at commit `431baf14aa7244394e11f908ee9bacee7d9d811c` registers `/index` without a `/` alias; PR #1062 adds that alias. Keep the value as a confirmed-affected bound, not an exact origin. `external.json` and `repair-chronology.json` still expose the later 1.0.2 automated file-match bound, so the generated manifest must clearly mark the manual 1.0.1 adjudication as superseding that intermediate result.

## Population controls

Issues #1706 and #1704 are maintenance suggestions, not confirmed faulty behavior: #1706 explicitly says the current coercion returns the correct result, and #1704 describes deprecation plus hypothetical future removal. Issue #1803 requests optional runtime response validation and is a feature request. They must remain outside defect counts even if a candidate classifier labels their titles as bugs.

The 35 `internal.json` confirmed findings are candidate repair records, not a publishable defect total. Their creation times are valid only when no earlier issue, comment, failing check, or branch-local finding is documented. The corrections above demonstrate three distinct failure modes in a raw total: a missed repair (#1165), a feature/carry-in treated as a post-period report (#1540), and repair-PR timestamps used after earlier reports (#1099 and the #1370 recurrence). Recompute every derived count after the adjudication ledger is updated.
