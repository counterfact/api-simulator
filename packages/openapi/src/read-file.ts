import fs from "node:fs/promises";
import nodePath from "node:path";

import nodeFetch from "node-fetch";

function normalizeLocalPath(path: string): string {
  if (path.includes("\0")) {
    throw new Error("File path cannot contain NUL bytes.");
  }

  return nodePath.resolve(path);
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
  if (urlOrPath.startsWith("http")) {
    const response = await nodeFetch(urlOrPath);

    return await response.text();
  }

  if (urlOrPath.startsWith("file")) {
    const fileUrl = new URL(urlOrPath);

    if (fileUrl.protocol !== "file:") {
      throw new Error(
        `Unsupported URL protocol for file read: ${fileUrl.protocol}`,
      );
    }

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- file URL is parsed and protocol-validated immediately above.
    return await fs.readFile(fileUrl, "utf8");
  }

  const normalizedPath = normalizeLocalPath(urlOrPath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is normalized and NUL-byte validated before filesystem access.
  return await fs.readFile(normalizedPath, "utf8");
}
