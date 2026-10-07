/* eslint-disable jest/no-conditional-in-test -- filesystem mocks dispatch by path; assertions do not branch. */
import { resolve } from "node:path";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const lstat = jest.fn<(path: string) => Promise<ReturnType<typeof metadata>>>();
const opendir =
  jest.fn<(path: string) => Promise<AsyncIterable<ReturnType<typeof entry>>>>();
const open =
  jest.fn<(path: string, flags: number) => Promise<ReturnType<typeof file>>>();

jest.unstable_mockModule("node:fs/promises", () => ({ lstat, opendir, open }));
const { scanWorkingDirectory } =
  await import("../../src/cli/discover-openapi-worker.js");

function metadata(ino: bigint, directory = false) {
  return {
    dev: 1n,
    ino,
    size: 100n,
    isDirectory: () => directory,
    isFile: () => !directory,
  };
}

function entry(name: string, directory = false) {
  return {
    name,
    isDirectory: () => directory,
    isFile: () => !directory,
    isSymbolicLink: () => false,
  };
}

async function* children(...entries: ReturnType<typeof entry>[]) {
  yield* entries;
}

function file(ino = 3n) {
  const content = Buffer.from(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Inside", version: "1" },
      paths: {},
    }),
  );
  return {
    stat: jest.fn(async () => metadata(ino)),
    read: jest.fn(
      async (
        buffer: Buffer,
        offset: number,
        _length: number,
        position: number,
      ) => {
        const bytesRead = position === 0 ? content.copy(buffer, offset) : 0;
        return { bytesRead, buffer };
      },
    ),
    close: jest.fn(async () => undefined),
  };
}

const rootIdentity = { dev: "1", ino: "1" };
const root = resolve("first-run-fixture-root");
let cwd: string;

beforeEach(() => {
  jest.clearAllMocks();
  cwd = root;
  jest.spyOn(process, "cwd").mockImplementation(() => cwd);
  jest.spyOn(process, "chdir").mockImplementation((path) => {
    cwd = path;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("directory identity and pinned reads", () => {
  it("rejects a queued directory replaced before chdir, without enumerating it", async () => {
    lstat.mockImplementation(async (path) => {
      if (path === "queued") return metadata(2n, true);
      return metadata(cwd === root ? 1n : 99n, true);
    });
    opendir.mockResolvedValue(children(entry("queued", true)));
    expect(await scanWorkingDirectory(rootIdentity)).toEqual({
      specs: [],
      limited: false,
      unreadable: true,
    });
    expect(opendir).toHaveBeenCalledTimes(1);
    expect(opendir).toHaveBeenCalledWith(".");
    expect(open).not.toHaveBeenCalled();
  });

  it("enumerates and reads direct cwd children after a directory pathname replacement", async () => {
    // The kernel's cwd stays pinned when /root/queued is renamed and its old
    // pathname becomes an outside symlink. A path-based lookup would escape.
    let replaced = false;
    lstat.mockImplementation(async (path) => {
      if (path === "queued") return metadata(2n, true);
      if (path === ".") return metadata(cwd === root ? 1n : 2n, true);
      if (path === "inside.json") return metadata(3n);
      throw new Error(`Unexpected path lookup: ${path}`);
    });
    opendir.mockImplementation(async (path) => {
      if (cwd === root) return children(entry("queued", true));
      replaced = true;
      return path === "."
        ? children(entry("inside.json"))
        : children(entry("escaped.json"));
    });
    const handle = file();
    open.mockImplementation(async (path) => {
      if (path !== "inside.json" || !replaced) throw new Error("Unpinned read");
      return handle;
    });
    const result = await scanWorkingDirectory(rootIdentity);
    expect(result.specs.map((path) => path.replaceAll("\\", "/"))).toEqual([
      "queued/inside.json",
    ]);
    expect(result.unreadable).toBe(false);
    expect(opendir.mock.calls.map(([path]) => path)).toEqual([".", "."]);
    expect(handle.close).toHaveBeenCalledTimes(1);
  });

  it("rejects a leaf swapped between lstat and open before reading its contents", async () => {
    lstat.mockImplementation(async (path) =>
      metadata(path === "." ? 1n : 3n, path === "."),
    );
    opendir.mockResolvedValue(children(entry("api.json")));
    const handle = file(99n);
    open.mockResolvedValue(handle);
    expect(await scanWorkingDirectory(rootIdentity)).toEqual({
      specs: [],
      limited: false,
      unreadable: true,
    });
    expect(handle.read).not.toHaveBeenCalled();
    expect(handle.close).toHaveBeenCalledTimes(1);
  });

  it("rejects a replaced starting directory before any enumeration", async () => {
    lstat.mockResolvedValue(metadata(99n, true));
    expect((await scanWorkingDirectory(rootIdentity)).unreadable).toBe(true);
    expect(opendir).not.toHaveBeenCalled();
  });
});
