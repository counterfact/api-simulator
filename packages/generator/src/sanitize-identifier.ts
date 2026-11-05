import { RESERVED_WORDS } from "./reserved-words.js";

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#reserved_words

export function sanitizeIdentifier(value: string): string {
  // Treat any run of non-identifier characters as a camelCase separator
  let result = value.replaceAll(/[^\w$]+(?<next>.)/gu, (_, char: string) =>
    char.toUpperCase(),
  );

  // Strip any trailing non-identifier characters (no following char to capitalize)
  result = result.replaceAll(/[^\w$]/gu, "");

  // If the identifier starts with a digit, prefix with an underscore
  if (/^\d/u.test(result)) {
    result = `_${result}`;
  }

  // If the identifier is a reserved word, append an underscore
  if (RESERVED_WORDS.has(result)) {
    result = `${result}_`;
  }

  return result || "_";
}
