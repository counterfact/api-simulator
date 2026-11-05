import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../../../../", import.meta.url);
const rootPath = fileURLToPath(root);
const text = (path) => readFileSync(new URL(path, root), "utf8");
const json = (path) => JSON.parse(text(path));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const sha = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const repo = "https://github.com/counterfact/api-simulator";
const cutoff = "2026-09-04T00:00:00Z";
const cohortStarts = {
  "2022": "2022-03-10T16:38:20Z",
  "2023": "2023-03-10T16:38:20Z",
  "2024": "2024-03-10T16:38:20Z",
  "2025": "2025-03-10T16:38:20Z",
  "2026": "2026-03-10T16:38:20Z",
};
const windows = Object.fromEntries(
  Object.entries(cohortStarts).map(([year, start]) => [
    `matched-${year}`,
    { start, endExclusive: `${year}-09-04T00:00:00Z` },
  ]),
);
for (const [year, start] of Object.entries(cohortStarts)) {
  windows[`mature-intake-${year}`] = {
    start,
    endExclusive: `${year}-06-06T00:00:00Z`,
  };
}
windows["continuous-2024-09-01-to-cutoff"] = {
  start: "2024-09-01T00:00:00Z",
  endExclusive: cutoff,
};

const includes = (instant, window) => instant >= window.start && instant < window.endExclusive;
const rawPullsPath = "site/study/2026/source/internal-tools/pulls-all.json.gz";
const rawPullsText = gunzipSync(readFileSync(new URL(rawPullsPath, root))).toString("utf8");
const rawPulls = JSON.parse(rawPullsText);
const npmText = text("site/study/2026/source/delivery-tools/npm-counterfact.json");
const npm = JSON.parse(npmText);

const inAnyWindow = (instant) => Object.values(windows).some((window) => includes(instant, window));
const manuallyClassifiedDependencyOnly = new Map([
  [16, "PR body says it updates dependencies; it changes the dependency set only."],
  [1106, "PR title identifies a Snyk security dependency upgrade."],
  [1150, "PR title identifies a jsonpath-plus security dependency upgrade."],
  [1403, "PR title identifies a Snyk patch-package dependency upgrade."],
  [1431, "PR title identifies a Snyk koa dependency upgrade."],
  [1512, "PR title identifies a Snyk koa dependency upgrade."],
  [2250, "PR title identifies only site package-lock dependency synchronization."],
]);
const dependencyReason = (pr) => {
  if (pr.user?.login === "renovate[bot]") {
    return "excluded_dependency_automation: author is renovate[bot], the repository's dependency-update automation";
  }
  if (pr.user?.login === "dependabot[bot]") {
    return "excluded_dependency_automation: author is dependabot[bot], a dependency-update automation";
  }
  if (manuallyClassifiedDependencyOnly.has(pr.number)) {
    return `excluded_dependency_only: ${manuallyClassifiedDependencyOnly.get(pr.number)}`;
  }
  return "included_non_dependency: neither dependency bot nor manually confirmed dependency-only change";
};
const prs = rawPulls
  .filter((pr) => pr.merged_at && pr.merged_at < cutoff && inAnyWindow(pr.merged_at))
  .sort((a, b) => a.merged_at.localeCompare(b.merged_at))
  .map((pr) => {
    const memberships = Object.entries(windows)
      .filter(([, window]) => includes(pr.merged_at, window))
      .map(([name]) => name);
    const dependency = pr.user?.login === "renovate[bot]" || pr.user?.login === "dependabot[bot]" || manuallyClassifiedDependencyOnly.has(pr.number);
    return {
      id: `pr-${pr.number}`,
      number: pr.number,
      url: pr.html_url,
      apiUrl: pr.url,
      title: pr.title,
      author: pr.user?.login ?? null,
      createdAt: pr.created_at,
      mergedAt: pr.merged_at,
      mergeCommit: pr.merge_commit_sha,
      disposition: dependency ? "dependency" : "non_dependency",
      dispositionReason: dependencyReason(pr),
      cohortMembership: memberships,
      immutableSource: {
        rawRecordSha256: sha(pr),
        sourceSnapshot: rawPullsPath,
      },
    };
  });

const releases = Object.entries(npm.time)
  .filter(([version, publishedAt]) => version !== "created" && version !== "modified" && publishedAt < cutoff)
  .sort(([, a], [, b]) => a.localeCompare(b))
  .map(([version, publishedAt]) => {
    const versionData = npm.versions[version] ?? {};
    return {
      id: `npm-counterfact-${version}`,
      package: "counterfact",
      version,
      publishedAt,
      url: `https://www.npmjs.com/package/counterfact/v/${version}`,
      tarball: versionData.dist?.tarball ?? null,
      integrity: versionData.dist?.integrity ?? null,
      shasum: versionData.dist?.shasum ?? null,
      cohortMembership: Object.entries(windows)
        .filter(([, window]) => includes(publishedAt, window))
        .map(([name]) => name),
      immutableSource: {
        rawRecordSha256: sha({ version, publishedAt, versionData }),
        sourceSnapshot: "site/study/2026/source/delivery-tools/npm-counterfact.json",
      },
    };
  });

