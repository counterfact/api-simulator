import type ts from "typescript";
import { TypeCoder } from "./type-coder.js";
import type { Requirement } from "./requirement.js";

export class ParameterExportTypeCoder extends TypeCoder {
  public _typeName: string;
  public _typeCode: ts.TypeNode;
  public _parameterKind: string;
  public _modulePath!: string;

  public constructor(
    requirement: Requirement,
    version: string,
    typeName: string,
    typeCode: ts.TypeNode,
    parameterKind: string,
  ) {
    super(requirement, version);
    this._typeName = typeName;
    this._typeCode = typeCode;
    this._parameterKind = parameterKind;
  }

  public override get id(): string {
    // Make the id unique by including the parameter kind
    return `${super.id}:${this._parameterKind}`;
  }

  public override *names(): Generator<string> {
    yield this._typeName;
  }

  public override writeCode(): ts.TypeNode {
    return this._typeCode;
  }

  public override modulePath(): string {
    // Use the same module path as the parent operation
    return this._modulePath;
  }
}
