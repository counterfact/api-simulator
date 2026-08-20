import { describe, expect, it } from "@jest/globals";

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
  it("does not throw when called", async () => {
    // In the test environment CI=true (set by jest config or environment),
    // so the update check is skipped immediately — no network call is made.
    await expect(checkForUpdates("1.0.0")).resolves.toBeUndefined();
  });
});
