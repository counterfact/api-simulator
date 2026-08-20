import { Coder } from "./coder.js";
import type { Script } from "./script.js";

export class TypeCoder extends Coder {
  public override write(script: Script): string {
    if (this.requirement?.isReference) {
      return script.importType(this);
    }

    return this.writeCode(script);
  }
}
