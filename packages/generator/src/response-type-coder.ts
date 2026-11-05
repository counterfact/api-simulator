import { STREAMING_CONTENT_TYPES } from "@counterfact/types/streaming-content-types";
import ts from "typescript";

import {
  neverType,
  typeLiteral,
  typeProperty,
  typeReference,
  unionType,
  unknownType,
} from "./ast.js";
import { TypeCoder } from "./type-coder.js";
import { pathJoin } from "./forward-slash-path.js";
import { SchemaTypeCoder } from "./schema-type-coder.js";
import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";

export class ResponseTypeCoder extends TypeCoder {
  public openApi2MediaTypes: string[];

  public constructor(
    requirement: Requirement,
    version = "",
    openApi2MediaTypes: string[] = [],
  ) {
    super(requirement, version);
    this.openApi2MediaTypes = openApi2MediaTypes;
  }

  public override names(): Generator<string> {
    return super.names((this.requirement.refUrl as string).split("/").at(-1));
  }

  public buildContentObjectType(
    script: Script,
    response: Requirement,
  ): [string, ts.TypeNode][] {
    if (response.has("content")) {
      return response
        .get("content")!
        .map((content, mediaType): [string, ts.TypeNode] => {
          let schemaType: ts.TypeNode;
          if (
            content.has("itemSchema") &&
            STREAMING_CONTENT_TYPES.has(mediaType)
          ) {
            schemaType = typeReference("AsyncIterable", [
              new SchemaTypeCoder(
                content.get("itemSchema")!,
                this.version,
              ).write(script),
            ]);
          } else {
            schemaType = content.has("schema")
              ? new SchemaTypeCoder(content.get("schema")!, this.version).write(
                  script,
                )
              : unknownType();
          }
          return [
            mediaType,
            typeLiteral([typeProperty("schema", schemaType)], true),
          ];
        });
    }

    return this.openApi2MediaTypes.map((mediaType): [string, ts.TypeNode] => [
      mediaType,
      typeLiteral(
        [
          typeProperty(
            "schema",
            new SchemaTypeCoder(response.get("schema")!, this.version).write(
              script,
            ),
          ),
        ],
        true,
      ),
    ]);
  }

  public contentType(script: Script, response: Requirement): ts.TypeNode {
    return response.has("content") || response.has("schema")
      ? typeLiteral(
          this.buildContentObjectType(script, response).map(([name, type]) =>
            typeProperty(name, type),
          ),
          true,
        )
      : neverType();
  }

  public headersType(script: Script, response: Requirement): ts.TypeNode {
    if (!response.has("headers")) {
      return neverType();
    }

    return typeLiteral(
      response
        .get("headers")!
        .map((value, name) =>
          typeProperty(
            name,
            typeLiteral([
              typeProperty(
                "schema",
                new SchemaTypeCoder(
                  value.get("schema") ?? value,
                  this.version,
                ).write(script),
              ),
            ]),
          ),
        ),
      true,
    );
  }

  public requiredHeadersType(response: Requirement): ts.TypeNode {
    const headers =
      response.get("headers")?.map((value, name) => ({
        name,
        required: (value.data as { required?: boolean }).required,
      })) ?? [];

    return unionType(
      headers
        .filter(({ required }) => required)
        .map(({ name }) =>
          ts.factory.createLiteralTypeNode(
            ts.factory.createStringLiteral(name),
          ),
        ),
    );
  }

  public buildExamplesObjectType(response: Requirement): ts.TypeLiteralNode {
    const names = new Set<string>();
    response.get("content")?.forEach((content) => {
      content.get("examples")?.forEach((_, name) => names.add(name));
    });

    return typeLiteral(
      [...names].map((name) => typeProperty(name, unknownType())),
      names.size > 0,
    );
  }

  public override modulePath(): string {
    return pathJoin("types", this.version, this.requirement.refUrl! + ".ts");
  }

  public override writeCode(script: Script): ts.TypeNode {
    return typeLiteral(
      [
        typeProperty("headers", this.headersType(script, this.requirement)),
        typeProperty(
          "requiredHeaders",
          this.requiredHeadersType(this.requirement),
        ),
        typeProperty("content", this.contentType(script, this.requirement)),
        typeProperty(
          "examples",
          this.buildExamplesObjectType(this.requirement),
        ),
      ],
      true,
    );
  }
}
