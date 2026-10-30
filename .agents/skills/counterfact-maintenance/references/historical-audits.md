# Historical experiments and public audits

Paths and commands below are relative to the repository root.

- Preserve historical experiment inputs in `counterfact/historical-experiments` rather than the maintained product tree. Pin external evidence to a full commit and retain its hash manifest and result snapshot locally so site builds stay offline. Verify the archive bytes against that pin with `cd site && npm run verify:experiment-archive -- /path/to/archive` when migrating or changing evidence; `verify:audit` checks local integrity and pin consistency, not external bytes. Keep historical dependency upgrades separate from preserved runs.

- For public repository-history audits, record classification confidence separately from chronology confidence. Use an exact origin only when the introducing change is demonstrated; otherwise publish the earliest confirmed affected bound and label it as a bound.

- Keep audit windows, population rules, candidate dispositions, deduplication rules, immutable source identifiers, and derived totals in a checked-in manifest with an offline consistency check. Do not make a headline denominator depend only on hand-maintained page copy or a live search URL.

- For time-to-report quality cohorts, close intake early enough to give every included release the same fixed follow-up. Publish the complete candidate ledger, treat unresolved response cases as censored, make raw event counts primary when exposure units are heterogeneous, and label rate denominators as sensitivity analyses.

A source-preserving refactor does not establish a defect's origin. Preserve standalone external defect PRs in the report population when they meet its inclusion rules.
