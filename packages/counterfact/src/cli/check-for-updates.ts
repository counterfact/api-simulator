import createDebug from "debug";

const debug = createDebug("counterfact:cli:check-for-updates");

/**
 * Returns `true` when `latest` is a strictly higher semver version than
 * `current`.
 */
export function isOutdated(current: string, latest: string): boolean {
  const [cMajor = 0, cMinor = 0, cPatch = 0] = current.split(".").map(Number);
  const [lMajor = 0, lMinor = 0, lPatch = 0] = latest.split(".").map(Number);

  if (lMajor > cMajor) return true;
  if (lMajor === cMajor && lMinor > cMinor) return true;
  if (lMajor === cMajor && lMinor === cMinor && lPatch > cPatch) return true;

  return false;
}

/**
 * Checks the npm registry for a newer version of counterfact and prints a
 * warning when one is available.  Never throws — update checks are
 * best-effort.
 */
export async function checkForUpdates(currentVersion: string): Promise<void> {
  if (process.env["CI"]) {
    debug("skipping update check in CI environment");
    return;
  }

  try {
    const response = await fetch(
      "https://registry.npmjs.org/counterfact/latest",
    );

    if (!response.ok) {
      debug("update check failed with status %d", response.status);
      return;
    }

    const data = (await response.json()) as { version: string };
    const latestVersion = data.version;

    if (isOutdated(currentVersion, latestVersion)) {
      process.stdout.write(
        `\n⚠️  You're running counterfact ${currentVersion}\n`,
      );
      process.stdout.write(`   Latest version is ${latestVersion}\n`);
      process.stdout.write(`   Run: npx counterfact@latest\n`);
    }
  } catch (error) {
    debug("update check error: %o", error);
  }
}
