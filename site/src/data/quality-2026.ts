import evidence from "./quality-audit-evidence.json" with { type: "json" };

export type AuditCategory =
  | "Same-year regression"
  | "Defect in same-year feature"
  | "Pre-existing";
export type EvidencePrecision = "Exact origin" | "Confirmed affected by";
export type ReportKind = "issue" | "pull request";
export type CandidateDisposition =
  | "product-defect"
  | "excluded"
  | "deduplicated"
  | "process-incident";

export interface AuditCase {
  id: string;
  reportYear: 2025 | 2026;
  reportKind: ReportKind;
  issue: number;
  title: string;
  shortTitle: string;
  reporter: string;
  reportedOn: string;
  reportedAt: string;
  reportedVersion: string;
  area: "Generator" | "Runtime" | "Packaging";
  category: AuditCategory;
  confidence: "High" | "Medium" | "Low";
  chronologyConfidence: "High" | "Medium" | "Low";
  evidencePrecision: EvidencePrecision;
  fixPr: number;
  fixedRelease: string;
  fixedOn: string;
  responseDays: number;
  originCommit: string;
  originDate: string;
  firstAffectedRelease: string;
  firstAffectedPublishedAt: string;
  originSummary: string;
  failure: string;
  finding: string;
  historyEvidence: string;
  releaseEvidence: string;
  sources: string[];
  nuance?: string;
}

export interface AuditCandidate {
  id: string;
  year: 2025 | 2026;
  kind: ReportKind;
  number: number;
  title: string;
  author: string;
  openedAt: string;
  sourceUrl: string;
  disposition: CandidateDisposition;
  reason: string;
  linkedCandidateId?: string;
}

export interface ProcessIncident {
  id: string;
  issue: number;
  year: number;
  title: string;
  reporter: string;
  reportedOn: string;
  reportedAt: string;
  release: string;
  publishedAt: string;
  finding: string;
  sourceUrl: string;
  sources: string[];
}

export const auditEvidence = evidence;
export const auditCases = evidence.productCases.filter(
  (item) => item.reportYear === 2026,
) as AuditCase[];
export const baselineCases = evidence.productCases.filter(
  (item) => item.reportYear === 2025,
) as AuditCase[];
export const auditCasesInReportOrder = [...auditCases].sort(
  (left, right) => Date.parse(left.reportedAt) - Date.parse(right.reportedAt),
);
export const allProductCases = [
  ...auditCasesInReportOrder,
  ...[...baselineCases].sort(
    (left, right) => Date.parse(left.reportedAt) - Date.parse(right.reportedAt),
  ),
];
export const candidates = evidence.candidates as AuditCandidate[];
export const processIncidents = evidence.processIncidents as ProcessIncident[];
export const auditExceptions = processIncidents;
export const featureTimeline = evidence.featureTimeline;
export const totalCases = auditCases.length;
export const totalRecords = allProductCases.length + processIncidents.length;

const windowFor = (
  year: 2025 | 2026,
  kind: "primaryWindows" | "supplementalWindows" = "primaryWindows",
) => evidence.study[kind][String(year) as "2025" | "2026"];

const isWithin = (timestamp: string, start: string, endExclusive: string) => {
  const value = Date.parse(timestamp);
  return value >= Date.parse(start) && value < Date.parse(endExclusive);
};

export const candidateIsInPrimaryWindow = (candidate: AuditCandidate) => {
  const window = windowFor(candidate.year);
  return isWithin(candidate.openedAt, window.start, window.endExclusive);
};

export const caseIsInPrimaryWindow = (item: AuditCase) => {
  const window = windowFor(item.reportYear);
  return isWithin(item.reportedAt, window.start, window.endExclusive);
};

export const caseWasIntroducedInPrimaryWindow = (item: AuditCase) => {
  const window = windowFor(item.reportYear);
  return isWithin(
    item.firstAffectedPublishedAt,
    window.start,
    window.endExclusive,
  );
};

export const primaryCases = {
  2025: baselineCases.filter(caseIsInPrimaryWindow),
  2026: auditCases.filter(caseIsInPrimaryWindow),
} as const;

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

