import type ts from "typescript";

import { typeReference, unionType } from "./ast.js";
import { SchemaTypeCoder } from "./schema-type-coder.js";

import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";

/** Model file inputs directly without changing the JSON representation of a shared schema. */
export class ClientMultipartSchemaTypeCoder extends SchemaTypeCoder {
  public constructor(
    requirement: Requirement,
    version = "",
    private readonly position: "root" | "part" | "nested" = "root",
    private readonly legacyStrings = false,
  ) {
    super(requirement, version);
  }

  protected override child(requirement: Requirement): SchemaTypeCoder {
    const property = requirement.parent?.url.endsWith("/properties");
    const position = property
      ? this.position === "root"
        ? "part"
        : "nested"
      : this.position;
    return new ClientMultipartSchemaTypeCoder(
      requirement,
      this.version,
      position,
      this.legacyStrings,
    );
  }

  public override get id(): string {
    return `${super.id}:${this.position}:${this.legacyStrings}`;
  }

  public override async delegate(): Promise<ClientMultipartSchemaTypeCoder> {
    return this.requirement.isReference
      ? new ClientMultipartSchemaTypeCoder(
          this.requirement.reference(),
          this.version,
          this.position,
          this.legacyStrings,
        )
      : this;
  }

  public override modulePath(): string {
    return super.modulePath().replace("types/", "types/multipart/");
  }

  protected override writeSchema(script: Script): ts.TypeNode {
    const raw = this.requirement.get("type")?.data;
    const types = Array.isArray(raw) ? raw : [raw];
    const binaryString =
      types.includes("string") &&
      this.requirement.get("format")?.data === "binary";
    const data = this.requirement.data;
    const openapi =
      this.requirement.specification?.getRequirement("#/openapi")?.data;
    const emptyRawPart =
      this.position === "part" &&
      typeof openapi === "string" &&
      /^3\.[1-9]\d*\./u.test(openapi) &&
      data !== null &&
      typeof data === "object" &&
      Object.keys(data).every((key) =>
        ["title", "description", "$comment"].includes(key),
      );
    const rawBinary =
      raw === undefined &&
      (emptyRawPart ||
        typeof this.requirement.get("contentMediaType")?.data === "string") &&
      !["contentEncoding", "properties", "items", "additionalProperties"].some(
        (keyword) => this.requirement.has(keyword),
      );

    if (
      !(binaryString || rawBinary || types.includes("file")) ||
      ["allOf", "anyOf", "oneOf", "enum", "const"].some((keyword) =>
        this.requirement.has(keyword),
      )
    ) {
      return super.writeSchema(script);
    }

    const alternatives = types.filter(
      (type) =>
        type !== undefined &&
        type !== "file" &&
        (type !== "string" || !binaryString),
    );
    return unionType([
      typeReference("Blob"),
      typeReference("Uint8Array"),
      ...(this.legacyStrings && (binaryString || types.includes("file"))
        ? [this.writeType(script, "string")]
        : []),
      ...alternatives.map((type) => this.writeType(script, type)),
    ]);
  }
}
