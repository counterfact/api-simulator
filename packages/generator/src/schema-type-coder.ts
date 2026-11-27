import ts from "typescript";

import {
  typeAlias,
  typeLiteral,
  typeProperty,
  typeReference,
  unionType,
  unknownType,
  neverType,
  withComment,
} from "./ast.js";
import { requireProperties } from "./schema-required-properties.js";
import { TypeCoder } from "./type-coder.js";
import { pathJoin } from "./forward-slash-path.js";
import { buildJsDoc } from "./jsdoc.js";
import { Requirement } from "./requirement.js";
import {
  SchemaTypeTransformError,
  type JsonSchema,
} from "./schema-type-transform.js";
import type { Script } from "./script.js";
import type { SchemaTypeOptions } from "./type-options.js";

const EXPORT = [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)];

/**
 * Returns the member names and values of an enum schema that declares a name
 * for every value (`x-enumNames` or `x-enum-varnames`), or `undefined` when it
 * must remain a union.
 */
export function namedEnumMembers(
  data: unknown,
): [name: string, value: number | string][] | undefined {
  const schema = data as Record<string, unknown> | null;
  const values = schema?.["enum"];
  const names = schema?.["x-enumNames"] ?? schema?.["x-enum-varnames"];
  if (
    !Array.isArray(values) ||
    !Array.isArray(names) ||
    values.length === 0 ||
    names.length !== values.length ||
    names.some((name) => typeof name !== "string" || name === "") ||
    new Set(names).size !== names.length ||
    values.some(
      (value) =>
        typeof value !== "string" &&
        (typeof value !== "number" || !Number.isFinite(value)),
    )
  ) {
    return undefined;
  }
  return names.map((name, index) => [
    name as string,
    values[index] as number | string,
  ]);
}

function memberName(name: string): ts.Identifier | ts.StringLiteral {
  return /^[A-Za-z_$][\w$]*$/u.test(name)
    ? ts.factory.createIdentifier(name)
    : ts.factory.createStringLiteral(name);
}

function valueExpression(value: number | string): ts.Expression {
  if (typeof value === "string") return ts.factory.createStringLiteral(value);
  const literal = ts.factory.createNumericLiteral(Math.abs(value));
  return value < 0
    ? ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken, literal)
    : literal;
}

export class SchemaTypeCoder extends TypeCoder {
  protected child(requirement: Requirement): SchemaTypeCoder {
    return new SchemaTypeCoder(requirement, this.version);
  }

  public override names(): Generator<string> {
    return super.names(this.requirement.refUrl?.split("/").at(-1));
  }

  public override jsdoc(): string {
    return buildJsDoc(this.requirement.data, this.options.validationJsDoc);
  }

  protected get options(): SchemaTypeOptions {
    return this.requirement.specification?.typeOptions ?? {};
  }

  /** Declares named enums and, optionally, object interfaces. */
  public override exportDeclarations(
    script: Script,
    name: string,
  ): ts.Statement[] | undefined {
    const { enumStyle = "union", preferInterfaces } = this.options;
    const members =
      enumStyle === "union"
        ? undefined
        : namedEnumMembers(this.requirement.data);
    if (members) {
      const [first, ...rest] = this.enumDeclarations(name, members);
      return [withComment(first!, this.jsdoc()), ...rest];
    }
    if (!preferInterfaces) return undefined;
    const type = this.write(script);
    if (!ts.isTypeLiteralNode(type)) return undefined;
    return [
      withComment(
        ts.factory.createInterfaceDeclaration(
          EXPORT,
          name,
          undefined,
          undefined,
          type.members,
        ),
        this.jsdoc(),
      ),
    ];
  }

