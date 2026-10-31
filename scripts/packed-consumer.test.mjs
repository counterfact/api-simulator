import assert from "node:assert/strict";
import test from "node:test";

import { usingTemporaryFiles } from "using-temporary-files";

import packFiles from "../packages/counterfact/test/package/fixtures/pack-files.json" with { type: "json" };
import { verifyPackedConsumer } from "../packages/counterfact/test/package/counterfact-consumer-smoke.mjs";

test("shared verification rejects an omitted published document", () =>
  usingTemporaryFiles(async ($) => {
    await assert.rejects(
      verifyPackedConsumer({
        consumerDirectory: $.path("."),
        pack: {
          files: packFiles.slice(1).map((path) => ({ path })),
        },
      }),
      { code: "ERR_ASSERTION", operator: "deepStrictEqual" },
    );
  }));
