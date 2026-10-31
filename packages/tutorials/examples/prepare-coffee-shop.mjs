import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { findTourDirectory, prepareTour } from "@counterfact/tutorials";

const root = await mkdtemp(join(tmpdir(), "counterfact-tour-example-"));
try {
  const directory = await findTourDirectory(root);
  const tour = await prepareTour(root, directory, "coffee-shop");
  assert.equal(tour.destination, join(root, directory));
  assert.equal(tour.walkthroughPath, "/tutorial/");
  const document = parse(await readFile(tour.source, "utf8"));
  assert(document.paths["/products"]);
  assert(document.paths["/orders"]);
  assert.deepEqual(document.servers, [{ url: "/shop" }]);
  assert.deepEqual(Object.keys(document.paths), ["/products", "/orders"]);
  await assert.rejects(
    readFile(join(tour.destination, "routes/walkthrough.ts"), "utf8"),
    { code: "ENOENT" },
  );
  assert.notEqual(await findTourDirectory(root), directory);
  await assert.rejects(prepareTour(root, directory), { code: "EEXIST" });
} finally {
  await rm(root, { recursive: true, force: true });
}
