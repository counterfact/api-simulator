import assert from "node:assert/strict";
import test from "node:test";
import baseManifest from "../src/data/quality-audit-evidence.json" with { type: "json" };
import archivedManifest from "../src/data/quality-audit-evidence-v3.json" with { type: "json" };
import historicalLedger from "../src/data/quality-historical-candidates.json" with { type: "json" };
import {
  exactPoissonInterval,
  isWithinWindow,
  kaplanMeier,
  median,
  matureCases,
  selectIntroducedCases,
  selectReportedCases,
  summarizeCases,
  validateManifest,
} from "./quality-audit-lib.mjs";
import {
  classifyPath,
  isCommitInCohortWindow,
  parseNumstat,
} from "./quality-churn-lib.mjs";

const manifest = {
  ...baseManifest,
  historicalCandidates: historicalLedger.records,
};

const v4Manifest = () => {
  const copy = structuredClone(manifest);
  return copy;
};

test("summarizeCases keeps report years and categories separate", () => {
  const cases = [
    { year: 2025, category: "Pre-existing" },
    { year: 2026, category: "Same-year regression" },
    { year: 2026, category: "Defect in same-year feature" },
  ];
  assert.deepEqual(summarizeCases(cases, 2026), {
    year: 2026,
    total: 2,
    counts: {
      "Same-year regression": 1,
      "Defect in same-year feature": 1,
      "Pre-existing": 0,
    },
  });
});

test("matureCases applies an exact 90-day boundary", () => {
  const cases = [
    { firstAffectedPublishedAt: "2026-06-06T00:00:00Z" },
    { firstAffectedPublishedAt: "2026-06-06T00:00:00.001Z" },
  ];
  assert.equal(matureCases(cases, "2026-09-04T00:00:00Z", 90).length, 1);
});

test("exact Poisson intervals retain uncertainty around zero events", () => {
  const interval = exactPoissonInterval(0, 14);
  assert.equal(interval.lower, 0);
  assert.ok(interval.upper > 0.26 && interval.upper < 0.27);
});

test("Kaplan-Meier estimates include administrative censoring", () => {
  assert.deepEqual(
    kaplanMeier([
      { days: 1, event: true },
      { days: 90, event: false },
    ]),
    {
      observations: 2,
      events: 1,
      medianDays: 1,
      resolvedBy90: 0.5,
      points: [
        { days: 1, atRisk: 2, events: 1, censored: 0, survival: 0.5 },
        { days: 90, atRisk: 1, events: 0, censored: 1, survival: 0.5 },
      ],
    },
  );
});

test("historical candidate ledger is a complete record-level census", () => {
  const counts = Object.fromEntries(
    [2022, 2023, 2024].map((year) => [
      year,
      historicalLedger.records.filter((item) => item.year === year).length,
    ]),
  );
  assert.deepEqual(counts, { 2022: 173, 2023: 152, 2024: 242 });
});

test("primary windows include the start and exclude the end", () => {
  const window = {
    start: "2026-03-10T16:38:20Z",
    endExclusive: "2026-09-04T00:00:00Z",
  };
  assert.equal(isWithinWindow("2026-03-10T16:38:20Z", window), true);
  assert.equal(isWithinWindow("2026-09-03T23:59:59Z", window), true);
  assert.equal(isWithinWindow("2026-09-04T00:00:00Z", window), false);
});

test("churn windows include the exact start and exclude the exact end", () => {
  assert.equal(isCommitInCohortWindow(2026, "2026-03-10T11:38:20-05:00"), true);
  assert.equal(isCommitInCohortWindow(2026, "2026-09-04T00:00:00Z"), false);
});

test("churn path categories apply a stable, exclusive priority", () => {
  assert.equal(classifyPath(".yarn/releases/yarn.cjs"), "lockOrGenerated");
  assert.equal(classifyPath("site/src/pages/example.test.ts"), "tests");
  assert.equal(classifyPath("site/src/pages/index.astro"), "documentation");
  assert.equal(classifyPath("packages/runtime/src/index.ts"), "sourceOrOther");
});

test("numstat parser handles ordinary, renamed, and binary records", () => {
  const records = parseNumstat(
    Buffer.from(
      "2\t1\tpackages/runtime/src/index.ts\0" +
        "0\t0\t\0old.test.ts\0new.test.ts\0" +
        "-\t-\timage.png\0",
    ),
  );
  assert.deepEqual(records, [
    {
      added: "2",
      deleted: "1",
      path: "packages/runtime/src/index.ts",
      renamed: false,
    },
    {
      added: "0",
      deleted: "0",
      path: "new.test.ts",
      renamed: true,
    },
    { added: "-", deleted: "-", path: "image.png", renamed: false },
  ]);
});

