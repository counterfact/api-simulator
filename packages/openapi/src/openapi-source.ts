import nodePath from "node:path";
import { fileURLToPath } from "node:url";

export type OpenApiSource =
  { kind: "local"; path: string } | { kind: "remote"; url: URL };

/**
 * Classifies an OpenAPI input as a local file-system path or a remote URL.
 *
 * Only successfully parsed HTTP(S) URLs are remote. File URLs are converted
 * to file-system paths, and every other input is treated as an ordinary local
 * path. NUL bytes are rejected before either classification can occur.
 */
export function classifyOpenApiSource(source: string): OpenApiSource {
  if (source.includes("\0")) {
    throw new Error("File path cannot contain NUL bytes.");
  }

  let url: URL | undefined;

  try {
    url = new URL(source);
  } catch {
    // Ordinary local paths do not need to be valid URLs.
  }

  if (url?.protocol === "http:" || url?.protocol === "https:") {
    return { kind: "remote", url };
  }

  if (url?.protocol === "file:") {
    return { kind: "local", path: fileURLToPath(url) };
  }

  return { kind: "local", path: nodePath.resolve(source) };
}

/** Returns the unique local paths from a list of OpenAPI inputs. */
export function getLocalOpenApiSourcePaths(
  sources: readonly string[],
): string[] {
  return [
    ...new Set(
      sources.flatMap((source) => {
        if (source === "_") {
          return [];
        }

        const classified = classifyOpenApiSource(source);

        return classified.kind === "local" ? [classified.path] : [];
      }),
    ),
  ];
}
