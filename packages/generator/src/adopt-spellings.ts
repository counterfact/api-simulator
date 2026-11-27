import fs from "node:fs/promises";
import nodePath from "node:path";
/* eslint-disable security/detect-non-literal-fs-filename -- only renames entries below a generator-owned destination directory. */

/**
 * Renames existing files and directories under `root` whose names differ from
 * `paths` only by case, so the next write keeps the chosen spelling.
 *
 * On a case-insensitive file system, writing `A.ts` over an existing `a.ts`
 * keeps the old name. Imports would then disagree with the file name, and
 * pruning would remove the file that was just written.
 *
 * An entry is left alone when the chosen spelling already exists beside it,
 * because on a case-sensitive file system the two are distinct files.
 *
 * @param root - Directory that `paths` are relative to.
 * @param paths - Forward-slash relative paths, spelled as they will be written.
 */
export async function adoptSpellings(
  root: string,
  paths: Iterable<string>,
): Promise<void> {
  const listings = new Map<string, string[]>();
  const list = async (directory: string): Promise<string[]> => {
    if (!listings.has(directory)) {
      listings.set(
        directory,
        await fs.readdir(directory).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT" || error.code === "ENOTDIR") return [];
          throw error;
        }),
      );
    }
    return listings.get(directory)!;
  };

  for (const path of [...new Set(paths)].sort()) {
    let directory = root;
    for (const segment of path.split("/")) {
      const names = await list(directory);
      if (!names.includes(segment)) {
        const index = names.findIndex(
          (name) => name.toLowerCase() === segment.toLowerCase(),
        );
        if (index !== -1) {
          // A case-only rename is a no-op on some file systems, so go through
          // a temporary name.
          const temporary = nodePath.join(
            directory,
            `.${segment}.${process.pid}.case-rename`,
          );
          await fs.rename(
            nodePath.join(directory, names.at(index)!),
            temporary,
          );
          await fs.rename(temporary, nodePath.join(directory, segment));
          names.splice(index, 1, segment);
        }
      }
      directory = nodePath.join(directory, segment);
    }
  }
}
