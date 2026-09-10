import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const DAY = 86_400_000;
const channels = [
  "external-human",
  "internal-human",
  "automated-agent",
  "unknown",
];
const defectDispositions = [
  "confirmed-defect",
  "process-incident",
  "unresolved",
  "deduplicated",
];
const releaseStatuses = ["released", "pre-release", "unknown"];
const deliveryDispositions = ["dependency", "non-dependency"];
const experimentOutcomes = [
  "demonstrated_detection",
  "did_not_distinguish",
  "inconclusive_environment",
];
const timestamp = (value) =>
  typeof value === "string" && value.includes("T") && !Number.isNaN(Date.parse(value))
    ? Date.parse(value)
    : null;
const dateOnly = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
export function chronologyDiagnostics(records) {
  return records.flatMap(record => ["reportedAt", "firstAffectedPublishedAt", "fixedPublishedAt"].flatMap(field =>
    dateOnly(record[field]) || (field === "reportedAt" && record[field] == null)
      ? [{id:record.id, field, value:record[field] ?? null, reason: "Exact chronology unresolved; excluded from calculations requiring an instant."}] : []));
}
const requireRecordDate = (errors, value, label) => {
  if (value != null && timestamp(value) === null && !dateOnly(value)) errors.push(`invalid ${label}`);
};
const range = (value, start, end) => {
  const point = timestamp(value);
  const first = timestamp(start);
  const last = timestamp(end);
  return (
    point !== null &&
    first !== null &&
    last !== null &&
    point >= first &&
    point < last
  );
};
const confirmed = (record) =>
  record.disposition === "confirmed-defect" && !record.duplicateOf;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const unique = (values) => [...new Set(values)];
const counter = () =>
  Object.fromEntries(channels.map((channel) => [channel, 0]));
