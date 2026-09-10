import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveMature,
  deriveMonthly,
  derivePeriods,
  validateCaseStudy,
} from "./quality-case-study-lib.mjs";

const source = [{ url: "https://example.test/source" }];
const base = () => ({
  window: {
    start: "2024-09-01T00:00:00Z",
    endExclusive: "2026-09-04T00:00:00Z",
  },
  adoptionAt: "2026-03-10T16:38:20Z",
  defects: [
    {
      id: "carry",
      reportedAt: "2024-08-31T23:00:00Z",
      firstAffectedPublishedAt: "2024-08-01T00:00:00Z",
      firstAffectedPrecision: "exact",
      fixedPublishedAt: "2024-09-02T00:00:00Z",
      discoveryChannel: "external-human",
      releaseStatus: "released",
      disposition: "confirmed-defect",
      duplicateOf: null,
      sources: source,
    },
    {
      id: "pre",
      reportedAt: "2026-03-10T16:38:19Z",
      firstAffectedPublishedAt: null,
      firstAffectedPrecision: "unknown",
      fixedPublishedAt: null,
      discoveryChannel: "internal-human",
      releaseStatus: "pre-release",
      disposition: "confirmed-defect",
      duplicateOf: null,
      sources: source,
    },
    {
      id: "post",
      reportedAt: "2026-03-10T16:38:20Z",
      firstAffectedPublishedAt: "2026-03-01T00:00:00Z",
      firstAffectedPrecision: "bound",
      fixedPublishedAt: "2026-03-11T00:00:00Z",
      discoveryChannel: "automated-agent",
      releaseStatus: "released",
      disposition: "confirmed-defect",
      duplicateOf: null,
      sources: source,
    },
    {
      id: "unknown",
      reportedAt: "2026-09-03T23:00:00Z",
      firstAffectedPublishedAt: null,
      firstAffectedPrecision: "unknown",
      fixedPublishedAt: null,
      discoveryChannel: "unknown",
      releaseStatus: "unknown",
      disposition: "confirmed-defect",
      duplicateOf: null,
      sources: source,
    },
    {
      id: "dup",
      reportedAt: "2026-03-11T00:00:00Z",
      firstAffectedPublishedAt: null,
      firstAffectedPrecision: "unknown",
      fixedPublishedAt: null,
      discoveryChannel: "unknown",
      releaseStatus: "unknown",
      disposition: "deduplicated",
      duplicateOf: "post",
      sources: source,
    },
  ],
});