test("reported and introduced cohorts remain distinct", () => {
  const window = {
    start: "2026-03-10T16:38:20Z",
    endExclusive: "2026-09-04T00:00:00Z",
  };
  const cases = [
    {
      reportYear: 2026,
      reportedAt: "2026-04-01T00:00:00Z",
      firstAffectedPublishedAt: "2026-02-01T00:00:00Z",
    },
    {
      reportYear: 2026,
      reportedAt: "2026-04-02T00:00:00Z",
      firstAffectedPublishedAt: "2026-03-20T00:00:00Z",
    },
  ];
  assert.equal(selectReportedCases(cases, 2026, window).length, 2);
  assert.equal(selectIntroducedCases(cases, 2026, window).length, 1);
});

test("median handles odd and even cohorts", () => {
  assert.equal(median([6, 357, 3]), 6);
  assert.equal(median([1, 1, 1, 1, 4, 5, 1]), 1);
  assert.equal(median([1, 5]), 3);
});

test("checked-in primary cohorts reproduce the article results", () => {
  const cohorts = [2025, 2026].map((year) => {
    const window = manifest.study.primaryWindows[String(year)];
    const cases = selectReportedCases(manifest.productCases, year, window);
    return {
      year,
      reports: cases.length,
      introduced: selectIntroducedCases(manifest.productCases, year, window)
        .length,
      medianResponseDays: median(cases.map((item) => item.responseDays)),
    };
  });
  assert.deepEqual(cohorts, [
    { year: 2025, reports: 3, introduced: 0, medianResponseDays: 6 },
    { year: 2026, reports: 7, introduced: 0, medianResponseDays: 1 },
  ]);
});

test("automated verification snapshots retain all five cohort endpoints", () => {
  const { comparison2022, comparison2023, comparison2024, comparison2025 } =
    manifest.activity.snapshots;
  const { preAdoption, endOfObservation } = manifest.activity.snapshots;
  const historicCoverage = manifest.activity.historicCohorts;
  const supplementalCoverage =
    manifest.activity.supplementalFullWindow.coverage;
  assert.deepEqual(
    {
      comparison2022: {
        status: comparison2022.status,
        firstReachableCommit: comparison2022.firstReachableCommit,
        endTestFiles: comparison2022.end.testFiles,
        endTestDeclarations: comparison2022.end.testDeclarations,
      },
      comparison2023: {
        testFiles:
          comparison2023.end.testFiles - comparison2023.start.testFiles,
        testDeclarations:
          comparison2023.end.testDeclarations -
          comparison2023.start.testDeclarations,
      },
      comparison2024: {
        testFiles:
          comparison2024.end.testFiles - comparison2024.start.testFiles,
        testDeclarations:
          comparison2024.end.testDeclarations -
          comparison2024.start.testDeclarations,
      },
      comparison2025: {
        testFiles:
          comparison2025.end.testFiles - comparison2025.start.testFiles,
        testDeclarations:
          comparison2025.end.testDeclarations -
          comparison2025.start.testDeclarations,
        branchCoveragePercent:
          comparison2025.start.branchCoverage.branchCoveragePercent,
        coverageKind: comparison2025.start.branchCoverage.kind,
        failedSuites:
          comparison2025.start.branchCoverage.testResult.failedSuites,
      },
      aiCohort: {
        testFiles: endOfObservation.testFiles - preAdoption.testFiles,
        testDeclarations:
          endOfObservation.testDeclarations - preAdoption.testDeclarations,
        branchCoveragePercentagePoints: Number(
          (
            endOfObservation.branchCoveragePercent -
            preAdoption.branchCoveragePercent
          ).toFixed(3),
        ),
      },
    },
    {
      comparison2022: {
        status: "not_estimable",
        firstReachableCommit: "238c74baa4748932dc5580cc0a18016b9442d21e",
        endTestFiles: 21,
        endTestDeclarations: 94,
      },
      comparison2023: { testFiles: 0, testDeclarations: 10 },
      comparison2024: { testFiles: 6, testDeclarations: 48 },
      comparison2025: {
        testFiles: 1,
        testDeclarations: 6,
        branchCoveragePercent: 89.72,
        coverageKind: "local-recomputation",
        failedSuites: 1,
      },
      aiCohort: {
        testFiles: 36,
        testDeclarations: 634,
        branchCoveragePercentagePoints: 0.071,
      },
    },
  );
  assert.deepEqual(
    {
      2022: historicCoverage["2022"].coverage.end.branchCoveragePercent,
      2023: historicCoverage["2023"].coverage.end.branchCoveragePercent,
      2024: historicCoverage["2024"].coverage.end.branchCoveragePercent,
      2025: supplementalCoverage["2025"].branchCoveragePercent,
      2026: endOfObservation.branchCoveragePercent,
    },
    {
      2022: 95.51282051282051,
      2023: 91.74560216508796,
      2024: 89.85637342908439,
      2025: 90.13107170393215,
      2026: 89.41451990632319,
    },
  );
});

