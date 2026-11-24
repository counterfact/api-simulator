/**
 * Maps repository paths to output paths that stay distinct on
 * case-insensitive file systems (the default on macOS and Windows).
 *
 * OpenAPI names are case-sensitive, so a document can contain both
 * `/Companies/{id}` and `/companies/{id}`, or schemas named `OutputType` and
 * `OutPutType`. Written as-is, those paths would share directories under
 * different spellings, or overwrite each other.
 *
 * - Directories whose names differ only by case are merged under one
 *   spelling.
 * - A file whose name differs only by case from another file in the same
 *   directory gets the next free numeric suffix (`OutputType_2.ts`). Suffixes
 *   skip names that another input path already uses, so a file without a
 *   case-insensitive twin always keeps its name.
 *
 * Paths without a case-insensitive twin map to themselves. The first
 * spelling in code-unit order wins, so the result does not depend on the
 * order in which paths are discovered.
 */
export function caseSafeOutputPaths(
  paths: Iterable<string>,
): Map<string, string> {
  const directories = new Map<string, string>();
  const entries = [...new Set(paths)].sort().map((path) => {
    const segments = path.split("/");
    const fileName = segments.pop()!;
    let directory = "";

    for (const segment of segments) {
      const candidate = directory === "" ? segment : `${directory}/${segment}`;
      const key = candidate.toLowerCase();
      if (!directories.has(key)) directories.set(key, candidate);
      directory = directories.get(key)!;
    }

    return { fileName, path, prefix: directory === "" ? "" : `${directory}/` };
  });
  // Reserve every natural name first, so a suffixed file never displaces a
  // file that has no case-insensitive twin.
  const reserved = new Set(
    entries.map(({ fileName, prefix }) => `${prefix}${fileName}`.toLowerCase()),
  );
  const taken = new Set<string>();
  const outputPaths = new Map<string, string>();
  const isFree = (candidate: string) =>
    !taken.has(candidate.toLowerCase()) &&
    !reserved.has(candidate.toLowerCase());

  for (const { fileName, path, prefix } of entries) {
    const extensionStart = fileName.indexOf(".", 1);
    const stem =
      extensionStart === -1 ? fileName : fileName.slice(0, extensionStart);
    const extension =
      extensionStart === -1 ? "" : fileName.slice(extensionStart);
    let outputPath = `${prefix}${fileName}`;

    for (let suffix = 2; taken.has(outputPath.toLowerCase()); suffix += 1) {
      const candidate = `${prefix}${stem}_${suffix}${extension}`;
      if (isFree(candidate)) outputPath = candidate;
    }

    taken.add(outputPath.toLowerCase());
    outputPaths.set(path, outputPath);
  }

  return outputPaths;
}
