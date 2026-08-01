# Report 5: Derived multi-spec group prefixes can duplicate existing resource paths

## Summary

Counterfact currently derives a URL prefix from each multi-spec `group` when `prefix` is omitted.

When an OpenAPI document already includes the resource name in its paths, the resulting server URL duplicates that name.

For example:

```yaml
group: customers
```

combined with:

```yaml
paths:
  /customers:
```

produces:

```text
/customers/customers
```

This may be intentional behavior, but it is surprising and currently difficult to avoid because multiple runners cannot safely share `prefix: ""`.

## Environment

- Counterfact: `2.12.0`
- Node.js: 24
- OpenAPI: 3.0.3
- Platform: macOS

## Minimal configuration

```yaml
spec:
  - source: ./customers.yml
    group: customers
  - source: ./products.yml
    group: products

destination: .
```

Customers specification:

```yaml
openapi: 3.0.3
info:
  title: Customers
  version: "1.0"
paths:
  /customers:
    get:
      operationId: listCustomers
      responses:
        "200":
          description: Success
```

## Actual behavior

Counterfact derives `/customers` from the group and prepends it to the declared path.

The effective endpoint becomes:

```text
/customers/customers
```

Likewise:

```text
/products/products
/subscriptions/subscriptions
/orders/orders
```

## Expected behavior

Group names should organize generated files without changing URLs. In multi-spec mode, an omitted `prefix` should default to `""`, preserving paths exactly as declared by the OpenAPI document.

Possible solutions include:

### Selected behavior: group does not derive a URL prefix

The following configuration should serve the declared `/customers` path at `/customers`, not `/customers/customers`:

```yaml
group: customers
```

## Impact

The generated simulator no longer mirrors the API described by its OpenAPI documents.

This affects:

- Client configuration
- Integration tests
- Documentation examples
- Drop-in replacement of real endpoints
- Multi-spec APIs divided by domain
- Developers diagnosing unexpected `404` responses

## Documentation gap

The configuration documentation should explain:

- That `group` affects both generated directory layout and URL routing.
- How a prefix is derived.
- That the prefix is prepended to paths already present in the specification.
- How to retain canonical paths.
- Whether multiple specs may share a prefix.
- How group names differ from URL prefixes.

## Suggested resolution

Remove automatic group-derived prefixes. An omitted `prefix` is the root prefix (`""`), and `group` affects generated directory layout only. Shared-prefix middleware fallthrough is required so root-mounted groups can coexist.

## Acceptance criteria

- Documentation shows the effective URL for grouped specifications.
- Users can preserve paths exactly as declared across multiple specs.
- Group names organize generated files without changing URLs.
- Omitted `prefix` defaults to `""` in multi-spec mode.
- Tests cover omitted, explicit, empty, and shared prefixes.
