# Claim-to-source map for the version 4 case study

Review date: 2026-09-09

Reviewed pages:

- `site/src/pages/quality/2026/index.astro`
- `site/src/pages/quality/2026/methodology.astro`

Reviewed analytical output: `site/src/data/quality-audit-evidence.json`, schema version 4, pinned mainline observation ref `77f0bc6fd2c3bc935d2eb2da80190369d91f7084`.

This is a bounded evidence map, not a new analysis. It maps the material claims in the article and methodology to individual records, immutable Git or GitHub identifiers, npm publication records, and the functions that compute aggregates. Supporting pages were outside the prose-review scope except where the article or methods explicitly rely on their underlying data.

## Review disposition

The article's material numerical and chronological claims are supported by the current version 4 data after the following corrections made during review:

- The two direct-mainline candidates now retain distinct commit identities instead of collapsing to `pr-undefined`.
- The coverage sentence now reports 89.34% and 89.41%, rather than rounding both endpoints to 89.3%.
- The historical experiments refer to affected and corrected **states**, which includes the published-package comparison for #2075.
- The 2.16.2 validity statement is attributed to the maintainer's public comment rather than presented as independently authenticated tarball-to-source identity.
- The August capability source points to the changelog at pinned ref `77f0bc6fd2c3bc935d2eb2da80190369d91f7084`, not mutable `main`.
- Experiment correction refs distinguish the checkout package version from the first corrected public release.
- The experiment artifact manifest now hashes the raw logs, reproducers, effective dependency environments, package evidence, assertion script, README, and result ledger.

No remaining article or methodology claim requires a classification or chronology change. The completed verification pass reported 39 audit tests passing, 98 static pages built, and 473 internal links checked. The final publication commit should still freeze this evidence set.

## Source chain and frozen boundaries

| Layer | Source and immutable evidence | Role |
| --- | --- | --- |
| Protocol | `site/study/2026/protocol.md`, declared frozen 2026-09-09 | Defines the retrospective question, populations, chronology rules, fixed seven-case experiment population, and non-causal interpretation. The freeze date is a declared study-process fact, not an independently timestamped preregistration. |
| Observation boundary | `caseStudy.window`: `[2024-09-01T00:00:00Z, 2026-09-04T00:00:00Z)`; adoption `2026-03-10T16:38:20Z`; pinned commit `77f0bc6fd2c3bc935d2eb2da80190369d91f7084` | Used by `deriveMonthly` and `derivePeriods`. |
| External issue census | `site/study/2026/source/external.json`, SHA-256 `c982ab106db3c7e87a78dc74affae634437213c04d1c8ef5553c65d5f0f8cfce`; retained search snapshot SHA-256 `00e24948c9e975b0869f7866ea5c871ff2f0c8fa0ad0ab8413ea758b72053618` | 395 actual issue records from query `repo:counterfact/api-simulator is:issue created:<2026-09-04`; four pages plus terminal empty page 5. Relevant-comments snapshot SHA-256 is `7f03f5b8ec909d0955b080e6629913fc248a23e0daf9a015e01eb2a50006eda1`. |
| Internal PR census | `site/study/2026/source/internal.json`, SHA-256 `c75c2defc8e0641d0f95f78023cc916a5206ab35d4c2ccfbbce3b5006f669475`; all-PR raw snapshot SHA-256 `659ff4ae887fbe6b01be0f837756d63bd8f8d4b3596ae5b327579dc5ec076e86` | 1,970 all-state PRs retrieved; 1,080 opened or merged in the observation interval. Every interval PR has a screening-ledger disposition. |
| First-parent history | Mainline interval snapshot SHA-256 `8e0cd9f8ce289763748fb4eb2f04227b1777bd6b09c54cbe5f1cdb8c44c0121b`; `caseStudy.mainlineScreen` | Separately screens direct changes so a repair need not be linked to a PR or issue. |
| Delivery | `site/study/2026/source/delivery.json`, SHA-256 `a2e1b309290eebd2e6435fa659f2f6f520f2566fccfe5b9759220b22a8c4f875` | Individual merged-PR records, dependency dispositions, npm releases, windows, workflow changes, and six-hour reconciliation. Each PR/release carries a raw-record SHA-256 and source-snapshot path. |
| Repair chronology | `site/study/2026/source/repair-chronology.json`, SHA-256 `5b4d6861efe38b6006f6f9f4774bfa04948669881907f1d365393516e63767fd` | Fix commits, corrected npm publications, and conservative affected-file/tag bounds. |
| Manual decisions | `site/study/2026/source/adjudications.json`, SHA-256 `eb2beeb1fe44e89cff68b9df606e345977c5bcad6fc08bac11f5b0d166dd010f` | Evidence-bound overrides for #1056, #1105, #1567, #1569, #1591, #1682, #1684, #2263, linked reports, excluded maintenance/features, and direct-mainline uncertainties. |
| Mature records | `site/study/2026/source/historical-dated-records.json`, SHA-256 `dee165e7838eb21f77bca8a1c19dd79c117e9dfe3cf954cec4622096c09bd75e` plus the original 14 `productCases` | Individual event and response inputs for `deriveMature`. |
| Experiments | `site/study/2026/experiments/results.json`, SHA-256 `2e90da71d55aa3948df0e121a64089d31df862edb3c2a5f34d89cea196b1ea9a`; generated `site/study/2026/experiments/artifact-manifest.json`; `caseStudy.experiments.fixed7.artifacts` | Fixed population, refs, commands, environments, named logs, outcomes, interpretation, and SHA-256 for every retained experiment artifact. The validator re-hashes each artifact and fails on drift or absence. |
| Builder and derivations | `site/scripts/build-quality-case-study.mjs`; `site/scripts/quality-case-study-lib.mjs` | Builds schema 4, hashes source inputs, and computes monthly, exact pre/post, and mature outputs from individual records. |

