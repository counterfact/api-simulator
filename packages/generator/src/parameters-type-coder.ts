import type ts from "typescript";

import { neverType, typeLiteral, typeProperty } from "./ast.js";
import { TypeCoder } from "./type-coder.js";
import { pathJoin } from "./forward-slash-path.js";
import { SchemaTypeCoder } from "./schema-type-coder.js";
import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";

export class ParametersTypeCoder extends TypeCoder {
  public placement: string;

  public constructor(requirement: Requirement, version = "", placement = "") {
    super(requirement, version);
    this.placement = placement;
  }

  public override names(): Generator<string> {
    return super.names("parameters");
  }

  public override writeCode(script: Script): ts.TypeNode {
    const members = ((this.requirement?.data as unknown as unknown[]) ?? [])
      .map((_, index) => this.requirement.get(index)!)
      .filter((parameter) => parameter.get("in")!.data === this.placement)
      .map((parameter) => {
        const name = parameter.get("name")?.data as string | undefined;
        const required = parameter.get("required")?.data as boolean | undefined;
        const schema = parameter.get("schema") ?? parameter;
        return typeProperty(
          String(name),
          new SchemaTypeCoder(schema, this.version).write(script),
          !required,
          parameter.data,
        );
      });

    return members.length === 0 ? neverType() : typeLiteral(members);
  }

  public override modulePath(): string {
    const pathString = this.requirement.url
      .split("/")
      .at(-2)!
      .replaceAll("~1", "/");
    return `${pathJoin("parameters", pathString)}.types.ts`;
  }
}
