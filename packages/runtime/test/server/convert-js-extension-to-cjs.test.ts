import { convertFileExtensionsToCjs } from "../../src/server/convert-js-extensions-to-cjs.js";

describe("convertFileExtensionsToCjs", () => {
  it.each(["./foo.js", "./foo.ts", "./foo"])(
    "converts %s a local require",
    (path) => {
      expect(convertFileExtensionsToCjs(`require("${path}");`)).toEqual(
        'require("./foo.cjs");',
      );
    },
  );

  it.each(["../foo.js", "../foo.ts", "../foo"])(
    "converts %s a local require",
    (path) => {
      expect(convertFileExtensionsToCjs(`require("${path}");`)).toEqual(
        'require("../foo.cjs");',
      );
    },
  );

  it("does not convert a non-local require", () => {
    expect(convertFileExtensionsToCjs('require("foo/bar.js");')).toEqual(
      'require("foo/bar.js");',
    );
  });
});

it.each(["cjs", "cts", "mjs", "mts"])(
  "maps explicit .%s imports to one cached .cjs suffix",
  (extension) => {
    expect(convertFileExtensionsToCjs(`require("./helper.${extension}")`)).toBe(
      'require("./helper.cjs")',
    );
  },
);

it.each(["json", "node", "yaml"])(
  "leaves non-code .%s imports unchanged",
  (extension) => {
    const source = `require("./data.${extension}")`;
    expect(convertFileExtensionsToCjs(source)).toBe(source);
  },
);

it("preserves dots in local module basenames when rewriting the suffix", () => {
  expect(convertFileExtensionsToCjs('require("./helper.v1.js")')).toBe(
    'require("./helper.v1.cjs")',
  );
});

it("rewrites dotted extensionless specifiers when they resolve to source files", () => {
  expect(convertFileExtensionsToCjs('require("./my.helper")', () => true)).toBe(
    'require("./my.helper.cjs")',
  );
});
