export function mediaTypeOf(value: string | null): string | undefined {
  return value?.split(";", 1)[0]?.trim().toLowerCase();
}

export function isJsonMediaType(value: string): boolean {
  const mediaType = mediaTypeOf(value);
  return (
    mediaType === "application/json" || mediaType?.endsWith("+json") === true
  );
}

function parameters(value: string): [string, string][] {
  return Array.from(
    value.matchAll(/;\s*([^=\s;]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/gu),
    ([, name, raw]) => {
      const key = name!.toLowerCase();
      const trimmed = raw!.trim();
      const parameter = trimmed.startsWith('"')
        ? trimmed.slice(1, -1).replaceAll(/\\(.)/gu, "$1")
        : trimmed;
      return [key, key === "charset" ? parameter.toLowerCase() : parameter];
    },
  );
}

/** Return the original declaration for the most specific matching media type. */
export function matchMediaType(
  declared: readonly string[],
  contentType: string | null,
): string | undefined {
  if (contentType === null) return undefined;
  const essence = mediaTypeOf(contentType);
  const received = new Map(parameters(contentType));
  let match: string | undefined;
  let specificity = -1;
  for (const candidate of declared) {
    if (mediaTypeOf(candidate) !== essence) continue;
    const required = parameters(candidate);
    if (
      required.length > specificity &&
      required.every(([key, value]) => received.get(key) === value)
    ) {
      match = candidate;
      specificity = required.length;
    }
  }
  return match;
}
