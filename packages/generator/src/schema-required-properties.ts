import ts from "typescript";

import {
  typeLiteral,
  typeProperty,
  typeReference,
  unionType,
  unknownType,
  neverType,
} from "./ast.js";

/** Apply a containing schema's required list without changing shared referenced models. */
export function requireProperties(
  type: ts.TypeNode,
  names: readonly string[],
): ts.TypeNode {
  if (ts.isParenthesizedTypeNode(type)) {
    return ts.factory.createParenthesizedType(
      requireProperties(type.type, names),
    );
  }
  if (ts.isUnionTypeNode(type)) {
    return unionType(
      type.types.map((branch) => requireProperties(branch, names)),
    );
  }
  if (ts.isIntersectionTypeNode(type)) {
    return ts.factory.createIntersectionTypeNode(
      type.types.map((part) => requireProperties(part, names)),
    );
  }
  if (ts.isTypeLiteralNode(type)) {
    const present = new Set<string>();
    const members = type.members.map((member) => {
      if (
        !ts.isPropertySignature(member) ||
        !member.name ||
        ts.isComputedPropertyName(member.name)
      )
        return member;
      const name = member.name.text;
      present.add(name);
      return names.includes(name)
        ? ts.factory.updatePropertySignature(
            member,
            member.modifiers,
            member.name,
            undefined,
            member.type,
          )
        : member;
    });
    for (const name of names) {
      if (!present.has(name)) members.push(typeProperty(name, unknownType()));
    }
    return typeLiteral(members);
  }
  if (type.kind !== ts.SyntaxKind.TypeReference) return type;

  // Distribute over referenced unions. A mapped type preserves each property's
  // original type while removing optionality only for the requested keys.
  const schema = typeReference("RequiredSchema");
  const key = typeReference("RequiredKey");
  const keys = unionType(
    names.map((name) =>
      ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(name)),
    ),
  );
  const selected = ts.factory.createMappedTypeNode(
    undefined,
    ts.factory.createTypeParameterDeclaration(
      undefined,
      "RequiredKey",
      ts.factory.createTypeOperatorNode(ts.SyntaxKind.KeyOfKeyword, schema),
    ),
    ts.factory.createConditionalTypeNode(key, keys, key, neverType()),
    ts.factory.createToken(ts.SyntaxKind.MinusToken),
    ts.factory.createIndexedAccessTypeNode(schema, key),
    undefined,
  );
  const enforced = ts.factory.createIntersectionTypeNode([
    schema,
    selected,
    typeLiteral(names.map((name) => typeProperty(name, unknownType()))),
  ]);
  return ts.factory.createConditionalTypeNode(
    type,
    ts.factory.createInferTypeNode(
      ts.factory.createTypeParameterDeclaration(undefined, "RequiredSchema"),
    ),
    ts.factory.createConditionalTypeNode(
      schema,
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword),
      enforced,
      schema,
    ),
    neverType(),
  );
}