const months = (start, end) => {
  const result = [];
  const endAt = timestamp(end);
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  while (cursor.getTime() < endAt) {
    const next = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1);
    result.push({
      month: cursor.toISOString().slice(0, 7),
      start: cursor.toISOString(),
      endExclusive: new Date(Math.min(next, endAt)).toISOString(),
      partial: next > endAt,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
};
const unresolvedCandidates = (caseStudy) =>
  unique([
    ...(caseStudy.unresolvedRecords ?? []),
    ...(caseStudy.candidates ?? []).filter(
      (record) => record.disposition === "unresolved",
    ),
  ]);
const publiclyAffectedBy = (record, at) => {
  if (record.releaseStatus === "released") return true;
  const affected = timestamp(record.firstAffectedPublishedAt);
  const fixed = timestamp(record.fixedPublishedAt);
  return (
    record.releaseStatus === "pre-release" &&
    affected !== null &&
    affected <= at &&
    (fixed === null || affected < fixed)
  );
};

export function deriveMonthly(caseStudy) {
  const { start, endExclusive } = caseStudy.window;
  const pullRequests = caseStudy.delivery?.pullRequests ?? [];
  const releases = caseStudy.delivery?.releases ?? [];
  const defects = (caseStudy.defects ?? []).filter(confirmed);
  const unresolved = unresolvedCandidates(caseStudy);
  return months(start, endExclusive).map((row) => {
    const reported = defects.filter((record) =>
      range(record.reportedAt, row.start, row.endExclusive),
    );
    const released = reported.filter(
      (record) => record.releaseStatus === "released",
    );
    const preRelease = reported.filter(
      (record) => record.releaseStatus === "pre-release",
    );
    const unknown = reported.filter(
      (record) => record.releaseStatus === "unknown",
    );
    const corrected = defects.filter(
      (record) =>
        range(record.fixedPublishedAt, row.start, row.endExclusive) &&
        publiclyAffectedBy(record, timestamp(record.fixedPublishedAt)),
    );
    const backlog = defects.filter(
      (record) =>
        timestamp(record.reportedAt) !== null &&
        timestamp(record.reportedAt) < timestamp(row.start) &&
        publiclyAffectedBy(record, timestamp(row.start)) &&
        (!record.fixedPublishedAt ||
          timestamp(record.fixedPublishedAt) >= timestamp(row.start)),
    );
    const unresolvedRecordIds = unresolved
      .filter((record) =>
        range(
          record.reportedAt ?? record.createdAt,
          row.start,
          row.endExclusive,
        ),
      )
      .map((record) => record.id);
    const reportedReleasedByChannel = counter();
    for (const record of released)
      reportedReleasedByChannel[record.discoveryChannel] += 1;
    return {
      month: row.month,
      partial: row.partial,
      nonDependencyMergedPullRequestIds: pullRequests
        .filter(
          (record) =>
            record.disposition === "non-dependency" &&
            range(record.mergedAt, row.start, row.endExclusive),
        )
        .map((record) => record.id),
      publishedReleaseIds: releases
        .filter((record) =>
          range(record.publishedAt, row.start, row.endExclusive),
        )
        .map((record) => record.id),
      reportedReleasedIds: released.map((record) => record.id),
      reportedPreReleaseIds: preRelease.map((record) => record.id),
      reportedUnknownReleaseIds: unknown.map((record) => record.id),
      reportedReleasedByChannel,
      correctedFirstPublishedIds: corrected.map((record) => record.id),
      carryInKnownBacklogIds: backlog.map((record) => record.id),
      unresolvedRecordIds,
      unplacedUnresolvedIds: unresolved.filter(r=>timestamp(r.reportedAt ?? r.createdAt) === null).map(r=>r.id),
      chronologyDiagnostics: chronologyDiagnostics(defects).filter(d => d.value === null || d.value.startsWith(row.month)),
      incomplete: unresolved.some(r=>timestamp(r.reportedAt ?? r.createdAt) === null) || chronologyDiagnostics(defects).some(d => d.value === null || d.value.startsWith(row.month)) || unknown.length > 0 || unresolvedRecordIds.length > 0,
    };
  });
}

export function derivePeriods(caseStudy) {
  const records = (caseStudy.defects ?? []).filter(confirmed);
  const pullRequests = caseStudy.delivery?.pullRequests ?? [];
  const releases = caseStudy.delivery?.releases ?? [];
  const derive = (id, start, endExclusive) => {
    const selected = records.filter((record) =>
      range(record.reportedAt, start, endExclusive),
    );
    return {
      id,
      start,
      endExclusive,
      eventIds: selected.map((record) => record.id),
      releasedIds: selected
        .filter((record) => record.releaseStatus === "released")
        .map((record) => record.id),
      preReleaseIds: selected
        .filter((record) => record.releaseStatus === "pre-release")
        .map((record) => record.id),
      unknownReleaseIds: selected
        .filter((record) => record.releaseStatus === "unknown")
        .map((record) => record.id),
      releasedByChannel: Object.fromEntries(
        channels.map((channel) => [
          channel,
          selected.filter(
            (record) =>
              record.releaseStatus === "released" &&
              record.discoveryChannel === channel,
          ).length,
        ]),
      ),
      nonDependencyMergedPullRequestIds: pullRequests
        .filter(
          (record) =>
            record.disposition === "non-dependency" &&
            range(record.mergedAt, start, endExclusive),
        )
        .map((record) => record.id),
      publishedReleaseIds: releases
        .filter((record) => range(record.publishedAt, start, endExclusive))
        .map((record) => record.id),
      chronologyDiagnostics: chronologyDiagnostics(records),
      incomplete: chronologyDiagnostics(records).length > 0 || selected.some((record) => record.releaseStatus === "unknown"),
    };
  };
  return {
    preAdoption: derive(
      "pre-adoption",
      caseStudy.window.start,
      caseStudy.adoptionAt,
    ),
    postAdoption: derive(
      "post-adoption",
      caseStudy.adoptionAt,
      caseStudy.window.endExclusive,
    ),
  };
}

const administrativeCensorAt = (name, window) =>
  window.administrativeCensorAt ?? `${name.slice(-4)}-09-04T00:00:00Z`;
const needsOriginResolution = (record, window, administrativeAt) => {
  const reported = timestamp(record.reportedAt);
  if (
    reported === null ||
    reported < timestamp(window.start) ||
    reported >= administrativeAt ||
    record.originStatus === "pre-window-supported"
  )
    return false;
  if (
    record.firstAffectedPrecision === "exact" &&
    timestamp(record.firstAffectedPublishedAt) !== null
  )
    return false;
  return !(
    record.firstAffectedPrecision === "bound" &&
    timestamp(record.firstAffectedPublishedAt) !== null &&
    timestamp(record.firstAffectedPublishedAt) < timestamp(window.start)
  );
};

export function deriveMature(records, delivery, windows) {
  const output = {};
  const selectedWindows = Object.entries(
    windows ?? delivery?.windows ?? {},
  ).filter(([name]) => name.startsWith("mature-intake-"));
  for (const [name, window] of selectedWindows) {
    const admin = administrativeCensorAt(name, window);
    const administrativeAt = timestamp(admin);
    const event = records.filter((record) => {
      const affected = timestamp(record.firstAffectedPublishedAt);
      const reported = timestamp(record.reportedAt);
      return (
        record.originStatus !== "pre-window-supported" &&
        record.firstAffectedPrecision === "exact" &&
        affected !== null &&
        reported !== null &&
        range(
          record.firstAffectedPublishedAt,
          window.start,
          window.endExclusive,
        ) &&
        reported >= affected &&
        reported <= affected + 90 * DAY &&
        reported < administrativeAt
      );
    });
    const response = records.filter((record) =>
      range(record.reportedAt, window.start, window.endExclusive),
    );
    const responseObservations = response.map((record) => {
      const reportAt = timestamp(record.reportedAt);
      const deadlineAt = reportAt + 90 * DAY;
      const censorAt = Math.min(deadlineAt, administrativeAt);
      const fixedAt = timestamp(record.fixedPublishedAt);
      const repaired = fixedAt !== null && fixedAt <= censorAt;
      const observedUntil = repaired ? fixedAt : censorAt;
      return {
        id: record.id,
        reportAt: record.reportedAt,
        deadline: new Date(deadlineAt).toISOString(),
        administrativeCensorAt: admin,
        observedUntil: new Date(observedUntil).toISOString(),
        status: repaired
          ? "corrected-within-followup"
          : fixedAt !== null
            ? "corrected-after-followup"
            : "censored-unresolved",
        elapsedDays: (observedUntil - reportAt) / DAY,
      };
    });
    const unresolvedIds = records
      .filter((record) =>
        needsOriginResolution(record, window, administrativeAt),
      )
      .map((record) => record.id);
    output[name] = {
      eventIds: event.map((record) => record.id),
      responseIds: response.map((record) => record.id),
      unresolvedIds,
      chronologyDiagnostics: chronologyDiagnostics(records).filter(d => d.value === null || d.value.startsWith(name.slice(-4))),
      incomplete: unresolvedIds.length > 0 || chronologyDiagnostics(records).some(d => d.value === null || d.value.startsWith(name.slice(-4))),
      responseObservations,
      counters: {
        eventRecords: event.length,
        responseRecords: response.length,
        deliveryReleaseCount: (delivery?.releases ?? []).filter((record) =>
          range(record.publishedAt, window.start, window.endExclusive),
        ).length,
        deliveryNonDependencyPullRequestCount: (
          delivery?.pullRequests ?? []
        ).filter(
          (record) =>
            record.disposition === "non-dependency" &&
            range(record.mergedAt, window.start, window.endExclusive),
        ).length,
        correctedWithinFollowup: responseObservations.filter(
          (record) => record.status === "corrected-within-followup",
        ).length,
        censored: responseObservations.filter(
          (record) => record.status !== "corrected-within-followup",
        ).length,
      },
    };
  }
  return output;
}

const requireTimestamp = (errors, value, label) => {
  if (timestamp(value) === null) errors.push(`invalid ${label}`);
};
const requireSources = (errors, sources, label) => {
  if (
    !Array.isArray(sources) ||
    sources.length === 0 ||
    sources.some((source) => typeof source !== "string" || source.length === 0)
  )
    errors.push(`missing source: ${label}`);
};
const validateUniqueRecords = (errors, records, label) => {
  if (!Array.isArray(records)) {
    errors.push(`missing ${label}`);
    return;
  }
  const ids = new Set();
  for (const record of records) {
    if (
      typeof record.id !== "string" ||
      record.id.length === 0 ||
      ids.has(record.id)
    )
      errors.push(
        `duplicate or missing ${label} id: ${record.id ?? "<missing>"}`,
      );
    ids.add(record.id);
  }
};
function validateDelivery(caseStudy, errors) {
  const delivery = caseStudy.delivery;
  if (
    !delivery ||
    !Array.isArray(delivery.pullRequests) ||
    !Array.isArray(delivery.releases)
  ) {
    errors.push(
      "missing denominator provenance: delivery pullRequests and releases required",
    );
    return;
  }
  requireTimestamp(errors, delivery.generatedAt, "delivery generatedAt");
  requireTimestamp(
    errors,
    delivery.cutoff?.endExclusive,
    "delivery cutoff endExclusive",
  );
  validateUniqueRecords(errors, delivery.pullRequests, "delivery pull request");
  validateUniqueRecords(errors, delivery.releases, "delivery release");
  for (const record of delivery.pullRequests) {
    requireTimestamp(
      errors,
      record.mergedAt,
      `delivery pull request mergedAt: ${record.id}`,
    );
    if (!deliveryDispositions.includes(record.disposition))
      errors.push(`invalid delivery pull request disposition: ${record.id}`);
    if (
      !record.immutableSource?.rawRecordSha256 ||
      !record.immutableSource?.sourceSnapshot
    )
      errors.push(
        `missing immutable source: delivery pull request ${record.id}`,
      );
  }
  for (const record of delivery.releases) {
    requireTimestamp(
      errors,
      record.publishedAt,
      `delivery release publishedAt: ${record.id}`,
    );
    if (
      !record.immutableSource?.rawRecordSha256 ||
      !record.immutableSource?.sourceSnapshot
    )
      errors.push(`missing immutable source: delivery release ${record.id}`);
  }
  for (const [name, window] of Object.entries(delivery.windows ?? {})) {
    requireTimestamp(errors, window.start, `${name} start`);
    requireTimestamp(errors, window.endExclusive, `${name} endExclusive`);
    const admin = name.startsWith("mature-intake-") ? administrativeCensorAt(name, window) : window.endExclusive;
    requireTimestamp(errors, admin, `${name} administrativeCensorAt`);
    if (
      timestamp(window.start) !== null &&
      timestamp(window.endExclusive) !== null &&
      timestamp(window.start) >= timestamp(window.endExclusive)
    )
      errors.push(`invalid ${name} interval`);
    if (
      timestamp(window.endExclusive) !== null &&
      timestamp(admin) !== null &&
      timestamp(window.endExclusive) > timestamp(admin)
    )
      errors.push(`administrative censor precedes intake end: ${name}`);
    const stored = delivery.counts?.[name];
    if (!stored) {
      errors.push(`missing delivery counts: ${name}`);
      continue;
    }
    const pulls = delivery.pullRequests.filter((record) =>
      range(record.mergedAt, window.start, window.endExclusive),
    );
    const releases = delivery.releases.filter((record) =>
      range(record.publishedAt, window.start, window.endExclusive),
    );
    const expected = {
      mergedPullRequests: pulls.length,
      dependencyPullRequests: pulls.filter(
        (record) => record.disposition === "dependency",
      ).length,
      nonDependencyPullRequests: pulls.filter(
        (record) => record.disposition === "non-dependency",
      ).length,
      publishedReleases: releases.length,
    };
    for (const [key, value] of Object.entries(expected))
      if (stored[key] !== value)
        errors.push(`delivery count mismatch for ${name}: ${key}`);
  }
}

export function validateCaseStudy(caseStudy) {
  const errors = [];
  if (
    !caseStudy.window?.start ||
    !caseStudy.window?.endExclusive ||
    !range(
      caseStudy.window.start,
      caseStudy.window.start,
      caseStudy.window.endExclusive,
    )
  )
    errors.push("invalid required study window");
  requireTimestamp(errors, caseStudy.adoptionAt, "required adoptionAt");
  if (
    timestamp(caseStudy.window?.endExclusive) !== null &&
    timestamp(caseStudy.adoptionAt) !== null &&
    !range(
      caseStudy.adoptionAt,
      caseStudy.window.start,
      caseStudy.window.endExclusive,
    )
  )
    errors.push("adoptionAt must be inside study window");
  validateUniqueRecords(errors, caseStudy.defects, "defect");
  for (const defect of caseStudy.defects ?? []) {
    requireRecordDate(errors, defect.firstAffectedPublishedAt, `firstAffectedPublishedAt: ${defect.id}`);
    requireSources(errors, defect.sources, defect.id);
    requireRecordDate(errors, defect.reportedAt, `reportedAt: ${defect.id}`);
    if (
      defect.fixedPublishedAt !== null &&
      defect.fixedPublishedAt !== undefined
    )
      requireRecordDate(
        errors,
        defect.fixedPublishedAt,
        `fixedPublishedAt: ${defect.id}`,
      );
    if (
      timestamp(defect.fixedPublishedAt) !== null &&
      timestamp(defect.reportedAt) !== null &&
      timestamp(defect.fixedPublishedAt) < timestamp(defect.reportedAt)
    )
      errors.push(`fix precedes report: ${defect.id}`);
    if (defect.releaseStatus === "released" && timestamp(defect.firstAffectedPublishedAt) !== null && timestamp(defect.reportedAt) !== null && timestamp(defect.firstAffectedPublishedAt) > timestamp(defect.reportedAt)) errors.push(`released status precedes confirmed affected publication: ${defect.id}`);
    if (!channels.includes(defect.discoveryChannel))
      errors.push(`invalid discovery channel: ${defect.id}`);
    if (!defectDispositions.includes(defect.disposition))
      errors.push(`invalid disposition: ${defect.id}`);
    if (!releaseStatuses.includes(defect.releaseStatus))
      errors.push(`invalid release status: ${defect.id}`);
    if (defect.disposition === "deduplicated" && !defect.duplicateOf)
      errors.push(`deduplicated record lacks duplicateOf: ${defect.id}`);
    if (defect.duplicateOf === defect.id)
      errors.push(`duplicate self link: ${defect.id}`);
  }
  const defectsById = new Map(
    (caseStudy.defects ?? []).map((defect) => [defect.id, defect]),
  );
  for (const defect of caseStudy.defects ?? []) {
    if (defect.duplicateOf && !defectsById.has(defect.duplicateOf))
      errors.push(`duplicateOf does not exist: ${defect.id}`);
    const seen = new Set([defect.id]);
    let next = defect.duplicateOf;
    while (next) {
      if (seen.has(next)) {
        errors.push(`duplicate cycle: ${defect.id}`);
        break;
      }
      seen.add(next);
      next = defectsById.get(next)?.duplicateOf;
    }
  }
  validateUniqueRecords(errors, caseStudy.unresolvedRecords ?? [], "unresolved record");
  for (const record of caseStudy.unresolvedRecords ?? []) {
    requireSources(errors, record.sources, record.id);
    requireRecordDate(errors, record.reportedAt, `unresolved reportedAt: ${record.id}`);
    if (!record.reason) errors.push(`missing unresolved reason: ${record.id}`);
  }
  validateUniqueRecords(errors, caseStudy.candidates, "candidate");
  for (const candidate of caseStudy.candidates ?? []) {
    if (
      !candidate.title ||
      !candidate.reason ||
      !candidate.disposition ||
      !candidate.source
    )
      errors.push(`incomplete candidate metadata: ${candidate.id}`);
    requireTimestamp(
      errors,
      candidate.reportedAt ?? candidate.createdAt,
      `candidate reportedAt: ${candidate.id}`,
    );
  }
  validateUniqueRecords(errors, caseStudy.matureRecords, "mature record");
  for (const record of caseStudy.matureRecords ?? []) {
    requireSources(errors, record.sources, record.id);
    requireRecordDate(
      errors,
      record.reportedAt,
      `mature record reportedAt: ${record.id}`,
    );
    if (
      !["exact", "bound", "unknown", undefined].includes(
        record.firstAffectedPrecision,
      )
    )
      errors.push(`invalid mature origin precision: ${record.id}`);
    if (
      record.firstAffectedPublishedAt !== null &&
      record.firstAffectedPublishedAt !== undefined
    )
      requireRecordDate(
        errors,
        record.firstAffectedPublishedAt,
        `mature record firstAffectedPublishedAt: ${record.id}`,
      );
    if (
      record.fixedPublishedAt !== null &&
      record.fixedPublishedAt !== undefined
    )
      requireRecordDate(
        errors,
        record.fixedPublishedAt,
        `mature record fixedPublishedAt: ${record.id}`,
      );
    if (
      timestamp(record.fixedPublishedAt) !== null &&
      timestamp(record.reportedAt) !== null &&
      timestamp(record.fixedPublishedAt) < timestamp(record.reportedAt)
    )
      errors.push(`mature fix precedes report: ${record.id}`);
  }
  if (
    !Array.isArray(caseStudy.sourceFiles) ||
    caseStudy.sourceFiles.length === 0
  )
    errors.push("missing source file metadata");
  else {
    const paths = new Set();
    for (const source of caseStudy.sourceFiles) {
      const validPath =
        typeof source.path === "string" &&
        /^site\/study\/2026\/(?:source|experiments)\/[A-Za-z0-9._/-]+\.json$/.test(
          source.path,
        ) &&
        !source.path.includes("..");
      if (
        !validPath ||
        paths.has(source.path) ||
        !/^[a-f0-9]{64}$/.test(source.sha256 ?? "")
      )
        errors.push(
          `invalid source file metadata: ${source.path ?? "<missing>"}`,
        );
      paths.add(source.path);
      if (
        validPath &&
        /^[a-f0-9]{64}$/.test(source.sha256 ?? "")
      ) {
        try {
          const contents = readFileSync(
            new URL(`../../${source.path}`, import.meta.url),
          );
          const actual = createHash("sha256").update(contents).digest("hex");
          if (actual !== source.sha256) {
            errors.push(`source hash mismatch: ${source.path}`);
          }
        } catch {
          errors.push(`source file unavailable: ${source.path}`);
        }
      }
    }
  }
  const artifacts = caseStudy.experiments?.fixed7?.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0) errors.push("missing experiment artifact hashes");
  for(const artifact of artifacts ?? []) {
    if(typeof artifact.path !== "string" || !/^site\/study\/2026\/experiments\/[A-Za-z0-9._/-]+$/.test(artifact.path) || artifact.path.includes("..") || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "")) {errors.push("invalid experiment artifact metadata");continue;}
    try {
      const actual=createHash("sha256").update(readFileSync(new URL(`../../${artifact.path}`,import.meta.url))).digest("hex");
      if(actual!==artifact.sha256)errors.push(`experiment artifact hash mismatch: ${artifact.path}`);
    } catch {errors.push(`experiment artifact unavailable: ${artifact.path}`);}
  }
  const fixed = caseStudy.experiments?.fixed7?.results;
  const expected = ["1617", "1618", "1619", "1842", "1933", "1971", "2075"];
  if (
    !Array.isArray(fixed) ||
    fixed.length !== 7 ||
    new Set(fixed.map((result) => String(result.id))).size !== 7 ||
    expected.some((id) => !fixed.some((result) => String(result.id) === id)) ||
    fixed.some((result) => !experimentOutcomes.includes(result.outcome))
  )
    errors.push(
      "fixed7 results must contain exactly the canonical seven issue ids and valid outcomes",
    );
  validateDelivery(caseStudy, errors);
  const canDerive =
    caseStudy.window?.start &&
    caseStudy.window?.endExclusive &&
    timestamp(caseStudy.window.start) !== null &&
    timestamp(caseStudy.window.endExclusive) !== null &&
    timestamp(caseStudy.adoptionAt) !== null;
  const recomputed = canDerive
    ? {
        monthly: deriveMonthly(caseStudy),
        periods: derivePeriods(caseStudy),
        supportingMature: deriveMature(
          caseStudy.matureRecords ?? [],
          caseStudy.delivery,
          caseStudy.delivery?.windows,
        ),
      }
    : { monthly: null, periods: null, supportingMature: null };
  for (const key of ["monthly", "periods", "supportingMature"]) {
    if (!caseStudy[key]) errors.push(`missing stored ${key}`);
    else if (recomputed[key] && !same(caseStudy[key], recomputed[key]))
      errors.push(`stored ${key} does not match recomputed derivation`);
  }
  return { valid: errors.length === 0, errors, chronologyDiagnostics: chronologyDiagnostics(caseStudy.defects ?? []), recomputed };
}
