import ts from "typescript";

import { objectExpression, typeReference, valueExpression } from "./ast.js";
import { Coder } from "./coder.js";
import type { Script } from "./script.js";

function scrubSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...schema };
  delete cleaned["example"];
  delete cleaned["xml"];
  return cleaned;
}

export class SchemaCoder extends Coder {
  public override names(): Generator<string> {
    return super.names(`${this.requirement.refUrl!.split("/").at(-1)}Schema`);
  }

  public objectSchema(script: Script): ts.Expression {
    const { properties, required } = this.requirement.data as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    return objectExpression(
      [
        ["type", valueExpression("object")],
        ["required", valueExpression(required ?? [])],
        [
          "properties",
          objectExpression(
            Object.keys(properties ?? {}).map((name) => [
              name,
              new SchemaCoder(
                this.requirement.get("properties")!.get(name)!,
                this.version,
              ).write(script),
            ]),
          ),
        ],
      ],
      true,
    );
  }

  public arraySchema(script: Script): ts.Expression {
    return objectExpression(
      [
        ["type", valueExpression("array")],
        [
          "items",
          new SchemaCoder(this.requirement.get("items")!, this.version).write(
            script,
          ),
        ],
      ],
      true,
    );
  }

  public override typeDeclaration(
    _namespace: Map<string, unknown> | undefined,
    script: Script,
  ): ts.TypeNode {
    return typeReference(
      script.importExternalType("JSONSchema6", "json-schema"),
    );
  }

  public override modulePath(): string {
    return `types/${this.requirement.refUrl!}.ts`;
  }

  public override write(script: Script): ts.Expression {
    if (this.requirement.isReference) {
      // Runtime schemas refer to value exports, rather than type imports.
      return ts.factory.createIdentifier(script.import(this));
    }
    return this.writeCode(script);
  }

  public override writeCode(script: Script): ts.Expression {
    const { type } = this.requirement.data as { type?: string };
    if (type === "object") return this.objectSchema(script);
    if (type === "array") return this.arraySchema(script);
    return valueExpression(
      scrubSchema(this.requirement.data as Record<string, unknown>),
    );
  }
}
