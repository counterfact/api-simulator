const UNICODE_RATIO_SYMBOL = "∶";
const REGULAR_COLON = ":";

export function escapePathForWindows(path: string): string {
  if (path.at(1) === ":") {
    return (
      path.slice(0, 2) +
      path.slice(2).replaceAll(REGULAR_COLON, UNICODE_RATIO_SYMBOL)
    );
  }

  return path.replaceAll(REGULAR_COLON, UNICODE_RATIO_SYMBOL);
}
