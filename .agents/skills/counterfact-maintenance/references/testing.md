# Focused tests and repository tooling

Paths and commands below are relative to the repository root.

- Use `usingTemporaryFiles()` for filesystem-heavy tests.

- In file-watching tests, register the expected event listener before writing the file, then await the saved promise. Close watchers in test teardown so Jest timeouts cannot skip cleanup; restore any changed working directory there as well.

- For source or tsconfig analysis in repository tooling, use the existing
  TypeScript parser instead of custom tokenizers or JSONC stripping. Preserve
  the source filename so TypeScript and TSX syntax are parsed correctly.

- Package-boundary export checks validate public subpaths across conditions;
  they do not replace installed-consumer tests for runtime resolution. Keep
  regression coverage for null exclusions and overlapping export patterns.

- Keep tests beside their owning workspace: CLI/application tests in `packages/counterfact/test/`, server tests in `packages/runtime/test/`, generator tests in `packages/generator/test/`, and the corresponding `test/` directory for client, OpenAPI, REPL, and tutorials.

- Use OS-assigned ephemeral ports for tests that start network servers; fixed high ports can collide on shared CI hosts.

- When an OpenAPI-aware request builder gains an input kind or encoding rule,
  keep the route-catalog metadata, immutable builder state, required-input
  diagnostics, help and inspection output, wire serialization, public docs,
  focused unit tests, and ephemeral-port integration tests aligned. Define and
  test precedence whenever two builder methods compete for the same HTTP
  request entity.

Keep focused unit/type tests even when a broader product journey covers the same behavior. Package-consumer coverage and packed-artifact coverage establish different guarantees.
