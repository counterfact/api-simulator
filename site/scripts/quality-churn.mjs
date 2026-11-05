import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  classifyPath,
  isCommitInCohortWindow,
  parseNumstat,
} from "./quality-churn-lib.mjs";

const run = promisify(execFile);
const ref =
  process.argv[2] ?? "77f0bc6fd2c3bc935d2eb2da80190369d91f7084";
const years = [2022, 2023, 2024, 2025, 2026];

const { stdout: repoRoot } = await run("git", [
  "rev-parse",
  "--show-toplevel",
]);
const gitOptions = {
  cwd: repoRoot.trim(),
  maxBuffer: 100 * 1024 * 1024,
  encoding: "buffer",
};

const gitText = async (args) => {
  const { stdout } = await run("git", args, gitOptions);
  return stdout.toString("utf8");
};

const datedCommits = async () => {
  const args = ["log", ref, "--first-parent", "--format=%H%x09%cI"];
  const output = await gitText(args);
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [commit, committedAt] = line.split("\t");
      return { commit, committedAt };
    });
};

const diffFor = async (commit) => {
  const parents = (await gitText(["rev-list", "--parents", "-n", "1", commit]))
    .trim()
    .split(" ")
    .slice(1);
  const args =
    parents.length === 0
      ? ["diff-tree", "--root", "--numstat", "-M", "-z", "--no-commit-id", "-r", commit]
      : ["diff", "--numstat", "-M", "-z", parents[0], commit];
  const { stdout } = await run("git", args, gitOptions);
  return parseNumstat(stdout);
};

const firstParentHistory = await datedCommits();
const results = {};

for (const year of years) {
  const commits = firstParentHistory.filter((item) =>
    isCommitInCohortWindow(year, item.committedAt),
  );
  const totals = {
    additions: 0,
    deletions: 0,
    churn: 0,
    fileTouchOccurrences: 0,
    binaryFileTouchOccurrences: 0,
    renamedFileOccurrences: 0,
  };
  const categories = Object.fromEntries(
    ["tests", "documentation", "lockOrGenerated", "sourceOrOther"].map(
      (category) => [category, {
        additions: 0,
        deletions: 0,
        churn: 0,
        fileTouchOccurrences: 0,
        binaryFileTouchOccurrences: 0,
      }],
    ),
  );

  for (const { commit } of commits) {
    for (const record of await diffFor(commit)) {
      const category = categories[classifyPath(record.path)];
      totals.fileTouchOccurrences += 1;
      category.fileTouchOccurrences += 1;
      if (record.renamed) totals.renamedFileOccurrences += 1;
      if (record.added === "-" || record.deleted === "-") {
        totals.binaryFileTouchOccurrences += 1;
        category.binaryFileTouchOccurrences += 1;
        continue;
      }
      const additions = Number(record.added);
      const deletions = Number(record.deleted);
      totals.additions += additions;
      totals.deletions += deletions;
      category.additions += additions;
      category.deletions += deletions;
    }
  }

  totals.churn = totals.additions + totals.deletions;
  for (const category of Object.values(categories)) {
    category.churn = category.additions + category.deletions;
  }

  results[String(year)] = {
    start: `${year}-03-10T16:38:20Z`,
    endExclusive: `${year}-09-04T00:00:00Z`,
    firstParentCommits: commits.length,
    ...totals,
    categories,
  };
}

console.log(JSON.stringify({ ref, clock: "committer timestamp", cohorts: results }, null, 2));
