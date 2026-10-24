# Multiple APIs in one simulator

Serve related specifications together when a frontend calls several APIs. Each specification keeps its own generated code group, while all APIs use one HTTP listener.

## Configure specifications

Create `counterfact.yaml`:

```yaml
spec:
  - source: ./customers.yaml
    group: customers
  - source: ./products.yaml
    group: products
```

Run `npx counterfact --config counterfact.yaml`. If the specifications declare `/customers` and `/products`, those are their effective paths. A group name selects generated directories and runtime state; it does not add a URL prefix.

## Add a prefix deliberately

Set `prefix: /api` on a specification entry to serve its paths beneath `/api`. Several specifications can share a prefix; matching runners are tried in declaration order. Avoid overlapping operations unless that precedence is intentional.

## Coordinate state

Different groups have isolated contexts. Introduce an application [shared store](../patterns/shared-store.md) when they need shared domain data. In the REPL, select a group through bindings such as `context.customers` and `route.products(...)`.

For versions of the same API, see [API versioning](../features/multiple-versions.md). For configuration fields and programmatic selection, see [simulator lifecycle](../api/simulator.md).
