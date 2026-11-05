# External issue census findings

This is the collection-stage report. Subsequent coordinator adjudications in `adjudications.json` supersede its intermediate counts and classifications; the generated version4dataset is the final adjudicated view.

## Result

The normalized census is `external.json`. It screens 395 public GitHub issues
created before the observation end, obtained from a complete four-page GitHub
Search response (`total_count: 395`, followed by an observed empty fifth page).
It retains 25 external-human reports that were created during the observation
interval or could have been open when it began. Thirteen are confirmed released
defects, including the fixed study population (issues 1617, 1618, 1619, 1842,
1933, 1971, and 2075) and the earlier validated cohort reports 1160, 1244,
1370, 1381, 1506, and 1515. Each has an established affected-release bound and
a first correcting npm publication timestamp, carried from the trusted
historical evidence and the retrieved npm publication metadata.

Five additional records have confirmed product behavior but unresolved release
chronology; the remaining external records are individually classified as a
feature request, invalid input, documentation/product-direction report,
supported workaround, unsupported invocation, process incident, or one
unresolved report. No issue closure is used as a corrected-release date.

| Disposition | Records |
| --- | ---: |
| confirmed released defect | 13 |
| confirmed product behavior with unresolved release chronology | 5 |
| external report awaiting adjudication | 1 |
| external record closed before the window | 20 |
| internal or collaborator record | 307 |
| automated or bot record | 43 |

## Source and completeness

The complete actual-issue source is GitHub Search:

```text
repo:counterfact/api-simulator is:issue created:<2026-09-04
```

`external-raw/issues-search-metadata.json` records the retrieval timestamp,
query, page count, returned count, `total_count`, observed terminal empty page,
and SHA-256 of the raw pages. Search records preserve issue bodies. Comments
for the 25 retained external records are in
`external-raw/relevant-issue-comments-pages.json`, with their own hash and
retrieval metadata.

An additional REST `issues` endpoint traversal was retained in
`external-raw/issues-pages.json`. Its explicit chronological pages produced 237
actual issues, whereas Search returned 395. The normalized census uses the
Search result because its `is:issue` total count and returned IDs establish the
actual-issue population; the endpoint discrepancy remains recorded as a source
gap. The REST issues endpoint must therefore not be used to claim complete
actual-issue ascertainment in this study.

The endpoint discrepancy also means a direct union of repository issue and PR
lists needs a separately verified PR source. This external census neither
counts PRs nor treats a fixing PR as proof of a corrected public release.

## Classification limits

“External human” is based on GitHub’s public user type and association only:
the reporter is a `User` who is neither `MEMBER` nor `COLLABORATOR`. It is a
population rule, not a claim about how the defect was found. For all unresolved
reports, discovery channel remains unadjudicated and release/fix chronology is
`null` with an explicit source-gap status. A current issue closure is not used
as a corrected-release date.

Earlier external records are retained only as carry-in candidates when their
public close time is absent or falls on/after 2024-09-01. Records already closed
before the window are screened and excluded rather than silently omitted.
