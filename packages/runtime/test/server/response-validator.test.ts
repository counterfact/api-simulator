import { validateResponse } from "../../src/server/response-validator.js";

describe("validateResponse", () => {
  it("returns valid when there is no operation", () => {
    const result = validateResponse(undefined, { body: "ok", status: 200 });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid when the operation has no response for the given status", () => {
    const result = validateResponse(
      { responses: {} },
      { body: "ok", status: 200 },
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid when the response spec has no headers", () => {
    const result = validateResponse(
      { responses: { 200: { content: {} } } },
      { body: "ok", status: 200 },
    );

    expect(result.valid).toBe(true);
  });

  it("reports an error when a required header is missing", () => {
    const result = validateResponse(
      {
        responses: {
          200: {
            content: {},
            headers: {
              "x-required": { required: true, schema: { type: "string" } },
            },
          },
        },
      },
      { body: "ok", headers: {}, status: 200 },
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("x-required");
    expect(result.errors[0]).toContain("required");
  });

  it("does not report an error when a non-required header is missing", () => {
    const result = validateResponse(
      {
        responses: {
          200: {
            content: {},
            headers: {
              "x-optional": { required: false, schema: { type: "string" } },
            },
          },
        },
      },
      { body: "ok", headers: {}, status: 200 },
    );

    expect(result.valid).toBe(true);
  });

  it("reports an error when a header value does not match its schema type", () => {
    const result = validateResponse(
      {
        responses: {
          200: {
            content: {},
            headers: {
              "x-count": { required: false, schema: { type: "integer" } },
            },
          },
        },
      },
      { body: "ok", headers: { "x-count": "not-a-number" }, status: 200 },
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("x-count");
  });

  it("coerces integer-typed header strings before validation", () => {
    const result = validateResponse(
      {
        responses: {
          200: {
            content: {},
            headers: {
              "x-count": { required: false, schema: { type: "integer" } },
            },
          },
        },
      },
      { body: "ok", headers: { "x-count": "42" }, status: 200 },
    );

    expect(result.valid).toBe(true);
  });

  it("coerces boolean-typed header strings before validation", () => {
    const result = validateResponse(
      {
        responses: {
          200: {
            content: {},
            headers: {
              "x-flag": { required: false, schema: { type: "boolean" } },
            },
          },
        },
      },
      { body: "ok", headers: { "x-flag": "true" }, status: 200 },
    );

    expect(result.valid).toBe(true);
  });

  it("uses the default response spec when status code is not found", () => {
    const result = validateResponse(
      {
        responses: {
          default: {
            content: {},
            headers: {
              "x-required": { required: true, schema: { type: "string" } },
            },
          },
        },
      },
      { body: "ok", headers: {}, status: 500 },
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("x-required");
  });

  it("uses the default response spec when response status is undefined", () => {
    const result = validateResponse(
      {
        responses: {
          default: {
            content: {},
            headers: {
              "x-required": { required: true, schema: { type: "string" } },
            },
          },
        },
      },
      { body: "ok", headers: {} },
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("x-required");
  });

  it("returns multiple errors when multiple headers are invalid", () => {
    const result = validateResponse(
      {
        responses: {
          200: {
            content: {},
            headers: {
              "x-first": { required: true, schema: { type: "string" } },
              "x-second": { required: true, schema: { type: "string" } },
            },
          },
        },
      },
      { body: "ok", headers: {}, status: 200 },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});
