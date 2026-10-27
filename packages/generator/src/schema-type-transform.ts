import type ts from "typescript";

/**
 * A bundled schema object (including OpenAPI/vendor extensions), or a boolean
 * schema. Object properties are unknown: narrow their values before use.
 * Treat this input, including nested objects, as read-only.
 */
export type JsonSchema = boolean | Readonly<Record<string, unknown>>;

/**
 * The generated file's output facade. It exposes named type imports, not the
 * internal Script, source locations, declaration names, or traversal controls.
 */
export interface SchemaTypeScript {
  /**
   * Register a named, type-only import and return a reference to its local alias.
   * Repeated requests reuse an import; collisions receive distinct aliases.
   *
   * @param moduleSpecifier Module to import from. Relative paths resolve from
   * each generated file, not from the callback module or YAML configuration.
   * @param exportedName An unqualified ASCII identifier exported by the module.
   * @returns A TypeReferenceNode using the allocated alias; do not guess its name.
   */
  importType(
    moduleSpecifier: string,
    exportedName: string,
  ): ts.TypeReferenceNode;
}

/**
 * Customize an inline schema or referenced definition after default generation.
 * Return the default type, update it with TypeScript factories, or replace it.
 * Children have already been transformed; ordinary $ref sites are not revisited.
 * Treat the schema and AST as immutable. Keep results deterministic across runs.
 *
 * @param schema The bundled schema after overlays; true defaults to unknown and
 * false to never. No source pointer or definition name is exposed.
 * @param defaultType Counterfact's generated type, including transformed children.
 * A containing schema can still add constraints around the returned node.
 * @param script Facade for registering imports in the current generated file.
 * @returns A synchronous TypeNode on every branch, never a string or Promise.
 * @throws Generation fails with the schema location if the callback throws or
 * returns an invalid result. Default generation happens before this callback.
 *
 * This changes generated types, not runtime conversion or validation. Configure
 * it on CodeGenerator or Repository, or select a default-exported JavaScript
 * module using schema-type-transform in counterfact.yaml.
 * @see https://counterfact.dev/docs/api/schema-types/
 */
export type SchemaTypeTransform = (
  schema: JsonSchema,
  defaultType: ts.TypeNode,
  script: SchemaTypeScript,
) => ts.TypeNode;

/** Internal marker so customization failures cannot become fallback types. */
export class SchemaTypeTransformError extends Error {}
