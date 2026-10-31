import { once } from "node:events";

import { watch } from "chokidar";
import { usingTemporaryFiles } from "using-temporary-files";

describe("watching optional paths", () => {
  it("becomes ready for an absent file and reports its later creation", async () => {
    await usingTemporaryFiles(async ($) => {
      const filePath = $.path("_.store.ts");
      const watcher = watch(filePath, {
        backend: "polling",
        depth: 0,
        ignoreInitial: true,
      });

      try {
        // once() rejects on an error event, including misclassified ENOENTs.
        await once(watcher, "ready");
        const added = once(watcher, "add");
        await $.add("_.store.ts", "export class Store {}");
        const [addedPath] = await added;

        expect(addedPath).toBe(filePath);
      } finally {
        await watcher.close();
      }
    });
  });
});
