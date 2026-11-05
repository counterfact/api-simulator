import type ts from "typescript";

import { typeReference, literalType, unionType } from "./ast.js";
import { SchemaTypeCoder } from "./schema-type-coder.js";
import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";

/** Multipart file types must not change the same model's JSON representation. */
export class MultipartSchemaTypeCoder extends SchemaTypeCoder {
  protected override child(requirement: Requirement): SchemaTypeCoder {
    return new MultipartSchemaTypeCoder(requirement, this.version);
  }

  public override modulePath(): string {
    return super.modulePath().replace("types/", "types/multipart/");
  }

  protected override writeSchema(script: Script): ts.TypeNode {
    const rawType = this.requirement.get("type")?.data;
    const types = Array.isArray(rawType) ? rawType : [rawType];
    if (
      (types.includes("string") &&
        this.requirement.get("format")?.data === "binary") ||
      types.includes("file")
    ) {
      const file = typeReference(script.importSharedType("MultipartFile"));
      const alternatives: ts.TypeNode[] = [file];
      if (
        types.includes("null") ||
        this.requirement.get("nullable")?.data === true
      )
        alternatives.push(literalType(null));
      return unionType(alternatives);
    }
    return super.writeSchema(script);
  }
}
