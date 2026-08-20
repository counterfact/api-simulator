import { describe, expect, it } from "@jest/globals";

import {
  toForwardSlashPath,
  pathJoin,
  pathRelative,
  pathDirname,
  pathResolve,
  type ForwardSlashPath,
} from "../../src/util/forward-slash-path.js";

describe("toForwardSlashPath", () => {
  it("returns the same string when there are no backslashes", () => {
    expect(toForwardSlashPath("/foo/bar/baz")).toBe("/foo/bar/baz");
  });

  it("replaces backslashes with forward slashes", () => {
    expect(toForwardSlashPath("C:\\Users\\foo\\bar")).toBe("C:/Users/foo/bar");
  });

  it("replaces all backslashes in the string", () => {
    expect(toForwardSlashPath("a\\b\\c\\d")).toBe("a/b/c/d");
  });

  it("returns an empty string unchanged", () => {
    expect(toForwardSlashPath("")).toBe("");
  });

  it("returns a ForwardSlashPath branded type", () => {
    const result = toForwardSlashPath("a\\b");
    // The branded type is assignable to string
    const _check: ForwardSlashPath = result;
    expect(typeof result).toBe("string");
  });
});

describe("pathJoin", () => {
  it("joins path segments with forward slashes", () => {
    expect(pathJoin("foo", "bar", "baz")).toBe("foo/bar/baz");
  });

  it("normalises multiple slashes", () => {
    expect(pathJoin("foo//", "bar")).toBe("foo/bar");
  });

  it("returns a ForwardSlashPath branded type", () => {
    const result = pathJoin("a", "b");
    const _check: ForwardSlashPath = result;
    expect(typeof result).toBe("string");
  });
});

describe("pathRelative", () => {
  it("returns the relative path between two absolute paths", () => {
    const result = pathRelative("/home/user/project", "/home/user/project/src");
    expect(result).toBe("src");
  });

  it("returns a ForwardSlashPath branded type", () => {
    const result = pathRelative("/a", "/b");
    const _check: ForwardSlashPath = result;
    expect(typeof result).toBe("string");
  });
});

describe("pathDirname", () => {
  it("returns the directory portion of a path", () => {
    expect(pathDirname("/foo/bar/baz.ts")).toBe("/foo/bar");
  });

  it("returns a ForwardSlashPath branded type", () => {
    const result = pathDirname("/a/b.ts");
    const _check: ForwardSlashPath = result;
    expect(typeof result).toBe("string");
  });
});

describe("pathResolve", () => {
  it("returns a ForwardSlashPath branded type", () => {
    const result = pathResolve("/a", "b");
    const _check: ForwardSlashPath = result;
    expect(typeof result).toBe("string");
  });
});
