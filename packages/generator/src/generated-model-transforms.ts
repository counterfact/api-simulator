import ts from "typescript";

import type { SchemaTypeTransform } from "./schema-type-transform.js";

/** Options shared by adapters for existing generated model exports. */
export interface GeneratedModelTransformOptions {
  /** Importable package/barrel, or a resolver for generators with one file per model.
   * Relative paths resolve from each generated Counterfact type file.
   */
  readonly moduleSpecifier: string | ((schemaName: string) => string);
  /** Exported model name (schema key for openapi-typescript).
   * Defaults to the exact OpenAPI schema name. Return undefined to keep
   * Counterfact's default for this model. Use this for renamed/omitted models.
   */
  readonly typeName?: (schemaName: string) => string | undefined;
}

function modelTransform(
  options: GeneratedModelTransformOptions,
  indexed: boolean,
): SchemaTypeTransform {
  // Capture options so later configuration mutations cannot change regeneration.
  const { moduleSpecifier, typeName = (name) => name } = options;
  if (typeof moduleSpecifier === "string" && !moduleSpecifier.trim()) {
    throw new TypeError("A generated model moduleSpecifier is required.");
  }
  return (_schema, defaultType, script, { schemaPath }) => {
    const parts = schemaPath.split("/");
    const isComponent =
      parts.length === 4 &&
      parts[0] === "#" &&
      parts[1] === "components" &&
      parts[2] === "schemas";
    const isDefinition =
      parts.length === 3 && parts[0] === "#" && parts[1] === "definitions";
    if (!isComponent && !(isDefinition && !indexed)) return defaultType;

    const name = parts.at(-1)!.replaceAll("~1", "/").replaceAll("~0", "~");
    const exportedName = typeName(name);
    if (exportedName === undefined) return defaultType;
    const module =
      typeof moduleSpecifier === "function"
        ? moduleSpecifier(name)
        : moduleSpecifier;
    if (indexed) {
      const schemas = ts.factory.createIndexedAccessTypeNode(
        script.importType(module, "components"),
        ts.factory.createLiteralTypeNode(
          ts.factory.createStringLiteral("schemas"),
        ),
      );
      return ts.factory.createIndexedAccessTypeNode(
        schemas,
        ts.factory.createLiteralTypeNode(
          ts.factory.createStringLiteral(exportedName),
        ),
      );
    }
    return script.importType(module, exportedName);
  };
}

/** Reuse openapi-typescript's components["schemas"][name] exports (OpenAPI 3). */
export function openapiTypescriptTransform(
  options: GeneratedModelTransformOptions,
): SchemaTypeTransform {
  return modelTransform(options, true);
}

/** Reuse named models from @hey-api/openapi-ts's types.gen.ts or a barrel. */
export function heyApiTransform(
  options: GeneratedModelTransformOptions,
): SchemaTypeTransform {
  return modelTransform(options, false);
}

/** Reuse named Orval TypeScript models from a schemas barrel or model resolver. */
export function orvalTransform(
  options: GeneratedModelTransformOptions,
): SchemaTypeTransform {
  return modelTransform(options, false);
}

/** Reuse OpenAPI Generator TypeScript models, e.g. typescript-fetch/axios/angular. */
export function openapiGeneratorTransform(
  options: GeneratedModelTransformOptions,
): SchemaTypeTransform {
  return modelTransform(options, false);
}

/** Reuse swagger-typescript-api's named data contracts. */
export function swaggerTypescriptApiTransform(
  options: GeneratedModelTransformOptions,
): SchemaTypeTransform {
  return modelTransform(options, false);
}

/** Reuse openapi-typescript-codegen's named model exports. */
export function openapiTypescriptCodegenTransform(
  options: GeneratedModelTransformOptions,
): SchemaTypeTransform {
  return modelTransform(options, false);
}

/** Reuse NSwag's exported DTO interfaces (module output, without a namespace). */
export function nswagTransform(
  options: GeneratedModelTransformOptions,
): SchemaTypeTransform {
  return modelTransform(options, false);
}
