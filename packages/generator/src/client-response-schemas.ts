import { isSwagger2 } from "./swagger2-client.js";

import type { Requirement, RequirementData } from "./requirement.js";
import type { Specification } from "./specification.js";

const schemaMaps = new Set([
  "$defs",
  "definitions",
  "properties",
  "patternProperties",
  "dependentSchemas",
  "dependencies",
]);
const subschemas = new Set([
  "additionalItems",
  "additionalProperties",
  "allOf",
  "anyOf",
  "contains",
  "contentSchema",
  "else",
  "if",
  "items",
  "not",
  "oneOf",
  "prefixItems",
  "propertyNames",
  "then",
  "unevaluatedItems",
  "unevaluatedProperties",
]);

/** Collect response schemas and their bundled references in one schema resource. */
export class ClientResponseSchemas {
  private readonly definitions = new Map<string, unknown>();
  private readonly validators = new Set<string>();
  private readonly keys = new Map<RequirementData, string>();
  private readonly draft: "7" | "2020-12";
  private readonly resource =
    "https://counterfact.invalid/client-response-schemas";

  public constructor(private readonly specification: Specification) {
    const version = String(specification.getRequirement("#/openapi")?.data);
    this.draft =
      isSwagger2(specification) || version.startsWith("3.0.") ? "7" : "2020-12";
  }

  public add(schema: Requirement): string {
    const key = this.addDefinition(schema);
    this.validators.add(key);
    return key;
  }

  private addDefinition(schema: Requirement): string {
    const previous = this.keys.get(schema.data);
    if (previous !== undefined) return previous;
    const key = `schema${this.keys.size}`;
    // Allocate the key before following references so recursive schemas can point back to it.
    this.keys.set(schema.data, key);
    this.definitions.set(key, this.visit(schema.data, false));
    return key;
  }

  public output() {
    if (this.definitions.size === 0) return undefined;
    return {
      draft: this.draft,
      validators: Object.fromEntries(
        [...this.validators].map((key) => [key, this.pointer(key)]),
      ),
      schema: {
        $id: this.resource,
        $defs: Object.fromEntries(this.definitions),
      },
    };
  }

  private reference(pointer: string): string | undefined {
    if (!pointer.startsWith("#/")) return undefined;
    const target = this.specification.getRequirement(pointer);
    return target && this.pointer(this.addDefinition(target));
  }

  private pointer(key: string): string {
    return this.resource + "#/$defs/" + key;
  }

  private visit(schema: unknown, nestedResource: boolean): unknown {
    if (Array.isArray(schema)) {
      return schema.map((child) => this.visit(child, nestedResource));
    }
    if (typeof schema !== "object" || schema === null) return schema;
    const entries = Object.entries(schema);
    const localResource =
      nestedResource || entries.some(([key]) => key === "$id");
    const keywords = new Map(entries);
    return Object.fromEntries(
      entries.flatMap(([key, value]): [string, unknown][] => {
        // Swagger 2.0 and OpenAPI 3.0 express exclusive limits as booleans beside the limit.
        if (this.draft === "7" && typeof value === "boolean") {
          const limit =
            key === "exclusiveMinimum"
              ? keywords.get("minimum")
              : key === "exclusiveMaximum"
                ? keywords.get("maximum")
                : undefined;
          if (key === "exclusiveMinimum" || key === "exclusiveMaximum") {
            return value && typeof limit === "number" ? [[key, limit]] : [];
          }
        }
        if (key === "$ref" && typeof value === "string" && !localResource) {
          return [[key, this.reference(value) ?? value]];
        }
        if (
          schemaMaps.has(key) &&
          typeof value === "object" &&
          value !== null
        ) {
          return [
            [
              key,
              Object.fromEntries(
                Object.entries(value).map(([name, child]) => [
                  name,
                  this.visit(child, localResource),
                ]),
              ),
            ],
          ];
        }
        return [
          [key, subschemas.has(key) ? this.visit(value, localResource) : value],
        ];
      }),
    );
  }
}
