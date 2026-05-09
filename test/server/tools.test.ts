import { describe, expect, it } from "@jest/globals";

import { Tools } from "../../src/server/tools.ts";

describe("tools", () => {
  it("oneOf()", () => {
    const tools = new Tools();

    expect(["A", "B", "C"]).toContain(tools.oneOf(["A", "B", "C"]));
  });

  it.each`
    contentType           | acceptHeader
    ${"what/ever"}        | ${undefined}
    ${"text/html"}        | ${"text/html"}
    ${"text/html"}        | ${"text/*"}
    ${"application/json"} | ${"*/json"}
    ${"text/*"}           | ${"text/*"}
    ${"application/json"} | ${"text/html, application/json"}
  `(
    "accept('$contentType') returns true when the accept header is $acceptHeader",
    ({ acceptHeader, contentType }) => {
      const tools = new Tools({ headers: { Accept: acceptHeader } });

      expect(tools.accepts(contentType)).toBe(true);
    },
  );

  it.each`
    contentType           | acceptHeader
    ${"application/json"} | ${"text/*"}
    ${"text/html"}        | ${"text/plain"}
    ${"application/json"} | ${"text/json"}
  `(
    "accept('$contentType') returns false when the accept header is $acceptHeader",
    ({ acceptHeader, contentType }) => {
      const tools = new Tools({ headers: { Accept: acceptHeader } });

      expect(tools.accepts(contentType)).toBe(false);
    },
  );

  it("accepts('application/json') returns false when lowercase 'accept' header is 'text/plain'", () => {
    const tools = new Tools({ headers: { accept: "text/plain" } });

    expect(tools.accepts("application/json")).toBe(false);
  });

  it("randomFromSchema() returns a value (the implementation is in a third party library)", async () => {
    const tools = new Tools();

    expect(typeof (await tools.randomFromSchema({ type: "integer" }))).toBe(
      "number",
    );
  });

  it("randomFromSchema() uses examples", async () => {
    const tools = new Tools();

    expect(
      await tools.randomFromSchema({ examples: [5], type: "integer" }),
    ).toBe(5);
  });

  it("randomFromSchema() supports prefixItems tuples", async () => {
    const tools = new Tools();
    const value = await tools.randomFromSchema({
      items: false,
      maxItems: 2,
      minItems: 2,
      prefixItems: [{ type: "string" }, { type: "integer" }],
      type: "array",
    });

    expect(Array.isArray(value)).toBe(true);
    expect(value).toHaveLength(2);
    expect(typeof value[0]).toBe("string");
    expect(typeof value[1]).toBe("number");
  });

  it("randomFromSchema() supports unevaluatedProperties: false", async () => {
    const tools = new Tools();
    const value = (await tools.randomFromSchema({
      properties: {
        only: { type: "string" },
      },
      required: ["only"],
      type: "object",
      unevaluatedProperties: false,
    })) as Record<string, unknown>;

    expect(Object.keys(value)).toStrictEqual(["only"]);
  });

  it("randomFromSchema() supports unevaluatedItems: false", async () => {
    const tools = new Tools();
    const value = await tools.randomFromSchema({
      maxItems: 2,
      minItems: 2,
      prefixItems: [{ type: "string" }, { type: "integer" }],
      type: "array",
      unevaluatedItems: false,
    });

    expect(Array.isArray(value)).toBe(true);
    expect(value).toHaveLength(2);
    expect(typeof value[0]).toBe("string");
    expect(typeof value[1]).toBe("number");
  });
});
