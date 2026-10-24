import ts from "typescript";

import { typeLiteral, typeReference, unionType } from "./ast.js";
import { TypeCoder } from "./type-coder.js";
import { ResponseTypeCoder } from "./response-type-coder.js";
import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";

function statusName(status: string): ts.NumericLiteral | ts.StringLiteral {
  return /^\d+$/u.test(status)
    ? ts.factory.createNumericLiteral(status)
    : ts.factory.createStringLiteral(status);
}

function statusLiteral(status: string): ts.LiteralTypeNode {
  return ts.factory.createLiteralTypeNode(statusName(status));
}

export class ResponsesTypeCoder extends TypeCoder {
  public openApi2MediaTypes: string[];

  public constructor(
    requirement: Requirement,
    version = "",
    openApi2MediaTypes: string[] = [],
  ) {
    super(requirement, version);
    this.openApi2MediaTypes = openApi2MediaTypes;
  }

  public typeForDefaultStatusCode(listedStatusCodes: string[]): ts.TypeNode {
    const defined = listedStatusCodes.filter((key) => key !== "default");
    const status = typeReference("HttpStatusCode");
    return defined.length === 0
      ? status
      : typeReference("Exclude", [
          status,
          unionType(defined.map(statusLiteral)),
        ]);
  }

  public buildResponseObjectType(script: Script): ts.TypeNode {
    const members: ts.TypeElement[] = [];
    let fallback: ts.MappedTypeNode | undefined;
    this.requirement.forEach((response, code) => {
      const type = new ResponseTypeCoder(
        response,
        this.version,
        this.openApi2MediaTypes,
      ).write(script);
      if (code === "default") {
        fallback = ts.factory.createMappedTypeNode(
          undefined,
          ts.factory.createTypeParameterDeclaration(
            undefined,
            "statusCode",
            this.typeForDefaultStatusCode(
              Object.keys(this.requirement.data as Record<string, unknown>),
            ),
          ),
          undefined,
          undefined,
          type,
          undefined,
        );
      } else {
        members.push(
          ts.factory.createPropertySignature(
            undefined,
            statusName(code),
            undefined,
            type,
          ),
        );
      }
    });

    const explicit = typeLiteral(members, true);
    return fallback
      ? members.length > 0
        ? ts.factory.createIntersectionTypeNode([explicit, fallback])
        : fallback
      : explicit;
  }

  public override writeCode(script: Script): ts.TypeNode {
    script.importSharedType("ResponseBuilderFactory");
    const type = this.buildResponseObjectType(script);
    if (this.requirement.has("default")) {
      script.importSharedType("HttpStatusCode");
    }
    return typeReference("ResponseBuilderFactory", [type]);
  }
}
