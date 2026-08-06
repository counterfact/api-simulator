const UNICODE_RATIO_SYMBOL = "∶"; // U+2236
const REGULAR_COLON = ":";

/**
 * Escapes a Windows absolute path for use in an ES module import specifier.
 *
 * On Windows, drive letters produce colons (e.g. `C:\path`) which are invalid
 * in URL-like import paths.  The drive separator colon and any additional
 * colons in the path are replaced with the Unicode ratio symbol `∶` (U+2236),
 * which is visually identical but safe in import specifiers.
 *
 * @param path - The file-system path to escape.
 * @returns An escaped path safe for use in an import specifier.
 */
export function escapePathForWindows(path: string): string {
  if (path.at(1) === ":") {
    return (
      path.slice(0, 2) +
      path.slice(2).replaceAll(REGULAR_COLON, UNICODE_RATIO_SYMBOL)
    );
  }
  return path.replaceAll(REGULAR_COLON, UNICODE_RATIO_SYMBOL);
}

/**
 * Reverses the transformation applied by {@link escapePathForWindows},
 * converting `∶` back to `:`.
 *
 * @param path - A previously escaped path.
 * @returns The original unescaped path.
 */
export function unescapePathForWindows(path: string): string {
  return path.replaceAll(UNICODE_RATIO_SYMBOL, REGULAR_COLON);
}