## Article claim map

### Delivery and product change

| Article claim | Individual evidence and computation | Status and bound |
| --- | --- | --- |
| 279 non-dependency PRs after adoption | `derivePeriods(caseStudy).postAdoption.nonDependencyMergedPullRequestIds`, filtering individual delivery PRs with `disposition === "non-dependency"` and `2026-03-10T16:38:20Z <= mergedAt < 2026-09-04T00:00:00Z`. The stored membership contains 279 PR IDs. | Supported. This is activity, not effort, value, or an authorship count. |
| About 3.7 times the highest comparable prior count | The same computation over `matched-2022` through `matched-2025` gives 63, 50, 75, and 15. `279 / max(63,50,75,15) = 3.72`, rendered as 3.7. | Supported as a raw merged-PR comparison. |
| 21 public releases after adoption | `derivePeriods(caseStudy).postAdoption.publishedReleaseIds`, using npm timestamps in the same exact interval, contains 21 individual `npm-counterfact-*` records. | Supported. GitHub releases and tags are not substituted for npm publication. |
| Test-file inventory doubled, 36 to 72 | `analysis.snapshots.preAdoption`: commit `68a3f505ce457f10e4ab30dea47ed8fdde2eb48a`, 36 files. `analysis.snapshots.endOfObservation`: commit `77f0bc6fd2c3bc935d2eb2da80190369d91f7084`, 72 files. | Supported. File count alone does not measure test strength. |
| Request validation, composable scenarios, multiple APIs, versioning, broader OpenAPI support, shared store, and modular packages shipped in the stated months | `featureTimeline` entries link v2.2.0, v2.6.0, v2.8.1, v2.9.0, v2.11.0, and v2.14.0 release records. August is linked to the changelog at pinned ref `77f0bc6fd2c3bc935d2eb2da80190369d91f7084`; npm records establish 2.15.0–2.16.2 publication dates. | Supported as release-history description. It does not establish adoption or use of any capability. |
| August releases lacked a mature 90-day follow-up | August 1 through September 4 is less than 90 days. `delivery.windows["mature-intake-2026"]` ends 2026-06-06 and administratively censors at 2026-09-04. | Supported. |

### Monthly history and broader post-adoption counts