test("historic delivery and coverage retain matched-window limitations", () => {
  const cohorts = manifest.activity.historicCohorts;
  assert.deepEqual(
    {
      2022: {
        nonDependencyMerges: cohorts["2022"].nonDependencyMergedPullRequests,
        releases: cohorts["2022"].publishedReleases,
        coverageStatus: cohorts["2022"].coverage.status,
      },
      2023: {
        nonDependencyMerges: cohorts["2023"].nonDependencyMergedPullRequests,
        releases: cohorts["2023"].publishedReleases,
        coverageChange: Number(
          (
            cohorts["2023"].coverage.end.branchCoveragePercent -
            cohorts["2023"].coverage.start.branchCoveragePercent
          ).toFixed(3),
        ),
      },
      2024: {
        nonDependencyMerges: cohorts["2024"].nonDependencyMergedPullRequests,
        releases: cohorts["2024"].publishedReleases,
        coverageChange: Number(
          (
            cohorts["2024"].coverage.end.branchCoveragePercent -
            cohorts["2024"].coverage.start.branchCoveragePercent
          ).toFixed(3),
        ),
      },
    },
    {
      2022: {
        nonDependencyMerges: 63,
        releases: 7,
        coverageStatus: "not_estimable",
      },
      2023: {
        nonDependencyMerges: 50,
        releases: 19,
        coverageChange: -2.686,
      },
      2024: {
        nonDependencyMerges: 75,
        releases: 24,
        coverageChange: -0.827,
      },
    },
  );
});

test("historic defect cohorts distinguish reports from introduced defects", () => {
  const cohorts = manifest.activity.historicDefectCohorts;
  assert.deepEqual(
    {
      2022: {
        reports: cohorts["2022"].qualifyingExternalProductDefects,
        introduced: cohorts["2022"].introducedWithinWindow,
        median: cohorts["2022"].medianResponseDays,
      },
      2023: {
        reports: cohorts["2023"].qualifyingExternalProductDefects,
        introduced: cohorts["2023"].introducedWithinWindow,
        median: cohorts["2023"].medianResponseDays,
        introducedReports: cohorts["2023"].introducedReports.map(
          (report) => report.number,
        ),
      },
      2024: {
        reports: cohorts["2024"].qualifyingExternalProductDefects,
        introduced: cohorts["2024"].introducedWithinWindow,
        median: cohorts["2024"].medianResponseDays,
        introducedReports: cohorts["2024"].introducedReports.map(
          (report) => report.number,
        ),
      },
    },
    {
      2022: { reports: 0, introduced: 0, median: null },
      2023: { reports: 4, introduced: 1, median: 10, introducedReports: [491] },
      2024: {
        reports: 7,
        introduced: 3,
        median: 6,
        introducedReports: [866, 906, 918],
      },
    },
  );
});

test("checked-in commit and churn metrics retain exact matched-window totals", () => {
  const cohorts = manifest.activity.cohortGitMetrics.cohorts;
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(cohorts).map(([year, cohort]) => [
        year,
        {
          firstParentCommits: cohort.firstParentCommits,
          additions: cohort.additions,
          deletions: cohort.deletions,
          churn: cohort.churn,
          categoryChurn: Object.values(cohort.categoryChurn).reduce(
            (total, value) => total + value,
            0,
          ),
        },
      ]),
    ),
    {
      2022: {
        firstParentCommits: 181,
        additions: 42770,
        deletions: 9252,
        churn: 52022,
        categoryChurn: 52022,
      },
      2023: {
        firstParentCommits: 129,
        additions: 7535,
        deletions: 5036,
        churn: 12571,
        categoryChurn: 12571,
      },
      2024: {
        firstParentCommits: 205,
        additions: 163929,
        deletions: 165287,
        churn: 329216,
        categoryChurn: 329216,
      },
      2025: {
        firstParentCommits: 152,
        additions: 9714,
        deletions: 7256,
        churn: 16970,
        categoryChurn: 16970,
      },
      2026: {
        firstParentCommits: 548,
        additions: 104938,
        deletions: 46409,
        churn: 151347,
        categoryChurn: 151347,
      },
    },
  );
  assert.equal(cohorts["2022"].status, "partial_history");
  assert.equal(cohorts["2024"].categoryChurn.lockOrGenerated, 312983);
});

