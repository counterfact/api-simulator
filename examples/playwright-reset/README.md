# Playwright with one Counterfact simulator per worker

This example uses Playwright's request fixture; it needs no browser download.
The worker fixture starts Counterfact once, and the automatic test fixture
awaits reset before every test, then optionally applies a named scenario.
Workers have separate stores, listeners, and temporary copies of the API source
so generated caches cannot conflict. Tests on a worker execute sequentially.

From a Counterfact checkout, build the packages and install the example's test
runner without changing the repository manifest:

```sh
yarn build
npm install --prefix /tmp/counterfact-playwright --no-package-lock @playwright/test using-temporary-files
ln -s /tmp/counterfact-playwright/node_modules/@playwright node_modules/@playwright
/tmp/counterfact-playwright/node_modules/.bin/playwright test examples/playwright-reset/projects.spec.ts --workers=1
```

When copying this into another project, install `counterfact`,
`@playwright/test`, and `using-temporary-files` there, copy the `api/` directory and test files, and run
`npx playwright test`. Select a free port range in `fixtures.ts`. Keep one
simulator per worker; separate workers must never reset a shared simulator.

`scenarioName` is a test option. Use `test.use({ scenarioName: "emptyProjects" })`
in a describe block or call `await simulator.scenario(name)` inside a test.
Reacquire `simulator.store` and `simulator.loadContext()` after every reset.
See the [programmatic API](../../packages/counterfact/docs/features/programmatic-api.md)
for lifecycle, failure, and reference-lifetime rules, and the
[Playwright fixture documentation](https://playwright.dev/docs/test-fixtures)
for fixture scope and options.
