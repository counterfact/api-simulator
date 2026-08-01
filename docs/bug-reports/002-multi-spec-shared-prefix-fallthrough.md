# Report 2: Multiple API runners sharing a prefix do not fall through on unmatched routes

## Summary

Counterfact’s multi-spec mode cannot serve multiple OpenAPI documents at the same URL prefix.

When multiple specifications use `prefix: ""`, every runner’s middleware matches every request. The first runner handles paths belonging to later runners and returns `404` instead of passing control to the next middleware.

As a result, only the first API is reachable.

## Environment

- Counterfact: `2.12.0`
- Node.js: 24
- OpenAPI: 3.0.3
- Platform: macOS

## Configuration

```yaml
spec:
  - source: ./customers.yml
    group: customers
    prefix: ""
  - source: ./products.yml
    group: products
    prefix: ""

destination: .
```

`customers.yml`:

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

`products.yml`:

```yaml
openapi: 3.0.3
info:
  title: Products
  version: "1.0"
paths:
  /products:
    get:
      operationId: listProducts
      responses:
        "200":
          description: Success
```

## Steps to reproduce

Generate and serve the combined simulator:

```sh
npx counterfact --config counterfact.yaml --generate
npx counterfact --config counterfact.yaml --serve
```

Request both APIs:

```sh
curl -i http://localhost:3100/customers
curl -i http://localhost:3100/products
```

## Actual behavior

The Customers runner is registered first and its middleware uses an empty prefix.

Because every string starts with `""`, it claims `/products` even though the Customers registry has no matching route. The Customers dispatcher returns `404`, and the Products middleware never receives the request.

## Expected behavior

If a runner’s prefix matches but its route registry does not contain the requested path, Counterfact should call the next middleware.

Expected routing:

```text
/customers
  → Customers runner has route
  → Customers handler

/products
  → Customers runner has no route
  → fall through
  → Products runner has route
  → Products handler
```

## Impact

Several OpenAPI documents describing subsets of one public API cannot be combined at their canonical paths.

Users must instead assign artificial prefixes, which changes the simulated URLs and can duplicate resource names.

For example:

```text
/customers/customers
/products/products
```

This makes the simulator less representative of the real API.

## Current workaround

Allow Counterfact to derive distinct prefixes from group names:

```yaml
spec:
  - source: ./customers.yml
    group: customers
  - source: ./products.yml
    group: products
```

This avoids middleware collisions but changes the public paths.

## Suggested resolution

In multi-spec routing middleware:

1. Check whether the request begins with the configured prefix.
2. Strip the prefix.
3. Check whether that runner’s registry contains a matching route or method.
4. Call `next()` when no route exists.
5. Dispatch only when the runner can handle the request.

Care is needed for `405 Method Not Allowed`: Counterfact should return `405` only when the selected runner owns the path but not the method. It should continue searching other runners if another runner could own the same path and method.

When multiple eligible runners define the same path and method, the first matching specification in configuration declaration order wins. If no runner supports the requested method but one or more own the path, return `405` with an `Allow` header that combines the methods from those runners.

## Acceptance criteria

- Two specifications can both use `prefix: ""`.
- Routes unique to either specification remain reachable.
- An unmatched route falls through to later runners.
- `404` is returned only after all eligible runners decline the request.
- `405` behavior remains correct.
- Overlapping paths with different methods are handled deterministically.
- Overlapping paths with the same method are handled by configuration declaration order.
- Prefixes other than `""` retain their existing behavior.
- Tests cover two and three runners sharing the same prefix.
