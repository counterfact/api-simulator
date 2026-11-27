import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import createDebug from "debug";

/* eslint-disable security/detect-non-literal-fs-filename -- publishes a caller-selected cache file via a unique sibling temporary file. */

const debug = createDebug("counterfact:server:transpiler");
const MAX_RENAME_RETRIES = 10;
const WINDOWS_SHARING_ERRORS = new Set(["EACCES", "EBUSY", "EPERM"]);

/** Publish complete contents without exposing a missing or truncated file. */
export async function writeFileAtomically(
  destinationPath: string,
  contents: string,
): Promise<void> {
  const temporaryPath = `${destinationPath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, contents);
    for (let retry = 0; ; retry += 1) {
      try {
        await fs.rename(temporaryPath, destinationPath);
        return;
      } catch (error) {
        // Windows readers, antivirus, or another publisher can briefly hold
        // a handle that denies replacement. Retry the same complete file;
        // unlinking the destination first would break atomic publication.
        if (
          process.platform !== "win32" ||
          !WINDOWS_SHARING_ERRORS.has(
            (error as NodeJS.ErrnoException | null)?.code ?? "",
          ) ||
          retry >= MAX_RENAME_RETRIES
        ) {
          throw error;
        }
        await delay(Math.min(10 * 2 ** retry, 100));
      }
    }
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch((cleanup: unknown) => {
      debug("could not remove temporary output %s: %o", temporaryPath, cleanup);
    });
    throw error;
  }
}
