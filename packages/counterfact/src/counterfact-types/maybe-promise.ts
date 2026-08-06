/**
 * A value that is either `T` directly or a `Promise<T>`.
 * Route handlers may return either synchronous values or promises, and
 * Counterfact will await them transparently.
 */
export type MaybePromise<T> = T | Promise<T>;
