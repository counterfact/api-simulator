import { buildJsDoc } from "./jsdoc.js";
import { TypeCoder } from "./type-coder.js";
import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";
import { pathJoin } from "../util/forward-slash-path.js";

export class SchemaTypeCoder extends TypeCoder {
  public override names(): Generator<string> {
    return super.names(
      (this.requirement.data["$ref"] as string | undefined)?.split("/").at(-1),
    );
  }

  public override jsdoc(): string {
    return buildJsDoc(this.requirement.data);
  }

  public additionalPropertiesType(script: Script): string {
    const { additionalProperties, properties } = this.requirement.data as {
      additionalProperties: { type?: string };
      properties?: Record<string, { type?: string }>;
    };

    if (!additionalProperties.type) {
      return "unknown";
    }

    if (
      Object.values(properties ?? {}).some(
        (property) => property.type !== additionalProperties.type,
      )
    ) {
      return "unknown";
    }

    const requirement = this.requirement.get("additionalProperties")!;

    return new SchemaTypeCoder(requirement, this.version).write(script);
  }

  public objectSchema(script: Script): string {
    const { data } = this.requirement;
    const typedData = data as {
      properties?: Record<string, unknown>;
      required?: string[];
      additionalProperties?: unknown;
    };

    const properties = Object.keys(typedData.properties ?? {}).map((name) => {
      const property = this.requirement.get("properties")!.get(name)!;

      const propertyData = property.data as {
        required?: boolean;
      };

      const isRequired =
        typedData.required?.includes(name) || propertyData.required === true;
      const optionalFlag = isRequired ? "" : "?";

      const comment = buildJsDoc(property.data);
      const commentPrefix = comment ? `\n${comment}` : "";

      const propertyType = new SchemaTypeCoder(property, this.version).write(
        script,
      );

      return `${commentPrefix}"${name}"${optionalFlag}: ${propertyType}`;
    });

    if (typedData.additionalProperties) {
      properties.push(
        `[key: string]: ${this.additionalPropertiesType(script)}`,
      );
    }

    return `{${properties.join(",")}}`;
  }

  public arraySchema(script: Script): string {
    return `Array<${new SchemaTypeCoder(
      this.requirement.get("items")!,
      this.version,
    ).write(script)}>`;
  }

  public writePrimitive(value: unknown): string {
    if (typeof value === "string") {
      return `"${value}"`;
    }

    if (value === null) {
      return "null";
    }

    return String(value);
  }

  public writeType(script: Script, type: unknown): string {
    if (Array.isArray(type)) {
      return (type as unknown[])
        .map((item) => this.writeType(script, item))
        .join(" | ");
    }

    if (typeof type !== "string") {
      return "unknown";
    }

    if (type === "object") {
      return this.objectSchema(script);
    }

    if (type === "array") {
      return this.arraySchema(script);
    }

    if (type === "integer") {
      return "number";
    }

    return type ?? "unknown";
  }

  public writeGroup(
    script: Script,
    {
      allOf,
      anyOf,
      oneOf,
    }: {
      allOf?: unknown[];
      anyOf?: unknown[];
      oneOf?: unknown[];
    },
  ): string {
    function matchingKey(): string {
      if (allOf) {
        return "allOf";
      }

      if (anyOf) {
        return "anyOf";
      }

      return "oneOf";
    }

    const key = matchingKey();
    const items = (allOf ?? anyOf ?? oneOf) as unknown[];
    const types = items.map((_item, index) =>
      new SchemaTypeCoder(
        this.requirement.get(key)!.get(index)!,
        this.version,
      ).write(script),
    );

    return types.join(allOf ? " & " : " | ");
  }

  public writeEnum(_script: Script, requirement: Requirement): string {
    return (requirement.data as unknown as unknown[])
      .map((item) => this.writePrimitive(item))
      .join(" | ");
  }

  public override modulePath(): string {
    return pathJoin(
      "types",
      this.version,
      (this.requirement.data["$ref"] as string).replace(/^#\//u, "") + ".ts",
    );
  }

  public override writeCode(script: Script): string {
    const { allOf, anyOf, oneOf, type, format, itemSchema } = this.requirement
      .data as {
      allOf?: unknown[];
      anyOf?: unknown[];
      oneOf?: unknown[];
      type?: string;
      format?: string;
      itemSchema?: unknown;
    };

    if (itemSchema) {
      return `AsyncIterable<${new SchemaTypeCoder(
        this.requirement.get("itemSchema")!,
        this.version,
      ).write(script)}>`;
    }

    if (allOf ?? anyOf ?? oneOf) {
      return this.writeGroup(script, { allOf, anyOf, oneOf });
    }

    if (this.requirement.has("enum")) {
      return this.writeEnum(script, this.requirement.get("enum")!);
    }

    if ((type === "string" && format === "binary") || type === "file") {
      return "Uint8Array | string";
    }

    return this.writeType(script, type);
  }
}
