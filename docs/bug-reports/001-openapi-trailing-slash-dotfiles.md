# Report 1: OpenAPI paths ending in `/` generate unusable dotfiles

## Summary

Counterfact generates malformed route and type filenames when an OpenAPI path ends with a trailing slash.

For a path such as `/customers/`, generation produces files including:

```text
routes/customers/.ts
types/paths/customers/.types.ts
```

The generated route is not registered for the intended `/customers/` URL, causing requests to return `404`.

## Environment

- Counterfact: `2.12.0`
- Node.js: 24
- OpenAPI: 3.0.3
- Platform: macOS

## Minimal reproduction

```yaml
openapi: 3.0.3

info:
  title: Trailing-slash reproduction
  version: "1.0"

paths:
  /customers/:
    get:
      operationId: listCustomers
      responses:
        "200":
          description: Success
```

Run:

```sh
npx counterfact openapi.yaml . --generate
```

## Actual behavior

Counterfact generates:

```text
routes/customers/.ts
types/paths/customers/.types.ts
```

The route module may subsequently be registered using its compiled filename rather than the intended collection path. A request to the declared path returns `404`:

```sh
curl -i http://localhost:3100/customers/
```

## Expected behavior

A trailing slash in an OpenAPI path should normalize to a valid, visible route module:

```text
routes/customers.ts
types/paths/customers.types.ts
```

The runtime should continue to accept both `/customers` and `/customers/`.

## Impact

Many APIs conventionally declare collection endpoints with trailing slashes. Such specifications cannot be generated reliably without modifying the contract first.

The current behavior also creates hidden files that are easy to overlook in editors, file listings, and code review.

## Current workaround

Maintain two copies of the contract:

1. An unchanged upstream copy.
2. A runtime copy with trailing slashes removed from path keys.

This works but creates contract duplication and requires a synchronization process.

## Suggested resolution

Normalize terminal slashes during path-to-filename conversion:

- Map `/customers/` to the same generated filename as `/customers`.
- Never generate an empty filename such as `.ts`.
- Ensure the generated module registry maps the file back to the intended OpenAPI path.
- Reject a document that declares both forms, such as `/customers` and `/customers/`, with a clear duplicate-normalized-path error.

## Acceptance criteria

- `/customers/` never generates `routes/customers/.ts`.
- Generated route and type filenames are visible, valid filenames.
- A request to `/customers/` reaches the generated handler.
- Nested paths such as `/customers/{id}/` work.
- Action paths such as `/subscriptions/{id}/cancel/` work.
- Regeneration does not produce duplicate trailing and non-trailing route modules.
- A document declaring both trailing and non-trailing forms fails generation clearly.
- Tests cover root `/`, collection paths, parameterized paths, and nested action paths.
