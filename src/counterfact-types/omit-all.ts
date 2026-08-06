/**
 * Removes all keys from `T` whose names contain any of the strings in `K`
 * as a substring (prefix, suffix, or exact match).
 * Used internally to narrow the set of available content-type methods on the
 * response builder after one has already been called.
 */
export type OmitAll<T, K extends readonly string[]> = {
  [P in keyof T as P extends `${string}${K[number]}${string}`
    ? never
    : P]: T[P];
};
