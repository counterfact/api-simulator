const VALIDATION_TAGS = [
  ["minLength", "minLength"],
  ["maxLength", "maxLength"],
  ["minimum", "min"],
  ["maximum", "max"],
  ["exclusiveMinimum", "exclusiveMin"],
  ["exclusiveMaximum", "exclusiveMax"],
  ["multipleOf", "multipleOf"],
  ["pattern", "pattern"],
  ["minItems", "minItems"],
  ["maxItems", "maxItems"],
] as const;

/**
 * Builds a JSDoc comment string from OpenAPI schema metadata.
 * Returns an empty string if there is no relevant metadata.
 *
 * @param validation - Also document the schema's validation constraints.
 */
export function buildJsDoc(data: unknown, validation = false): string {
  if (typeof data !== "object" || data === null) {
    return "";
  }

  const record = data as Record<string, unknown>;
  const lines: string[] = [];

  const description = record["description"] as string | undefined;
  const summary = record["summary"] as string | undefined;
  const example = record["example"];
  const examples = record["examples"] as
    Record<string, { value?: unknown }> | undefined;
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

  if (validation) {
    for (const [keyword, tag] of VALIDATION_TAGS) {
      const value = record[keyword];
      // OpenAPI 3.0 exclusive bounds are booleans that modify minimum/maximum.
      if (typeof value === "number" || typeof value === "string") {
        lines.push(` * @${tag} ${String(value).replace(/\*\//gu, "* /")}`);
      }
    }
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