  private enumDeclarations(
    name: string,
    members: [string, number | string][],
  ): ts.Statement[] {
    if (this.options.enumStyle === "enum") {
      return [
        ts.factory.createEnumDeclaration(
          EXPORT,
          name,
          members.map(([member, value]) =>
            ts.factory.createEnumMember(
              memberName(member),
              valueExpression(value),
            ),
          ),
        ),
      ];
    }
    const values = ts.factory.createVariableStatement(
      EXPORT,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            name,
            undefined,
            undefined,
            ts.factory.createAsExpression(
              ts.factory.createObjectLiteralExpression(
                members.map(([member, value]) =>
                  ts.factory.createPropertyAssignment(
                    memberName(member),
                    valueExpression(value),
                  ),
                ),
                true,
              ),
              typeReference("const"),
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );
    const valuesType = ts.factory.createTypeQueryNode(
      ts.factory.createIdentifier(name),
    );
    return [
      values,
      typeAlias(
        name,
        ts.factory.createIndexedAccessTypeNode(
          valuesType,
          ts.factory.createTypeOperatorNode(
            ts.SyntaxKind.KeyOfKeyword,
            valuesType,
          ),
        ),
      ),
    ];
  }

  public additionalPropertiesType(script: Script): ts.TypeNode {
    const { additionalProperties, properties } = this.requirement.data as {
      additionalProperties: { type?: string } | boolean;
      properties?: Record<string, { type?: string }>;
    };

    if (
      typeof additionalProperties !== "object" ||
      (Object.keys(properties ?? {}).length > 0 &&
        (!additionalProperties.type ||
          Object.values(properties ?? {}).some(
            (property) => property.type !== additionalProperties.type,
          )))
    ) {
      return unknownType();
    }

    return this.child(this.requirement.get("additionalProperties")!).write(
      script,
    );
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
          this.child(property).write(script),
          !isRequired,
          property.data,
          this.options.validationJsDoc,
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
    const data = this.requirement.data as {
      prefixItems?: unknown[];
      items?: unknown;
      additionalItems?: unknown;
      minItems?: number;
      maxItems?: number;
    };
    const tupleKey = Array.isArray(data.prefixItems)
      ? "prefixItems"
      : Array.isArray(data.items)
        ? "items"
        : undefined;
    if (tupleKey) {
      const items = this.requirement.get(tupleKey)!;
      const members = items
        .map((item, index) => {
          const type = this.child(item).write(script);
          return Number(index) < (data.minItems ?? 0)
            ? type
            : ts.factory.createOptionalTypeNode(type);
        })
        .slice(0, data.maxItems);
      const restKey = tupleKey === "prefixItems" ? "items" : "additionalItems";
      const rest = this.requirement.get(restKey);
      if (
        rest?.data !== false &&
        (data.maxItems === undefined || data.maxItems > members.length)
      ) {
        const restType = rest ? this.child(rest).write(script) : unknownType();
        members.push(
          ts.factory.createRestTypeNode(
            ts.factory.createArrayTypeNode(restType),
          ),
        );
      }
      return ts.factory.createTupleTypeNode(members);
    }
    const items = this.requirement.get("items");
    return typeReference("Array", [
      items ? this.child(items).write(script) : unknownType(),
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
      const types =
        this.options.ignoreNullable && type.some((item) => item !== "null")
          ? type.filter((item) => item !== "null")
          : type;
      return unionType(
        types.map((item: unknown) => this.writeType(script, item)),
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
        if (
          type === undefined &&
          (this.requirement.has("properties") ||
            this.requirement.has("additionalProperties"))
        ) {
          return this.objectSchema(script);
        }
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
    const { discriminator } = this.requirement.data as {
      discriminator?: {
        propertyName?: string;
        mapping?: Record<string, string>;
      };
    };
    const types = items.map((_item, index) => {
      const branch = this.requirement.get(key)!.get(index)!;
      const type = this.child(branch).write(script);
      const values =
        !allOf && branch.refUrl && discriminator?.propertyName
          ? Object.entries(discriminator.mapping ?? {})
              .filter(([, ref]) => ref === branch.refUrl)
              .map(([value]) => this.writePrimitive(value))
          : [];
      return values.length > 0
        ? unionType(
            values.map((value) =>
              ts.factory.createIntersectionTypeNode([
                type,
                typeLiteral([
                  typeProperty(discriminator!.propertyName!, value),
                ]),
              ]),
            ),
          )
        : type;
    });

    // OpenAPI 3.2 discriminator fallback participates in the union.
    if (!allOf) {
      const { discriminator } = this.requirement.data as {
        discriminator?: { defaultMapping?: string };
      };

      if (discriminator?.defaultMapping) {
        types.push(
          this.child(
            new Requirement(
              { $ref: discriminator.defaultMapping },
              "",
              this.requirement.specification,
            ),
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
    const defaultType = this.defaultType(script);
    const transform = script?.repository?.options.schemaTypeTransform;
    if (
      !transform ||
      this.requirement.data === null ||
      (typeof this.requirement.data !== "object" &&
        typeof this.requirement.data !== "boolean")
    )
      return defaultType;
    try {
      const result = transform(
        this.requirement.data as JsonSchema,
        defaultType,
        Object.freeze({
          importType: (module: string, name: string) =>
            script.importSchemaType(module, name),
        }),
      );
      if (result instanceof Promise) {
        // Invalid JavaScript callbacks must not also leak unhandled rejections.
        void result.catch(() => undefined);
        throw new TypeError("Expected a synchronous TypeNode result.");
      }
      if (!result || !ts.isTypeNode(result))
        throw new TypeError("Expected a synchronous TypeNode result.");
      return result;
    } catch (cause) {
      throw new SchemaTypeTransformError(
        `Schema type transform failed at ${this.requirement.url}: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  }

  private defaultType(script: Script): ts.TypeNode {
    if (this.requirement.data === false) return neverType();
    if (this.requirement.data === true || this.requirement.data === null)
      return unknownType();
    const type = this.writeSchema(script);
    const data = this.requirement.data as {
      nullable?: boolean;
      type?: unknown;
    };
    // nullable expands the declared type; enum/const remain independent constraints.
    return data.nullable === true &&
      !this.options.ignoreNullable &&
      data.type !== undefined &&
      !this.requirement.has("enum") &&
      !this.requirement.has("const")
      ? unionType([type, this.writePrimitive(null)])
      : type;
  }

  protected writeSchema(script: Script): ts.TypeNode {
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
        this.child(this.requirement.get("itemSchema")!).write(script),
      ]);
    }

    if (allOf ?? anyOf ?? oneOf) {
      const parts: ts.TypeNode[] = [];
      for (const group of [{ allOf }, { anyOf }, { oneOf }]) {
        if (Object.values(group)[0] !== undefined)
          parts.push(this.writeGroup(script, group));
      }
      if (
        this.requirement.has("properties") ||
        this.requirement.has("additionalProperties")
      ) {
        parts.push(this.objectSchema(script));
      }
      const result =
        parts.length === 1
          ? parts[0]!
          : ts.factory.createIntersectionTypeNode(parts);
      const required = (this.requirement.data as { required?: unknown })
        .required;
      return Array.isArray(required) && required.length > 0
        ? requireProperties(result, required as string[])
        : result;
    }

    if (this.requirement.has("const")) {
      return this.writePrimitive(this.requirement.get("const")!.data);
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
