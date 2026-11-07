import { ContextRegistry } from "../../src/server/context-registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { Registry } from "../../src/server/registry.js";
import { parameterType } from "../../src/server/parameter-type.js";

it.each([
  ["integer", "12", 12],
  ["number", "12", 12],
  ["boolean", "true", true],
])(
  "converts nullable %s parameters like plain primitives",
  async (type, text, expected) => {
    for (const schema of [
      { type },
      { anyOf: [{ type }, { type: "null" }] },
      { oneOf: [{ type: "null" }, { type }] },
      { type: [type, "null"] },
    ]) {
      const registry = new Registry();
      registry.add("/value", {
        GET: ($) => ({ status: 200, body: $.query.value }),
      });
      const dispatcher = new Dispatcher(registry, new ContextRegistry(), {
        paths: {
          "/value": {
            get: {
              parameters: [
                {
                  name: "value",
                  in: "query",
                  schema: schema as { type?: string },
                },
              ],
              responses: {},
            },
          },
        },
      });
      const result = await dispatcher.request({
        method: "GET",
        path: "/value",
        headers: {},
        query: { value: text },
        body: undefined,
        req: {},
      });
      expect(result.body).toBe(expected);
    }
  },
);
it("does not guess ambiguous or unconstrained union conversion", () => {
  expect(
    parameterType({ anyOf: [{ type: "number" }, { type: "string" }] }),
  ).toBeUndefined();
  expect(parameterType({ anyOf: [{ type: "integer" }, {}] })).toBeUndefined();
  expect(
    parameterType({ type: ["integer", "string", "null"] }),
  ).toBeUndefined();
});

it("does not recurse indefinitely through a dereferenced union", () => {
  const schema: Record<string, unknown> = {};
  schema.anyOf = [{ type: "integer" }, schema];
  expect(parameterType(schema)).toBeUndefined();
});

it.each([
  { type: ["null"] },
  { oneOf: [{ type: "null" }] },
  { anyOf: [{ type: ["null"] }] },
])("recognizes equivalent null-only alternatives %j", (nullBranch) => {
  expect(parameterType({ anyOf: [{ type: "integer" }, nullBranch] })).toBe(
    "integer",
  );
  expect(parameterType({ oneOf: [{ type: "boolean" }, nullBranch] })).toBe(
    "boolean",
  );
});
