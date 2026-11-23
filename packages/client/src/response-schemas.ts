import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020.js";

export interface FetchResponseSchemas {
  draft: "7" | "2020-12";
  schema: { $id: string; $defs: Record<string, unknown> };
}

export type ValidateResponseBody = (key: string, body: unknown) => boolean;

export function createResponseValidator(
  schemas: FetchResponseSchemas,
): ValidateResponseBody {
  const Validator = schemas.draft === "7" ? Ajv : Ajv2020;
  const validator = new Validator({
    strict: false,
    ownProperties: true,
    strictNumbers: true,
  });
  validator.addSchema(schemas.schema);
  return (key, body) => {
    const validate = validator.getSchema(`${schemas.schema.$id}#/$defs/${key}`);
    if (!validate) throw new Error(`Missing generated response schema ${key}`);
    return validate(body) === true;
  };
}
