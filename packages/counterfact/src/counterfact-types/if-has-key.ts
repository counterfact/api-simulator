/**
 * Conditional type that resolves to `Yes` when `SomeObject` has at least one
 * key that contains any string from `Keys` as a substring, and `No` otherwise.
 * Used to determine whether a shortcut method (e.g. `.json()`, `.html()`)
 * should be present on the response builder for a given response type.
 */
export type IfHasKey<
  SomeObject,
  Keys extends readonly string[],
  Yes,
  No,
> = Keys extends [
  infer FirstKey extends string,
  ...infer RestKeys extends string[],
]
  ? Extract<keyof SomeObject, `${string}${FirstKey}${string}`> extends never
    ? IfHasKey<SomeObject, RestKeys, Yes, No>
    : Yes
  : No;
