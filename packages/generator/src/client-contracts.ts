import ts from "typescript";

import {
  printNode,
  typeLiteral,
  typeProperty,
  unionType,
  unknownType,
} from "./ast.js";
import { pascalCase, uniqueName } from "./client-operations.js";
import { Requirement } from "./requirement.js";
import { SchemaTypeCoder } from "./schema-type-coder.js";
import type { Script } from "./script.js";
import type { Specification } from "./specification.js";

/** Directory, inside the client, that holds one file per data contract. */
export const DATA_CONTRACTS_DIRECTORY = "data-contracts";

/** JSON Pointer locations whose entries become named data contracts. */
const CONTRACT_COLLECTIONS = ["#/components/schemas", "#/definitions"];

/** Names the generated client declares itself, which data contracts must avoid. */
export interface ContractNaming {
  directory: string;
  reserved: Iterable<string>;
  typePrefix?: string;
  typeSuffix?: string;
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function unescapePointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function isJsonMediaType(mediaType: string): boolean {
  const essence = mediaType.split(";")[0]!.trim().toLowerCase();
  return (
    essence === "application/json" ||
    (essence.startsWith("application/") && essence.endsWith("+json"))
  );
}

/**
 * `unknown` for no types, the type itself for one, otherwise the union of the
 * distinct types (responses often share an error schema).
 */
function union(types: readonly ts.TypeNode[]): ts.TypeNode {
  const distinct = [
    ...new Map(types.map((type) => [printNode(type), type])).values(),
  ];
  if (distinct.length === 0) return unknownType();
  return distinct.length === 1 ? distinct[0]! : unionType(distinct);
}

function resolve(requirement: Requirement): Requirement {
  let resolved = requirement;
  while (resolved.isReference) resolved = resolved.reference();
  return resolved;
}

/**
 * A {@link SchemaTypeCoder} that declares each named schema in its own file
 * under `client/data-contracts/`, named by `contracts`.
 */
function contractTypeCoder(
  contracts: DataContracts,
): new (requirement: Requirement) => SchemaTypeCoder {
  return class ContractTypeCoder extends SchemaTypeCoder {
    protected override child(requirement: Requirement): SchemaTypeCoder {
      return new ContractTypeCoder(requirement);
    }

    public override *names(): Generator<string> {
      const name = contracts.nameFor(
        this.requirement.refUrl ?? this.requirement.url,
      );
      yield name;
      for (let index = 2; index < 100; index += 1) yield `${name}${index}`;
    }

    public override modulePath(): string {
      return contracts.modulePath(
        this.requirement.refUrl ?? this.requirement.url,
      );
    }
  };
}

/**
 * Declares the data contracts of a standalone client: every named schema in
 * its own file under `client/data-contracts/`, referenced by the client's
 * modules instead of the shared `types/` directory.
 */
export class DataContracts {
  private readonly names = new Map<string, string>();
  private readonly taken: Set<string>;
  private readonly Coder: new (requirement: Requirement) => SchemaTypeCoder;

  public constructor(
    private readonly specification: Specification,
    private readonly naming: ContractNaming,
  ) {
    this.taken = new Set(
      [...naming.reserved].map((name) => name.toLowerCase()),
    );
    // Name every collection entry up front so names do not depend on the
    // order in which operations reference them.
    for (const collection of CONTRACT_COLLECTIONS) {
      specification.getRequirement(collection)?.forEach((_, name) => {
        this.nameFor(`${collection}/${escapePointerSegment(name)}`);
      });
    }

    this.Coder = contractTypeCoder(this);
  }

  /** Every named contract, as `[typeName, refUrl]`, in declaration order. */
  public get entries(): [string, string][] {
    return [...this.names].map(([refUrl, name]) => [name, refUrl]);
  }

  /**
   * The unique, case-insensitively distinct name for the contract at
   * `refUrl`. Names are also file names, so `OutputType` and `OutPutType`
   * must not share one.
   */
  public nameFor(refUrl: string): string {
    const existing = this.names.get(refUrl);
    if (existing !== undefined) return existing;
    const raw = unescapePointerSegment(refUrl.split("/").at(-1) ?? "");
    const name = uniqueName(
      `${this.naming.typePrefix ?? ""}${pascalCase(raw)}${this.naming.typeSuffix ?? ""}`,
      this.taken,
    );
    this.names.set(refUrl, name);
    return name;
  }

