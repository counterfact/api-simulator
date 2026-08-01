# Counterfact user personas

These personas describe the people most likely to get durable value from Counterfact. They are organized around a job to be done, not title alone: one person may fit more than one persona as a project moves from implementation to testing.

## Maya — frontend engineer unblocked by a contract

**Context.** Maya is building a web or mobile feature against an OpenAPI document while the backend is incomplete, owned by another team, or costly to access locally.

**Job to be done.** “Give me an API that behaves enough like the promised backend that I can build, demo, and iterate without waiting.”

**Pain today.** Static mocks drift from the contract, happy-path JSON does not support a real workflow, and an unavailable or shared development environment slows every iteration.

**What wins her over.** One-command OpenAPI setup, generated TypeScript handlers, shared state, hot reload, and a REPL for changing data or errors while the app is running.

**Moment of value.** She creates an order in the UI, sees it on a later request, and can demo the complete flow before the production backend exists.

**Likely objection.** “I could just hard-code a fixture.” Counterfact must make the first stateful flow feel faster than maintaining that fixture.

## Devon — API/backend engineer building incrementally

**Context.** Devon owns an API whose endpoints arrive in stages. Some paths are ready locally or in a dev environment; others are still being designed or implemented.

**Job to be done.** “Let consumers integrate with the contract now, while I replace simulated endpoints with the real service at my own pace.”

**Pain today.** A backend team either has to finish broad scaffolding before anyone can integrate or maintain a separate mock implementation that immediately becomes stale.

**What wins him over.** Contract-derived handler types and response validation catch divergence early; selective proxying lets real paths coexist with simulated paths.

**Moment of value.** He proxies existing `/users` traffic to a dev service while controlling unfinished `/payments` behavior locally, without changing client configuration.

**Likely objection.** “It will become another service to operate.” Counterfact should remain clearly local, version-controlled, and easy to remove as endpoints become real.

## Priya — QA or SDET seeking reproducible edge cases

**Context.** Priya tests multi-step workflows that require specific data, permissions, latency, or failure states. Shared test environments are noisy and hard to reset.

**Job to be done.** “Put the API into a known state and make difficult cases repeatable for every test run and bug report.”

**Pain today.** Tests rely on brittle seeded data, failures are difficult to induce safely, and a bug reproduction disappears when another team changes the environment.

**What wins her over.** Stateful routes, runtime control through the REPL, deterministic scenario code, and request/response validation against the OpenAPI contract.

**Moment of value.** A test reliably demonstrates an empty account, then a declined payment, then a successful retry—without coordinating with a shared environment.

**Likely objection.** “A simulator cannot prove the real service works.” Position Counterfact as a fast, controlled complement to—not a replacement for—end-to-end testing.

## Leo — staff engineer protecting contract quality

**Context.** Leo supports several teams that share APIs. He wants the OpenAPI document to be an executable agreement rather than a diagram that is updated after implementation.

**Job to be done.** “Make contract changes visible to client and server teams immediately, before a broken integration reaches a shared environment.”

**Pain today.** Hand-written mocks, clients, and server implementations encode slightly different assumptions. Breaking changes surface late and their owner is unclear.

**What wins him over.** OpenAPI-native generation, typed route interfaces, validation, watch mode, and overlays for environment- or consumer-specific contract variations.

**Moment of value.** After a schema change, TypeScript identifies every affected simulated handler and client integration in local development or CI.

**Likely objection.** “Our API gateway already validates requests.” Counterfact’s value is earlier feedback and usable simulation for consumers, not gateway replacement.

## Aria — AI-assisted implementation workflow owner

**Context.** Aria uses coding agents to implement an API client or feature. The agent needs stable endpoints, inspectable state, and a clear contract to verify against.

**Job to be done.** “Give an implementation agent a bounded, reliable API world so it can build and verify a feature without guessing about a remote environment.”

**Pain today.** Agents encounter unstable credentials, mutable test data, rate limits, and incomplete documentation. Their work is difficult to reproduce or evaluate.

**What wins her over.** A local OpenAPI-backed server, deterministic stateful scenarios, generated types, and programmatic or REPL control of behavior.

**Moment of value.** An agent implements a client flow against Counterfact and leaves behind the scenario code that reproduces the verification environment for a human reviewer.

**Likely objection.** “The agent may optimize for the mock, not reality.” Keep the simulator contract-driven, validate responses, and retain a targeted real-backend test stage.

## Primary audience and non-goals

Counterfact should lead with **Maya** and **Priya**: they have urgent day-to-day pain and quickly experience the value of stateful simulation. **Devon** and **Leo** are strong adopters and champions when the team needs contract discipline or staged rollout. **Aria** is an emerging audience whose needs reinforce the same product qualities: stable, explicit, reproducible behavior.

Counterfact is not primarily for someone who only needs a single static JSON response, nor for teams seeking a hosted production substitute or a complete end-to-end test platform. In those cases, its statefulness and generated project structure are more capability than the task requires.
