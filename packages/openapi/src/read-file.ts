import fs from "node:fs/promises";
import nodePath from "node:path";

import nodeFetch from "node-fetch";

function normalizeLocalPath(path: string): string {
  if (path.includes("\0")) {
    throw new Error("File path cannot contain NUL bytes.");
  }

  return nodePath.resolve(path);
}

function parseSupportedUrl(urlOrPath: string): URL | undefined {
  try {
    const url = new URL(urlOrPath);

    if (
      url.protocol === "file:" ||
      url.protocol === "http:" ||
      url.protocol === "https:"
    ) {
      return url;
    }
  } catch {
    // A local path is not necessarily a valid URL.
  }

  return undefined;
}

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
  if (urlOrPath.includes("\0")) {
    throw new Error("File path cannot contain NUL bytes.");
  }

  const url = parseSupportedUrl(urlOrPath);

  if (url?.protocol === "http:" || url?.protocol === "https:") {
    const response = await nodeFetch(urlOrPath);

    return await response.text();
  }

  if (url?.protocol === "file:") {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- file URL is parsed and protocol-validated immediately above.
    return await fs.readFile(url, "utf8");
  }

  const normalizedPath = normalizeLocalPath(urlOrPath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is normalized and NUL-byte validated before filesystem access.
  return await fs.readFile(normalizedPath, "utf8");
}
