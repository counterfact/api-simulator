import { runtimeCanExecuteErasableTs } from "../../src/util/runtime-can-execute-erasable-ts.js";

describe("runtimeCanExecuteErasableTs", () => {
  it("returns true when the current runtime can natively execute TypeScript with erasable type annotations", async () => {
    // This test suite runs under tsx/ts-node, so the probe should succeed
    await expect(runtimeCanExecuteErasableTs()).resolves.toBe(true);
  });
});
