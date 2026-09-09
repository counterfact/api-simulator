import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  median,
  matureCases,
  selectIntroducedCases,
  selectReportedCases,
  summarizeCases,
  validateManifest,
} from "./quality-audit-lib.mjs";

const manifestPath = fileURLToPath(
  new URL("../src/data/quality-audit-evidence.json", import.meta.url),
);
const historicalCandidatesPath = fileURLToPath(
  new URL("../src/data/quality-historical-candidates.json", import.meta.url),
);
const manifest = {
  ...JSON.parse(await readFile(manifestPath, "utf8")),
  historicalCandidates: JSON.parse(
    await readFile(historicalCandidatesPath, "utf8"),
  ).records,
};
const errors = validateManifest(manifest);

function printDiagnostics(manifest) {
  for (const [year, cohort] of Object.entries(manifest.matureAnalysis.cohorts)) {
    console.log(
      `${year} mature cohort: ${cohort.events} event(s), ${cohort.publishedReleases} release(s), ${cohort.nonDependencyMergedPullRequests} non-dependency merge(s), ${cohort.responseObservations.length} response observation(s).`,
    );
  }
  for (const year of [2025, 2026]) {
    const primaryWindow = manifest.study.primaryWindows[String(year)];
    const primaryCases = selectReportedCases(
      manifest.productCases,
      year,
      primaryWindow,
    );
    const introduced = selectIntroducedCases(
      manifest.productCases,
      year,
      primaryWindow,
    );
    const responseMedian = median(primaryCases.map((item) => item.responseDays));
    const nonDependencyMerges =
      manifest.activity.primaryWindow.nonDependencyMergedPullRequests[String(year)];
    console.log(
      `${year} primary window: ${primaryCases.length} external product reports; ${introduced.length} cases had both the first affected release and report inside the window (${introduced.length === 0 ? "0" : ((introduced.length / nonDependencyMerges) * 100).toFixed(2)} per 100 non-dependency merges); median report-to-release time: ${responseMedian} ${responseMedian === 1 ? "day" : "days"}.`,
    );

    const cases = manifest.productCases.filter(
      (item) => item.reportYear === year,
    );
    const summary = summarizeCases(cases, year);
    const matureSummary = summarizeCases(
      matureCases(
        cases,
        manifest.study.supplementalWindows[String(year)].endExclusive,
        manifest.maturityDays,
      ),
      year,
    );
    console.log(
      `${year}: ${summary.total} product defects (${summary.counts["Same-year regression"]} regressions, ${summary.counts["Defect in same-year feature"]} feature defects, ${summary.counts["Pre-existing"]} pre-existing); observed cases at least 90 days old: ${matureSummary.total}`,
    );
  }

  const dispositionCounts = Object.groupBy(
    manifest.candidates,
    (item) => item.disposition,
  );
  console.log(
    `Candidate ledger: ${manifest.candidates.length} records (${Object.entries(
      dispositionCounts,
    )
      .map(([disposition, items]) => `${items.length} ${disposition}`)
      .join(", ")}).`,
  );

  const historicalCohorts = manifest.activity.historicCohorts;
  const historicalDefects = manifest.activity.historicDefectCohorts;
  const pooledHistoricalMerges =
    historicalCohorts["2022"].nonDependencyMergedPullRequests +
    historicalCohorts["2023"].nonDependencyMergedPullRequests +
    historicalCohorts["2024"].nonDependencyMergedPullRequests +
    manifest.activity.primaryWindow.nonDependencyMergedPullRequests["2025"];
  const pooledHistoricalIntroductions =
    historicalDefects["2022"].introducedWithinWindow +
    historicalDefects["2023"].introducedWithinWindow +
    historicalDefects["2024"].introducedWithinWindow +
    selectIntroducedCases(
      manifest.productCases,
      2025,
      manifest.study.primaryWindows["2025"],
    ).length;
  const exposureScaledBenchmark =
    (pooledHistoricalIntroductions / pooledHistoricalMerges) *
    manifest.activity.primaryWindow.nonDependencyMergedPullRequests["2026"];
  console.log(
    `Retrospective defect benchmark: ${pooledHistoricalIntroductions}/${pooledHistoricalMerges} pre-AI introductions per non-dependency PR; ${exposureScaledBenchmark.toFixed(2)} after scaling to the 2026 exposure.`,
  );

  const gitCohorts = manifest.activity.cohortGitMetrics.cohorts;
  console.log(
    `2026 Git activity: ${gitCohorts["2026"].firstParentCommits} first-parent commits; ${gitCohorts["2026"].additions.toLocaleString()} additions; ${gitCohorts["2026"].deletions.toLocaleString()} deletions; ${gitCohorts["2026"].churn.toLocaleString()} lines of churn.`,
  );
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  printDiagnostics(manifest);
  console.log("Audit evidence manifest is internally consistent.");
}
