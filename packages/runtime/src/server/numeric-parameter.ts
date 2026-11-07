function isDecimalText(value: string): boolean {
  if (value.trim() !== value) return false;
  const scientific = value.split(/e/iu);
  if (
    scientific.length > 2 ||
    (scientific.length === 2 && !/^[+-]?\d+$/u.test(scientific[1]!))
  )
    return false;
  const mantissa = scientific[0]!;
  const unsigned =
    mantissa.startsWith("+") || mantissa.startsWith("-")
      ? mantissa.slice(1)
      : mantissa;
  const parts = unsigned.split(".");
  return (
    parts.length <= 2 &&
    parts.every((part) => /^\d*$/u.test(part)) &&
    parts.some((part) => part.length > 0)
  );
}

/** Coerce only a complete finite decimal spelling; retain invalid input verbatim. */
export function numericParameterValue<T>(value: T, type: string): T | number {
  if (typeof value !== "string" || !isDecimalText(value)) return value;
  const number = Number(value);
  return Number.isFinite(number) &&
    (type !== "integer" || Number.isInteger(number))
    ? number
    : value;
}
