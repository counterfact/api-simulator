import { expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";

import { findDemoDirectory, prepareDemo } from "../../src/cli/tutorial.js";

it("creates a restartable offline shop without touching an existing project", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("counterfact-demo/keep.txt", "user edits");
    await $.add("counterfact-demo-2", "an existing file");
    const directory = await findDemoDirectory($.path("."));
    expect(directory).toBe("counterfact-demo-3");
    await prepareDemo($.path("."), directory);
    expect(await $.read("counterfact-demo/keep.txt")).toBe("user edits");
    const spec = JSON.parse(await $.read(`${directory}/openapi.json`));
    expect(spec.paths["/products"].get.responses["200"]).toBeDefined();
    expect(spec.paths["/orders"].post.responses["503"]).toBeDefined();
    expect(await $.read(`${directory}/routes/_.context.ts`)).toContain(
      "inventory",
    );
    expect(await $.read(`${directory}/scenarios/index.ts`)).toContain(
      '"dark-roast": 3',
    );
    expect(await $.read(`${directory}/routes/walkthrough.ts`)).toContain(
      "Counterfact Coffee",
    );
    await expect(prepareDemo($.path("."), directory)).rejects.toMatchObject({
      code: "EEXIST",
    });
  });
});
