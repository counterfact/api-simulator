import { resolve } from "node:path";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const root = resolve("first-run-project");
const closed = jest.fn();
const fileClosed = jest.fn(async () => undefined);
const content = Buffer.from(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "API", version: "1" },
    paths: {},
  }),
);
const read = jest.fn(
  async (
    buffer: Buffer,
    offset: number,
    _length: number,
    position: number,
  ) => ({
    buffer,
    bytesRead: position === 0 ? content.copy(buffer, offset) : 0,
  }),
);
const open = jest.fn(async () => ({
  stat: async () => ({ size: content.length, isFile: () => true }),
  read,
  close: fileClosed,
}));
const opendir =
  jest.fn<() => Promise<AsyncIterable<ReturnType<typeof entry>>>>();
jest.unstable_mockModule("node:fs/promises", () => ({
  realpath: jest.fn(async () => root),
  lstat: jest.fn(async () => ({ isDirectory: () => true, isFile: () => true })),
  open,
  opendir,
}));
const { discoverOpenApiSpecs } =
  await import("../../src/cli/discover-openapi.js");

function entry(name: string) {
  return {
    name,
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
  };
}

async function* entries(count: number, extension = "json") {
  try {
    for (let index = 0; index < count; index += 1)
      yield entry(`api-${index}.${extension}`);
  } finally {
    closed();
  }
}

beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("bounded in-process discovery", () => {
  it("caps directory entries even when none are candidate documents", async () => {
    opendir.mockResolvedValue(entries(10_001, "txt"));
    expect(await discoverOpenApiSpecs(root)).toEqual({
      specs: [],
      limited: true,
      unreadable: false,
    });
    expect(open).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("caps candidate reads and skips unreadable files", async () => {
    opendir.mockResolvedValue(entries(1_001));
    // Unreadable files still count toward the candidate budget.
    open.mockRejectedValue(
      Object.assign(new Error("Unreadable"), { code: "EACCES" }),
    );
    expect(await discoverOpenApiSpecs(root)).toEqual({
      specs: [],
      limited: true,
      unreadable: true,
    });
    expect(open).toHaveBeenCalledTimes(1_000);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("stops after cancellation during a read and closes the file and directory", async () => {
    opendir.mockResolvedValue(entries(2));
    const cancellation = new AbortController();
    open.mockResolvedValue({
      stat: async () => ({ size: 0, isFile: () => true }),
      read,
      close: fileClosed,
    });
    read.mockImplementationOnce(async (buffer) => {
      cancellation.abort();
      return { buffer, bytesRead: 0 };
    });
    expect(await discoverOpenApiSpecs(root, cancellation.signal)).toEqual({
      specs: [],
      limited: false,
      unreadable: false,
    });
    expect(fileClosed).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("keeps discovered options when the cooperative time budget expires", async () => {
    const clock = jest.spyOn(performance, "now").mockReturnValue(0);
    open.mockResolvedValue({
      stat: async () => ({ size: content.length, isFile: () => true }),
      read,
      close: fileClosed,
    });
    opendir.mockResolvedValue(
      (async function* () {
        try {
          yield entry("api.json");
          clock.mockReturnValue(15_000);
          yield entry("later.json");
        } finally {
          closed();
        }
      })(),
    );
    expect(await discoverOpenApiSpecs(root)).toEqual({
      specs: ["api.json"],
      limited: true,
      unreadable: false,
    });
    expect(fileClosed).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