The chart and detailed table are record-derived rather than manually entered. For every calendar row, `deriveMonthly` selects:

- non-dependency PR IDs by `mergedAt`;
- npm release IDs by `publishedAt`;
- confirmed, non-duplicate defect IDs by `reportedAt` and release status;
- correction IDs by first corrected npm publication;
- known backlog IDs reported before the row and publicly affected by its start;
- pre-release, unknown-release, and unresolved IDs in separate arrays.

The rendered exact values come from `caseStudy.monthly[*]`, which the validator recomputes and compares byte-for-byte to `deriveMonthly(caseStudy)`. March remains a full calendar bar; exact pre/post claims use `derivePeriods` and the adoption instant.

The two unplaced direct-mainline candidates are individually retained as:

- `commit-17635fe6b5a55b8381f83eb4f81583d930ae02e3`, authored `2024-09-16T11:44:32-04:00`, committed `2024-10-02T23:19:26Z`, with no independently established report instant or affected public release;
- `commit-8a0483ecfd624227d19781a6005fab121de1f4b1`, authored `2024-10-02T18:47:00-04:00`, committed `2024-10-02T23:19:26Z`, with no independently established report instant or affected public release.

They therefore cannot be put into a report-month column. Their commit URLs and rationales appear in `adjudications.directMainlineReview` and `caseStudy.unresolvedRecords`.

The post-adoption aggregate is exactly the following individual membership:

- **17 released-status reports:** `issue-1617`, `issue-1618`, `issue-1619`, `issue-1842`, `issue-1933`, `issue-1971`, `issue-2075`, `pr-2266`, `pr-1795`, `pr-1740`, `pr-1684`, `pr-1682`, `pr-1624`, `pr-1614`, `pr-1612`, `pr-1609`, `pr-1567`.
- **Discovery split:** the seven `issue-*` records are `external-human`; the ten `pr-*` records are `unknown`. There are no released-status post-adoption records attributed to internal-human or automated-agent discovery.
- **Two pre-release findings:** `pr-1591` and `pr-2263`.
- **Four confirmed behaviors with unknown release status:** `pr-2365`, `pr-1970`, `pr-1920`, `pr-1683`.

These arrays are stored under `caseStudy.periods.postAdoption` and recomputed by `derivePeriods`. The article correctly describes them as deduplicated public-record findings rather than all defects in the software.

### Original seven external reports and response chronology

