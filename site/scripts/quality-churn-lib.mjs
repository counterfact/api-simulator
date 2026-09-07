const lockOrGeneratedPath =
  /(^|\/)\.yarn\/|(^|\/)(yarn\.lock|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|bun\.lockb?|cargo\.lock)$|(^|\/)(dist|coverage|\.astro)(\/|$)|\.tsbuildinfo$/i;
const testPath =
  /(^|\/)(test|tests|__tests__|test-black-box)(\/|$)|\.(test|spec)\.[^/]+$/i;
const documentationPath =
  /(^|\/)(docs|documentation|site|\.changeset)(\/|$)|(^|\/)(readme|changelog|contributing|license|security|code_of_conduct)(\.[^/]*)?$|\.(md|mdx|rst|adoc)$/i;

export const classifyPath = (path) => {
  if (lockOrGeneratedPath.test(path)) return "lockOrGenerated";
  if (testPath.test(path)) return "tests";
  if (documentationPath.test(path)) return "documentation";
  return "sourceOrOther";
};

export const parseNumstat = (buffer) => {
  const fields = buffer.toString("utf8").split("\0");
  const records = [];
  for (let index = 0; index < fields.length - 1; index += 1) {
    const field = fields[index];
    const [added, deleted, path = ""] = field.split("\t");
    if (added === undefined || deleted === undefined) continue;
    if (path === "") {
      index += 2;
      records.push({ added, deleted, path: fields[index], renamed: true });
    } else {
      records.push({ added, deleted, path, renamed: false });
    }
  }
  return records;
};

export const isCommitInCohortWindow = (year, committedAt) => {
  const value = Date.parse(committedAt);
  return (
    value >= Date.parse(`${year}-03-10T16:38:20Z`) &&
    value < Date.parse(`${year}-09-04T00:00:00Z`)
  );
};
