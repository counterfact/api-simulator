/**
 * Builds a JSDoc comment string from OpenAPI schema metadata.
 * Returns an empty string if there is no relevant metadata.
 */
export function buildJsDoc(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return "";
  }

  const record = data as Record<string, unknown>;
  const lines: string[] = [];

  const description = record["description"] as string | undefined;
  const summary = record["summary"] as string | undefined;
  const example = record["example"];
  const examples = record["examples"] as
    | Record<string, { value?: unknown }>
    | undefined;
  const defaultValue = record["default"];
  const format = record["format"] as string | undefined;
  const deprecated = record["deprecated"] as boolean | undefined;

  const mainText = description ?? summary;

  if (mainText) {
    // Escape */ to prevent prematurely closing the JSDoc block
    const escaped = String(mainText).replace(/\*\//gu, "* /");
    const textLines = escaped.split("\n");

    for (const line of textLines) {
      lines.push(` * ${line}`);
    }
  }

  if (format !== undefined) {
    lines.push(` * @format ${format}`);
  }

  if (defaultValue !== undefined) {
    lines.push(` * @default ${JSON.stringify(defaultValue)}`);
  }

  // Use scalar `example`, or fall back to the first value from `examples`
  const exampleValue =
    example !== undefined
      ? example
      : examples !== undefined
        ? Object.values(examples)[0]?.value
        : undefined;

  if (exampleValue !== undefined) {
    lines.push(` * @example ${JSON.stringify(exampleValue)}`);
  }

  if (deprecated === true) {
    lines.push(` * @deprecated`);
  }

  if (lines.length === 0) {
    return "";
  }

  return `/**\n${lines.join("\n")}\n */\n`;
}
