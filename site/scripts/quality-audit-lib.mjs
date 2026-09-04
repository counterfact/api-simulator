export const categories = [
  "Same-year regression",
  "Defect in same-year feature",
  "Pre-existing",
];

export function summarizeCases(cases, year) {
  const selected = cases.filter(
    (item) => (item.reportYear ?? item.year) === year,
  );
  const counts = Object.fromEntries(
    categories.map((category) => [
      category,
      selected.filter((item) => item.category === category).length,
    ]),
  );
  return { year, total: selected.length, counts };
}

export function isWithinWindow(timestamp, window) {
  const value = Date.parse(timestamp);
  return (
    value >= Date.parse(window.start) &&
    value < Date.parse(window.endExclusive)
  );
}

export function selectReportedCases(cases, year, window) {
  return cases.filter(
    (item) =>
      item.reportYear === year && isWithinWindow(item.reportedAt, window),
  );
}

export function selectIntroducedCases(cases, year, window) {
  return selectReportedCases(cases, year, window).filter((item) =>
    isWithinWindow(item.firstAffectedPublishedAt, window),
  );
}

export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function matureCases(cases, windowEndExclusive, maturityDays) {
  const end = Date.parse(windowEndExclusive);
  const threshold = maturityDays * 24 * 60 * 60 * 1000;
  return cases.filter(
    (item) => end - Date.parse(item.firstAffectedPublishedAt) >= threshold,
  );
}

export function validateManifest(manifest) {
  const errors = [];
  if (manifest.schemaVersion !== 2)
    errors.push(`unsupported schema version: ${manifest.schemaVersion}`);

  const ids = new Set();
  for (const item of manifest.productCases) {
    if (ids.has(item.id)) errors.push(`duplicate product case id: ${item.id}`);
    ids.add(item.id);
    if (!categories.includes(item.category))
      errors.push(`unknown category for ${item.id}`);
    if (Number.isNaN(Date.parse(item.firstAffectedPublishedAt))) {
      errors.push(`invalid publication timestamp for ${item.id}`);
    }
    if (!Array.isArray(item.sources) || item.sources.length < 2) {
      errors.push(`missing primary sources for ${item.id}`);
    }
  }

  const candidateIds = new Set();
  for (const candidate of manifest.candidates) {
    if (candidateIds.has(candidate.id))
      errors.push(`duplicate candidate id: ${candidate.id}`);
    candidateIds.add(candidate.id);
    if (!candidate.title || !candidate.author || !candidate.sourceUrl) {
      errors.push(`incomplete candidate metadata: ${candidate.id}`);
    }
    if (Number.isNaN(Date.parse(candidate.openedAt))) {
      errors.push(`invalid candidate timestamp: ${candidate.id}`);
    }
  }

  for (const candidate of manifest.candidates) {
    if (
      candidate.linkedCandidateId &&
      !candidateIds.has(candidate.linkedCandidateId)
    ) {
      errors.push(
        `missing linked candidate ${candidate.linkedCandidateId} for ${candidate.id}`,
      );
    }
  }

  const includedCandidateIds = new Set(
    manifest.candidates
      .filter((item) => item.disposition === "product-defect")
      .map((item) => item.id),
  );
  for (const id of ids) {
    if (!includedCandidateIds.has(id))
      errors.push(`product case has no included candidate: ${id}`);
  }

  for (const year of [2025, 2026]) {
    const included = manifest.candidates.filter(
      (item) => item.year === year && item.disposition === "product-defect",
    );
    const cases = manifest.productCases.filter(
      (item) => item.reportYear === year,
    );
    if (included.length !== cases.length) {
      errors.push(
        `${year} included candidate count ${included.length} does not match case count ${cases.length}`,
      );
    }
    for (const candidate of included) {
      if (!ids.has(candidate.id))
        errors.push(`included candidate has no case: ${candidate.id}`);
    }
  }

  const processCandidateIds = new Set(
    manifest.candidates
      .filter((item) => item.disposition === "process-incident")
      .map((item) => item.id),
  );
  const processIds = new Set(manifest.processIncidents.map((item) => item.id));
  for (const id of processCandidateIds) {
    if (!processIds.has(id)) errors.push(`process candidate has no incident: ${id}`);
  }

  for (const year of [2025, 2026]) {
    const authorTotal = Object.values(
      manifest.activity.primaryWindow.pullRequestAuthors[String(year)],
    ).reduce((sum, value) => sum + value, 0);
    const expected =
      manifest.activity.primaryWindow.mergedPullRequests[String(year)];
    if (authorTotal !== expected) {
      errors.push(
        `${year} pull-request author groups total ${authorTotal}, expected ${expected}`,
      );
    }
  }
  return errors;
}
