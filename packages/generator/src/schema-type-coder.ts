import ts from "typescript";

import {
  typeLiteral,
  typeProperty,
  typeReference,
  unionType,
  unknownType,
} from "./ast.js";
import { TypeCoder } from "./type-coder.js";
import { pathJoin } from "./forward-slash-path.js";
import { buildJsDoc } from "./jsdoc.js";
import { Requirement } from "./requirement.js";
import type { Script } from "./script.js";

export class SchemaTypeCoder extends TypeCoder {
  public override names(): Generator<string> {
    return super.names(this.requirement.refUrl?.split("/").at(-1));
  }

  public override jsdoc(): string {
    return buildJsDoc(this.requirement.data);
  }

  public additionalPropertiesType(script: Script): ts.TypeNode {
    const { additionalProperties, properties } = this.requirement.data as {
      additionalProperties: { type?: string };
      properties?: Record<string, { type?: string }>;
    };

    if (
      !additionalProperties.type ||
      Object.values(properties ?? {}).some(
        (property) => property.type !== additionalProperties.type,
      )
    ) {
      return unknownType();
    }

    return new SchemaTypeCoder(
      this.requirement.get("additionalProperties")!,
      this.version,
    ).write(script);
  }

  public objectSchema(script: Script): ts.TypeNode {
    const data = this.requirement.data as {
      properties?: Record<string, unknown>;
      required?: string[];
      additionalProperties?: unknown;
    };

    const members: ts.TypeElement[] = Object.keys(data.properties ?? {}).map(
      (name) => {
        const property = this.requirement.get("properties")!.get(name)!;
        const isRequired =
          data.required?.includes(name) ||
          (property.data as { required?: boolean }).required === true;

        return typeProperty(
          name,
          new SchemaTypeCoder(property, this.version).write(script),
          !isRequired,
          property.data,
        );
      },
    );

    if (data.additionalProperties) {
      members.push(
        ts.factory.createIndexSignature(
          undefined,
          [
            ts.factory.createParameterDeclaration(
              undefined,
              undefined,
              "key",
              undefined,
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
            ),
          ],
          this.additionalPropertiesType(script),
        ),
      );
    }

    return typeLiteral(members);
  }

  public arraySchema(script: Script): ts.TypeNode {
    return typeReference("Array", [
      new SchemaTypeCoder(this.requirement.get("items")!, this.version).write(
        script,
      ),
    ]);
  }

  public writePrimitive(value: unknown): ts.TypeNode {
    if (typeof value === "string") {
      return ts.factory.createLiteralTypeNode(
        ts.factory.createStringLiteral(value),
      );
    }

    if (typeof value === "number") {
      const literal = ts.factory.createNumericLiteral(Math.abs(value));
      return ts.factory.createLiteralTypeNode(
        value < 0
          ? ts.factory.createPrefixUnaryExpression(
              ts.SyntaxKind.MinusToken,
              literal,
            )
          : literal,
      );
    }

    if (typeof value === "boolean") {
      return ts.factory.createLiteralTypeNode(
        value ? ts.factory.createTrue() : ts.factory.createFalse(),
      );
    }

    if (value === null) {
      return ts.factory.createLiteralTypeNode(ts.factory.createNull());
    }

    return unknownType();
  }

  public writeType(script: Script, type: unknown): ts.TypeNode {
    if (Array.isArray(type)) {
      return unionType(
        type.map((item: unknown) => this.writeType(script, item)),
      );
    }

    switch (type) {
      case "object":
        return this.objectSchema(script);
      case "array":
        return this.arraySchema(script);
      case "integer":
      case "number":
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
      case "string":
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
      case "boolean":
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
      case "null":
        return ts.factory.createLiteralTypeNode(ts.factory.createNull());
      default:
        return unknownType();
    }
  }

  public writeGroup(
    script: Script,
    {
      allOf,
      anyOf,
      oneOf,
    }: { allOf?: unknown[]; anyOf?: unknown[]; oneOf?: unknown[] },
  ): ts.TypeNode {
    const key = allOf ? "allOf" : anyOf ? "anyOf" : "oneOf";
    const items = (allOf ?? anyOf ?? oneOf)!;
    const types = items.map((_item, index) =>
      new SchemaTypeCoder(
        this.requirement.get(key)!.get(index)!,
        this.version,
      ).write(script),
    );

    // OpenAPI 3.2 discriminator fallback participates in the union.
    if (!allOf) {
      const { discriminator } = this.requirement.data as {
        discriminator?: { defaultMapping?: string };
      };

      if (discriminator?.defaultMapping) {
        types.push(
          new SchemaTypeCoder(
            new Requirement(
              { $ref: discriminator.defaultMapping },
              "",
              this.requirement.specification,
            ),
            this.version,
          ).write(script),
        );
      }
    }

    return allOf
      ? ts.factory.createIntersectionTypeNode(types)
      : unionType(types);
  }

  public writeEnum(requirement: Requirement): ts.TypeNode {
    return unionType(
      (requirement.data as unknown as unknown[]).map((item) =>
        this.writePrimitive(item),
      ),
    );
  }

  public override modulePath(): string {
    return pathJoin(
      "types",
      this.version,
      (this.requirement.refUrl as string).replace(/^#\//u, "") + ".ts",
    );
  }

  public override writeCode(script: Script): ts.TypeNode {
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
      return typeReference("AsyncIterable", [
        new SchemaTypeCoder(
          this.requirement.get("itemSchema")!,
          this.version,
        ).write(script),
      ]);
    }

    if (allOf ?? anyOf ?? oneOf) {
      return this.writeGroup(script, { allOf, anyOf, oneOf });
    }

    if (this.requirement.has("enum")) {
      return this.writeEnum(this.requirement.get("enum")!);
    }

    if ((type === "string" && format === "binary") || type === "file") {
      return unionType([
        typeReference("Uint8Array"),
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      ]);
    }

    return this.writeType(script, type);
  }
}