  /** The client-relative file that declares the contract at `refUrl`. */
  public modulePath(refUrl: string): string {
    return `${this.naming.directory}/${DATA_CONTRACTS_DIRECTORY}/${this.nameFor(refUrl)}.ts`;
  }

  /** Declares the contract at `refUrl` in its own file. */
  public declare(script: Script, refUrl: string): void {
    script.exportType(this.coder({ $ref: refUrl }));
  }

  /** Writes the type of `schema`, importing the contracts it references. */
  public type(script: Script, schema: Requirement | undefined): ts.TypeNode {
    return schema === undefined
      ? unknownType()
      : new this.Coder(schema).write(script);
  }

  private coder(data: Record<string, unknown>): SchemaTypeCoder {
    return new this.Coder(new Requirement(data, "", this.specification));
  }

  /**
   * The resolved parameters of an operation, keyed by `location:name`, with
   * operation-level parameters overriding path-level ones.
   */
  public parameters(
    pathItem: Requirement,
    operation: Requirement,
  ): Map<string, Requirement> {
    const parameters = new Map<string, Requirement>();
    for (const list of [
      pathItem.get("parameters"),
      operation.get("parameters"),
    ]) {
      list?.forEach((parameter) => {
        const resolved = resolve(parameter);
        const { in: location, name } = resolved.data as {
          in: string;
          name: string;
        };
        parameters.set(`${location}:${name}`, resolved);
      });
    }
    return parameters;
  }

  /** The type of one parameter: its schema (OpenAPI 3) or the parameter itself (Swagger 2). */
  public parameterType(script: Script, parameter: Requirement): ts.TypeNode {
    if (parameter.has("schema")) {
      return this.type(script, parameter.get("schema"));
    }
    if (parameter.has("content")) {
      return this.contentType(script, parameter.get("content")!);
    }
    return this.type(script, parameter);
  }

  /** An object type with one property per parameter, honoring `required`. */
  public parameterObject(
    script: Script,
    parameters: Iterable<Requirement>,
  ): ts.TypeNode {
    return typeLiteral(
      [...parameters].map((parameter) => {
        const { name, required } = parameter.data as {
          name: string;
          required?: boolean;
        };
        return typeProperty(
          name,
          this.parameterType(script, parameter),
          required !== true,
          parameter.data,
        );
      }),
    );
  }

  /**
   * The schema type of a content map, preferring JSON media types because the
   * client parses JSON by default.
   */
  public contentType(script: Script, content: Requirement): ts.TypeNode {
    const mediaTypes = content.map((_, mediaType) => mediaType);
    const json = mediaTypes.filter(isJsonMediaType);
    const selected = json.length > 0 ? json : mediaTypes;
    const types = selected.map((mediaType) => {
      const schema = resolve(content.get(mediaType)!).get("schema");
      return schema === undefined ? unknownType() : this.type(script, schema);
    });
    return union(types);
  }

  /** The request body type, or `undefined` when the operation has none. */
  public bodyType(
    script: Script,
    operation: Requirement,
    parameters: Map<string, Requirement>,
  ): ts.TypeNode | undefined {
    const requestBody = operation.get("requestBody");
    if (requestBody !== undefined) {
      const content = resolve(requestBody).get("content");
      return content === undefined
        ? unknownType()
        : this.contentType(script, content);
    }

    // Swagger 2.0 declares bodies as parameters.
    const all = [...parameters.values()];
    const body = all.find(
      (parameter) => (parameter.data as { in: string }).in === "body",
    );
    if (body !== undefined) return this.type(script, body.get("schema"));

    const form = all.filter(
      (parameter) => (parameter.data as { in: string }).in === "formData",
    );
    return form.length === 0 ? undefined : this.parameterObject(script, form);
  }

  /**
   * The union of response bodies whose status is (or is not) 2xx: `void` for
   * a response without content, and `unknown` when there are no such
   * responses.
   */
  public responseType(
    script: Script,
    operation: Requirement,
    success: boolean,
  ): ts.TypeNode {
    const types: ts.TypeNode[] = [];
    operation.get("responses")?.forEach((response, status) => {
      if (/^2(?:\d\d|XX)$/iu.test(status) !== success) return;
      const resolved = resolve(response);
      const content = resolved.get("content");
      if (content !== undefined && content.map((_, key) => key).length > 0) {
        types.push(this.contentType(script, content));
      } else if (resolved.has("schema")) {
        types.push(this.type(script, resolved.get("schema")));
      } else {
        types.push(ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword));
      }
    });
    return union(types);
  }
}
