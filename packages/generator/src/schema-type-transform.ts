import type ts from "typescript";

/** A schema object (including OpenAPI extensions) or a JSON Schema boolean. */
export type JsonSchema = boolean | Readonly<Record<string, unknown>>;

/** Output capabilities available to a schema type transform. */
export interface SchemaTypeScript {
  /** Import a named type; relative specifiers are relative to the generated file. */
  importType(
    moduleSpecifier: string,
    exportedName: string,
  ): ts.TypeReferenceNode;
}

/**
 * Customize an inline schema or referenced definition after default generation.
 * Child schemas have already been transformed. Treat the schema and AST as immutable.
 * This synchronous callback changes types, not runtime conversion or validation.
 */
export type SchemaTypeTransform = (
  schema: JsonSchema,
  defaultType: ts.TypeNode,
  script: SchemaTypeScript,
) => ts.TypeNode;

/** Internal marker so customization failures cannot become fallback types. */
export class SchemaTypeTransformError extends Error {}
