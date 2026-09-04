import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  matureCases,
  summarizeCases,
  validateManifest,
} from "./quality-audit-lib.mjs";

const manifestPath = fileURLToPath(
  new URL("../src/data/quality-audit-evidence.json", import.meta.url),
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const errors = validateManifest(manifest);

for (const year of [2025, 2026]) {
  const cases = manifest.productCases.filter((item) => item.year === year);
  const summary = summarizeCases(cases, year);
  const matureSummary = summarizeCases(
    matureCases(
      cases,
      manifest.windows[String(year)].endExclusive,
      manifest.maturityDays,
    ),
    year,
  );
  console.log(
    `${year}: ${summary.total} product defects (${summary.counts["Same-year regression"]} regressions, ${summary.counts["Defect in same-year feature"]} feature defects, ${summary.counts["Pre-existing"]} pre-existing); 90-day sensitivity: ${matureSummary.total}`,
  );
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Audit evidence manifest is internally consistent.");
}
