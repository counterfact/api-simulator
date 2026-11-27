import ts from "typescript";

import type {
  JsonSchema,
  SchemaTypeTransform,
} from "./schema-type-transform.js";

/** Generator conventions to approximate with Counterfact-owned model types. */
export type SchemaTypeCompatibilityTarget =
  | "openapi-typescript"
  | "hey-api"
  | "orval"
  | "openapi-generator-fetch"
  | "openapi-generator-axios"
  | "swagger-typescript-api"
  | "openapi-typescript-codegen"
  | "nswag";

type BinaryType =
  "string" | "Blob" | "File" | "Blob | File" | "ArrayBuffer" | "any";

/** Override conventions when the other generator uses non-default settings. */
export interface SchemaTypeCompatibilityOptions {
  readonly dateType?: "string" | "Date";
  readonly binaryType?: BinaryType;
  readonly byteType?: "string" | "Blob";
  readonly readonlyProperties?: "schema" | "all" | "none";
  readonly emptyObjectType?: "preserve" | "unknown-record" | "never-record";
  /** Match openapi-typescript's defaultNonNullable option outside request inputs. */
  readonly defaultPropertiesRequired?: boolean;
}

type Profile = Required<SchemaTypeCompatibilityOptions> & {
  fileType: BinaryType;
};
const common: Profile = {
  dateType: "string",
  binaryType: "Blob",
  byteType: "string",
  readonlyProperties: "schema",
  emptyObjectType: "preserve",
  defaultPropertiesRequired: false,
  fileType: "Blob",
};
const profiles: Record<SchemaTypeCompatibilityTarget, Profile> = {
  "openapi-typescript": {
    ...common,
    binaryType: "string",
    fileType: "string",
    emptyObjectType: "never-record",
    defaultPropertiesRequired: true,
  },
  "hey-api": { ...common, binaryType: "Blob | File", fileType: "Blob | File" },
  orval: { ...common },
  "openapi-generator-fetch": { ...common, dateType: "Date" },
  "openapi-generator-axios": {
    ...common,
    binaryType: "File",
    fileType: "File",
    readonlyProperties: "none",
  },
  "swagger-typescript-api": {
    ...common,
    binaryType: "File",
    fileType: "File",
    byteType: "Blob",
    readonlyProperties: "none",
  },
  "openapi-typescript-codegen": { ...common },
  nswag: { ...common, dateType: "Date", binaryType: "string", fileType: "any" },
};

function nativeType(name: BinaryType | "Date"): ts.TypeNode {
  if (name === "string" || name === "any") {
    return ts.factory.createKeywordTypeNode(
      name === "string"
        ? ts.SyntaxKind.StringKeyword
        : ts.SyntaxKind.AnyKeyword,
    );
  }
  if (name === "Blob | File") {
    return ts.factory.createUnionTypeNode([
      nativeType("Blob"),
      nativeType("File"),
    ]);
  }
  // Generated models can themselves be named Date, Blob, File, or ArrayBuffer.
  return ts.factory.createTypeReferenceNode(
    ts.factory.createQualifiedName(
      ts.factory.createIdentifier("globalThis"),
      name,
    ),
  );
}

