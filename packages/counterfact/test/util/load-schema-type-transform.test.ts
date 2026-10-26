import { describe, expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";

import { loadSchemaTypeTransform } from "../../src/util/load-schema-type-transform.js";

describe("loadSchemaTypeTransform", () => {
  it("leaves generation unchanged when the setting is absent", async () => {
    expect(
      await loadSchemaTypeTransform(undefined, "counterfact.yaml"),
    ).toBeUndefined();
  });

  it.each([true, null, "", "   ", {}])(
    "rejects an invalid module path %j",
    async (value) => {
      await expect(
        loadSchemaTypeTransform(value, "counterfact.yaml"),
      ).rejects.toThrow("must be a nonempty JavaScript module path");
    },
  );

  it("resolves an ES module relative to a config path containing spaces and a hash", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "settings # one/transform.mjs",
        "export default function transform(_schema, type) { return type; }",
      );
      const transform = await loadSchemaTypeTransform(
        "./transform.mjs",
        $.path("settings # one/counterfact.yaml"),
      );
      expect(typeof transform).toBe("function");
    });
  });

  it("accepts a CommonJS callback module", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "transform.cjs",
        "module.exports = function transform(_schema, type) { return type; };",
      );
      expect(
        typeof (await loadSchemaTypeTransform(
          "./transform.cjs",
          $.path("counterfact.yaml"),
        )),
      ).toBe("function");
    });
  });

  it("reports a missing module", async () => {
    await usingTemporaryFiles(async ($) => {
      await expect(
        loadSchemaTypeTransform("./missing.mjs", $.path("counterfact.yaml")),
      ).rejects.toThrow("Could not load schema type transform");
    });
  });

  it("rejects a module that does not default-export a function", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "transform.mjs",
        "export default { schemaTypeTransform: true };",
      );
      await expect(
        loadSchemaTypeTransform("./transform.mjs", $.path("counterfact.yaml")),
      ).rejects.toThrow("must default-export a function");
    });
  });
});
