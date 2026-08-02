# Report 3: Multi-spec startup runs only the primary API’s scenario

## Summary

In multi-spec mode, Counterfact creates separate runners and scenario registries for every OpenAPI document, but server startup invokes the `startup` scenario only for the first runner.

Startup scenarios belonging to subsequent API groups are never executed.

## Environment

- Counterfact: `2.12.0`
- Node.js: 24
- OpenAPI: 3.0.3
- Platform: macOS

## Example configuration

```yaml
spec:
  - source: ./customers.yml
    group: customers
  - source: ./products.yml
    group: products

destination: .
```

Generated structure:

```text
customers/
  routes/
  scenarios/index.ts

products/
  routes/
  scenarios/index.ts
```

Customers scenario:

```ts
export const startup: Scenario = ($) => {
  $.context.seedCustomers([
    {
      id: "customer-001",
      email: "ada@example.com",
    },
  ]);
};
```

Products scenario:

```ts
export const startup: Scenario = ($) => {
  $.context.seedProducts([
    {
      id: "product-001",
      price: "19.99",
    },
  ]);
};
```

## Actual behavior

When the combined server starts:

- The Customers `startup` scenario runs.
- The Products `startup` scenario does not run.
- Product routes begin with empty state.

The application startup logic selects the first runner as `primaryRunner` and invokes its scenario registry only.

## Expected behavior

Every configured API group should have an opportunity to initialize its group state.

A combined server startup should run:

```text
customers/scenarios/index.ts → startup
products/scenarios/index.ts  → startup
```

Each scenario should receive the context registry for its group. All version runners within that group should share the same registry and therefore the same state. Separate groups retain separate context registries.

When multiple versions share a group and therefore one physical scenario file, that group's startup scenario should run once.

## Impact

Multi-spec simulators cannot use Counterfact’s documented scenario convention consistently.

This is especially problematic when:

- Each API owns independent state.
- The APIs are generated into separate groups.
- Seeded data is required for useful startup behavior.
- Related APIs need coherent fixtures.
- Tests expect the combined server to be ready immediately after startup.

Users must create custom bootstrap code, seed state directly in context constructors, or use private/internal runner objects.

## Suggested resolution

During server startup, invoke the startup scenario once for every configured group, in the group’s first declaration order, and pass each invocation that group’s shared context registry:

```ts
for (const group of groupsInDeclarationOrder) {
  await runStartupScenario(
    group.scenarioRegistry,
    group.contextRegistry,
    { port: config.port },
    group.openApiDocument,
  );
}
```

If scenario order matters, execute them in specification declaration order instead of concurrently.

An optional combined-server startup hook could also be useful for establishing cross-API relationships after individual groups initialize.

## Design considerations

- All version runners within a group must use the same context registry, not merely startup scenarios. Runners from different groups retain separate registries.
- A failure must identify the group (and version, when relevant) whose startup failed and prevent the server from listening.
- Startup order is configuration declaration order.
- Multiple versioned specifications sharing a group must not initialize the shared state more than once.
- Replacing the current runner-per-version architecture with one runner per group is future work and is not required to resolve this bug.
- Existing single-spec behavior must remain unchanged.

## Acceptance criteria

- Every configured group’s `startup` scenario runs.
- Every startup receives its group’s shared context.
- State seeded for a group is visible to all versions of that group.
- State remains isolated between different groups.
- Declaration order is deterministic and documented.
- A startup failure reports the relevant group.
- Single-spec startup behavior remains compatible.
- Versioned specs do not duplicate shared-state initialization.
- Programmatic and CLI startup behave consistently.
