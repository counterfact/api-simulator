# Playwright with one Counterfact simulator per worker

This example consumes `@counterfact/playwright` using Playwright's request
fixture, so no browser download is needed. The package owns worker startup,
source/cache isolation, automatic per-test reset, and teardown. Ports are
assigned by the OS.

From a Counterfact checkout:

```sh
yarn install --immutable
yarn build
yarn test:playwright-example --workers=1
yarn test:playwright-example --workers=3
```

In another ESM project, install `@counterfact/playwright` and `@playwright/test`
as development dependencies, copy this directory, and run `npx playwright test`.
See the [package README](../../packages/playwright/README.md) for composition
with an existing extended test, path resolution, fixtures, and lifecycle limits.

`scenarioName` is a test option. Use `test.use({ scenarioName: "emptyProjects" })`
in a describe block or call `await simulator.scenario(name)` inside a test.
Reacquire `simulator.store` and `simulator.loadContext()` after every reset.
See the [programmatic API](../../packages/counterfact/docs/features/programmatic-api.md)
for reset and reference-lifetime rules.
