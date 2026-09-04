export const categories = [
  "Same-year regression",
  "Defect in same-year feature",
  "Pre-existing",
];

export function summarizeCases(cases, year) {
  const selected = cases.filter((item) => item.year === year);
  const counts = Object.fromEntries(
    categories.map((category) => [
      category,
      selected.filter((item) => item.category === category).length,
    ]),
  );
  return { year, total: selected.length, counts };
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
  const ids = new Set();
  for (const item of manifest.productCases) {
    if (ids.has(item.id)) errors.push(`duplicate product case id: ${item.id}`);
    ids.add(item.id);
    if (!categories.includes(item.category))
      errors.push(`unknown category for ${item.id}`);
    if (Number.isNaN(Date.parse(item.firstAffectedPublishedAt))) {
      errors.push(`invalid publication timestamp for ${item.id}`);
    }
    if (
      !Array.isArray(manifest.sourceIndex[item.id]) ||
      manifest.sourceIndex[item.id].length < 2
    ) {
      errors.push(`missing primary sources for ${item.id}`);
    }
  }
  for (const year of [2025, 2026]) {
    const included = manifest.candidates.filter(
      (item) => item.year === year && item.disposition === "product-defect",
    );
    const cases = manifest.productCases.filter((item) => item.year === year);
    if (included.length !== cases.length) {
      errors.push(
        `${year} included candidate count ${included.length} does not match case count ${cases.length}`,
      );
    }
  }
  const authorTotal = Object.values(
    manifest.activity.pullRequestAuthors2026,
  ).reduce((sum, value) => sum + value, 0);
  if (authorTotal !== manifest.activity.mergedPullRequests["2026"]) {
    errors.push(
      `2026 pull-request author groups total ${authorTotal}, expected ${manifest.activity.mergedPullRequests["2026"]}`,
    );
  }
  return errors;
}