test("monthly keeps standalone PRs, carry-in, channels, pre-release, unknown release, unresolved gaps, and partial September separate", () => {
  const study = base();
  study.delivery = {
    pullRequests: [
      {
        id: "standalone-pr",
        mergedAt: "2026-03-11T00:00:00Z",
        disposition: "non-dependency",
      },
      {
        id: "dep-pr",
        mergedAt: "2026-03-11T00:00:00Z",
        disposition: "dependency",
      },
    ],
    releases: [{ id: "release", publishedAt: "2026-03-11T00:00:00Z" }],
  };
  study.candidates = [
    {
      id: "unresolved-gap",
      reportedAt: "2026-03-12T00:00:00Z",
      disposition: "unresolved",
    },
  ];
  const rows = deriveMonthly(study);
  assert.equal(rows[0].month, "2024-09");
  assert.deepEqual(rows[0].carryInKnownBacklogIds, ["carry"]);
  const march = rows.find((x) => x.month === "2026-03");
  assert.deepEqual(march.nonDependencyMergedPullRequestIds, ["standalone-pr"]);
  assert.deepEqual(march.publishedReleaseIds, ["release"]);
  assert.deepEqual(march.reportedPreReleaseIds, ["pre"]);
  assert.deepEqual(march.reportedReleasedIds, ["post"]);
  assert.equal(march.reportedReleasedByChannel["automated-agent"], 1);
  assert.deepEqual(march.unresolvedRecordIds, ["unresolved-gap"]);
  assert.equal(march.incomplete, true);
  const september = rows.at(-1);
  assert.equal(september.partial, true);
  assert.deepEqual(september.reportedUnknownReleaseIds, ["unknown"]);
  assert.equal(september.incomplete, true);
});
test("period split assigns exact adoption boundaries for records, delivery, and released discovery channels", () => {
  const study = base();
  study.delivery = {
    pullRequests: [
      { id: "pre-pr", mergedAt: "2026-03-10T16:38:19Z", disposition: "non-dependency" },
      { id: "post-pr", mergedAt: "2026-03-10T16:38:20Z", disposition: "non-dependency" },
    ],
    releases: [
      { id: "pre-release", publishedAt: "2026-03-10T16:38:19Z" },
      { id: "post-release", publishedAt: "2026-03-10T16:38:20Z" },
    ],
  };
  const periods = derivePeriods(study);
  assert.deepEqual(periods.preAdoption.eventIds, ["pre"]);
  assert.deepEqual(periods.postAdoption.eventIds, ["post", "unknown"]);
  assert.deepEqual(periods.preAdoption.nonDependencyMergedPullRequestIds, ["pre-pr"]);
  assert.deepEqual(periods.postAdoption.nonDependencyMergedPullRequestIds, ["post-pr"]);
  assert.deepEqual(periods.preAdoption.publishedReleaseIds, ["pre-release"]);
  assert.deepEqual(periods.postAdoption.publishedReleaseIds, ["post-release"]);
  assert.equal(periods.preAdoption.releasedByChannel["automated-agent"], 0);
  assert.equal(periods.postAdoption.releasedByChannel["automated-agent"], 1);
});
test("monthly corrections and backlog retain pre-release reports after a public affected release", () => {
  const study = base();
  study.defects.push({
    id: "escaped-pre-release",
    reportedAt: "2025-01-10T00:00:00Z",
    firstAffectedPublishedAt: "2025-02-01T00:00:00Z",
    firstAffectedPrecision: "exact",
    fixedPublishedAt: "2025-03-10T00:00:00Z",
    discoveryChannel: "internal-human",
    releaseStatus: "pre-release",
    disposition: "confirmed-defect",
    duplicateOf: null,
    sources: source,
  });
  const rows = deriveMonthly(study);
  assert.deepEqual(
    rows.find((row) => row.month === "2025-02").carryInKnownBacklogIds,
    ["escaped-pre-release"],
  );
  const march = rows.find((row) => row.month === "2025-03");
  assert.deepEqual(march.correctedFirstPublishedIds, ["escaped-pre-release"]);
  assert.deepEqual(march.reportedReleasedIds, []);
});
test("mature uses individual 90-day limits including day zero, day ninety, late repairs, and unknown origin", () => {
  const records = [
    {
      id: "zero",
      reportedAt: "2025-06-01T00:00:00Z",
      firstAffectedPublishedAt: "2025-01-01T00:00:00Z",
      firstAffectedPrecision: "exact",
      fixedPublishedAt: "2025-06-01T00:00:00Z",
    },
    {
      id: "ninety",
      reportedAt: "2025-06-01T00:00:00Z",
      firstAffectedPublishedAt: "2025-01-01T00:00:00Z",
      firstAffectedPrecision: "exact",
      fixedPublishedAt: "2025-08-30T00:00:00Z",
    },
    {
      id: "late",
      reportedAt: "2025-06-01T00:00:00Z",
      firstAffectedPublishedAt: "2025-01-01T00:00:00Z",
      firstAffectedPrecision: "exact",
      fixedPublishedAt: "2025-08-31T00:00:00Z",
    },
    {
      id: "unknown-origin",
      reportedAt: "2025-06-02T00:00:00Z",
      firstAffectedPublishedAt: null,
      firstAffectedPrecision: "unknown",
      fixedPublishedAt: null,
    },
  ];
  const result = deriveMature(
    records,
    {
      releases: [{ id: "r", publishedAt: "2025-02-01T00:00:00Z" }],
      pullRequests: [
        {
          id: "p",
          mergedAt: "2025-02-01T00:00:00Z",
          disposition: "non-dependency",
        },
      ],
    },
    {
      "mature-intake-2025": {
        start: "2025-01-01T00:00:00Z",
        endExclusive: "2025-06-06T00:00:00Z",
      },
    },
  )["mature-intake-2025"];
  assert.equal(result.counters.correctedWithinFollowup, 2);
  assert.equal(result.counters.deliveryReleaseCount, 1);
  assert.equal(
    result.responseObservations.find((x) => x.id === "zero").elapsedDays,
    0,
  );
  assert.equal(
    result.responseObservations.find((x) => x.id === "ninety").elapsedDays,
    90,
  );
  assert.equal(
    result.responseObservations.find((x) => x.id === "late").status,
    "corrected-after-followup",
  );
  assert.deepEqual(result.unresolvedIds, ["unknown-origin"]);
  assert.equal(result.incomplete, true);
});
test("mature event cohort enforces report delay after release and before administrative censoring", () => {
  const rows = [
    {
      id: "included",
      reportedAt: "2025-07-01T00:00:00Z",
      firstAffectedPublishedAt: "2025-05-01T00:00:00Z",
      firstAffectedPrecision: "exact",
    },
    {
      id: "late-report",
      reportedAt: "2025-08-01T00:00:00Z",
      firstAffectedPublishedAt: "2025-05-01T00:00:00Z",
      firstAffectedPrecision: "exact",
    },
    {
      id: "early-report",
      reportedAt: "2025-04-30T00:00:00Z",
      firstAffectedPublishedAt: "2025-05-01T00:00:00Z",
      firstAffectedPrecision: "exact",
    },
    {
      id: "bound",
      reportedAt: "2025-07-01T00:00:00Z",
      firstAffectedPublishedAt: "2025-05-01T00:00:00Z",
      firstAffectedPrecision: "bound",
    },
  ];
  const mature = deriveMature(
    rows,
    {},
    {
      "mature-intake-2025": {
        start: "2025-03-10T00:00:00Z",
        endExclusive: "2025-06-06T00:00:00Z",
      },
    },
  )["mature-intake-2025"];
  assert.deepEqual(mature.eventIds, ["included"]);
  assert.deepEqual(mature.unresolvedIds, ["bound"]);
});
test("mature origin uncertainty is scoped to the relevant release and administrative span", () => {
  const rows = [
    {
      id: "old-bound",
      reportedAt: "2024-04-01T00:00:00Z",
      firstAffectedPublishedAt: "2023-01-01T00:00:00Z",
      firstAffectedPrecision: "bound",
    },
    {
      id: "inside-bound",
      reportedAt: "2025-04-01T00:00:00Z",
      firstAffectedPublishedAt: "2025-04-01T00:00:00Z",
      firstAffectedPrecision: "bound",
    },
    {
      id: "unknown-inside",
      reportedAt: "2025-06-05T23:59:59Z",
      firstAffectedPublishedAt: null,
      firstAffectedPrecision: "unknown",
    },
    {
      id: "after-admin",
      reportedAt: "2025-09-04T00:00:00Z",
      firstAffectedPublishedAt: null,
      firstAffectedPrecision: "unknown",
    },
  ];
  const mature = deriveMature(
    rows,
    {},
    {
      "mature-intake-2025": {
        start: "2025-03-10T00:00:00Z",
        endExclusive: "2025-06-06T00:00:00Z",
      },
    },
  )["mature-intake-2025"];
  assert.deepEqual(mature.unresolvedIds, ["inside-bound", "unknown-inside"]);
});
test("mature response censoring respects both the report deadline and an earlier administrative limit", () => {
  const rows = [
    {
      id: "deadline",
      reportedAt: "2025-03-10T00:00:00Z",
      firstAffectedPublishedAt: "2025-03-10T00:00:00Z",
      firstAffectedPrecision: "exact",
      fixedPublishedAt: null,
    },
    {
      id: "admin",
      reportedAt: "2025-05-30T00:00:00Z",
      firstAffectedPublishedAt: "2025-05-30T00:00:00Z",
      firstAffectedPrecision: "exact",
      fixedPublishedAt: "2025-06-21T00:00:00Z",
    },
  ];
  const mature = deriveMature(
    rows,
    {},
    {
      "mature-intake-2025": {
        start: "2025-03-10T00:00:00Z",
        endExclusive: "2025-06-06T00:00:00Z",
        administrativeCensorAt: "2025-06-20T00:00:00Z",
      },
    },
  )["mature-intake-2025"];
  const deadline = mature.responseObservations.find(
    (record) => record.id === "deadline",
  );
  const admin = mature.responseObservations.find(
    (record) => record.id === "admin",
  );
  assert.equal(deadline.elapsedDays, 90);
  assert.equal(deadline.status, "censored-unresolved");
  assert.equal(admin.elapsedDays, 21);
  assert.equal(admin.status, "corrected-after-followup");
  assert.equal(Number.isFinite(admin.elapsedDays), true);
});
test("validation catches missing sources, stored mismatch, and fixed-seven replacement", () => {
  const study = base();
  study.monthly = [];
  study.defects[0].sources = [];
  study.delivery = { pullRequests: [], releases: [] };
  study.experiments = { fixed7: { results: [{ id: "1617" }, { id: "1618" }] } };
  const result = validateCaseStudy(study);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /missing source: carry/);
  assert.match(result.errors.join("\n"), /stored monthly/);
  assert.match(result.errors.join("\n"), /fixed7/);
});
test("monthly clips post-window records even in the same September month", () => {
  const study = base();
  study.defects.push({
    id: "late",
    reportedAt: "2026-09-04T00:00:00.500Z",
    firstAffectedPublishedAt: null,
    firstAffectedPrecision: "unknown",
    fixedPublishedAt: null,
    discoveryChannel: "unknown",
    releaseStatus: "unknown",
    disposition: "confirmed-defect",
    duplicateOf: null,
    sources: source,
  });
  assert.deepEqual(deriveMonthly(study).at(-1).reportedUnknownReleaseIds, [
    "unknown",
  ]);
});
test("validation returns diagnostics for malformed windows and duplicate cycles without throwing", () => {
  const study = base();
  study.window = { start: "bad", endExclusive: "also-bad" };
  study.defects[0].duplicateOf = "carry";
  const result = validateCaseStudy(study);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /invalid required study window/);
  assert.match(result.errors.join("\n"), /duplicate self link/);
});


