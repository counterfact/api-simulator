# Report 4: `--prune` leaves obsolete generated path-type dotfiles

## Summary

Counterfact’s `--prune` option does not consistently remove obsolete generated type files.

After changing OpenAPI paths from trailing-slash forms to normalized forms and regenerating with `--prune`, obsolete route files were removed, but stale hidden type files remained under `types/paths/`.

## Environment

- Counterfact: `2.12.0`
- Node.js: 24
- OpenAPI: 3.0.3
- Platform: macOS

## Steps to reproduce

Start with:

```yaml
paths:
  /customers/:
    get:
      operationId: listCustomers
      responses:
        "200":
          description: Success
```

Generate:

```sh
npx counterfact openapi.yaml . --generate
```

This creates files including:

```text
routes/customers/.ts
types/paths/customers/.types.ts
```

Change the path:

```yaml
paths:
  /customers:
    get:
      operationId: listCustomers
      responses:
        "200":
          description: Success
```

Regenerate with pruning:

```sh
npx counterfact openapi.yaml . --generate --prune
```

## Actual behavior

The normalized files are generated:

```text
routes/customers.ts
types/paths/customers.types.ts
```

The obsolete hidden type file remains:

```text
types/paths/customers/.types.ts
```

In a six-spec package, this left 18 obsolete hidden type files after pruning.

## Expected behavior

`--prune` should remove every generator-owned artifact that no longer corresponds to the current OpenAPI document, including when generation is restricted to types.

After pruning, only this file should remain:

```text
types/paths/customers.types.ts
```

## Impact

Stale generated types:

- Create confusing duplicate definitions.
- Increase repository noise.
- Can affect imports or editor indexing.
- Are difficult to notice because their filenames begin with a dot.
- Make `--prune` unreliable for contract updates.
- Require manual deletion after regeneration.

## Suggested resolution

Extend pruning to build an expected-file set for every generator-owned artifact category:

- Route modules
- Path-operation types
- Component types
- Response types
- Context-support types, where appropriate
- Version metadata

Then delete only generator-owned files absent from the expected set. Provenance should be established with Counterfact’s generated-file marker; user-authored route implementations must never be deleted.

Generated files already contain a “do not edit” banner, which could help distinguish safe-to-prune output from user-authored files.

## Safety considerations

Pruning must never remove user-authored route implementations merely because a path disappears.

If route and type pruning have different safety policies, Counterfact should expose separate options such as:

```text
--prune-routes
--prune-types
```

## Acceptance criteria

- Obsolete `types/paths/**` files are removed by `--prune`.
- Hidden files such as `.types.ts` are included.
- All stale generator-owned artifact categories are pruned.
- Type-only generation with `--prune` prunes stale generator-owned types.
- Valid current path types are preserved.
- User-authored files are protected according to documented pruning rules.
- Pruning works in single-spec and multi-spec mode.
- A second generation is idempotent.
- Tests cover path renames, deletions, and trailing-slash normalization.
