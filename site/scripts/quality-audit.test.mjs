import assert from "node:assert/strict";
import test from "node:test";
import {
  matureCases,
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

test("validateManifest catches duplicate cases and count drift", () => {
  const manifest = {
    productCases: [
      {
        id: "issue-1",
        year: 2026,
        category: "Pre-existing",
        firstAffectedPublishedAt: "2020-01-01T00:00:00Z",
      },
      {
        id: "issue-1",
        year: 2026,
        category: "Pre-existing",
        firstAffectedPublishedAt: "2020-01-01T00:00:00Z",
      },
    ],
    candidates: [],
    sourceIndex: {},
    activity: {
      pullRequestAuthors2026: { dependencyBots: 1 },
      mergedPullRequests: { 2026: 2 },
    },
  };
  assert.equal(validateManifest(manifest).length, 5);
});
