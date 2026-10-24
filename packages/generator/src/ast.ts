import ts from "typescript";
import { format } from "prettier";

import { buildJsDoc } from "./jsdoc.js";

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const sourceFile = ts.createSourceFile(
  "generated.ts",
  "",
  ts.ScriptTarget.Latest,
  false,
  ts.ScriptKind.TS,
);

export function printNode(node: ts.Node): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
}

export function printStatements(
  statements: readonly ts.Statement[],
  comments: readonly string[] = [],
): string {
  const nodes = [...statements];
  if (comments.length > 0) {
    const banner = ts.factory.createNotEmittedStatement(sourceFile);
    for (const comment of comments) {
      for (const line of comment.split("\n")) {
        ts.addSyntheticLeadingComment(
          banner,
          ts.SyntaxKind.SingleLineCommentTrivia,
          ` ${line}`,
          true,
        );
      }
    }
    nodes.unshift(banner);
  }
  return printer.printFile(ts.factory.updateSourceFile(sourceFile, nodes));
}

export async function formatStatements(
  statements: readonly ts.Statement[],
  comments: readonly string[] = [],
): Promise<string> {
  return format(printStatements(statements, comments), {
    parser: "typescript",
  });
}

export function stringType(): ts.TypeNode {
  return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
}

export function numberType(): ts.TypeNode {
  return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
}

export function literalType(
  value: string | number | boolean | null,
): ts.LiteralTypeNode {
  let expression: ts.LiteralTypeNode["literal"];
  if (typeof value === "string")
    expression = ts.factory.createStringLiteral(value);
  else if (typeof value === "number") {
    const number = ts.factory.createNumericLiteral(Math.abs(value));
    expression =
      value < 0
        ? ts.factory.createPrefixUnaryExpression(
            ts.SyntaxKind.MinusToken,
            number,
          )
        : number;
  } else if (value === null) expression = ts.factory.createNull();
  else expression = value ? ts.factory.createTrue() : ts.factory.createFalse();
  return ts.factory.createLiteralTypeNode(expression);
}

export function parameter(
  name: string,
  type?: ts.TypeNode,
  optional = false,
): ts.ParameterDeclaration {
  return ts.factory.createParameterDeclaration(
    undefined,
    undefined,
    name,
    optional ? ts.factory.createToken(ts.SyntaxKind.QuestionToken) : undefined,
    type,
  );
}

export function functionType(
  parameters: readonly ts.ParameterDeclaration[],
  result: ts.TypeNode,
): ts.FunctionTypeNode {
  return ts.factory.createFunctionTypeNode(undefined, parameters, result);
}

export function typeAlias(
  name: string,
  type: ts.TypeNode,
  exported = true,
  parameters?: readonly ts.TypeParameterDeclaration[],
): ts.TypeAliasDeclaration {
  return ts.factory.createTypeAliasDeclaration(
    exported
      ? [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)]
      : undefined,
    name,
    parameters,
    type,
  );
}

export function importDeclaration(
  name: string,
  modulePath: string,
  isType = false,
  isDefault = false,
  exportedName = name,
): ts.ImportDeclaration {
  return ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      isType,
      isDefault ? ts.factory.createIdentifier(name) : undefined,
      isDefault
        ? undefined
        : ts.factory.createNamedImports([
            ts.factory.createImportSpecifier(
              false,
              exportedName === name
                ? undefined
                : ts.factory.createIdentifier(exportedName),
              ts.factory.createIdentifier(name),
            ),
          ]),
    ),
    ts.setEmitFlags(
      ts.factory.createStringLiteral(modulePath),
      ts.EmitFlags.NoAsciiEscaping,
    ),
  );
}

export function valueExpression(value: unknown): ts.Expression {
  // Normalize JSON data as the previous serializer did, including dates and
  // omitted undefined properties. This parses data, never TypeScript fragments.
  const json = JSON.stringify(value);
  if (json === undefined)
    throw new Error(`Cannot generate a JSON expression for ${typeof value}`);
  return jsonExpression(JSON.parse(json) as unknown);
}

