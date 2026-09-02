import fs from "node:fs/promises";

import nodeFetch from "node-fetch";

import { classifyOpenApiSource } from "./openapi-source.js";

/**
 * Reads the content of a file or URL and returns it as a UTF-8 string.
 *
 * Accepts three kinds of inputs:
 * - **HTTP(S) URLs** — fetches with `node-fetch`.
 * - **`file://` URLs** — reads via the Node.js `fs` module.
 * - **File system paths** — reads via the Node.js `fs` module.
 *
 * @param urlOrPath - A URL string or file-system path.
 * @returns The file contents as a string.
 */
export async function readFile(urlOrPath: string) {
  const source = classifyOpenApiSource(urlOrPath);

  if (source.kind === "remote") {
    const response = await nodeFetch(source.url);

    return await response.text();
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is normalized and NUL-byte validated before filesystem access.
  return await fs.readFile(source.path, "utf8");
}
