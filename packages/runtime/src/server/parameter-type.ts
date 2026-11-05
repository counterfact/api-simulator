/** Resolve a single non-null primitive without guessing between union alternatives. */
export function parameterType(
  schema: unknown,
  ancestors = new Set<object>(),
): string | undefined {
  if (typeof schema !== "object" || schema === null) return undefined;
  if (ancestors.has(schema)) return undefined;
  const seen = new Set(ancestors).add(schema);
  const value = schema as Record<string, unknown>;
  const types = Array.isArray(value.type)
    ? value.type
    : value.type
      ? [value.type]
      : undefined;
  if (types) {
    const nonNull = [...new Set(types.filter((type) => type !== "null"))];
    return nonNull.length === 1 && typeof nonNull[0] === "string"
      ? nonNull[0]
      : undefined;
  }
  const alternatives = value.anyOf ?? value.oneOf;
  if (!Array.isArray(alternatives) || alternatives.length === 0)
    return undefined;
  const resolved = alternatives.map((entry) => parameterType(entry, seen));
  if (
    resolved.some(
      (type, index) =>
        type === undefined &&
        (alternatives[index] as Record<string, unknown>)?.type !== "null",
    )
  )
    return undefined;
  const nonNull = [
    ...new Set(
      resolved.filter((type) => type !== undefined && type !== "null"),
    ),
  ];
  return nonNull.length === 1 ? nonNull[0] : undefined;
}
