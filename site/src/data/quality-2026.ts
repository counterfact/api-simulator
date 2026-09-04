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
export const testingMetrics = [
  {
    label: "Conventional test files",
    before: snapshots.preAdoption.testFiles,
    after: snapshots.endOfObservation.testFiles,
    displayBefore: String(snapshots.preAdoption.testFiles),
    displayAfter: String(snapshots.endOfObservation.testFiles),
  },
  {
    label: "Explicit test declarations",
    before: snapshots.preAdoption.testDeclarations,
    after: snapshots.endOfObservation.testDeclarations,
    displayBefore: String(snapshots.preAdoption.testDeclarations),
    displayAfter: String(snapshots.endOfObservation.testDeclarations),
  },
  {
    label: "Reported line coverage",
    before: snapshots.preAdoption.lineCoveragePercent,
    after: snapshots.endOfObservation.lineCoveragePercent,
    displayBefore: `${snapshots.preAdoption.lineCoveragePercent}%`,
    displayAfter: `${snapshots.endOfObservation.lineCoveragePercent}%`,
  },
] as const;

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