test("retrospective baselines use every complete eligible pre-AI cohort", () => {
  const delivery = manifest.activity.historicCohorts;
  const defects = manifest.activity.historicDefectCohorts;
  const primary = manifest.activity.primaryWindow;
  const historicNonDependencyMerges = [
    delivery["2022"].nonDependencyMergedPullRequests,
    delivery["2023"].nonDependencyMergedPullRequests,
    delivery["2024"].nonDependencyMergedPullRequests,
    primary.nonDependencyMergedPullRequests["2025"],
  ];
  const historicReleases = [
    delivery["2022"].publishedReleases,
    delivery["2023"].publishedReleases,
    delivery["2024"].publishedReleases,
    primary.publishedReleases["2025"],
  ];
  const historicIntroductions =
    defects["2022"].introducedWithinWindow +
    defects["2023"].introducedWithinWindow +
    defects["2024"].introducedWithinWindow +
    selectIntroducedCases(
      manifest.productCases,
      2025,
      manifest.study.primaryWindows["2025"],
    ).length;
  const pooledMerges = historicNonDependencyMerges.reduce(
    (total, value) => total + value,
    0,
  );
  assert.equal(median(historicNonDependencyMerges), 56.5);
  assert.equal(median(historicReleases), 13);
  assert.equal(median([0, 6, 1]), 1);
  assert.equal(median([10, 48, 6]), 10);
  assert.equal(
    median([
      defects["2022"].qualifyingExternalProductDefects,
      defects["2023"].qualifyingExternalProductDefects,
      defects["2024"].qualifyingExternalProductDefects,
      3,
    ]),
    3.5,
  );
  assert.equal(median([10, 6, 6]), 6);
  assert.deepEqual(
    {
      gitCommitMedian: median([129, 205, 152]),
      gitChurnMedian: median([12571, 329216, 16970]),
    },
    { gitCommitMedian: 152, gitChurnMedian: 16970 },
  );
  assert.equal(pooledMerges, 203);
  assert.equal(historicIntroductions, 4);
  assert.equal(
    Number(
      (
        (historicIntroductions / pooledMerges) *
        primary.nonDependencyMergedPullRequests["2026"]
      ).toFixed(2),
    ),
    5.54,
  );
});

test("coverage reference stays a two-cohort descriptive midpoint", () => {
  const cohorts = manifest.activity.historicCohorts;
  const changes = ["2023", "2024"].map(
    (year) =>
      cohorts[year].coverage.end.branchCoveragePercent -
      cohorts[year].coverage.start.branchCoveragePercent,
  );
  assert.equal(Number(median(changes).toFixed(3)), -1.756);
  assert.equal(
    Number(
      (
        manifest.activity.snapshots.endOfObservation.branchCoveragePercent -
        manifest.activity.snapshots.preAdoption.branchCoveragePercent -
        median(changes)
      ).toFixed(3),
    ),
    1.827,
  );
});

test("candidate ledger exposes every reviewed disposition", () => {
  assert.equal(manifest.candidates.length, 19);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(
        Object.groupBy(manifest.candidates, (item) => item.disposition),
      ).map(([key, items]) => [key, items.length]),
    ),
    {
      "product-defect": 14,
      excluded: 3,
      deduplicated: 1,
      "process-incident": 1,
    },
  );
  assert.deepEqual(validateManifest(v4Manifest()), []);
});

test("archived schema three still reproduces its original consistency checks", () => {
  const archived = {
    ...archivedManifest,
    historicalCandidates: historicalLedger.records,
  };
  assert.deepEqual(validateManifest(archived), []);
});

