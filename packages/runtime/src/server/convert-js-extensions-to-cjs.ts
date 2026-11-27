import { extname } from "node:path";

export function convertFileExtensionsToCjs(
  code: string,
  isExtensionlessSource: (path: string) => boolean = () => false,
) {
  // Match require('...') or require("...") where the path starts with .
  // Replace JavaScript/TypeScript extensions (or no extension) with .cjs
  return code.replace(
    // eslint-disable-next-line regexp/prefer-named-capture-group
    /require\((['"])(\.[^'"]*?)(\.[cm]?[jt]s)?\1\)/g,
    (match, quote, path, extension) =>
      extension !== undefined ||
      extname(path) === "" ||
      isExtensionlessSource(path)
        ? `require(${quote}${path}.cjs${quote})`
        : match,
  );
}
