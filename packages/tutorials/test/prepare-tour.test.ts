import { expect, it } from "@jest/globals";
import { check } from "prettier";
import { usingTemporaryFiles } from "using-temporary-files";

import { findTourDirectory, prepareTour } from "../src/index.js";

it("creates a restartable offline shop without touching an existing project", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("counterfact-demo/keep.txt", "user edits");
    await $.add("counterfact-demo-2", "an existing file");
    const directory = await findTourDirectory($.path("."));
    expect(directory).toBe("counterfact-demo-3");
    expect(await prepareTour($.path("."), directory)).toEqual({
      source: $.path(`${directory}/openapi.json`),
      destination: $.path(directory),
      walkthroughPath: "/walkthrough",
    });
    expect(await $.read("counterfact-demo/keep.txt")).toBe("user edits");
    const spec = JSON.parse(await $.read(`${directory}/openapi.json`));
    expect(spec.paths["/products"].get.responses["200"]).toBeDefined();
    expect(spec.paths["/orders"].post.responses["503"]).toBeDefined();
    await expect(
      $.read(`${directory}/routes/_.context.ts`),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      $.read(`${directory}/routes/products.ts`),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect($.read(`${directory}/routes/orders.ts`)).rejects.toMatchObject(
      { code: "ENOENT" },
    );
    await expect(
      $.read(`${directory}/scenarios/index.ts`),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await $.read(`${directory}/routes/walkthrough.ts`)).toContain(
      "Counterfact Coffee",
    );
    for (const file of [
      "routes/tutorial-info.ts",
      "routes/tutorial-check.ts",
      "routes/tutorial-event.ts",
      "routes/walkthrough.ts",
    ]) {
      expect(
        await check(await $.read(`${directory}/${file}`), {
          parser: "typescript",
        }),
      ).toBe(true);
    }
    await expect(prepareTour($.path("."), directory)).rejects.toMatchObject({
      code: "EEXIST",
    });
  });
});

it("rejects an unknown tour before creating its directory", async () => {
  await usingTemporaryFiles(async ($) => {
    await expect(
      prepareTour($.path("."), "example", "missing"),
    ).rejects.toThrow("Unknown tour: missing");
    // A rejected request must leave this name available for a valid tour.
    await expect(
      prepareTour($.path("."), "example", "coffee-shop"),
    ).resolves.toHaveProperty("walkthroughPath", "/walkthrough");
  });
});
