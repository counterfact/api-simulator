import type ts from "typescript";

import { typeReference, unionType } from "./ast.js";
import { SchemaTypeCoder } from "./schema-type-coder.js";

import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";

/** Model file inputs directly without changing the JSON representation of a shared schema. */
export class ClientMultipartSchemaTypeCoder extends SchemaTypeCoder {
  protected override child(requirement: Requirement): SchemaTypeCoder {
    return new ClientMultipartSchemaTypeCoder(requirement, this.version);
  }

  public override modulePath(): string {
    return super.modulePath().replace("types/", "types/multipart/");
  }

  protected override writeSchema(script: Script): ts.TypeNode {
    const raw = this.requirement.get("type")?.data;
    const types = Array.isArray(raw) ? raw : [raw];
    const binaryString =
      types.includes("string") &&
      this.requirement.get("format")?.data === "binary";
    const rawBinary =
      raw === undefined &&
      typeof this.requirement.get("contentMediaType")?.data === "string" &&
      !["contentEncoding", "properties", "items", "additionalProperties"].some(
        (keyword) => this.requirement.has(keyword),
      );

    if (
      !(binaryString || rawBinary || types.includes("file")) ||
      ["allOf", "anyOf", "oneOf", "enum", "const"].some((keyword) =>
        this.requirement.has(keyword),
      )
    ) {
      return super.writeSchema(script);
    }

    const alternatives = types.filter(
      (type) =>
        type !== undefined &&
        type !== "file" &&
        (type !== "string" || !binaryString),
    );
    return unionType([
      typeReference("Blob"),
      typeReference("Uint8Array"),
      ...alternatives.map((type) => this.writeType(script, type)),
    ]);
  }
}
