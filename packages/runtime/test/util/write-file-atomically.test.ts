import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

// Fault injection only: real filesystem tests use usingTemporaryFiles below
// the Transpiler boundary. These mocks model Windows sharing violations on any OS.
const files = new Map<string, string>();
const writeFile = jest.fn<(path: string, contents: string) => Promise<void>>();
const rename = jest.fn<(from: string, to: string) => Promise<void>>();
const rm =
  jest.fn<(path: string, options: { force: boolean }) => Promise<void>>();
const delay = jest.fn<(milliseconds: number) => Promise<void>>();

jest.unstable_mockModule("node:fs/promises", () => ({
  default: { writeFile, rename, rm },
}));
jest.unstable_mockModule("node:timers/promises", () => ({ setTimeout: delay }));

const { writeFileAtomically } =
  await import("../../src/util/write-file-atomically.js");
const platformDescriptor = Object.getOwnPropertyDescriptor(
  process,
  "platform",
)!;
const destination = "cache/_.context.cjs";
const oldContents = "exports.value = 'old';";
const newContents = "exports.value = 'new';";

function sharingError(code: string) {
  return Object.assign(new Error(`rename: ${code}`), { code });
}

beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(process, "platform", { value: "win32" });
  files.clear();
  files.set(destination, oldContents);
  writeFile.mockImplementation(async (path, contents) => {
    files.set(path, contents);
  });
  rename.mockImplementation(async (from, to) => {
    files.set(to, files.get(from)!);
    files.delete(from);
  });
  rm.mockImplementation(async (path) => {
    files.delete(path);
  });
  delay.mockResolvedValue(undefined);
});

afterEach(() => {
  Object.defineProperty(process, "platform", platformDescriptor);
  jest.restoreAllMocks();
});

describe("atomic cache publication", () => {
  it("writes a complete sibling file before replacing the destination", async () => {
    await writeFileAtomically(destination, newContents);

    const temporaryPath = writeFile.mock.calls[0][0];
    expect(temporaryPath).toMatch(/^cache\/_.context\.cjs\.[\da-f-]+\.tmp$/u);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(temporaryPath, newContents);
    expect(rename.mock.calls).toEqual([[temporaryPath, destination]]);
    expect([...files]).toEqual([[destination, newContents]]);
    expect(delay).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
  });

  it.each(["EPERM", "EACCES", "EBUSY"])(
    "retries Windows %s without removing or rewriting either file",
    async (code) => {
      const error = sharingError(code);
      rename.mockRejectedValueOnce(error).mockRejectedValueOnce(error);
      delay.mockImplementation(async () => {
        expect(files.get(destination)).toBe(oldContents);
        expect(files.get(writeFile.mock.calls[0][0])).toBe(newContents);
        expect(writeFile).toHaveBeenCalledTimes(1);
        expect(rm).not.toHaveBeenCalled();
      });

      await writeFileAtomically(destination, newContents);

      const temporaryPath = writeFile.mock.calls[0][0];
      expect(rename.mock.calls).toEqual(
        Array(3).fill([temporaryPath, destination]),
      );
      expect(delay.mock.calls).toEqual([[10], [20]]);
      expect([...files]).toEqual([[destination, newContents]]);
      expect(rm).not.toHaveBeenCalled();
    },
  );

  it("bounds persistent Windows failures and cleans only its temporary file", async () => {
    const error = sharingError("EPERM");
    rename.mockRejectedValue(error);

    await expect(writeFileAtomically(destination, newContents)).rejects.toBe(
      error,
    );

    expect(rename).toHaveBeenCalledTimes(11);
    expect(delay.mock.calls).toEqual(
      [10, 20, 40, 80, 100, 100, 100, 100, 100, 100].map((milliseconds) => [
        milliseconds,
      ]),
    );
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(rm.mock.calls).toEqual([
      [writeFile.mock.calls[0][0], { force: true }],
    ]);
    expect([...files]).toEqual([[destination, oldContents]]);
  });

  it.each(["ENOENT", "EIO", "ENOSPC"])(
    "immediately propagates non-sharing error %s on Windows",
    async (code) => {
      const error = sharingError(code);
      rename.mockRejectedValue(error);

      await expect(writeFileAtomically(destination, newContents)).rejects.toBe(
        error,
      );

      expect(rename).toHaveBeenCalledTimes(1);
      expect(delay).not.toHaveBeenCalled();
      expect([...files]).toEqual([[destination, oldContents]]);
    },
  );

  it.each(["EPERM", "EACCES", "EBUSY"])(
    "does not retry %s on POSIX",
    async (code) => {
      Object.defineProperty(process, "platform", { value: "linux" });
      const error = sharingError(code);
      rename.mockRejectedValue(error);

      await expect(writeFileAtomically(destination, newContents)).rejects.toBe(
        error,
      );

      expect(rename).toHaveBeenCalledTimes(1);
      expect(delay).not.toHaveBeenCalled();
      expect([...files]).toEqual([[destination, oldContents]]);
    },
  );

  it("preserves write failures even when temporary-file cleanup also fails", async () => {
    const error = sharingError("ENOSPC");
    writeFile.mockRejectedValue(error);
    rm.mockRejectedValue(sharingError("EPERM"));

    await expect(writeFileAtomically(destination, newContents)).rejects.toBe(
      error,
    );

    expect(rename).not.toHaveBeenCalled();
    expect(delay).not.toHaveBeenCalled();
    expect(rm.mock.calls).toEqual([
      [writeFile.mock.calls[0][0], { force: true }],
    ]);
    expect([...files]).toEqual([[destination, oldContents]]);
  });

  it.each([null, new Error("unknown failure")])(
    "preserves failures without a filesystem error code: %s",
    async (error) => {
      rename.mockRejectedValue(error);

      await expect(writeFileAtomically(destination, newContents)).rejects.toBe(
        error,
      );

      expect(rename).toHaveBeenCalledTimes(1);
      expect(delay).not.toHaveBeenCalled();
      expect([...files]).toEqual([[destination, oldContents]]);
    },
  );
});
