# Verified first-10-minutes example

[![First 10 minutes example](https://github.com/counterfact/api-simulator/actions/workflows/first-10-minutes.yml/badge.svg)](https://github.com/counterfact/api-simulator/actions/workflows/first-10-minutes.yml)

This smaller, standalone variant of the repository's [Petstore first-10-minutes guide](../../docs/first-10-minutes.md) uses its own minimal `/pets` contract so every file fits in one directory. It proves the same state/failure/reset concepts without implying that its paths or generated types are identical to the longer walkthrough:

1. empty state returns `404`;
2. create then read returns the expected record body;
3. an explicit context flag forces `503`;
4. `reset()` restores the empty baseline;
5. reseeding after reset recreates ID `1` and returns the expected recovered body.

## Run it

Requires Node.js 22 or newer.

```sh
npm install
npm run verify
```

`npm run verify` performs three separate checks:

- `npm run generate` derives route and contract types from `openapi.yaml` without replacing the checked-in handler bodies;
- `npm test` starts Counterfact without the REPL, waits for readiness, drives the state/failure/reset flow over real HTTP, and awaits teardown;
- `npm run typecheck` checks the generated types and authored TypeScript handlers.

The path-scoped [GitHub Actions workflow](../../.github/workflows/first-10-minutes.yml) runs those commands with Node.js 22 for changes to this example. `package-lock.json` pins its dependency tree.

The JavaScript test harness is intentional: Counterfact 2.14.0 does not publish a complete TypeScript declaration for its library entry point. Handler type checking remains a separate, explicit step.

For parallel test workers, copy the pattern with a separate Counterfact process, output directory, and port per worker. Counterfact has no built-in atomic reset or automatic per-test isolation; `Context.reset()` defines this example's baseline.

## Contract boundary

Passing this example proves that the authored simulator behaves as asserted and that its handlers type-check against this OpenAPI document. It does not prove authentication, authorization, production side effects, performance, or the real service's business behavior. Retain targeted real-backend and end-to-end tests.