export const primaryComparisonSummary = ([2025, 2026] as const).map((year) => {
  const cases = primaryCases[year];
  const introduced = cases.filter(caseWasIntroducedInPrimaryWindow).length;
  const delivery = evidence.activity.primaryWindow;
  const nonDependencyMerges = delivery.nonDependencyMergedPullRequests[year];
  return {
    year,
    totalReports: cases.length,
    introduced,
    inherited: cases.length - introduced,
    medianResponseDays: median(cases.map((item) => item.responseDays)),
    nonDependencyMerges,
    releases: delivery.publishedReleases[year],
    introducedPer100Merges:
      nonDependencyMerges === 0
        ? 0
        : Number(((introduced / nonDependencyMerges) * 100).toFixed(2)),
  };
});

const categoryDefinitions: Array<{
  label: AuditCategory;
  tone: "neutral" | "feature" | "legacy";
}> = [
  { label: "Same-year regression", tone: "neutral" },
  { label: "Defect in same-year feature", tone: "feature" },
  { label: "Pre-existing", tone: "legacy" },
];

export const categoryCounts = categoryDefinitions.map(({ label, tone }) => {
  const count = auditCases.filter((item) => item.category === label).length;
  return {
    label,
    count,
    percent:
      totalCases === 0 ? 0 : Number(((count / totalCases) * 100).toFixed(1)),
    tone,
  };
});

const matureIds = new Set(
  evidence.productCases
    .filter((item) => {
      const end = Date.parse(
        evidence.study.supplementalWindows[
          String(item.reportYear) as "2025" | "2026"
        ].endExclusive,
      );
      return (
        end - Date.parse(item.firstAffectedPublishedAt) >=
        evidence.maturityDays * 24 * 60 * 60 * 1000
      );
    })
    .map((item) => item.id),
);

export const comparisonSummary = [
  { year: 2025 as const, cases: baselineCases },
  { year: 2026 as const, cases: auditCases },
].map(({ year, cases }) => ({
  year,
  total: cases.length,
  regressions: cases.filter((item) => item.category === "Same-year regression")
    .length,
  featureDefects: cases.filter(
    (item) => item.category === "Defect in same-year feature",
  ).length,
  preExisting: cases.filter((item) => item.category === "Pre-existing").length,
  matureTotal: cases.filter((item) => matureIds.has(item.id)).length,
}));

const snapshots = evidence.activity.snapshots;
const displaySignedChange = (value: number, unit = "") =>
  `${value >= 0 ? "+" : ""}${value}${unit}`;
type TestCountSnapshot = {
  testFiles: number;
  testDeclarations: number;
};
const cohortAddition = (
  label: string,
  start: TestCountSnapshot,
  end: TestCountSnapshot,
) => {
  const testFilesAdded = end.testFiles - start.testFiles;
  const declarationsAdded = end.testDeclarations - start.testDeclarations;
  return {
    label,
    testFilesStart: start.testFiles,
    testFilesEnd: end.testFiles,
    testFilesAdded,
    declarationsStart: start.testDeclarations,
    declarationsEnd: end.testDeclarations,
    declarationsAdded,
    displayTestFiles: `${start.testFiles} → ${end.testFiles}`,
    displayTestFilesAdded: displaySignedChange(testFilesAdded),
    displayDeclarations: `${start.testDeclarations} → ${end.testDeclarations}`,
    displayDeclarationsAdded: displaySignedChange(declarationsAdded),
  };
};
const comparison2022Snapshots = snapshots.comparison2022;
const comparison2023Snapshots = snapshots.comparison2023;
const comparison2024Snapshots = snapshots.comparison2024;
const comparison2025Snapshots = snapshots.comparison2025;
const historicCohorts = evidence.activity.historicCohorts;
const formatCoverage = (percent: number) => `${percent.toFixed(3)}%`;

type VerificationSnapshot = TestCountSnapshot & {
  lineCoveragePercent: number;
  coverageSource: string;
};

