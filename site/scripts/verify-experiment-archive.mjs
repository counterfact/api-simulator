/** Verify a checked-out archive without installing or executing historical code. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const directory = process.argv[2];
if (!directory) throw new Error("Usage: npm run verify:experiment-archive -- /path/to/historical-experiments");
const root = pathToFileURL(`${resolve(directory)}/`);
const local = new URL("../study/2026/experiments/", import.meta.url);
const pin = JSON.parse(readFileSync(new URL("archive.json", local), "utf8"));
const head = execFileSync("git", ["-C", resolve(directory), "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(head, pin.commit, "Check out the pinned archive commit first");
const manifestBytes = readFileSync(new URL("artifact-manifest.json", local));
assert.equal(createHash("sha256").update(manifestBytes).digest("hex"), pin.manifestSha256, "Local archive manifest hash mismatch");
const prefix = "site/study/2026/experiments/";
assert.deepEqual(readFileSync(new URL(pin.manifestPath, root)), manifestBytes, "Archived manifest differs from the retained manifest");
const { artifacts } = JSON.parse(manifestBytes);
const expected = artifacts;
const list = (path) => readdirSync(new URL(path, root), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? list(`${path}${entry.name}/`) : [`${path}${entry.name}`]);
assert.deepEqual(list(prefix).sort(), expected.map(file => file.path).sort(), "Archive evidence inventory differs");
for (const file of expected) {
  assert.ok(file.path.startsWith(prefix) && !file.path.includes(".."), "Invalid artifact path");
  const actual = createHash("sha256").update(readFileSync(new URL(file.path, root))).digest("hex");
  assert.equal(actual, file.sha256, `Archived evidence changed: ${file.path}`);
}
assert.deepEqual(readFileSync(new URL(`${prefix}results.json`, root)), readFileSync(new URL("results.json", local)), "Local results differ from archive");
const source = JSON.parse(readFileSync(new URL("SOURCE.json", root), "utf8"));
assert.equal(source.repository, "https://github.com/counterfact/api-simulator");
assert.equal(source.commit, pin.sourceCommit, "Archive source provenance differs");
assert.deepEqual(source.files.toSorted((a, b) => a.path.localeCompare(b.path)), expected.toSorted((a, b) => a.path.localeCompare(b.path)), "Archive source inventory differs");
console.log(`Verified ${expected.length} archived files at ${pin.commit}; local results match.`);
