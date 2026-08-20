import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
/* eslint-disable security/detect-non-literal-fs-filename -- runtime probe only writes fixed filenames in a fresh temporary directory. */

/**
 * Probes the current Node.js runtime to determine whether it can execute
 * TypeScript source files directly (via `--experimental-strip-types` or
 * equivalent).
 *
 * The check works by writing a tiny TypeScript module to a temporary directory
 * and attempting to import it.  If the import succeeds and returns the
 * expected value, the runtime supports native TypeScript execution.
 *
 * @returns `true` when the runtime can execute `.ts` files natively.
 */
export async function runtimeCanExecuteErasableTs(): Promise<boolean> {
  const dir = mkdtempSync(join(tmpdir(), "ts-probe-"));

  // helper.ts is imported via .js extension — the TypeScript convention used
  // throughout this codebase. If the runtime resolves helper.js → helper.ts,
  // it is fully capable of running the TypeScript source tree.
  writeFileSync(
    join(dir, "helper.ts"),
    'export const value: string = "ok";\n',
    "utf8",
  );
  writeFileSync(
    join(dir, "main.ts"),
    'import { value } from "./helper.js"; export default value;\n',
    "utf8",
  );

  try {
    const mod = await import(pathToFileURL(join(dir, "main.ts")).href);
    return mod?.default === "ok";
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
