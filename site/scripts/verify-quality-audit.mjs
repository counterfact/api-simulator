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
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const errors = validateManifest(manifest);

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
    `${year} primary window: ${primaryCases.length} external product reports; ${introduced.length} first affected releases entered during the window (${introduced.length === 0 ? "0" : ((introduced.length / nonDependencyMerges) * 100).toFixed(2)} per 100 non-dependency merges); median report-to-release time: ${responseMedian} ${responseMedian === 1 ? "day" : "days"}.`,
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
    `${year}: ${summary.total} product defects (${summary.counts["Same-year regression"]} regressions, ${summary.counts["Defect in same-year feature"]} feature defects, ${summary.counts["Pre-existing"]} pre-existing); 90-day sensitivity: ${matureSummary.total}`,
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

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Audit evidence manifest is internally consistent.");
}
