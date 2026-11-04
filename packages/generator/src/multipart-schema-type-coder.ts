import type ts from "typescript";

import { typeReference } from "./ast.js";
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
    if (
      (this.requirement.get("type")?.data === "string" &&
        this.requirement.get("format")?.data === "binary") ||
      this.requirement.get("type")?.data === "file"
    ) {
      return typeReference(script.importSharedType("MultipartFile"));
    }
    return super.writeSchema(script);
  }
}
