export function convertFileExtensionsToCjs(code: string) {
  // Match require('...') or require("...") where the path starts with .
  // Replace .js or .ts extensions (or no extension) with .cjs
  return code.replace(
    // eslint-disable-next-line regexp/prefer-named-capture-group
    /require\((['"])(\.[^'"]*?)(\.(?:js|ts))?\1\)/g,
    (match, quote, path) => `require(${quote}${path}.cjs${quote})`,
  );
}
