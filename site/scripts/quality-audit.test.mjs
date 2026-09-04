import assert from "node:assert/strict";
import test from "node:test";
import manifest from "../src/data/quality-audit-evidence.json" with { type: "json" };
import {
  isWithinWindow,
  median,
  matureCases,
  selectIntroducedCases,
  selectReportedCases,
  summarizeCases,
  validateManifest,
} from "./quality-audit-lib.mjs";

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

test("primary windows include the start and exclude the end", () => {
  const window = {
    start: "2026-03-10T16:38:20Z",
    endExclusive: "2026-09-04T00:00:00Z",
  };
  assert.equal(isWithinWindow("2026-03-10T16:38:20Z", window), true);
  assert.equal(isWithinWindow("2026-09-03T23:59:59Z", window), true);
  assert.equal(isWithinWindow("2026-09-04T00:00:00Z", window), false);
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
      introduced: selectIntroducedCases(
        manifest.productCases,
        year,
        window,
      ).length,
      medianResponseDays: median(cases.map((item) => item.responseDays)),
    };
  });
  assert.deepEqual(cohorts, [
    { year: 2025, reports: 3, introduced: 0, medianResponseDays: 6 },
    { year: 2026, reports: 7, introduced: 0, medianResponseDays: 1 },
  ]);
});

test("candidate ledger exposes every reviewed disposition", () => {
  assert.equal(manifest.candidates.length, 19);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(Object.groupBy(manifest.candidates, (item) => item.disposition))
        .map(([key, items]) => [key, items.length]),
    ),
    {
      "product-defect": 14,
      excluded: 3,
      deduplicated: 1,
      "process-incident": 1,
    },
  );
  assert.deepEqual(validateManifest(manifest), []);
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
          "2025": { dependencyBots: 0 },
          "2026": { dependencyBots: 1 },
        },
        mergedPullRequests: { "2025": 0, "2026": 2 },
      },
    },
  };
  assert.ok(validateManifest(manifest).length >= 8);
});
