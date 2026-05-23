# Counterfact Product Spec (Markdown)

## 1) Vision

Counterfact turns an OpenAPI/Swagger document into a live, editable API simulation that supports frontend work, integration testing, and AI-assisted implementation before a real backend is available.

## 2) Primary users and jobs

### Frontend and full-stack developers

- Start a working API from a spec in one command.
- Unblock UI development without waiting on backend delivery.

### QA and integration engineers

- Run deterministic, local API simulations in CI and local test runs.
- Reproduce failure and edge-case behavior on demand.

### AI coding agents

- Use a stable, controllable API target while implementing features.
- Iterate quickly with low cost and no third-party rate limits.

## 3) Core product requirements

1. **Spec to server bootstrap**
   - Accept OpenAPI/Swagger file paths or URLs.
   - Generate route and type scaffolding from the spec.
   - Start an HTTP server for generated handlers.

2. **Type-safe implementation loop**
   - Regenerate TypeScript types from the spec.
   - Keep handlers structurally aligned with the contract through typing.

3. **Stateful simulation**
   - Provide shared, mutable route context (`_.context.ts`) scoped by route hierarchy.
   - Support scenario scripts for repeatable startup/setup flows.

4. **Fast iteration**
   - Watch mode must regenerate/reload without full restarts.
   - REPL must allow runtime inspection and mutation of state.

5. **Controlled realism**
   - Support generated/random schema-valid responses for unimplemented routes.
   - Allow custom handler logic for realistic domain behavior.
   - Support selective proxying to a real upstream backend.

6. **Multi-spec and version support**
   - Support multiple specs/groups in one runtime.
   - Support version-aware behavior branching where configured.

## 4) Non-goals

- Replace a production API gateway or service mesh.
- Guarantee semantic correctness from schema typing alone.
- Implement every auth scheme in OpenAPI today.

## 5) Operational and compatibility requirements

- Node.js runtime support: current project policy (Node >= 22).
- Generated projects must remain editable by humans and agents.
- Regeneration should preserve user-authored route logic where documented.
- CLI behavior should remain backward compatible unless explicitly versioned.

## 6) Success criteria

- A user can run a single command and call a live endpoint within minutes.
- Spec edits are reflected in regenerated types/routes during watch workflows.
- Teams can model happy-path + failure-path behavior without external API dependencies.
- AI-assisted implementations can use generated typing + route structure to produce valid handlers with minimal manual correction.

## 7) Acceptance criteria (observable)

- Given a valid OpenAPI document, running Counterfact starts an HTTP API simulation and serves responses for documented routes.
- Given watch mode and a spec change, generated types update without manually restarting the process.
- Given a context flag toggled in REPL or scenario, subsequent HTTP responses reflect the new state-driven behavior.
- Given proxy rules, configured paths forward to the upstream while non-proxied paths continue using local handlers.