test("schema four validates source-linked delivery, experiments, and stored derivations", () => {
  const valid = v4Manifest();
  const invalidDisposition = structuredClone(valid);
  invalidDisposition.caseStudy.delivery.pullRequests[0].disposition =
    "non_dependency";
  assert.match(
    validateManifest(invalidDisposition).join("\n"),
    /invalid delivery pull request disposition/,
  );

  const wrongCount = structuredClone(valid);
  wrongCount.caseStudy.delivery.counts[
    "mature-intake-2026"
  ].publishedReleases += 1;
  assert.match(
    validateManifest(wrongCount).join("\n"),
    /delivery count mismatch for mature-intake-2026: publishedReleases/,
  );

  const changedSource = structuredClone(valid);
  changedSource.caseStudy.sourceFiles[0].sha256 = "0".repeat(64);
  assert.match(
    validateManifest(changedSource).join("\n"),
    /source hash mismatch/,
  );

  const staleMature = structuredClone(valid);
  staleMature.caseStudy.supportingMature["mature-intake-2026"].eventIds.push(
    "invented",
  );
  assert.match(
    validateManifest(staleMature).join("\n"),
    /stored supportingMature does not match recomputed derivation/,
  );

  const invalidExperiment = structuredClone(valid);
  invalidExperiment.caseStudy.experiments.fixed7.results[0].outcome = "none";
  assert.match(
    validateManifest(invalidExperiment).join("\n"),
    /fixed7 results/,
  );
});

test("manifest declares branch coverage and the mixed 2025 pair", () => {
  assert.equal(manifest.analysis.coverageMetric, "branch");
  assert.equal(
    manifest.analysis.coverageComparability["2025"],
    "not_comparable_mixed_sources",
  );
  assert.match(manifest.study.primaryOutcomes[2], /reported branch coverage/);
});

test("manifest distinguishes the mature primary outcome from the same-window retrospective rule", () => {
  assert.match(manifest.study.primaryOutcomes[0], /first released by June 6/);
  assert.match(manifest.study.primaryOutcomes[0], /reported within 90 days/);

  const retrospectiveRule =
    manifest.study.retrospectiveComparison.introducedDefectRule;
  assert.match(retrospectiveRule, /external report/);
  assert.match(retrospectiveRule, /first affected public release/);
  assert.match(retrospectiveRule, /both/);
});

test("validateManifest catches incomplete evidence relationships", () => {
  const manifest = {
    schemaVersion: 2,
    productCases: [
      {
        id: "issue-1",
        reportYear: 2026,
        category: "Pre-existing",
        firstAffectedPublishedAt: "2020-01-01T00:00:00Z",
      },
      {
        id: "issue-1",
        reportYear: 2026,
        category: "Pre-existing",
        firstAffectedPublishedAt: "2020-01-01T00:00:00Z",
      },
    ],
    candidates: [
      {
        id: "issue-1",
        year: 2026,
        disposition: "product-defect",
        openedAt: "invalid",
      },
      {
        id: "issue-1",
        year: 2026,
        disposition: "deduplicated",
        openedAt: "2026-01-01T00:00:00Z",
        linkedCandidateId: "issue-404",
      },
    ],
    processIncidents: [],
    activity: {
      primaryWindow: {
        pullRequestAuthors: {
          2025: { dependencyBots: 0 },
          2026: { dependencyBots: 1 },
        },
        mergedPullRequests: { 2025: 0, 2026: 2 },
      },
    },
  };
  assert.ok(validateManifest(manifest).length >= 8);
});

test("validateManifest reports structurally incomplete manifests", () => {
  const errors = validateManifest({
    schemaVersion: 2,
    productCases: [],
    candidates: [],
    processIncidents: [],
  });
  assert.ok(
    errors.some((error) =>
      error.startsWith("manifest validation could not complete:"),
    ),
  );
});


test("experiment output and environment hashes detect artifact drift", () => {
  const changed=structuredClone(baseManifest);
  changed.caseStudy.experiments.fixed7.artifacts[0].sha256="0".repeat(64);
  assert.ok(validateManifest(changed).some(error=>error.includes("experiment artifact hash mismatch")));
});


test("matched and continuous stored delivery totals are checked as well as mature totals", () => {
  for(const name of ["matched-2026","continuous-2024-09-01-to-cutoff"]) {
    const changed=structuredClone(baseManifest);
    changed.caseStudy.delivery.counts[name].publishedReleases += 1;
    assert.ok(validateManifest(changed).some(error=>error.includes(`delivery count mismatch for ${name}`)));
  }
});