const firstParentText = execFileSync(
  "git",
  ["log", "--first-parent", "--format=%H%x09%cI%x09%s", "--since=2022-03-10T16:38:20Z", `--until=${cutoff}`],
  { cwd: rootPath, encoding: "utf8" },
);
const firstParent = firstParentText.trim().split("\n").filter(Boolean).map((line) => {
  const [commit, committedAt, subject] = line.split("\t");
  return { commit, committedAt, subject, url: `${repo}/commit/${commit}` };
});
writeFileSync(new URL("site/study/2026/source/delivery-tools/first-parent-main.json", root), `${JSON.stringify({
  query: "git log --first-parent from 2022-03-10T16:38:20Z through 2026-09-04T00:00:00Z, exclusive cutoff applied by ledger",
  records: firstParent,
}, null, 2)}\n`);
const cutoffRef = execFileSync("git", ["rev-list", "--first-parent", "-1", `--before=${cutoff}`, "HEAD"], {
  cwd: rootPath, encoding: "utf8",
}).trim();
const reconciliation = {
  originalSnapshotEndExclusive: "2026-09-03T18:00:00Z",
  expansionEndExclusive: cutoff,
  mergedPullRequests: rawPulls.filter((pr) => pr.merged_at && pr.merged_at >= "2026-09-03T18:00:00Z" && pr.merged_at < cutoff).map((pr) => pr.number),
  releases: releases.filter((release) => release.publishedAt >= "2026-09-03T18:00:00Z").map((release) => release.version),
  firstParentCommits: firstParent.filter((commit) => commit.committedAt >= "2026-09-03T18:00:00Z").map((commit) => commit.commit),
};
const workflowChanges = [
  ["d6a93b09e0cd343080e31d44eed71479c06d0280", "2026-03-27T15:36:42-04:00", "#1592", "manual acceptance review gate", "Added required manual-acceptance checklist validation for qualifying PRs."],
  ["61455e829e8c17e6b84c426db8c9f9527bc4de5b", "2026-03-26T20:42:21Z", "#1561", "black-box test architecture", "Converted black-box coverage to product-level Python journeys; timestamp is GitHub PR merged_at."],
  ["4c0d10b7a96569c765b641d9873ad81bf99b08cc", "2026-08-20T00:29:15Z", "#2323", "Cucumber black-box journeys", "Reworked product-level black-box journeys into feature files and bindings."],
  ["307b8e5e62b0a4aa7691be97b4ffd382a7756a11", "2026-09-02T11:12:49Z", "#2379", "merge-queue review-gate repair", "Made the manual-acceptance required check run for merge-group requests after queue timeouts."],
].map(([commit, committedAt, pullRequest, category, finding]) => ({
  commit, committedAt, pullRequest, category, finding,
  sourceUrl: commit.length === 40 ? `${repo}/commit/${commit}` : `${repo}/pull/${pullRequest.slice(1)}`,
}));
const count = (records, name) => records.filter((record) => record.cohortMembership.includes(name)).length;
const countNonDependency = (name) => prs.filter((pr) => pr.disposition === "non_dependency" && pr.cohortMembership.includes(name)).length;
const countOriginalProxy = (name) => prs.filter((pr) => pr.author !== "renovate[bot]" && pr.cohortMembership.includes(name)).length;
const counts = Object.fromEntries(Object.keys(windows).map((name) => [name, {
  mergedPullRequests: count(prs, name),
  dependencyPullRequests: prs.filter((pr) => pr.disposition === "dependency" && pr.cohortMembership.includes(name)).length,
  nonDependencyPullRequests: countNonDependency(name),
  originalNonRenovateProxy: countOriginalProxy(name),
  publishedReleases: count(releases, name),
}]));
const ledger = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repository: "counterfact/api-simulator",
  cutoff: { endExclusive: cutoff, firstParentRef: cutoffRef, firstParentRefUrl: `${repo}/commit/${cutoffRef}` },
  windows,
  classification: {
    dependencyRule: "A merged PR is dependency-only when authored by renovate[bot] or dependabot[bot], or when a manual record-level review confirms an exclusively dependency update. All other PRs remain non-dependency; this retains the original renovate-bot denominator while correcting confirmed human-authored dependency-only records.",
    chronology: "PR chronology uses GitHub merged_at. Release chronology uses npm publication time. Git chronology uses committer timestamp on the local first-parent main history.",
  },
  rawSources: {
    pulls: { path: rawPullsPath, sha256: digest(rawPullsText), records: rawPulls.length, api: "GET /repos/counterfact/api-simulator/pulls?state=all&per_page=100, paginated by internal_census" },
    npm: { path: "site/study/2026/source/delivery-tools/npm-counterfact.json", sha256: digest(npmText), url: "https://registry.npmjs.org/counterfact", retrievedAt: "2026-09-09", package: "counterfact" },
    git: { path: "site/study/2026/source/delivery-tools/first-parent-main.json", source: "local pinned Git repository first-parent history", records: firstParent.length },
  },
  counts,
  reconciliation,
  workflowChanges,
  releases,
  pullRequests: prs,
};
writeFileSync(new URL("site/study/2026/source/delivery.json", root), `${JSON.stringify(ledger, null, 2)}\n`);