function jsonExpression(value: unknown): ts.Expression {
  if (value === null) return ts.factory.createNull();
  if (typeof value === "string") return ts.factory.createStringLiteral(value);
  if (typeof value === "number") return literalType(value).literal;
  if (typeof value === "boolean")
    return value ? ts.factory.createTrue() : ts.factory.createFalse();
  if (Array.isArray(value))
    return ts.factory.createArrayLiteralExpression(value.map(jsonExpression));
  if (typeof value === "object")
    return objectExpression(
      Object.entries(value).map(([name, item]) => [name, jsonExpression(item)]),
    );
  throw new Error(`Cannot generate a JSON expression for ${typeof value}`);
}

export function objectExpression(
  entries: readonly (readonly [string, ts.Expression])[],
  multiline = false,
): ts.ObjectLiteralExpression {
  return ts.factory.createObjectLiteralExpression(
    entries.map(([name, value]) =>
      ts.factory.createPropertyAssignment(
        name === "__proto__"
          ? ts.factory.createComputedPropertyName(
              ts.factory.createStringLiteral(name),
            )
          : ts.factory.createStringLiteral(name),
        value,
      ),
    ),
    multiline,
  );
}

export function exportedConst(
  name: string,
  value: ts.Expression,
  type?: ts.TypeNode,
): ts.VariableStatement {
  return ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [ts.factory.createVariableDeclaration(name, undefined, type, value)],
      ts.NodeFlags.Const,
    ),
  );
}

export function readonlyProperty(
  name: string,
  type: ts.TypeNode,
  description: string,
): ts.PropertySignature {
  return withJsDoc(
    ts.factory.createPropertySignature(
      [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
      name,
      undefined,
      type,
    ),
    { description },
  );
}

export function typeReference(
  name: string,
  arguments_: readonly ts.TypeNode[] = [],
): ts.TypeReferenceNode {
  return ts.factory.createTypeReferenceNode(name, arguments_);
}

export function unknownType(): ts.TypeNode {
  return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
}

export function neverType(): ts.TypeNode {
  return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NeverKeyword);
}

export function typeLiteral(
  members: readonly ts.TypeElement[],
  multiline = false,
): ts.TypeLiteralNode {
  const node = ts.factory.createTypeLiteralNode(members);
  // Keep JSDoc on its own line and attached to the following member.
  return multiline ||
    members.some((member) => ts.getSyntheticLeadingComments(member)?.length)
    ? node
    : ts.setEmitFlags(node, ts.EmitFlags.SingleLine);
}

export function unionType(types: readonly ts.TypeNode[]): ts.TypeNode {
  return types.length === 0
    ? neverType()
    : ts.factory.createUnionTypeNode(types);
}

export function withJsDoc<T extends ts.Node>(node: T, data: unknown): T {
  const comment = buildJsDoc(data);
  return withComment(node, comment);
}

export function withComment<T extends ts.Node>(node: T, comment: string): T {
  if (comment === "") {
    return node;
  }

  return ts.addSyntheticLeadingComment(
    node,
    ts.SyntaxKind.MultiLineCommentTrivia,
    comment.slice(2, comment.lastIndexOf("*/")).replaceAll("*/", "* /"),
    true,
  );
}

export function typeProperty(
  name: string,
  type: ts.TypeNode,
  optional = false,
  data?: unknown,
): ts.PropertySignature {
  return withJsDoc(
    ts.factory.createPropertySignature(
      undefined,
      /^[A-Za-z_$][\w$]*$/u.test(name)
        ? ts.factory.createIdentifier(name)
        : ts.factory.createStringLiteral(name),
      optional
        ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
        : undefined,
      type,
    ),
    data,
  );
}
