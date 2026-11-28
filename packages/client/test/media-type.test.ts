import { expect, it } from "@jest/globals";

import { matchMediaType } from "../src/media-type.js";

it("selects the most specific declaration without changing its original spelling", () => {
  const general = "application/json";
  const utf8 = 'application/json; CHARSET="UTF-8"';
  const versioned = 'application/json; charset=utf-8; profile="A;B"';
  const declarations = [general, utf8, versioned];
  expect(
    matchMediaType(
      declarations,
      'Application/JSON; Charset=UTF-8; profile="A;B"',
    ),
  ).toBe(versioned);
  expect(
    matchMediaType(
      declarations,
      'application/json; charset=utf-8; profile="a;b"',
    ),
  ).toBe(utf8);
  expect(matchMediaType(declarations, "application/json; charset=latin1")).toBe(
    general,
  );
  expect(matchMediaType(declarations, "text/plain")).toBeUndefined();
  expect(matchMediaType(declarations, null)).toBeUndefined();
});
