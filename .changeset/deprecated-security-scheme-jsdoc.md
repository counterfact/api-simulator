---
"counterfact": minor
---

Emit `@deprecated` JSDoc for operations using deprecated security schemes (OpenAPI 3.2).

When a security scheme in `components/securitySchemes` is marked `deprecated: true`, any generated handler type that references that scheme will now include a `/** @deprecated The security scheme '<name>' is deprecated. */` JSDoc comment. This causes IDEs to show a strikethrough warning on affected handlers, surfacing the deprecation intent to developers.

- `SecurityScheme` interface in `operation-type-coder.ts` now includes `name?: string` and `deprecated?: boolean` fields.
- `buildJsDoc` in `jsdoc.ts` accepts an optional `deprecatedMessage` option to emit a `@deprecated` tag with a custom message.
- `OperationTypeCoder.jsdoc()` checks for deprecated security schemes and passes the scheme name as the deprecated message.
- `code-generator.ts` and `migrate/update-route-types.ts` now use `Object.entries()` when reading `securitySchemes` so each scheme carries its spec-level identifier as `name`.