| Case | Immutable report identity and report time | Confirmed affected history | First corrected npm publication | Calendar/elapsed result |
| --- | --- | --- | --- | --- |
| #1617 | `github-issue-1617`; node `I_kwDOHJTTqM75ywDY`; `2026-04-02T01:24:04Z` | Origin commit `e0696850a6b666d191f1265d798609aca94ca285`; v2.0.0 published `2026-02-26T20:50:41.958Z` | v2.5.0, `2026-04-03T17:57:55.215Z`; npm raw-record SHA-256 `0da98bbd1c63b0e89b6c85b2da82fb3e8685e0e07f81c8ea586fed56ac36bbac` | Next UTC calendar date; 1.6902 days. |
| #1618 | `github-issue-1618`; node `I_kwDOHJTTqM75zTdE`; `2026-04-02T02:19:16Z` | Origin commit `cf49cad1e335f2e7843b904285e4f5d7f72382cb`; v0.13.0 published `2022-10-22T02:50:08.717Z` | v2.5.0 at the timestamp above | Next UTC calendar date; 1.6518 days. |
| #1619 | `github-issue-1619`; node `I_kwDOHJTTqM75zgQl`; `2026-04-02T02:36:22Z` | Origin commit `8f0d2d2091ebb3741e66db1a43b251ea4717a6c5`; v1.4.5 published `2025-09-05T00:17:55.340Z` | v2.5.0 at the timestamp above | Next UTC calendar date; 1.6400 days. |
| #1842 | `github-issue-1842`; node `I_kwDOHJTTqM79uAfu`; `2026-04-13T17:25:51Z` | Origin commit `748424dfe5b46e852ec756bbabab1b2315c86479`; v0.5.0 published `2022-07-18T20:46:08.562Z` | v2.8.1, `2026-04-14T15:48:16.501Z`; npm raw-record SHA-256 `ac0a8593a7e0c0c84ac8ab074dd37a1747feb67058f47b29d94efbaf980f8dbc` | Next UTC calendar date; 0.9322 days. |
| #1933 | `github-issue-1933`; node `I_kwDOHJTTqM8AAAABAI0jeg`; `2026-04-21T17:16:37Z` | Earliest confirmed affected bound v0.13.1, `2022-11-17T00:50:25.076Z`; source-history commit `023788931d612875c70748b1e78094158edbe6b8` | v2.10.0, `2026-04-25T02:27:39.025Z`; npm raw-record SHA-256 `952a2ad6c0d1f83ad5fb5dae496c07c302e1c589868b39be7ef4ca27a57f0eae` | 3.3827 days; within four UTC calendar dates. |
| #1971 | `github-issue-1971`; node `I_kwDOHJTTqM8AAAABA5DhpA`; `2026-04-30T01:54:48Z` | Origin commit `193bc9b0a35abd6be199a58a25a5376c64c59dc4`; v0.5.0 published `2022-07-18T20:46:08.562Z` | v2.11.0, `2026-05-05T00:10:50.946Z`; npm raw-record SHA-256 `b0e8b17f1780d50526429559123ee20d2685ecb7a3ba6c831efb98d138515340` | 4.9278 days; corrected on the fifth subsequent UTC calendar date. |
| #2075 | `github-issue-2075`; node `I_kwDOHJTTqM8AAAABCY2sDA`; `2026-05-15T16:00:38Z` | Origin commit `c4dda369fb51fcfa072a49b5a23dc9143b57c9e8`; v0.39.0 published `2024-04-18T22:51:21.572Z` | v2.12.0, `2026-05-16T18:11:36.115Z`; npm raw-record SHA-256 `d279f8162bb54773d61eb8749a1fe07d4d7827d32ce97651a1bce7fc07e42ed7` | Next UTC calendar date; 1.0910 days. |

The table supports the article's two response claims: five of seven first reached a corrected release on the next UTC calendar date, and all seven did so within five calendar days. The elapsed chart uses exact timestamp subtraction, while the prose explicitly distinguishes calendar dates from 24-hour periods.

