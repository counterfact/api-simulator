import ts from "typescript";

import {
  literalType,
  typeAlias,
  typeLiteral,
  typeProperty,
  typeReference,
  unionType,
  unknownType,
} from "./ast.js";
import { pathJoin } from "./forward-slash-path.js";
import { READ_ONLY_COMMENTS } from "./read-only-comments.js";
import { SchemaTypeCoder } from "./schema-type-coder.js";
import { ResponseTypeCoder } from "./response-type-coder.js";
import { TypeCoder } from "./type-coder.js";
import { Requirement } from "./requirement.js";
import type { OperationTypeCoder } from "./operation-type-coder.js";
import type { Repository } from "./repository.js";
import type { Script } from "./script.js";
import type { Specification } from "./specification.js";

const CATEGORIES = [
  "schemas",
  "parameters",
  "responses",
  "requestBodies",
  "headers",
  "examples",
  "securitySchemes",
  "links",
  "callbacks",
  "pathItems",
  "mediaTypes",
] as const;

/** Non-schema components keep their structure; embedded schemas become data types. */
class ComponentTypeCoder extends TypeCoder {
  public override modulePath(): string {
    return pathJoin(
      "types",
      this.version,
      (this.requirement.refUrl ?? this.requirement.url).replace(/^#\//u, "") +
        ".ts",
    );
  }

  public override writeCode(script: Script): ts.TypeNode {
    const category = this.requirement.url.split("/").at(-2);
    if (category === "parameters" || category === "headers") {
      const schema = this.requirement.get("schema");
      if (schema)
        return new SchemaTypeCoder(schema, this.version).write(script);
      const content = this.requirement.get("content");
      return content ? this.structure(content, script) : unknownType();
    }
    return this.structure(
      this.requirement,
      script,
      !["examples", "securitySchemes", "links"].includes(category ?? ""),
    );
  }

  private structure(
    requirement: Requirement,
    script: Script,
    schemas = true,
  ): ts.TypeNode {
    if (!schemas) return literalStructure(requirement.data);
    if (requirement.isReference) {
      return typeReference(
        script.importType(new ComponentTypeCoder(requirement, this.version)),
      );
    }
    const { data } = requirement;
    if (Array.isArray(data)) {
      return ts.factory.createTupleTypeNode(
        data.map((_, index) =>
          this.structure(requirement.get(index)!, script, schemas),
        ),
      );
    }
    if (data !== null && typeof data === "object") {
      return typeLiteral(
        requirement.map((value, key) =>
          typeProperty(
            key,
            schemas && (key === "schema" || key === "itemSchema")
              ? new SchemaTypeCoder(value, this.version).write(script)
              : this.structure(
                  value,
                  script,
                  key !== "example" && key !== "value",
                ),
          ),
        ),
      );
    }
    return literalType(data);
  }
}

/** One public entry point per API group, assembled after all versions register. */
class CentralTypes {
  private readonly script: Script;
  private readonly routes = new Map<string, Map<string, ts.TypeNode>>();
  private readonly components = new Map<
    string,
    Map<string, Map<string, ts.TypeNode>>
  >();

  public constructor(repository: Repository) {
    this.script = repository.get("types/index.ts");
    this.script.comments.push(...READ_ONLY_COMMENTS);
    this.script.reservedNames = new Set(["Routes", "Components", "Schemas"]);
    this.script.statementBuilders.set("api-types", () => [
      typeAlias(
        "Routes",
        typeLiteral(
          [...this.routes].map(([path, methods]) =>
            typeProperty(
              path,
              typeLiteral(
                [...methods].map(([method, type]) =>
                  typeProperty(method, type),
                ),
              ),
            ),
          ),
        ),
      ),
      typeAlias(
        "Components",
        typeLiteral(
          CATEGORIES.map((category) =>
            typeProperty(
              category,
              typeLiteral(
                [...(this.components.get(category) ?? [])].map(
                  ([name, versions]) =>
                    typeProperty(name, unionType([...versions.values()])),
                ),
              ),
            ),
          ),
        ),
      ),
      typeAlias(
        "Schemas",
        ts.factory.createIndexedAccessTypeNode(
          typeReference("Components"),
          literalType("schemas"),
        ),
      ),
    ]);
  }

  public addOperation(
    path: string,
    method: string,
    coder: OperationTypeCoder,
  ): void {
    const methods = this.routes.get(path) ?? new Map<string, ts.TypeNode>();
    this.routes.set(path, methods);
    methods.set(
      method.toUpperCase(),
      typeReference(
        this.script.importType(
          coder,
          `Route${this.routes.size}_${method.toUpperCase()}`,
        ),
      ),
    );
  }

  public addComponents(specification: Specification, version: string): void {
    for (const category of CATEGORIES) {
      specification
        .getRequirement(`#/components/${category}`)
        ?.forEach((component, name) => {
          const components =
            this.components.get(category) ??
            new Map<string, Map<string, ts.TypeNode>>();
          this.components.set(category, components);
          const versions =
            components.get(name) ?? new Map<string, ts.TypeNode>();
          components.set(name, versions);
          // Import by reference so the existing coder chooses the canonical module
          // and resolves component aliases without duplicating their definitions.
          const reference = new Requirement(
            {
              $ref: `#/components/${category}/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`,
            },
            component.url,
            specification,
          );
          const Coder =
            category === "schemas"
              ? SchemaTypeCoder
              : category === "responses"
                ? ResponseTypeCoder
                : ComponentTypeCoder;
          versions.set(
            version,
            typeReference(
              this.script.importType(new Coder(reference, version)),
            ),
          );
        });
    }
  }
}

const indexes = new WeakMap<Repository, CentralTypes>();

export function centralTypes(repository: Repository): CentralTypes {
  let index = indexes.get(repository);
  if (!index) {
    index = new CentralTypes(repository);
    indexes.set(repository, index);
  }
  return index;
}

function literalStructure(data: unknown): ts.TypeNode {
  if (Array.isArray(data))
    return ts.factory.createTupleTypeNode(data.map(literalStructure));
  if (data !== null && typeof data === "object")
    return typeLiteral(
      Object.entries(data).map(([key, value]) =>
        typeProperty(key, literalStructure(value)),
      ),
    );
  return literalType(data as string | number | boolean | null);
}
