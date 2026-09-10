# Version 4 delivery verification

Verified locally on September 9, 2026, in the dedicated `codex/quality-study-case-study` worktree based on refreshed `origin/main` commit `c8aed03a844f91f641c2925b79e6566f94c11dce`. No commit, push, PR, merge, or deployment was performed.

## Mechanical checks

- `npm run test:audit`: 39 tests pass, covering half-open dates, the exact adoption split, partial September, duplicate cycles, discovery and release-state separation, known carry-in, later escape after pre-release discovery, release timing, individual 90-day follow-up, administrative censoring, date-only and unknown chronology, unresolved identities, all-window stored counts, and source/experiment artifact drift.
- `npm run verify:audit`: passes using the same derivation functions as the article and supporting tables.
- `npm run build`: passes; 99 static site pages.
- `git diff --check`: passes.
- Built study route: 24 pages, 443 internal links and fragments checked, zero invalid targets.
- Version 4 download equals the source manifest plus the retained historical-candidate ledger. Version 3 download equals the preserved original manifest plus its original 567 historical records.
- The original v3 substantive manifest canonically matches `c8aed03a`; SHA-256 `187da310bb61dc89ca3b916b99788a9262923bb2f916ca9044bbfc8feb6bfb34`. Its historical ledger matches SHA-256 `3f752a9b5969b2ea8858827fa07c5ac3c81741ac509f388612d7a636c85d5c5b`.
- The retired 5.54 benchmark is absent from current reader-facing pages and retained in the archive.

## Rendered inspection

Inspected the main article, monthly bars and native table disclosure, seven-case response timeline, methods, expanded ledger, supporting mature table, experiment detail, original case appendix, representative case page, and feedback at desktop (1280×900) and mobile (390×844) widths. Corrected long disposition labels to human-readable wrapping and preserved horizontal scrolling within wide tables. Navigation and source links remain accessible; charts and disclosures require no client-side JavaScript. Both published JSON routes are generated and checked for content agreement. Browser viewport overrides were reset after review.

## Fixed experiment population

All seven required pairs demonstrated the targeted distinction. Six use contemporaneous regression assertions copied into affected historical environments; the packaging case uses an audit-created assertion on actual published tarballs. Raw outputs, exact refs, commands, effective dependency locks where adapted, and hashes are in `experiments/`.

| Case | Targeted distinction |
| --- | --- |
| 1617 | Reserved operation IDs are escaped in generated TypeScript. |
| 1618 | Responses with no schema no longer crash type generation. |
| 1619 | Colon-route imports use the escaped path. |
| 1842 | Path Item metadata is not treated as an operation. |
| 1933 | Exploded query-object fields are reconstructed for handlers. |
| 1971 | Path-item parameters are merged and converted. |
| 2075 | The obsolete patch-package postinstall hook is absent from the corrected package. Both installs succeed; no installation failure is claimed. |

## Interpretation and unresolved evidence

The expanded interval contains 365 non-dependency merges and 47 `counterfact` package releases. The adoption interval contains 279 merges and 21 releases. Seventeen confirmed released defects were reported after adoption: seven from external human discovery and ten with undocumented discovery attribution. Two other findings were repaired before release; four confirmed behaviors retain unknown release status. These are known public-record findings, not an estimate of all defects or a causal AI effect.

The wider account includes the post-adoption middleware regression, a separately recorded recurrence after a January revert, and the independently corrected 2024 parameter-reference defect. The original seven external cases were corrected within five calendar days, but the collection did not capture all released defects.

Unknown release states, unresolved candidates, incomplete public-record backlog ascertainment, two direct-mainline candidates with no established report time, and three unresolved 2023 origin boundaries remain explicit. The source retrieval discrepancy in the first issues traversal is preserved alongside the independently paginated 395-issue census. These are limitations of the evidence, not verification failures or zero outcomes.

## Hypothesis and reader-facing assessment

The article now states a retrospective working hypothesis with explicit delivery, traceable-public-correction, and fixed-case behavioral-check criteria. The historical ninety-day window is documented as a follow-up and censoring rule, not a repair criterion or MTTR. See `hypothesis.md` and `editorial-hypothesis-review.md`. Observations and classifications are unchanged. The article presents the five-year delivery comparison; the complete monthly series is at `/quality/2026/timeline`. Draft-history discussion is absent from the current reader path. Audit tests (39), offline verification, build (99 pages), and whitespace checks pass after this editorial work.