test("date-only and missing report chronology never invent midnight or exact follow-up", () => {
  const study=base();
  study.defects=[{...study.defects[2],id:"date-only",reportedAt:"2026-03-10"},{...study.defects[2],id:"missing-report",reportedAt:null}];
  const periods=derivePeriods(study);
  assert.deepEqual(periods.preAdoption.releasedIds,[]);
  assert.deepEqual(periods.postAdoption.releasedIds,[]);
  assert.equal(periods.postAdoption.chronologyDiagnostics.length,2);
  const march=deriveMonthly(study).find(r=>r.month==="2026-03");
  assert.equal(march.reportedReleasedIds.length,0);
  assert.equal(march.incomplete,true);
  assert.equal(march.chronologyDiagnostics.length,2);
  assert.deepEqual(march.carryInKnownBacklogIds,[]);
  const mature=deriveMature(study.defects,{releases:[],pullRequests:[]},{"mature-intake-2026":{start:"2026-03-10T16:38:20Z",endExclusive:"2026-06-06T00:00:00Z"}})["mature-intake-2026"];
  assert.equal(mature.responseObservations.length,0);
  assert.equal(mature.incomplete,true);
});


test("unresolved ledger requires distinct identities, source links, and reasons", () => {
  const study=base();
  study.unresolvedRecords=[{id:"commit-a",reportedAt:null,reason:"unknown discovery",sources:["https://example.test/commit/a"]},{id:"commit-a",reportedAt:null,sources:[]}];
  const result=validateCaseStudy(study);
  assert.ok(result.errors.some(e=>e.includes("duplicate or missing unresolved record id")));
  assert.ok(result.errors.some(e=>e.includes("missing source: commit-a")));
  assert.ok(result.errors.some(e=>e.includes("missing unresolved reason: commit-a")));
});