const verificationCohort = (
  year: number,
  start: TestCountSnapshot | undefined,
  end: VerificationSnapshot,
  note?: string,
) => ({
  year,
  testFiles: start
    ? `${start.testFiles} → ${end.testFiles}`
    : `Not available → ${end.testFiles}`,
  testDeclarations: start
    ? `${start.testDeclarations} → ${end.testDeclarations}`
    : `Not available → ${end.testDeclarations}`,
  lineCoveragePercent: end.lineCoveragePercent,
  coverageSource: end.coverageSource,
  note,
});

export const verificationCohorts = [
  verificationCohort(
    2022,
    undefined,
    {
      ...comparison2022Snapshots.end,
      lineCoveragePercent: historicCohorts["2022"].coverage.end.coveredPercent,
      coverageSource: historicCohorts["2022"].coverage.end.source,
    },
    comparison2022Snapshots.reason,
  ),
  verificationCohort(
    2023,
    comparison2023Snapshots.start,
    {
      ...comparison2023Snapshots.end,
      lineCoveragePercent: historicCohorts["2023"].coverage.end.coveredPercent,
      coverageSource: historicCohorts["2023"].coverage.end.source,
    },
  ),
  verificationCohort(
    2024,
    comparison2024Snapshots.start,
    {
      ...comparison2024Snapshots.end,
      lineCoveragePercent: historicCohorts["2024"].coverage.end.coveredPercent,
      coverageSource: historicCohorts["2024"].coverage.end.source,
    },
  ),
  verificationCohort(
    2025,
    comparison2025Snapshots.start,
    {
      ...comparison2025Snapshots.end,
      lineCoveragePercent: evidence.activity.supplementalFullWindow.coverage["2025"].percent,
      coverageSource: evidence.activity.supplementalFullWindow.coverage["2025"].source,
    },
  ),
  verificationCohort(
    2026,
    snapshots.preAdoption,
    {
      ...snapshots.endOfObservation,
      lineCoveragePercent: snapshots.endOfObservation.lineCoveragePercent,
      coverageSource: snapshots.endOfObservation.coverageSource,
    },
  ),
];

export const historicDeliveryAndCoverage = [2022, 2023, 2024].map((year) => {
  const cohort = historicCohorts[String(year) as "2022" | "2023" | "2024"];
  const coverage = cohort.coverage;
  if ("status" in coverage) {
    return {
      year,
      ...cohort,
      coverageDisplay: `Not available → ${formatCoverage(coverage.end.coveredPercent)}`,
      coverageChange: "Not estimable",
      coverageNote: coverage.reason,
    };
  }
  const change = Number(
    (coverage.end.coveredPercent - coverage.start.coveredPercent).toFixed(3),
  );
  return {
    year,
    ...cohort,
    coverageDisplay: `${formatCoverage(coverage.start.coveredPercent)} → ${formatCoverage(coverage.end.coveredPercent)}`,
    coverageChange: `${displaySignedChange(change)} percentage points`,
  };
});

const historicDefectCohorts = evidence.activity.historicDefectCohorts;

export const matchedWindowCohorts = [2022, 2023, 2024].map((year) => {
  const cohort = historicCohorts[String(year) as "2022" | "2023" | "2024"];
  const defects =
    historicDefectCohorts[String(year) as "2022" | "2023" | "2024"];
  return {
    year,
    totalReports: defects.qualifyingExternalProductDefects,
    introduced: defects.introducedWithinWindow,
    medianResponseDays: defects.medianResponseDays,
    allMergedPullRequests: cohort.mergedPullRequests,
    nonDependencyMerges: cohort.nonDependencyMergedPullRequests,
    releases: cohort.publishedReleases,
  };
}).concat(
  primaryComparisonSummary.map((cohort) => ({
    year: cohort.year,
    totalReports: cohort.totalReports,
    introduced: cohort.introduced,
    medianResponseDays: cohort.medianResponseDays,
    allMergedPullRequests:
      evidence.activity.primaryWindow.mergedPullRequests[
        String(cohort.year) as "2025" | "2026"
      ],
    nonDependencyMerges: cohort.nonDependencyMerges,
    releases: cohort.releases,
  })),
);

