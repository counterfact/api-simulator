import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadOpenApiDocument } from "@counterfact/openapi";

const directory = await mkdtemp(path.join(tmpdir(), "counterfact-openapi-"));

try {
  const specPath = path.join(directory, "openapi.yaml");
  await writeFile(
    specPath,
    `openapi: 3.0.3
info:
  title: Package example
  version: 1.0.0
paths:
  /health:
    get:
      responses:
        "204":
          description: Healthy
`,
  );

  const document = await loadOpenApiDocument(specPath);
  assert("/health" in document.paths);
} finally {
  await rm(directory, { force: true, recursive: true });
}
