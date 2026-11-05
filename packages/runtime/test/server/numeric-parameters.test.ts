import type { OpenApiParameters } from "@counterfact/types";
import { ContextRegistry } from "../../src/server/context-registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { Registry } from "../../src/server/registry.js";

const schemas = (type: string) => [
  { type },
  { anyOf: [{ type }, { type: "null" }] },
  { oneOf: [{ type: "null" }, { type }] },
  { type: [type, "null"] },
];
function probe(schema: unknown, validateRequests = true, legacyType?: string) {
  const registry = new Registry();
  let entries = 0;
  registry.add("/probe", {
    POST: ($) => {
      entries++;
      return { status: 200, body: $.query.count };
    },
  });
  const dispatcher = new Dispatcher(
    registry,
    new ContextRegistry(),
    {
      paths: {
        "/probe": {
          post: {
            parameters: [
              {
                name: "count",
                in: "query",
                schema,
                type: legacyType,
              } as OpenApiParameters,
            ],
            responses: {},
          },
        },
      },
    },
    { validateRequests },
  );
  return {
    entries: () => entries,
    send: (count: string) =>
      dispatcher.request({
        method: "POST",
        path: "/probe",
        headers: {},
        query: { count },
        req: {},
      }),
  };
}

it.each(["integer", "number"])(
  "rejects malformed scalar and nullable %s query text before mutation",
  async (type) => {
    for (const schema of schemas(type)) {
      const runtime = probe(schema);
      for (const value of [
        "3600junk",
        "12.5tail",
        "",
        " ",
        " 12",
        "12 ",
        "12\n",
        "12\r",
        "0x10",
        "Infinity",
        "NaN",
        "1e309",
        "1e",
        ".",
        "--1",
      ]) {
        expect((await runtime.send(value)).status).toBe(400);
        expect(runtime.entries()).toBe(0);
      }
    }
  },
);

it.each(["integer", "number"])(
  "retains complete finite decimal and exponent conversion for %s",
  async (type) => {
    for (const schema of schemas(type)) {
      const runtime = probe(schema);
      for (const [text, expected] of [
        ["3600", 3600],
        ["-12", -12],
        ["+12", 12],
        ["1e3", 1000],
        ["2.0", 2],
      ] as const) {
        const result = await runtime.send(text);
        expect(result.status).toBe(200);
        expect(result.body).toBe(expected);
      }
      expect(runtime.entries()).toBe(5);
    }
  },
);

it("does not truncate fractional integers, including with validation disabled", async () => {
  const validated = probe({ type: "integer" });
  expect((await validated.send("1.5")).status).toBe(400);
  expect(validated.entries()).toBe(0);
  const unchecked = probe({ type: "integer" }, false);
  expect((await unchecked.send("1.5")).body).toBe("1.5");
});
it("accepts complete fractional numbers", async () => {
  const runtime = probe({ type: "number" });
  for (const [text, value] of [
    ["1.5", 1.5],
    [".5", 0.5],
    ["1.", 1],
    ["1e-3", 0.001],
  ] as const)
    expect((await runtime.send(text)).body).toBe(value);
});
it("preserves malformed text with validation disabled", async () => {
  for (const type of ["integer", "number"])
    expect((await probe({ type }, false).send("3600junk")).body).toBe(
      "3600junk",
    );
});
it("validates OpenAPI 2 numeric declarations before invoking the handler", async () => {
  const runtime = probe(undefined, true, "integer");
  expect((await runtime.send("12tail")).status).toBe(400);
  expect(runtime.entries()).toBe(0);
  expect((await runtime.send("12")).body).toBe(12);
});
it("leaves string and ambiguous query schemas unchanged", async () => {
  for (const schema of [
    { type: "string" },
    { anyOf: [{ type: "string" }, { type: "number" }] },
  ])
    expect((await probe(schema).send("3600junk")).body).toBe("3600junk");
});