export const historicDefectSummaries = [2022, 2023, 2024].map((year) => {
  const cohort =
    historicDefectCohorts[String(year) as "2022" | "2023" | "2024"];
  return {
    year,
    ...cohort,
    responseDisplay:
      cohort.medianResponseDays === null
        ? "Not estimable"
        : `${cohort.medianResponseDays} days`,
    introducedDisplay:
      cohort.introducedReports.length === 0
        ? "None observed"
        : cohort.introducedReports.map((report) => `#${report.number}`).join(", "),
  };
});

const numberRange = (values: number[]) => ({
  minimum: Math.min(...values),
  maximum: Math.max(...values),
});
const displayNumber = (value: number, maximumFractionDigits = 2) =>
  value.toLocaleString("en-US", { maximumFractionDigits });
const displayDays = (value: number) => `${value} ${value === 1 ? "day" : "days"}`;
const displayRange = (values: number[], suffix = "") => {
  const range = numberRange(values);
  return `${displayNumber(range.minimum)}–${displayNumber(range.maximum)}${suffix}`;
};
const baselineRow = (
  label: string,
  years: string,
  historicalValues: number[],
  actual: number,
  suffix = "",
  note?: string,
) => {
  const benchmark = median(historicalValues);
  const difference = actual - benchmark;
  return {
    label,
    historicalBasis: `${years}; range ${displayRange(historicalValues, suffix)}`,
    benchmark,
    actual,
    difference,
    displayBenchmark: `${displayNumber(benchmark)}${suffix}`,
    displayActual: `${displayNumber(actual)}${suffix}`,
    displayDifference: `${difference >= 0 ? "+" : ""}${displayNumber(difference)}${suffix}`,
    note,
  };
};

const historicalDeliveryValues = [
  historicCohorts["2022"],
  historicCohorts["2023"],
  historicCohorts["2024"],
];
const testGrowthValues = [
  cohortAddition(
    "2023",
    comparison2023Snapshots.start,
    comparison2023Snapshots.end,
  ),
  cohortAddition(
    "2024",
    comparison2024Snapshots.start,
    comparison2024Snapshots.end,
  ),
  cohortAddition(
    "2025",
    comparison2025Snapshots.start,
    comparison2025Snapshots.end,
  ),
];
const historicalDefectValues = [
  historicDefectCohorts["2022"],
  historicDefectCohorts["2023"],
  historicDefectCohorts["2024"],
];
const comparison2025 = primaryComparisonSummary.find(
  (cohort) => cohort.year === 2025,
)!;
const actual2026 = primaryComparisonSummary.find(
  (cohort) => cohort.year === 2026,
)!;

const pooledHistoricalIntroductions =
  historicalDefectValues.reduce(
    (total, cohort) => total + cohort.introducedWithinWindow,
    0,
  ) + comparison2025.introduced;
const pooledHistoricalMerges =
  historicalDeliveryValues.reduce(
    (total, cohort) => total + cohort.nonDependencyMergedPullRequests,
    0,
  ) + comparison2025.nonDependencyMerges;
export const pooledHistoricalIntroducedRatePer100 =
  (pooledHistoricalIntroductions / pooledHistoricalMerges) * 100;
export const exposureScaledIntroducedBenchmark =
  (pooledHistoricalIntroductions / pooledHistoricalMerges) *
  actual2026.nonDependencyMerges;

