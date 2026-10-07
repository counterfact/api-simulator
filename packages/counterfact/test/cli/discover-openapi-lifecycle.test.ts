import { EventEmitter } from "node:events";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const worker = new EventEmitter();
const kill = jest.fn();
Object.assign(worker, { kill });
const fork = jest.fn(() => worker);
jest.unstable_mockModule("node:child_process", () => ({ fork }));
jest.unstable_mockModule("node:fs/promises", () => ({
  stat: jest.fn(async () => ({ dev: 1n, ino: 2n, isDirectory: () => true })),
  realpath: jest.fn(async () => "/root"),
  lstat: jest.fn(),
  open: jest.fn(),
  opendir: jest.fn(),
}));
const { discoverOpenApiSpecs } =
  await import("../../src/cli/discover-openapi.js");

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  worker.removeAllListeners();
});

afterEach(() => {
  jest.useRealTimers();
});

async function start(signal?: AbortSignal) {
  const result = discoverOpenApiSpecs("/root", signal);
  await jest.advanceTimersByTimeAsync(0);
  return { result };
}

describe("discovery worker lifecycle", () => {
  it("returns results and stops the worker exactly once", async () => {
    const { result } = await start();
    const discovered = {
      specs: ["api.json"],
      limited: false,
      unreadable: false,
    };
    worker.emit("message", discovered);
    worker.emit("exit", null);
    expect(await result).toEqual(discovered);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("kills an active scan on cancellation without a warning", async () => {
    const cancellation = new AbortController();
    const { result } = await start(cancellation.signal);
    cancellation.abort();
    expect(await result).toEqual({
      specs: [],
      limited: false,
      unreadable: false,
    });
    expect(kill).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("bounds a stalled scan and cleans up the worker", async () => {
    const { result } = await start();
    await jest.advanceTimersByTimeAsync(15_000);
    expect(await result).toEqual({
      specs: [],
      limited: true,
      unreadable: false,
    });
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it.each(["error", "exit"])(
    "handles worker %s without rejecting the intro",
    async (event) => {
      const { result } = await start();
      worker.emit(event, new Error("worker unavailable"));
      expect(await result).toEqual({
        specs: [],
        limited: false,
        unreadable: true,
      });
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it("rejects malformed worker output", async () => {
    const { result } = await start();
    worker.emit("message", { specs: [123], limited: false, unreadable: false });
    expect(await result).toEqual({
      specs: [],
      limited: false,
      unreadable: true,
    });
    expect(kill).toHaveBeenCalledTimes(1);
  });
});
