import { describe, expect, it } from "@jest/globals";

import { canRunIntro } from "../../src/cli/intro.js";

describe("canRunIntro", () => {
  it.each([undefined, "", "false", "0"])(
    "allows an interactive terminal with CI=%p",
    (ci) => {
      expect(canRunIntro(true, true, ci)).toBe(true);
    },
  );

  it.each([
    [undefined, true, undefined],
    [true, undefined, undefined],
    [false, true, undefined],
    [true, false, undefined],
    [true, true, "true"],
    [true, true, "1"],
  ] as const)(
    "skips prompts for stdin=%p, stdout=%p, CI=%p",
    (input, output, ci) => {
      expect(canRunIntro(input, output, ci)).toBe(false);
    },
  );
});