export const retrospectiveBaselineRows = [
  baselineRow(
    "Non-dependency merged PRs",
    "2022–2025",
    [
      ...historicalDeliveryValues.map(
        (cohort) => cohort.nonDependencyMergedPullRequests,
      ),
      comparison2025.nonDependencyMerges,
    ],
    actual2026.nonDependencyMerges,
  ),
  baselineRow(
    "Published releases",
    "2022–2025",
    [
      ...historicalDeliveryValues.map((cohort) => cohort.publishedReleases),
      comparison2025.releases,
    ],
    evidence.activity.primaryWindow.publishedReleases["2026"],
  ),
  baselineRow(
    "Test files added",
    "2023–2025",
    testGrowthValues.map((cohort) => cohort.testFilesAdded),
    snapshots.endOfObservation.testFiles - snapshots.preAdoption.testFiles,
  ),
  baselineRow(
    "Test declarations added",
    "2023–2025",
    testGrowthValues.map((cohort) => cohort.declarationsAdded),
    snapshots.endOfObservation.testDeclarations -
      snapshots.preAdoption.testDeclarations,
  ),
  baselineRow(
    "Qualifying external product-defect reports",
    "2022–2025",
    [
      ...historicalDefectValues.map(
        (cohort) => cohort.qualifyingExternalProductDefects,
      ),
      comparison2025.totalReports,
    ],
    actual2026.totalReports,
  ),
  {
    ...baselineRow(
      "Median report-to-release time",
      "2023–2025 cohort medians",
      [
        historicDefectCohorts["2023"].medianResponseDays!,
        historicDefectCohorts["2024"].medianResponseDays!,
        comparison2025.medianResponseDays,
      ],
      actual2026.medianResponseDays,
      " days",
    ),
    displayActual: displayDays(actual2026.medianResponseDays),
  },
  {
    label: "Introduced qualifying reports, exposure-scaled",
    historicalBasis: `${pooledHistoricalIntroductions} reports / ${pooledHistoricalMerges} non-dependency PRs (${pooledHistoricalIntroducedRatePer100.toFixed(2)} per 100)`,
    benchmark: exposureScaledIntroducedBenchmark,
    actual: actual2026.introduced,
    difference: actual2026.introduced - exposureScaledIntroducedBenchmark,
    displayBenchmark: exposureScaledIntroducedBenchmark.toFixed(2),
    displayActual: String(actual2026.introduced),
    displayDifference: (actual2026.introduced - exposureScaledIntroducedBenchmark).toFixed(2),
    note: `Expected-value benchmark after scaling the pooled historical rate to ${actual2026.nonDependencyMerges} observed 2026 non-dependency PRs.`,
  },
];

const completeHistoricalCoverageChanges = ["2023", "2024"].map((year) => {
  const coverage = historicCohorts[year as "2023" | "2024"].coverage;
  return coverage.end.coveredPercent - coverage.start.coveredPercent;
});
const coverageReferenceMidpoint = median(completeHistoricalCoverageChanges);
const actualCoverageChange =
  snapshots.endOfObservation.lineCoveragePercent -
  snapshots.preAdoption.lineCoveragePercent;
export const coverageReference = {
  historicalYears: "2023–2024",
  midpoint: coverageReferenceMidpoint,
  actual: actualCoverageChange,
  difference: actualCoverageChange - coverageReferenceMidpoint,
  displayMidpoint: `${displaySignedChange(Number(coverageReferenceMidpoint.toFixed(3)))} percentage points`,
  displayRange: `${displayNumber(Math.min(...completeHistoricalCoverageChanges), 3)} to ${displayNumber(Math.max(...completeHistoricalCoverageChanges), 3)} percentage points`,
  displayActual: `${displaySignedChange(Number(actualCoverageChange.toFixed(3)))} percentage points`,
  displayDifference: `${displaySignedChange(Number((actualCoverageChange - coverageReferenceMidpoint).toFixed(3)))} percentage points`,
};

const cohortGitMetrics = evidence.activity.cohortGitMetrics.cohorts;
export const gitCohortMetrics = [2022, 2023, 2024, 2025, 2026].map((year) => ({
  year,
  ...cohortGitMetrics[String(year) as "2022" | "2023" | "2024" | "2025" | "2026"],
}));

