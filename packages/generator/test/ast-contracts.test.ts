import { printNode } from "../src/ast.js";
import { describe, expect, it } from "@jest/globals";

import { ParametersTypeCoder } from "../src/parameters-type-coder.js";
import { Repository } from "../src/repository.js";
import { Requirement } from "../src/requirement.js";
import { ResponseTypeCoder } from "../src/response-type-coder.js";
import { ResponsesTypeCoder } from "../src/responses-type-coder.js";
import { Specification } from "../src/specification.js";
import { typeDiagnostics } from "./type-diagnostics.js";

describe("AST parameter and response contracts", () => {
  it("preserves unusual parameter names and their requiredness", async () => {
    const name = 'parameter"\\\n';
    const script = new Repository().get("types/parameters.ts");
    script.exportType(
      new ParametersTypeCoder(
        new Requirement([
          { in: "query", name, required: true, schema: { type: "string" } },
          { in: "query", name: "optional", schema: { type: "number" } },
        ]),
        "",
        "query",
      ),
    );
    const source = await script.contents();

    expect(
      typeDiagnostics(`${source}
      const valid: parameters = { [${JSON.stringify(name)}]: "ok" };
      // @ts-expect-error The unusual parameter is required.
      const missing: parameters = {};
      // @ts-expect-error Optional parameters still have a constrained type.
      const wrong: parameters = { [${JSON.stringify(name)}]: "ok", optional: "bad" };
    `),
    ).toEqual([]);
  });

  it("preserves header, media type, and example names through final printing", async () => {
    const header = 'header"\\\n';
    const media = 'application/example"\\\n';
    const example = 'example"\\\n';
    const script = new Repository().get("types/response.ts");
    const specification = new Specification(
      new Requirement({
        components: {
          responses: {
            Response: {
              headers: {
                [header]: { required: true, schema: { type: "string" } },
              },
              content: {
                [media]: {
                  schema: { type: "number" },
                  examples: { [example]: { value: 42 } },
                },
              },
            },
          },
        },
      }),
    );
    script.exportType(
      new ResponseTypeCoder(
        new Requirement(
          { $ref: "#/components/responses/Response" },
          "#/reference",
          specification,
        ),
      ),
    );
    const source = await script.contents();

    expect(
      typeDiagnostics(`${source}
      const valid: Response = {
        headers: { [${JSON.stringify(header)}]: { schema: "ok" } },
        requiredHeaders: ${JSON.stringify(header)},
        content: { [${JSON.stringify(media)}]: { schema: 42 } },
        examples: { [${JSON.stringify(example)}]: null },
      };
      // @ts-expect-error Only the declared required header is accepted.
      const wrong: Response["requiredHeaders"] = "missing";
    `),
    ).toEqual([]);
  });

  it("keeps explicit and default response schemas distinct", () => {
    const coder = new ResponsesTypeCoder(
      new Requirement({
        200: {
          content: { "application/json": { schema: { type: "number" } } },
        },
        default: {
          content: { "application/json": { schema: { type: "string" } } },
        },
      }),
    );
    const source = printNode(
      coder.writeCode({
        importSharedType: (name: string) => name,
      }),
    );

    expect(
      typeDiagnostics(`
      type Exclude<T, U> = T extends U ? never : T;
      type HttpStatusCode = 200 | 201 | 400;
      type ResponseBuilderFactory<T> = T;
      type Responses = ${source};
      const success: Responses[200]["content"]["application/json"]["schema"] = 42;
      const fallback: Responses[400]["content"]["application/json"]["schema"] = "error";
      // @ts-expect-error The default response must not constrain the explicit response.
      const wrongSuccess: Responses[200]["content"]["application/json"]["schema"] = "error";
      // @ts-expect-error The explicit response must not change the default response.
      const wrongFallback: Responses[201]["content"]["application/json"]["schema"] = 42;
    `),
    ).toEqual([]);
  });
});
