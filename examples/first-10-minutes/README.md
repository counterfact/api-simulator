# Verified first-10-minutes example

[![First 10 minutes example](https://github.com/counterfact/api-simulator/actions/workflows/first-10-minutes.yml/badge.svg)](https://github.com/counterfact/api-simulator/actions/workflows/first-10-minutes.yml)

This smaller, standalone variant of the repository's [Petstore first-10-minutes guide](../../packages/counterfact/docs/first-10-minutes.md) uses its own minimal contract so every file fits in one directory. It proves the same state/failure/reset concepts without implying that its paths or generated types are identical to the longer walkthrough:

1. empty state returns `404`;
2. create then read returns the expected record body;
3. an explicit context flag forces `503`;
4. `reset()` restores the empty baseline;
5. reseeding after reset recreates ID `1` and returns the expected recovered body.

It also proves two team-level integration claims:

- a representative TypeScript client in `client/pets.ts` compiles from the same generated `Pet` contract as the simulator handlers;
- one Counterfact base URL serves local `/pets` behavior while forwarding `/health` to a disposable upstream server, with path ownership declared in test configuration rather than changed interactively.

## Run it

Requires Node.js 22 or newer.

```sh
npm ci
npm run verify
```

`npm run verify` performs three separate checks:

- `npm run generate` derives route and contract types from `openapi.yaml` without replacing the checked-in handler bodies;
- `npm test` starts Counterfact without the REPL, waits for readiness, drives the state/failure/reset flow over real HTTP, and awaits teardown;
- `npm run typecheck` checks the representative client and authored handlers against the same generated contract types.

The path-scoped [GitHub Actions workflow](../../.github/workflows/first-10-minutes.yml) runs those commands with Node.js 22 for changes to this example. `package-lock.json` pins its dependency tree.

The JavaScript test harness is intentional: Counterfact 2.14.0 does not publish a complete TypeScript declaration for its library entry point. Handler type checking remains a separate, explicit step.

## See a contract change reach the client

The OpenAPI document defines `NewPet.status` as `available | adopted`. The representative client commits an `available` fixture in `client/pets.ts`. On a disposable branch, remove `available` from the enum, then run:

```sh
npm run generate
npm run typecheck
```

TypeScript names `client/pets.ts` as incompatible with the regenerated contract. Restore the spec change and the same command passes. This is earlier compile-time contract feedback; it does not claim that either implementation has correct production business behavior.

For spec watch and regeneration details, continue with [Executable Spec](../../packages/counterfact/docs/patterns/executable-spec.md).

## Hybrid path ownership

The HTTP test starts a disposable upstream on port 4101. Counterfact listens on port 4100 with root proxying enabled and `/pets` explicitly local. The assertions prove that `http://localhost:4100/pets/1` uses the simulated handler while `http://localhost:4100/health` returns the upstream body. Forwarded traffic bypasses Counterfact's local handlers and contract checks, so real-backend coverage remains required.

For interactive path switching and operational tradeoffs, continue with [Hybrid Proxy](../../packages/counterfact/docs/patterns/hybrid-proxy.md).

For parallel test workers, copy the pattern with a separate Counterfact process, output directory, and port per worker. Counterfact has no built-in atomic reset or automatic per-test isolation; `Context.reset()` defines this example's baseline.

## Contract boundary

Passing this example proves that the authored simulator behaves as asserted and that its handlers type-check against this OpenAPI document. It does not prove authentication, authorization, production side effects, performance, or the real service's business behavior. Retain targeted real-backend and end-to-end tests.
