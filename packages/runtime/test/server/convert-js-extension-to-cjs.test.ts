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
