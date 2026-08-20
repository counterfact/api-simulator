export function printObjectWithoutQuotes(entries: [string, string][]): string {
  return `{\n${entries
    .map(([key, value]) => `${key}: ${value}`)
    .join(",\n")}\n}`;
}

export function printObject(entries: [string, string][]): string {
  return `{\n${entries
    .map(([key, value]) => `"${key}": ${value}`)
    .join(",\n")}\n}`;
}
