import { isProxyEnabledForPath } from "../../src/server/is-proxy-enabled-for-path.js";

describe("isProxyEnabledForPath()", () => {
  it.each([
    ["/", true],
    ["/enabled", true],
    ["/enabled/sub/path", true],
    ["/disabled", false],
    ["/disabled/sub/path", false],
    ["/unset", true],
    ["/unset/sub/path", true],
  ])("given path '%s', returns %s", (path, expected) => {
    expect(
      isProxyEnabledForPath(path, {
        proxyPaths: new Map([
          ["", true],
          ["/disabled", false],
          ["/enabled", true],
        ]),
      }),
    ).toBe(expected);
  });

  it.each([
    ["/", false],
    ["/enabled", true],
    ["/enabled/sub/path", true],
    ["/disabled", false],
    ["/disabled/sub/path", false],
    ["/unset", false],
    ["/unset/sub/path", false],
  ])("given path '%s', returns %s", (path, expected) => {
    expect(
      isProxyEnabledForPath(path, {
        proxyPaths: new Map([
          ["", false],
          ["/disabled", false],
          ["/enabled", true],
        ]),
      }),
    ).toBe(expected);
  });
});