const completePreAiGitCohorts = [
  cohortGitMetrics["2023"],
  cohortGitMetrics["2024"],
  cohortGitMetrics["2025"],
];
export const gitHistoricalBaselineRows = [
  baselineRow(
    "First-parent commits",
    "2023–2025",
    completePreAiGitCohorts.map((cohort) => cohort.firstParentCommits),
    cohortGitMetrics["2026"].firstParentCommits,
  ),
  baselineRow(
    "Total textual churn",
    "2023–2025",
    completePreAiGitCohorts.map((cohort) => cohort.churn),
    cohortGitMetrics["2026"].churn,
    " lines",
  ),
  baselineRow(
    "Test churn",
    "2023–2025",
    completePreAiGitCohorts.map((cohort) => cohort.categoryChurn.tests),
    cohortGitMetrics["2026"].categoryChurn.tests,
    " lines",
  ),
  baselineRow(
    "Docs/site churn",
    "2023–2025",
    completePreAiGitCohorts.map(
      (cohort) => cohort.categoryChurn.documentation,
    ),
    cohortGitMetrics["2026"].categoryChurn.documentation,
    " lines",
  ),
  baselineRow(
    "Lock/generated churn",
    "2023–2025",
    completePreAiGitCohorts.map(
      (cohort) => cohort.categoryChurn.lockOrGenerated,
    ),
    cohortGitMetrics["2026"].categoryChurn.lockOrGenerated,
    " lines",
  ),
  baselineRow(
    "Source/other churn",
    "2023–2025",
    completePreAiGitCohorts.map(
      (cohort) => cohort.categoryChurn.sourceOrOther,
    ),
    cohortGitMetrics["2026"].categoryChurn.sourceOrOther,
    " lines",
  ),
];

export const deliveryMetrics = [
  {
    label: "Non-dependency merged pull requests",
    before: String(
      evidence.activity.primaryWindow.nonDependencyMergedPullRequests["2025"],
    ),
    after: String(
      evidence.activity.primaryWindow.nonDependencyMergedPullRequests["2026"],
    ),
    note: "Exact matched March 10–September 3 windows.",
  },
  {
    label: "Published releases",
    before: String(evidence.activity.primaryWindow.publishedReleases["2025"]),
    after: String(evidence.activity.primaryWindow.publishedReleases["2026"]),
    note: "npm publication timestamps within the matched windows.",
  },
  {
    label: "Conventional test files",
    before: String(snapshots.preAdoption.testFiles),
    after: String(snapshots.endOfObservation.testFiles),
    note: "Immediately before adoption and at the end of observation.",
  },
  {
    label: "Explicit test declarations",
    before: String(snapshots.preAdoption.testDeclarations),
    after: String(snapshots.endOfObservation.testDeclarations),
    note: "JavaScript and TypeScript test declarations in conventional test files.",
  },
] as const;

export const categoryLabel = (category: AuditCategory, year: 2025 | 2026) => {
  if (category === "Same-year regression") return `${year} regression`;
  if (category === "Defect in same-year feature") {
    return `Defect in a ${year} feature`;
  }
  return `Pre-existing before ${year}`;
};

export const dispositionLabel = (disposition: CandidateDisposition) => {
  switch (disposition) {
    case "product-defect":
      return "Included product defect";
    case "excluded":
      return "Excluded";
    case "deduplicated":
      return "Deduplicated";
    case "process-incident":
      return "Process incident";
  }
};

export const formatDate = (timestamp: string) =>
  new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));

export const issueUrl = (issue: number) =>
  `https://github.com/counterfact/api-simulator/issues/${issue}`;
export const prUrl = (pr: number) =>
  `https://github.com/counterfact/api-simulator/pull/${pr}`;
export const commitUrl = (commit: string) =>
  `https://github.com/counterfact/api-simulator/commit/${commit}`;
export const releaseUrl = (version: string) =>
  `https://github.com/counterfact/api-simulator/releases/tag/v${version}`;
export const reportUrl = (item: AuditCase) =>
  item.reportKind === "pull request" ? prUrl(item.issue) : issueUrl(item.issue);
export const casePath = (item: AuditCase) =>
  item.reportYear === 2025
    ? `/quality/2026/cases/2025-${item.issue}`
    : `/quality/2026/cases/${item.reportKind === "pull request" ? "pr-" : ""}${item.issue}`;
