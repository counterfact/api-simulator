/**
 * Creates a new type from `Base` that omits any keys whose value type is
 * `never`. This is used to strip unavailable builder methods (those that
 * don't apply to the current response shape) from the fluent response builder.
 */
export type OmitValueWhenNever<Base> = Pick<
  Base,
  {
    [Key in keyof Base]: [Base[Key]] extends [never] ? never : Key;
  }[keyof Base]
>;
