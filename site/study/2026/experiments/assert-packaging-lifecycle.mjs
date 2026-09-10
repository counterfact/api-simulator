import { execFileSync } from "node:child_process";
import { strict as assert } from "node:assert";

const [affectedTarball, correctedTarball] = process.argv.slice(2);
assert(affectedTarball && correctedTarball, "pass 2.11.0 and 2.12.0 tarballs");

function packageJson(tarball) {
  return JSON.parse(execFileSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" }));
}

function contents(tarball) {
  return execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).split("\n").filter(Boolean);
}

const affected = packageJson(affectedTarball);
const corrected = packageJson(correctedTarball);
assert.equal(affected.version, "2.11.0");
assert.equal(affected.scripts?.postinstall, "patch-package");
assert.equal(affected.dependencies?.["patch-package"], "8.0.1");
assert.equal(contents(affectedTarball).some((path) => path.startsWith("package/patches/")), false);
assert.equal(corrected.version, "2.12.0");
assert.equal(corrected.scripts?.postinstall, undefined);
assert.equal(corrected.dependencies?.["patch-package"], undefined);
console.log("verified: 2.11.0 has the patch lifecycle without published patches; 2.12.0 omits it");
