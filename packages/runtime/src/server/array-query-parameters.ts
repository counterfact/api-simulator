import type { OpenApiParameters } from "@counterfact/types";
type Schema = Record<string, unknown>;

/** Retain one non-null schema without guessing across unconstrained alternatives. */
function alternatives(
  schema: unknown,
  ancestors = new Set<object>(),
): (Schema | undefined)[] {
  if (schema === false) return [];
  if (typeof schema !== "object" || schema === null || ancestors.has(schema))
    return [undefined];
  const value = schema as Schema;
  const seen = new Set(ancestors).add(schema);
  const union = value.anyOf ?? value.oneOf;
  if (Array.isArray(union))
    return union.flatMap((branch) => alternatives(branch, seen));
  const types = Array.isArray(value.type) ? value.type : [value.type];
  const nonNull = [...new Set(types.filter((type) => type !== "null"))];
  if (nonNull.length === 0) return [];
  return nonNull.length === 1 ? [{ ...value, type: nonNull[0] }] : [undefined];
}

function itemValue(value: string, schema: unknown): unknown {
  const choices = alternatives(schema);
  const type = choices.length === 1 ? choices[0]?.type : undefined;
  if (type === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  if ((type === "integer" || type === "number") && value.trim() !== "") {
    const number = Number(value);
    if (
      Number.isFinite(number) &&
      (type !== "integer" || Number.isInteger(number))
    )
      return number;
  }
  return value;
}

/** Apply declared OpenAPI array serialization before handing query values to routes. */
export function normalizeArrayQueryParameters(
  query: Record<string, unknown>,
  parameters: OpenApiParameters[],
): Record<string, unknown> {
  const result = { ...query };
  for (const parameter of parameters) {
    if (parameter.in !== "query" || !Object.hasOwn(result, parameter.name))
      continue;
    const choices = alternatives(parameter.schema);
    const schema = choices.length === 1 ? choices[0] : undefined;
    if (schema?.type !== "array") continue;
    const style = parameter.style ?? "form";
    if (!["form", "spaceDelimited", "pipeDelimited"].includes(style)) continue;
    const raw = result[parameter.name];
    const values =
      typeof raw === "string"
        ? [raw]
        : Array.isArray(raw) && raw.every((value) => typeof value === "string")
          ? raw
          : undefined;
    if (!values) continue;
    const separator =
      style === "spaceDelimited"
        ? " "
        : style === "pipeDelimited"
          ? "|"
          : parameter.explode === false
            ? ","
            : undefined;
    result[parameter.name] = values
      .flatMap((value) =>
        separator === undefined ? [value] : value.split(separator),
      )
      .map((value) => itemValue(value, schema.items));
  }
  return result;
}