function schemaObject(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function scalarType(
  schema: Readonly<Record<string, unknown>>,
  node: ts.TypeNode,
  profile: Profile,
): ts.TypeNode {
  // Preserve enums/const and composed schemas rather than broadening constraints.
  if (
    schema.enum !== undefined ||
    schema.const !== undefined ||
    schema.allOf !== undefined ||
    schema.anyOf !== undefined ||
    schema.oneOf !== undefined
  )
    return node;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const binary =
    (types.includes("string") && schema.format === "binary") ||
    types.includes("file");
  const replacement = types.includes("file")
    ? profile.fileType
    : binary
      ? profile.binaryType
      : types.includes("string") &&
          (schema.format === "date" || schema.format === "date-time")
        ? profile.dateType
        : types.includes("string") && schema.format === "byte"
          ? profile.byteType
          : undefined;
  if (replacement === undefined) return node;
  const isBytes = (part: ts.TypeNode) =>
    ts.isTypeReferenceNode(part) &&
    ts.isIdentifier(part.typeName) &&
    part.typeName.text === "Uint8Array";
  const replace = (part: ts.TypeNode): ts.TypeNode => {
    if (ts.isUnionTypeNode(part)) {
      // Replace Counterfact's binary pair together, including nested nullable unions.
      if (binary && part.types.some(isBytes)) {
        const others = part.types
          .filter(
            (item) =>
              item.kind !== ts.SyntaxKind.StringKeyword && !isBytes(item),
          )
          .map(replace);
        return others.length
          ? ts.factory.createUnionTypeNode([nativeType(replacement), ...others])
          : nativeType(replacement);
      }
      return ts.factory.createUnionTypeNode(part.types.map(replace));
    }
    if (ts.isParenthesizedTypeNode(part))
      return ts.factory.updateParenthesizedType(part, replace(part.type));
    if (part.kind === ts.SyntaxKind.StringKeyword || (binary && isBytes(part)))
      return nativeType(replacement);
    // In particular, keep the server's MultipartFile reference unchanged.
    return part;
  };
  return replace(node);
}

function objectType(
  schema: Readonly<Record<string, unknown>>,
  node: ts.TypeNode,
  profile: Profile,
  request: boolean,
): ts.TypeNode {
  if (ts.isUnionTypeNode(node))
    return ts.factory.createUnionTypeNode(
      node.types.map((part) => objectType(schema, part, profile, request)),
    );
  if (ts.isIntersectionTypeNode(node))
    return ts.factory.createIntersectionTypeNode(
      node.types.map((part) => objectType(schema, part, profile, request)),
    );
  if (ts.isParenthesizedTypeNode(node))
    return ts.factory.updateParenthesizedType(
      node,
      objectType(schema, node.type, profile, request),
    );
  if (!ts.isTypeLiteralNode(node)) return node;
  if (
    node.members.length === 0 &&
    (schema.type === "object" ||
      (Array.isArray(schema.type) && schema.type.includes("object"))) &&
    profile.emptyObjectType !== "preserve"
  ) {
    return ts.factory.createTypeLiteralNode([
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
        ts.factory.createKeywordTypeNode(
          profile.emptyObjectType === "never-record"
            ? ts.SyntaxKind.NeverKeyword
            : ts.SyntaxKind.UnknownKeyword,
        ),
      ),
    ]);
  }
  const properties = schemaObject(schema.properties);
  return ts.factory.createTypeLiteralNode(
    node.members.map((member) => {
      if (!ts.isPropertySignature(member) || !member.name || !properties)
        return member;
      const name =
        ts.isIdentifier(member.name) ||
        ts.isStringLiteral(member.name) ||
        ts.isNumericLiteral(member.name)
          ? member.name.text
          : undefined;
      const property =
        name === undefined ? undefined : schemaObject(properties[name]);
      const readonly =
        profile.readonlyProperties === "all" ||
        (profile.readonlyProperties === "schema" &&
          property?.readOnly === true);
      const modifiers: ts.Modifier[] =
        member.modifiers?.filter(
          (modifier) => modifier.kind !== ts.SyntaxKind.ReadonlyKeyword,
        ) ?? [];
      if (readonly)
        modifiers.push(
          ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword),
        );
      const defaultRequired =
        profile.defaultPropertiesRequired &&
        !request &&
        property?.default !== undefined;
      return ts.factory.updatePropertySignature(
        member,
        modifiers,
        member.name,
        defaultRequired ? undefined : member.questionToken,
        member.type,
      );
    }),
  );
}

/**
 * Generate independent model types using another tool's common conventions.
 * No SDK types are imported. This changes types only, not HTTP conversion.
 */
export function schemaTypeCompatibility(
  target: SchemaTypeCompatibilityTarget,
  options: SchemaTypeCompatibilityOptions = {},
): SchemaTypeTransform {
  if (!Object.hasOwn(profiles, target))
    throw new TypeError(`Unknown schema type compatibility target: ${target}`);
  const profile = { ...profiles[target], ...options };
  if (options.binaryType !== undefined) profile.fileType = options.binaryType;
  return (input: JsonSchema, defaultType, _script, { schemaPath }) => {
    const schema = schemaObject(input);
    if (!schema) return defaultType;
    const parts = schemaPath.split("/");
    const request =
      (parts[1] === "components" &&
        ["parameters", "requestBodies"].includes(parts[2] ?? "")) ||
      (parts[1] === "paths" &&
        (parts[3] === "parameters" ||
          ["parameters", "requestBody"].includes(parts[4] ?? "") ||
          (parts[3] === "additionalOperations" &&
            ["parameters", "requestBody"].includes(parts[5] ?? ""))));
    return objectType(
      schema,
      scalarType(schema, defaultType, profile),
      profile,
      request,
    );
  };
}
