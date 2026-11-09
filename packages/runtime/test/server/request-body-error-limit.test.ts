import { validateRequest } from "../../src/server/request-validator.js";
import type { OpenApiOperation } from "@counterfact/types";

const schema = { type: "array", items: { type: "integer" } };
function operationFor(mediaType: string): OpenApiOperation {
  return mediaType === "swagger"
    ? { parameters: [{ in: "body", name: "body", schema }], responses: {} }
    : { requestBody: { content: { [mediaType]: { schema } } }, responses: {} };
}

it.each([
  "application/json",
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "swagger",
])(
  "does not collect an error for every invalid array item (%s)",
  (mediaType) => {
    const request = {
      body: Array.from({ length: 10000 }, () => "invalid"),
      headers: { "content-type": mediaType },
      cookie: {},
      query: {},
    };
    const invalid = validateRequest(operationFor(mediaType), request);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toHaveLength(1);
    expect(invalid.errors[0]).toContain("body/0");
    expect(
      validateRequest(operationFor(mediaType), { ...request, body: [1, 2] })
        .valid,
    ).toBe(true);
  },
);
