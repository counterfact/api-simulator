/** How schemas that list their member names (`x-enumNames`) are declared. */
export type EnumStyle = "const" | "enum" | "union";

export const ENUM_STYLES: readonly EnumStyle[] = ["union", "enum", "const"];

/**
 * Options that change how schema types are declared. They apply to
 * `types/`, so they also shape the generated client's data contracts.
 * The defaults reproduce the standard output.
 */
export interface SchemaTypeOptions {
  /**
   * `union` (default) declares a union of the values. `enum` declares a
   * TypeScript enum and `const` an object of values plus a union type, both
   * named from `x-enumNames` (or `x-enum-varnames`). Enums without member
   * names remain unions.
   */
  enumStyle?: EnumStyle;
  /** Omit `| null` for nullable schemas. */
  ignoreNullable?: boolean;
  /** Declare named object schemas as interfaces instead of type aliases. */
  preferInterfaces?: boolean;
  /** Document length, range, pattern, and item constraints in JSDoc. */
  validationJsDoc?: boolean;
}