Six reports came from `dissemond-bitside` (#1617, #1618, #1619, #1842, #1933, #1971); #2075 came from `iki`. All seven affected publications precede adoption. Six affected publications are more than 90 days before report: every case except #1617. This supports the concentration and late-discovery limitations without treating either as a rate denominator.

### Named maintenance cases

| Claim | Individual evidence | Status and precision |
| --- | --- | --- |
| Root-middleware regression was introduced after adoption, escaped, and was corrected in 2.3.0 | PR #1524 merged as `a987fde68aa5d07f0695f99bc70a734cd6ca629e` at `2026-03-10T16:45:24Z`, seven minutes after adoption. `pr-1567` explicitly says the earlier fix broke behavior. The faulty file is preserved at v2.2.1 tag commit `bf994d4f662b6865f362ff60133b81818d8af21d`, blob `1b397b809ed52274b48f4983357809a7f8019afa`; the same fault first published in v2.2.0 at `2026-03-19T15:24:20.542Z`. Fix merge `f5c6cdc510bba23abcaf1d0a5591643694bd14ad`; v2.3.0 published `2026-03-23T20:49:36.734Z`. | Supported exact post-adoption origin and released status. Discovery remains `unknown`; authorship is not used to fill it. |
| A January revert reintroduced a prior content-type correction; report and npm timestamps conflict at minute precision | Recurrence `pr-1569`; revert `89acaa14b34c65b40060c2cce35f27f8ae9b92d9`; immutable reopening comment URL `issues/1370#issuecomment-3751824219` at `2026-01-14T21:35:48Z`; npm v1.4.9 at `2026-01-14T21:40:37.731Z`; repair `7913a9c4587419ed4fe2f6140d8ea4f30aed0ccc`; v2.4.0 at `2026-03-30T22:55:09.435Z`. | Supported. Under the npm boundary the public report precedes publication by 4m49s, so discovery is `pre-release`; the fault nevertheless escaped and remained through the corrected publication. The prose does not claim it was prevented. |
| August syntax error was repaired before its feature's first public release | `pr-2263`, original prompt links Actions job `30706039092/job/91385553095`; fix commit `31833fb46b704554bc587f0825029caacd1b1862`; containing durable-context PR #2262 reached main as `973b198e4f7c4deca99719f763bc4b51b78e53ca`; v2.15.0 published `2026-08-01T20:57:29.110Z`. | Supported as pre-release. `automated-agent` describes the documented CI/agent finding chain; it does not establish autonomous discovery beyond that record. |
| March REPL completion fault was repaired before publication | `pr-1591`; introduced by `861c4dbb348fd45f47de104f7f0f3f5354dce2bf`; repaired by `578faab7721445884834a8103aa4a1c079fa4100`; main repair merge `cf1ae286e62296f1d883759bfef8036588d43a96`; both feature and repair precede v2.4.0 publication. Earliest linked issue is #1590. | Supported as pre-release and introduced after adoption. Discovery stays `unknown`. |
| Two April repairs have a supported released-status bound before their earliest linked reports | `pr-1684`: v2.5.1 `src/server/tools.ts` at tag `fe5280874065ce7a88545af7d09ffd85fb47c6e2` is byte-identical to the faulty 2.6.0 file and predates issue #1678. `pr-1682`: the faulty proxy block and Koa body handling at the same v2.5.1 tag remain unchanged through 2.6.0 and predate issue #1676. v2.5.1 published `2026-04-03T18:18:59.849Z`; both linked reports are April 6. | Supported as conservative affected bounds, not exact origins. This repairs the earlier chronology in which an automatic 2.6.0 bound fell after the reports. Discovery remains `unknown`. |
| #1105 and #1971 are separate defects | #1105 immutable issue node `I_kwDOHJTTqM6deupy` reports operation-level `$ref` parameters; affected bound is v1.1.3 tag `37c07a6912dc8e1165a9eac0a3248bc68d426306`; PR #1165 / merge `3b0bab4442db668db1a8d940720476f05954531b` follows those references; first correction v1.1.7 at commit `278dcbd48c310666c6a80982c829202bf9efb4a9`. #1971 reports inline parameters at Path Item level and is repaired by PR #1972 / merge `695c1ca39d90d8cc26a8e5448f3209e81ef08e41`. | Supported distinct identity. The shared `path: never` symptom is not evidence of a shared root cause. |

### Test inventory and paired historical experiments

The endpoint inventory is sourced by commit, not inferred from the seven experiments:

- Earlier endpoint `68a3f505ce457f10e4ab30dea47ed8fdde2eb48a`: 270 explicit declarations; Coveralls build 78168279 reports branch coverage `89.34368383909668%`.
- Later endpoint `77f0bc6fd2c3bc935d2eb2da80190369d91f7084`: 904 explicit declarations; Coveralls build 81535061 reports branch coverage `89.41451990632319%`.

The article correctly reports these as 89.34% and 89.41% and immediately warns that the package reorganization changed the measured branch set. It does not interpret the small percentage difference as a quality effect.

| Case | Affected execution state | Corrected execution state | Assertion provenance and stored result | Assessment |
| --- | --- | --- | --- | --- |
| #1617 | `8ff2046f6e7ddfd2f58d75c600de0fcc2053ab09` (v2.0.0) | PR #1622 merge `59f74e1cf2374290b0499567bbe5ff9107cd011b`; first public correction v2.5.0 | Contemporaneous reserved-word assertions from #1622, copied to affected state. `logs/issue-1617-corrected.log`: 3 pass. `logs/issue-1617-affected.log`: 3 fail with unsafe names. Copied reproducer SHA-256 currently `685f6cf6b34b1a3e98f536f4156cdf35ef503a4cc48b96112dbfa01ec47ba10d`. | `demonstrated_detection` supported. Historical dependency adaptation is archived and disclosed. |
| #1618 | `1db0b22de2998f1abf84e536e74da624840ee0fc` (v0.13.0) | Chronology fix merge `8587018a0daa9f93b934b6e0060023b954c4fb91`; corrected execution at `59f74e1cf2374290b0499567bbe5ff9107cd011b`, the first installable retained state containing the unchanged assertion | Contemporaneous no-schema assertion from #1621. Corrected log: 1 pass. Affected log: TypeError on missing schema. Copied reproducer SHA-256 currently `685f6cf6b34b1a3e98f536f4156cdf35ef503a4cc48b96112dbfa01ec47ba10d`. | `demonstrated_detection` supported. The result properly separates correction chronology from the execution ref. |
| #1619 | Immediate affected parent `241d6284ac1424669c179ca4538786b97aa11539`; earliest affected bound v1.4.5 at `0c081caf351ad5c378b1da9a48a54130abf1fe62` | PR #1620 merge `80dc0732ecb4e6e664dbedc29d1ceac7ce49a366`; checkout still reports package v2.4.0; first public correction v2.5.0 | Contemporaneous colon-path assertion. Reproducer SHA-256 `da594a4b4cbb306882a8cec60cb2043a162f75de79288a6f2eae154a63981684`. Corrected 1 pass; affected 1 fail on ASCII versus ratio colon. | `demonstrated_detection` supported. Bound and experimental pair answer different questions and remain separate. |
| #1842 | Immediate affected parent `60a320e5c9673d5fc0cfd5ec351891869b6f1eb1`; earliest affected bound v0.5.0 at `f7b52edf77bfecc3b841f1fc33918fb29b483934` | PR #1843 merge `af406dd6a4709d00fbae8b757ff43eb10ddd4bab`; checkout v2.7.0; first public correction v2.8.1 | Contemporaneous Path Item metadata assertion. Reproducer SHA-256 `6d3d2dc0d13dcc8cee023195a361796a5f1d982f51cb1bc3f2fc129e02e129e9`. Corrected 1 pass; affected 1 TypeError failure. | `demonstrated_detection` supported. |
| #1933 | Immediate affected parent `a67ccaf1f3f2067210fe67c3d8ffd9876036300a`; earliest affected bound v0.13.1 at `3ad1e91161dae681ac208b314a3756d33d555096` | PR #1935 merge `2997e43c12df3d4214d2302183b618d772c452e3`; checkout v2.9.0; first public correction v2.10.0 | Contemporaneous exploded-object assertions. Reproducer SHA-256 `5820cff72e416f154303f1fe96880d547005a209517f427a93492a6de95f52e2`. Corrected 4 pass; affected 3 fail and 1 pass. | `demonstrated_detection` supported because the fixed relevant assertion set distinguishes states; the partial affected pass is disclosed. |
| #1971 | Immediate affected parent `fd9b7dcb179b45c465fc438244272953ba1d5c8b`; earliest affected bound v0.5.0 at `f7b52edf77bfecc3b841f1fc33918fb29b483934` | PR #1972 merge `695c1ca39d90d8cc26a8e5448f3209e81ef08e41`; checkout v2.10.0; first public correction v2.11.0 | Contemporaneous path-item parameter assertions. Reproducer SHA-256 `266ad9faed8cd7a2a45bb8cbafaf660421dd53c377f6743622638d506b47251c`. Corrected 2 pass; affected 2 fail because values remain strings. | `demonstrated_detection` supported and distinct from #1105. |
| #2075 | Published `counterfact@2.11.0`, tarball SHA-256 `432a6484fa46ec6a4c02da1c319935d63f9fa4c43e654fd1974c73a527514fe6` | Published `counterfact@2.12.0`, tarball SHA-256 `426c40f1ebc9c19a7cf2f6d1ddc0febd71a26803220f08fa09ac5b1c09c25e12`; PR #2076 merge `1cd24bdf1d965760b527f8b31f73523995126a8c` | Audit-created `assert-packaging-lifecycle.mjs`, SHA-256 `bc5f8a5752b62b1b39a3f118d0fba20ff1b972de4d3d7cef884a356ee29638a5`. 2.11.0 contains a `postinstall: patch-package` hook and no patches; 2.12.0 omits both. Separate clean installs both exit 0; the affected install logs “No patch files found.” | `demonstrated_detection` supported for the unnecessary lifecycle behavior. It does **not** show an installation failure or a contemporaneous regression test. |

All seven outcomes therefore support the article's narrow statement that the paired checks distinguish affected from corrected behavior. Six checks use assertions introduced with the contemporaneous repairs; #2075 is a later artifact-level check. They do not show what the pre-existing suite would have caught before a report, that the whole historical suite passed, or how many defects were prevented.

For practitioner clarity, “paired historical checks distinguish” is more precise than “tests caught” in a heading or page description, because the experiments were executed later even when the assertions came from contemporaneous repair PRs.

### Release provenance and workflow changes

| Article claim | Evidence | Status and bound |
| --- | --- | --- |
| 2.16.2 appeared on npm without the normal public signals, prompting an external validity question | `npm-counterfact-2.16.2`, published `2026-08-19T20:09:05.856Z`, raw-record SHA-256 `11989f191b5aa614f8099bf27232057b2ebb5195d050e0fb7039a028e4465948`. Issue #2348 is `github-issue-2348`, immutable node `I_kwDOHJTTqM8AAAABOOv3bg`, opened `2026-08-25T19:49:16Z`; its body names the missing repository release and npm provenance check. | Supported as a process incident. |
| Maintainer said the release was valid and locally published | Immutable comment node `IC_kwDOHJTTqM8AAAABRG3sxQ`, `2026-08-27T17:48:50Z`, says it was valid and the first modular-package release came from the maintainer's machine. Comment node `IC_kwDOHJTTqM8AAAABRY6Spg`, `2026-08-29T10:58:06Z`, says GitHub publishing resumed with 2.16.5. | Supported as attributed maintainer statements. This is not an independent artifact-to-source authentication. |
| Manual-acceptance checks were added and product-level journeys changed | Workflow record `d6a93b09e0cd343080e31d44eed71479c06d0280` / PR #1592 adds the manual checklist gate. `61455e829e8c17e6b84c426db8c9f9527bc4de5b` / PR #1561 moves black-box journeys to Python. `4c0d10b7a96569c765b641d9873ad81bf99b08cc` / PR #2323 moves them to Cucumber. | Supported as process changes. The article correctly does not estimate their separate effects. |

## Methodology claim map

| Methods claim | Source or computation | Assessment |
| --- | --- | --- |
| Version 4 is a retrospective expansion, not preregistration | `protocol.md`; `study.design`; `caseStudy.researchQuestion`; retained schema 3 artifact and 14 original `productCases`. | Supported as a declared study-design fact. |
| Continuous interval, exact adoption instant, partial September, and exact pre/post split | `caseStudy.window`, `caseStudy.adoptionAt`, `deriveMonthly`, `derivePeriods`. | Supported. Monthly rows intentionally do not split March; exact-period outputs do. |
| Six-hour reconciliation found no new merge, npm release, or first-parent commit | `delivery.reconciliation` contains empty `mergedPullRequests`, `releases`, and `firstParentCommits` between `2026-09-03T18:00:00Z` and `2026-09-04T00:00:00Z`. | Supported negative observation for the three named streams. |
| 395 issue records; 1,970 PR records overall; 1,080 interval PRs | External search metadata and internal retrieval/counts described above. | Supported. The explicit REST issues traversal's 237-issue discrepancy is retained and not treated as authoritative completeness. |
| Every issue/interval-PR candidate has a disposition and rationale | `caseStudy.candidates` contains the 395 issue records plus 1,080 interval PRs, for 1,475 candidates. `internal.screening_ledger` covers every interval PR. Direct first-parent commits have their own 1,012-record `mainlineScreen`; its two unresolved candidates are separately retained with commit IDs and reasons. | Supported with the stated separation between candidate and mainline ledgers. |
| Classification attributes are independent | `protocol.md`; `validateCaseStudy`; per-record `disposition`, `duplicateOf`, `discoveryChannel`, `releaseStatus`, `originStatus`, precision, and timestamps. | Supported. Current adjudications preserve #1105/#1971 identity, unknown discovery for author-only repairs, and the pre-release/released distinction for #1569. |
| A source-file match is a bound rather than exact origin | `repair-chronology.json` affected-file entries, `firstAffectedPrecision`, and `adjudications.json`. | Supported. The methods and article avoid converting bounds into exact introduction dates. |
| Original 281 count corrected to 279 | Individual delivery PR classification; exact post-adoption `derivePeriods` result. | Supported. Two additional dependency-only changes are excluded from the old non-Renovate proxy. |
| Known backlog is public-record backlog | `deriveMonthly.publiclyAffectedBy` and `carryInKnownBacklogIds`; unknown release states remain separate. | Supported within the public-record boundary. It is not all outstanding product debt. |
| Mature event and response cohorts have distinct rules | `deriveMature`; `caseStudy.matureRecords`; `delivery.windows["mature-intake-YYYY"]`; stored `supportingMature`. Events require exact first-affected publication in intake and report within that release's 90-day follow-up. Responses enter by report time and use individual deadlines. | Supported. The 2023 event analysis remains explicitly incomplete through unresolved IDs `issue-453`, `issue-487`, and `issue-530`; it must not be read as a known zero. |
| Fixed seven-case population and outcome rules | `protocol.md`; `experiments/results.json`; `validateCaseStudy` requires the exact IDs 1617, 1618, 1619, 1842, 1933, 1971, 2075 and a valid outcome enum. | Supported. Outcome semantics remain focused-pair semantics. |
| Pages and verifier share derivations; commands check analytical boundaries and source integrity | Article imports `deriveMonthly`/`derivePeriods`; builder and validator import the same library; `test:audit`, `verify:audit`, and build scripts provide the named gates. The builder enumerates every experiment artifact except the generated artifact manifest itself, writes SHA-256 values into both the manifest and `caseStudy.experiments.fixed7.artifacts`, and the validator re-hashes each file. | Supported for normalized source files, result ledger, raw logs, reproducers, assertion script, README, package evidence, and effective archived environments. |
| No causal model, combined score, defect/download rate, or prevented-defect estimate is published | Article limitations, protocol, and methods. | Supported. Interpretive prose stays qualitative and names confounders. |

## Practitioner-facing prose recommendations

The factual repairs above are reflected in the reviewed article. The experiment wording now follows these practitioner-facing choices:

1. The page description says “what paired historical checks distinguish,” and the section heading says “What the paired historical checks distinguish.” This avoids suggesting contemporaneous or preventive discovery when the experiments are later executions of repair-era assertions.
2. The seven-case result remains adjacent to its qualification: six checks reuse assertions added with the repair, and the seventh is an audit-created package-lifecycle check.

The most useful practitioner claim is the release-path claim already present in the article: code review, focused regression assertions, product-level journeys, and publication provenance answer different questions. The #1567 escape shows why a passing subset of checks cannot stand in for an affected workflow; #1591 and #2263 show why pre-release findings should be counted separately; #2348 shows that artifact provenance is part of delivery quality even when a maintainer says the artifact is valid.

## Final verification requirements

The completed final mechanical pass rebuilt schema 4, ran the audit and offline verification, built 98 static pages, and checked 473 internal links; 39 audit tests passed. The reviewed output also confirms:

1. `caseStudy.unresolvedRecords` contains two distinct `commit-*` entries and no `pr-undefined` entry.
2. All seven result records have an allowed outcome and corresponding retained evidence.
3. The experiment artifact manifest covers the raw logs, reproducers, effective environments, package evidence, assertion script, README, and result ledger, and validation detects artifact drift.
4. Released-status records cannot place their confirmed affected publication after the report; delivery counts are recomputed for every stored window.

The remaining publication requirement is to freeze the reviewed protocol, normalized sources, adjudications, builder, manifest, pages, and experiment archive in the final repository commit.
