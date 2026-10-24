import type ts from "typescript";

import { typeReference } from "./ast.js";
import { Coder } from "./coder.js";
import type { Script } from "./script.js";

export class TypeCoder extends Coder {
  public override write(script: Script): ts.TypeNode {
    if (this.requirement?.isReference) {
      return typeReference(script.importType(this));
    }
    return this.writeCode(script);
  }

  public override writeCode(_script: Script): ts.TypeNode {
    throw new Error("TypeCoder.writeCode() must be implemented by a subclass");
  }
}
