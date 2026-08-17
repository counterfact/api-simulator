import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { CodeGenerator } from "@counterfact/generator";

const directory = await mkdtemp(path.join(tmpdir(), "counterfact-generator-"));

try {
  const specPath = path.join(directory, "openapi.yaml");
  const outputPath = path.join(directory, "generated");
  await writeFile(
    specPath,
    `openapi: 3.0.3
info:
  title: Package example
  version: 1.0.0
paths:
  /health:
    get:
      operationId: getHealth
      responses:
        "204":
          description: Healthy
`,
  );

  await new CodeGenerator(specPath, outputPath, {
    routes: true,
    types: true,
  }).generate();

  assert.match(
    await readFile(path.join(outputPath, "routes", "health.ts"), "utf8"),
    /export const GET/u,
  );
} finally {
  await rm(directory, { force: true, recursive: true });
}
