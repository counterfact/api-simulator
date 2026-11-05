import { validateRequest } from "../../src/server/request-validator.js";
const request = {
  body: undefined as unknown,
  query: {},
  headers: {},
  cookie: {},
};
it.each([false, undefined])(
  "allows absence of a body with required=%s",
  (required) => {
    const operation = {
      requestBody: {
        required,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: {},
    };
    expect(validateRequest(operation, request).valid).toBe(true);
    expect(validateRequest(operation, { ...request, body: {} }).valid).toBe(
      true,
    );
    expect(
      validateRequest(operation, { ...request, body: "wrong" }).valid,
    ).toBe(false);
    expect(validateRequest(operation, { ...request, body: null }).valid).toBe(
      false,
    );
  },
);
it("rejects absent required bodies and validates explicit null", () => {
  const operation = {
    requestBody: {
      required: true,
      content: {
        "application/json": { schema: { type: "object", nullable: true } },
      },
    },
    responses: {},
  };
  expect(validateRequest(operation, request)).toEqual({
    valid: false,
    errors: ["body is required"],
  });
  expect(validateRequest(operation, { ...request, body: null }).valid).toBe(
    true,
  );
});
it("honors Swagger body parameter optionality", () => {
  for (const required of [false, true]) {
    const operation = {
      parameters: [
        {
          in: "body" as const,
          name: "body",
          required,
          schema: { type: "object" },
        },
      ],
      responses: {},
    };
    expect(validateRequest(operation, request).valid).toBe(!required);
    expect(
      validateRequest(operation, { ...request, body: "wrong" }).valid,
    ).toBe(false);
  }
});
