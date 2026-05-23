import { jest } from "@jest/globals";

import { ModuleTree } from "../../src/server/module-tree.js";

function add(
  moduleTree: ModuleTree,
  url: string,
  name: string,
  method: string = "GET",
) {
  const module: { [key: string]: () => { body: string } } = {};
  module[method] = () => ({ body: name });
  moduleTree.add(url, module);
}

function match(moduleTree: ModuleTree, path: string, method: string = "GET") {
  return moduleTree.match(path, method)?.module[method]?.()?.body;
}

it("returns undefined for /", () => {
  const moduleTree = new ModuleTree();

  expect(match(moduleTree, "/")).toBe(undefined);
});

it("finds a file at the root", () => {
  const moduleTree = new ModuleTree();

  add(moduleTree, "/a", "a");
  expect(match(moduleTree, "/a")).toBe("a");
});

it("finds a file under a subdirectory", () => {
  const moduleTree = new ModuleTree();

  add(moduleTree, "/a", "a");
  add(moduleTree, "/a/b", "b");
  // Should handle differences in case between the path and the module name
  add(moduleTree, "/a/Something", "something");
  expect(match(moduleTree, "/a")).toBe("a");
  expect(match(moduleTree, "/a/b")).toBe("b");
  expect(match(moduleTree, "/a/Something")).toBe("something");
});

it("finds a file with a trailing slash in the path", () => {
  const moduleTree = new ModuleTree();

  add(moduleTree, "/a", "a");
  expect(match(moduleTree, "/a/")).toBe("a");
});

it("finds a file with a wildcard match", () => {
  const moduleTree = new ModuleTree();

  add(moduleTree, "/a", "a");
  add(moduleTree, "/a/{x}", "b", "PUT");
  add(moduleTree, "/a/{y}", "c");
  expect(match(moduleTree, "/a")).toBe("a");
  expect(match(moduleTree, "/a/b", "PUT")).toBe("b");
  expect(match(moduleTree, "/a/c")).toBe("c");
});

it("finds a directory with a wildcard match", () => {
  const moduleTree = new ModuleTree();

  add(moduleTree, "/a", "a");
  add(moduleTree, "/{x}/b", "b");
  add(moduleTree, "/{y}/c", "c");
  expect(match(moduleTree, "/a")).toBe("a");
  expect(match(moduleTree, "/a/b")).toBe("b");
  expect(match(moduleTree, "/a/c")).toBe("c");
});

it("prefers an exact match to a wildcard", () => {
  const moduleTree = new ModuleTree();

  add(moduleTree, "/a", "a");
  add(moduleTree, "/a/b", "exact");
  add(moduleTree, "/a/{x}", "wildcard");
  expect(match(moduleTree, "/a")).toBe("a");
  expect(match(moduleTree, "/a/b")).toBe("exact");
});

it("is case-insensitive", () => {
  const moduleTree = new ModuleTree();

  add(moduleTree, "/a", "a");
  add(moduleTree, "/a/b", "exact");
  add(moduleTree, "/a/{x}", "wildcard");
  expect(match(moduleTree, "/A")).toBe("a");
  expect(match(moduleTree, "/A/B")).toBe("exact");
});

it("captures the path variables", () => {
  const moduleTree = new ModuleTree();

  add(moduleTree, "/a/{foo}/{bar}", "wildcard");
  expect(moduleTree.match("/a/b/c", "GET")?.pathVariables).toEqual({
    bar: "c",
    foo: "b",
  });
});

it("captures the matched path", () => {
  const moduleTree = new ModuleTree();

  add(moduleTree, "/a/b/c", "simple");
  expect(moduleTree.match("/a/b/c", "GET")?.matchedPath).toEqual("/a/b/c");
});

it("captures the matched path with wildcards", () => {
  const moduleTree = new ModuleTree();

  add(moduleTree, "/a/{foo}/{bar}", "wildcard");
  expect(moduleTree.match("/a/b/c", "GET")?.matchedPath).toEqual(
    "/a/{foo}/{bar}",
  );
});

it("removes a module", () => {
  const moduleTree = new ModuleTree();

  add(moduleTree, "/a", "a");
  add(moduleTree, "/a/b", "b");
  add(moduleTree, "/c", "c");
  moduleTree.remove("/a/b");
  moduleTree.remove("/c");
  expect(match(moduleTree, "/a")).toBe("a");
  expect(match(moduleTree, "/a/b")).toBe(undefined);
  expect(match(moduleTree, "/c")).toBe(undefined);
});

it("has all of the routes", () => {
  const moduleTree = new ModuleTree();

  add(moduleTree, "/a", "a");
  add(moduleTree, "/a/b", "b");
  add(moduleTree, "/a/{b}", "b");
  add(moduleTree, "/c", "c");
  expect(moduleTree.routes.map((route) => route.path)).toEqual([
    "/a",
    "/a/b",
    "/a/{b}",
    "/c",
  ]);
});

it("logs an error when multiple wildcard files exist at the same level", () => {
  const moduleTree = new ModuleTree();
  const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation();

  add(moduleTree, "/a/{x}", "x");
  add(moduleTree, "/a/{y}", "y");

  expect(stderrSpy).toHaveBeenCalledWith(
    expect.stringContaining("Ambiguous wildcard paths detected"),
  );
  expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("{x}"));
  expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("{y}"));

  stderrSpy.mockRestore();
});

it("logs an error when multiple wildcard directories exist at the same level", () => {
  const moduleTree = new ModuleTree();
  const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation();

  add(moduleTree, "/{x}/a", "x");
  add(moduleTree, "/{y}/a", "y");

  expect(stderrSpy).toHaveBeenCalledWith(
    expect.stringContaining("Ambiguous wildcard paths detected"),
  );
  expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("{x}"));
  expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("{y}"));

  stderrSpy.mockRestore();
});

it("returns an ambiguous match when multiple wildcard files handle the same method", () => {
  const moduleTree = new ModuleTree();
  const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation();

  add(moduleTree, "/a/{x}", "x");
  add(moduleTree, "/a/{y}", "y");

  const result = moduleTree.match("/a/something", "GET");

  expect(result?.ambiguous).toBe(true);

  stderrSpy.mockRestore();
});

it("does not return an ambiguous match when wildcards handle different methods", () => {
  const moduleTree = new ModuleTree();
  const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation();

  add(moduleTree, "/a/{x}", "x", "PUT");
  add(moduleTree, "/a/{y}", "y", "GET");

  expect(moduleTree.match("/a/something", "PUT")?.ambiguous).toBeUndefined();
  expect(moduleTree.match("/a/something", "GET")?.ambiguous).toBeUndefined();

  stderrSpy.mockRestore();
});

it("returns an ambiguous match when multiple wildcard directories lead to a match", () => {
  const moduleTree = new ModuleTree();
  const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation();

  add(moduleTree, "/{x}/a", "x");
  add(moduleTree, "/{y}/a", "y");

  const result = moduleTree.match("/something/a", "GET");

  expect(result?.ambiguous).toBe(true);

  stderrSpy.mockRestore();
});
