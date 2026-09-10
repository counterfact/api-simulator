# Delivery census findings

`delivery.json` is the record-level ledger for the original matched and mature
cohorts plus the continuous 2024-09-01 through 2026-09-04 observation interval.
It uses the public npm registry for `counterfact` publication times, the complete
all-state GitHub pull-request snapshot collected by `internal_census`, and the
local pinned repository's first-parent history. The cutoff is exclusive:
`2026-09-04T00:00:00Z`, whose preceding first-parent commit is
`77f0bc6fd2c3bc935d2eb2da80190369d91f7084`.

## Reconciliation

The original snapshot ended at `2026-09-03T18:00:00Z`. There were zero merged
PRs, zero npm publications, and zero first-parent main commits in the six-hour
extension through the cutoff. This is an observed zero from the respective
record sets, not an inference from an aggregate.

The original matched counts reproduce when using its historical non-Renovate
proxy except that it includes two confirmed dependency-only PRs in 2026:
`#1512` (Snyk koa upgrade) and `#2250` (site lockfile dependency repair). The
content-classified ledger therefore reports 279 non-dependency PRs for the 2026
matched window and retains `originalNonRenovateProxy: 281` for compatibility.

For 2022, manual review identifies `#16` as a human-authored dependency-only
change. Classifying it as dependency restores the old 63 non-dependency count;
the old aggregate's 45 "dependency bot" label should not be read as a complete
dependency-only classification. For 2026 mature intake, manually classifying
`#1512` restores 235 non-dependency PRs.

## Classification limits

All Renovate and Dependabot authored PRs are dependency automation. A small
enumerated set of human-authored or agent-authored dependency-only changes is
also excluded with a record-specific reason. Other records are not called
dependency-only merely because their title contains a dependency-related word:
for example, `#1992` includes a product compatibility change and `#2076`
removes a user-visible install-time hook. The public pull-list snapshot has PR
bodies but not a complete PR-file census, so this is a conservative
record-reviewed classification rather than proof that no other mixed change
contains a dependency edit.

## Dated workflow evidence

The ledger links four immutable records useful to the article: creation of the
manual-acceptance gate in `#1592`, black-box journey conversion in `#1561`, the
Cucumber journey/mutation-testing expansion in `#2323`, and merge-queue support
for the required manual-acceptance check in `#2379`. Timestamps are labelled by
source: the `#1561` time is GitHub `merged_at`; the commit entries use Git
committer timestamps.

## Source gaps

The GitHub raw PR response is retained as `internal-tools/pulls-all.json.gz`
inside the source archive. Its decompressed content is the original retrieval.
Its SHA-256 and query/pagination description are recorded in `delivery.json`.
The release ledger covers the package named `counterfact`; it does not assert a
separate publication census for later internal workspace packages.
