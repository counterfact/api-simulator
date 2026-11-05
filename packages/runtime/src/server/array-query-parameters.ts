import type { OpenApiParameters } from "@counterfact/types";
type Schema = Record<string, unknown>;
type Choice = { constraints: Schema[]; type: string | undefined };

/** Union branches retain enclosing constraints; allOf constraints apply together. */
function alternatives(
  schema: unknown,
  ancestors = new Set<object>(),
): Schema[][] {
  if (schema === false) return [];
  if (
    typeof schema !== "object" ||
    schema === null ||
    Array.isArray(schema) ||
    ancestors.has(schema)
  )
    return [[]];
  const value = schema as Schema;
  const seen = new Set(ancestors).add(schema);
  const combine = (left: Schema[][], right: Schema[][]) =>
    left.flatMap((a) => right.map((b) => [...a, ...b]));
  let result: Schema[][] = [[value]];
  if (Array.isArray(value.allOf))
    for (const branch of value.allOf)
      result = combine(result, alternatives(branch, seen));
  for (const keyword of ["anyOf", "oneOf"]) {
    const union = value[keyword];
    if (Array.isArray(union))
      result = combine(
        result,
        union.flatMap((branch) => alternatives(branch, seen)),
      );
  }
  return result;
}

function choices(schema: unknown): Choice[] {
  return alternatives(schema).flatMap((constraints) => {
    let possible: Set<string> | undefined;
    for (const constraint of constraints) {
      if (constraint.type === undefined) continue;
      const declared = Array.isArray(constraint.type)
        ? constraint.type
        : [constraint.type];
      const types = new Set(
        declared.filter(
          (type): type is string => typeof type === "string" && type !== "null",
        ),
      );
      if (types.has("number")) types.add("integer");
      possible =
        possible === undefined
          ? types
          : new Set([...possible].filter((type) => types.has(type)));
    }
    if (possible?.size === 0) return [];
    return [
      {
        constraints,
        type:
          possible?.has("number") &&
          possible.size === 2 &&
          possible.has("integer")
            ? "number"
            : possible?.size === 1
              ? [...possible][0]
              : undefined,
      },
    ];
  });
}

function commonType(options: Choice[]): string | undefined {
  const type = options[0]?.type;
  return type !== undefined && options.every((option) => option.type === type)
    ? type
    : undefined;
}

function isDecimalText(value: string): boolean {
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

function itemValue(value: string, index: number, arrays: Choice[]): unknown {
  const itemChoices = arrays.flatMap(({ constraints }) => {
    const schemas = constraints.flatMap((schema) => {
      const prefix = schema.prefixItems;
      const item =
        Array.isArray(prefix) && index < prefix.length
          ? prefix[index]
          : Array.isArray(schema.items)
            ? schema.items[index]
            : schema.items;
      return item === undefined ? [] : [item];
    });
    return choices({ allOf: schemas });
  });
  const type = commonType(itemChoices);
  if (type === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  // Decimal text only: Number() also accepts radix forms, whitespace and Infinity.
  if ((type === "integer" || type === "number") && isDecimalText(value)) {
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
    const arrays = choices(parameter.schema);
    if (commonType(arrays) !== "array") continue;
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
      parameter.explode === true
        ? undefined
        : style === "spaceDelimited"
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
      .map((value, index) => itemValue(value, index, arrays));
  }
  return result;
}
