import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  checkForUpdates,
  isOutdated,
} from "../../src/cli/check-for-updates.js";

describe("isOutdated", () => {
  it("returns false when versions are equal", () => {
    expect(isOutdated("1.2.3", "1.2.3")).toBe(false);
  });

  it("returns true when the latest major version is higher", () => {
    expect(isOutdated("1.2.3", "2.0.0")).toBe(true);
  });

  it("returns true when the latest minor version is higher", () => {
    expect(isOutdated("1.2.3", "1.3.0")).toBe(true);
  });

  it("returns true when the latest patch version is higher", () => {
    expect(isOutdated("1.2.3", "1.2.4")).toBe(true);
  });

  it("returns false when the current major version is higher", () => {
    expect(isOutdated("2.0.0", "1.9.9")).toBe(false);
  });

  it("returns false when the current minor version is higher", () => {
    expect(isOutdated("1.3.0", "1.2.9")).toBe(false);
  });

  it("returns false when the current patch version is higher", () => {
    expect(isOutdated("1.2.4", "1.2.3")).toBe(false);
  });
});

describe("checkForUpdates", () => {
  beforeEach(() => {
    jest.replaceProperty(process, "env", { ...process.env, CI: "" });
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("skips the registry request in CI", async () => {
    process.env["CI"] = "true";

    await expect(checkForUpdates("1.0.0")).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks the registry outside CI", async () => {
    jest
      .mocked(fetch)
      .mockResolvedValue(new Response(JSON.stringify({ version: "1.0.0" })));

    await expect(checkForUpdates("1.0.0")).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "https://registry.npmjs.org/counterfact/latest",
    );
  });

  it("ignores registry connection failures", async () => {
    await expect(checkForUpdates("1.0.0")).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
