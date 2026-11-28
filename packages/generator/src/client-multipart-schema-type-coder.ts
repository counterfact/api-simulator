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
    private readonly encoding?: Requirement,
  ) {
    super(requirement, version);
  }

  protected override child(requirement: Requirement): SchemaTypeCoder {
    const properties = this.requirement.get("properties");
    const property =
      properties !== undefined && requirement.parent?.url === properties.url;
    const position = property
      ? this.position === "root"
        ? "part"
        : "nested"
      : this.position;
    if (property && this.position === "root" && this.encoding) {
      const name = requirement.unescapeJsonPointer(
        requirement.url.slice(properties.url.length + 1),
      );
      const contentType = this.encoding.get(name)?.get("contentType")?.data;
      if (
        typeof contentType === "string" &&
        contentType.split(",").every((type) => {
          const essence = type.split(";")[0]?.trim().toLowerCase();
          return essence === "application/json" || essence?.endsWith("+json");
        })
      )
        return new SchemaTypeCoder(requirement, this.version);
    }
    return new ClientMultipartSchemaTypeCoder(
      requirement,
      this.version,
      position,
      this.legacyStrings,
      position === "root" ? this.encoding : undefined,
    );
  }

  public override get id(): string {
    return `${super.id}:${this.position}:${this.legacyStrings}:${this.encoding?.url ?? ""}`;
  }

  public override async delegate(): Promise<ClientMultipartSchemaTypeCoder> {
    return this.requirement.isReference
      ? new ClientMultipartSchemaTypeCoder(
          this.requirement.reference(),
          this.version,
          this.position,
          this.legacyStrings,
          this.encoding,
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
