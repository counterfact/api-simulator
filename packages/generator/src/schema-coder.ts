import { Coder } from "./coder.js";
import type { Script } from "./script.js";

function scrubSchema(schema: Record<string, unknown>): Record<string, unknown> {
  // remove properties that are not valid in JSON Schema 6 and not useful anyway

  const cleaned = { ...schema };

  delete cleaned["example"];
  delete cleaned["xml"];

  return cleaned;
}

export class SchemaCoder extends Coder {
  public override names(): Generator<string> {
    return super.names(
      `${(this.requirement.refUrl as string).split("/").at(-1)}Schema`,
    );
  }

  public objectSchema(script: Script): string {
    const { properties, required } = this.requirement.data as {
      properties?: Record<string, unknown>;
      required?: string[];
    };

    const propertyLines = Object.keys(properties ?? {}).map((name) => {
      const schemaCoder = new SchemaCoder(
        this.requirement.select(`properties/${name}`)!,
        this.version,
      );

      return `"${name}": ${schemaCoder.write(script)}`;
    });

    return `
      {
        type: "object",
        required: ${JSON.stringify(required ?? [])},
        properties: { ${propertyLines.join(", ")} }
      }
    `;
  }

  public arraySchema(script: Script): string {
    return `{
        type: "array",     
        items: ${new SchemaCoder(this.requirement.get("items")!, this.version).write(script)}
      }`;
  }

  public override typeDeclaration(
    _namespace: Map<string, unknown> | undefined,
    script: Script,
  ): string {
    return script.importExternalType("JSONSchema6", "json-schema");
  }

  public override modulePath(): string {
    return `types/${this.requirement.refUrl as string}.ts`;
  }

  public override writeCode(script: Script): string {
    const { type } = this.requirement.data as { type?: string };

    if (type === "object") {
      return this.objectSchema(script);
    }

    if (type === "array") {
      return this.arraySchema(script);
    }

    return JSON.stringify(
      scrubSchema(this.requirement.data as Record<string, unknown>),
    );
  }
}
