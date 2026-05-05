import { printObject } from "./printers.js";
import { SchemaTypeCoder } from "./schema-type-coder.js";
import { TypeCoder } from "./type-coder.js";
import type { Requirement } from "./requirement.js";
import type { Script } from "./script.js";
import { pathJoin } from "../util/forward-slash-path.js";

const STREAMING_CONTENT_TYPES = new Set([
  "text/event-stream",
  "application/jsonl",
  "application/x-ndjson",
  "application/ndjson",
  "application/json-seq",
]);

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
    return super.names(
      (this.requirement.data["$ref"] as string).split("/").at(-1),
    );
  }

  public buildContentObjectType(
    script: Script,
    response: Requirement,
  ): [string, string][] {
    if (response.has("content")) {
      return response
        .get("content")!
        .map((content, mediaType): [string, string] => {
          let schemaType: string;

          if (
            content.has("itemSchema") &&
            STREAMING_CONTENT_TYPES.has(mediaType)
          ) {
            schemaType = `AsyncIterable<${new SchemaTypeCoder(
              content.get("itemSchema")!,
              this.version,
            ).write(script)}>`;
          } else {
            schemaType = content.has("schema")
              ? new SchemaTypeCoder(content.get("schema")!, this.version).write(
                  script,
                )
              : "unknown";
          }

          return [
            mediaType,
            `{ 
            schema:  ${schemaType}
         }`,
          ];
        });
    }

    return this.openApi2MediaTypes.map((mediaType): [string, string] => [
      mediaType,
      `{
            schema: ${new SchemaTypeCoder(response.get("schema")!, this.version).write(script)}
         }`,
    ]);
  }

  public printContentObjectType(script: Script, response: Requirement): string {
    if (response.has("content") || response.has("schema")) {
      return printObject(this.buildContentObjectType(script, response));
    }

    return "never";
  }

  public buildHeaders(
    script: Script,
    response: Requirement,
  ): [string, string][] {
    return response
      .get("headers")!
      .map((value, name): [string, string] => [
        name,
        `{ schema: ${new SchemaTypeCoder(
          value.get("schema") ?? value,
          this.version,
        ).write(script)}}`,
      ]);
  }

  public printHeaders(script: Script, response: Requirement): string {
    if (!response.has("headers")) {
      return "never";
    }

    return printObject(this.buildHeaders(script, response));
  }

  public printRequiredHeaders(response: Requirement): string {
    const requiredHeaders = (
      response.get("headers")?.map((value, name) => ({
        name,
        required: (value.data as { required?: boolean }).required,
      })) ?? []
    )
      .filter(({ required }) => required)
      .map(({ name }) => `"${name}"`);

    return requiredHeaders.length === 0 ? "never" : requiredHeaders.join(" | ");
  }

  public buildExamplesObjectType(response: Requirement): string {
    if (!response.has("content")) {
      return "{}";
    }

    const exampleNames: string[] = [];

    response.get("content")!.forEach((content) => {
      if (content.has("examples")) {
        content.get("examples")!.forEach((_, name) => {
          if (!exampleNames.includes(name)) {
            exampleNames.push(name);
          }
        });
      }
    });

    if (exampleNames.length === 0) {
      return "{}";
    }

    return printObject(
      exampleNames.map((name): [string, string] => [name, "unknown"]),
    );
  }

  public override modulePath(): string {
    return pathJoin(
      "types",
      this.version,
      this.requirement.data["$ref"]! + ".ts",
    );
  }

  public override writeCode(script: Script): string {
    return `{
          headers: ${this.printHeaders(script, this.requirement)};
          requiredHeaders: ${this.printRequiredHeaders(this.requirement)};
          content: ${this.printContentObjectType(script, this.requirement)};
          examples: ${this.buildExamplesObjectType(this.requirement)};
        }`;
  }
}
