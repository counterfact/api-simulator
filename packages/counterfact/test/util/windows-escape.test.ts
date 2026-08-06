import { describe, expect, it } from "@jest/globals";

import {
  escapePathForWindows,
  unescapePathForWindows,
} from "../../src/util/windows-escape.js";

describe("escapePathForWindows", () => {
  it("leaves a POSIX path unchanged (no colons to replace)", () => {
    expect(escapePathForWindows("/home/user/project")).toBe(
      "/home/user/project",
    );
  });

  it("replaces the drive-letter colon and any additional colons in a Windows path", () => {
    const result = escapePathForWindows("C:\\Users\\foo");
    // Drive-letter part (C:) is preserved; additional colons in the rest are replaced
    expect(result.startsWith("C:")).toBe(true);
    // No regular colon should appear after the first two characters
    expect(result.slice(2)).not.toContain(":");
  });

  it("replaces colons in a non-drive path that still contains colons", () => {
    const path = "relative/path:with:colons";
    const result = escapePathForWindows(path);
    expect(result).not.toContain(":");
  });

  it("returns an empty string unchanged", () => {
    expect(escapePathForWindows("")).toBe("");
  });
});

describe("unescapePathForWindows", () => {
  it("converts the ratio symbol back to colons", () => {
    const escaped = escapePathForWindows("C:\\some\\path");
    const unescaped = unescapePathForWindows(escaped);
    // The drive-letter colon is preserved; the round-trip should restore colons
    expect(unescaped).toContain("C:");
  });

  it("leaves a string with no ratio symbols unchanged", () => {
    expect(unescapePathForWindows("/no/colons/here")).toBe("/no/colons/here");
  });

  it("is the inverse of escapePathForWindows for Windows paths", () => {
    const original = "C:\\Users\\foo\\bar";
    expect(unescapePathForWindows(escapePathForWindows(original))).toBe(
      original,
    );
  });

  it("is the inverse of escapePathForWindows for POSIX paths", () => {
    const original = "/home/user/project";
    expect(unescapePathForWindows(escapePathForWindows(original))).toBe(
      original,
    );
  });
});
