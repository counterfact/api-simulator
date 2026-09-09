import fs from "node:fs";
import path from "node:path";

const snapshotDirectory = process.argv[2];
const outputPath = process.argv[3];

if (!snapshotDirectory || !outputPath) {
  throw new Error(
    "usage: node scripts/build-historical-quality-ledger.mjs SNAPSHOT_DIRECTORY OUTPUT_PATH",
  );
}

const qualifying = new Map([
  ["issue-453", "confirmed external product defect"],
  ["issue-487", "confirmed external product defect"],
  ["issue-491", "confirmed external product defect"],
  ["issue-530", "confirmed external product defect"],
  ["issue-820", "confirmed external product defect"],
  ["issue-828", "confirmed external product defect"],
  ["issue-835", "confirmed external product defect"],
  ["issue-866", "confirmed external product defect"],
  ["issue-890", "confirmed external product defect"],
  ["issue-906", "confirmed external product defect"],
  ["issue-918", "confirmed external product defect"],
]);

const linkedFixes = new Map([
  ["pr-454", "issue-453"],
  ["pr-532", "issue-530"],
]);

const specificExclusions = new Map([
  ["pr-512", "unmerged proposed fix; not an accepted standalone report"],
  ["pr-513", "unmerged superseded proposed fix"],
  ["pr-508", "accepted feature contribution; did not report confirmed faulty behavior"],
  ["issue-827", "enhancement request, as labeled and resolved"],
  ["issue-1005", "unsupported OpenAPI 3.1 capability at the time of the report"],
]);

const readYear = (year) => {
  const names = fs
    .readdirSync(snapshotDirectory)
    .filter((name) => name.startsWith(`counterfact-${year}-page-`))
    .sort();
  if (names.length === 0) throw new Error(`no snapshots found for ${year}`);
  return names.flatMap((name) => {
    const page = JSON.parse(
      fs.readFileSync(path.join(snapshotDirectory, name), "utf8"),
    );
    return page.items;
  });
};

const classify = (item) => {
  const kind = item.pull_request ? "pr" : "issue";
  const id = `${kind}-${item.number}`;
  if (qualifying.has(id)) {
    return {
      disposition: "product-defect",
      reason: qualifying.get(id),
      reviewMethod: "manual source review",
    };
  }
  if (linkedFixes.has(id)) {
    return {
      disposition: "deduplicated",
      reason: "accepted fix linked to an included issue",
      linkedCandidateId: linkedFixes.get(id),
      reviewMethod: "manual source review",
    };
  }
  if (specificExclusions.has(id)) {
    return {
      disposition: "excluded",
      reason: specificExclusions.get(id),
      reviewMethod: "manual source review",
    };
  }
  if (kind === "pr") {
    return {
      disposition: "excluded",
      reason: "pull request did not independently report a confirmed product defect",
      reviewMethod: "population-rule exclusion",
    };
  }
  if (item.user.login.endsWith("[bot]")) {
    return {
      disposition: "excluded",
      reason: "automation record, not a human external report",
      reviewMethod: "population-rule exclusion",
    };
  }
  if (item.user.login === "pmcelhaney") {
    return {
      disposition: "excluded",
      reason: "maintainer-authored issue, not an external report",
      reviewMethod: "population-rule exclusion",
    };
  }
  return {
    disposition: "excluded",
    reason: "feature, support, or unconfirmed report; not a confirmed product defect",
    reviewMethod: "manual title and body review",
  };
};

const records = [2022, 2023, 2024]
  .flatMap((year) =>
    readYear(year).map((item) => {
      const kind = item.pull_request ? "pr" : "issue";
      return {
        id: `${kind}-${item.number}`,
        year,
        kind: kind === "pr" ? "pull request" : "issue",
        number: item.number,
        title: item.title,
        author: item.user.login,
        authorAssociation: item.author_association,
        openedAt: item.created_at,
        closedAt: item.closed_at,
        state: item.state,
        sourceUrl: item.html_url,
        ...classify(item),
      };
    }),
  )
  .sort((left, right) =>
    left.year === right.year
      ? left.number - right.number
      : left.year - right.year,
  );

const output = {
  schemaVersion: 1,
  generatedOn: "2026-09-08",
  source: "GitHub Search API snapshots for the exact half-open study windows",
  reviewIndependence: "author-reviewed; no independent adjudication claimed",
  records,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
