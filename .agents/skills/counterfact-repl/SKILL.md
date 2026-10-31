---
name: counterfact-repl
description: >
  Inspect or control a running Counterfact simulator through its HTTP Admin
  API: inspect contexts and routes, update compatible plain-object state, or
  configure proxying. Use for live simulator state/control requests; repository
  development and general OpenAPI work use the relevant contributor skills.
---

# Counterfact Admin API Control

Use this skill to inspect or control a running simulator over HTTP. This
interface cannot evaluate REPL code, call context methods, or run scenarios.
Use the interactive REPL for those operations when terminal access is available.

## Discover the target

Inspect project scripts/configuration for the actual port, API group, and Admin
API setting before sending requests. It is opt-in: `--admin-api`, YAML
`admin-api: true`, or programmatic `startAdminApi: true`.

The Admin API base is `http://localhost:<port>/_counterfact/api` plus the
selected group subdirectory, such as `/pets`. The served-route `prefix` is
independent. Examples use the ungrouped default port 3100; substitute the actual
port and group in every request.

If a token is configured with `--admin-api-token` or
`COUNTERFACT_ADMIN_API_TOKEN`, send `Authorization: Bearer <TOKEN_VALUE>` for
every request, including health, and keep its value out of output. Without a
token, middleware accepts loopback request IPs only; this does not establish
that the listener itself binds only to loopback. Keep Admin API access within
the intended development/test environment.

Check `GET /health` relative to that base. A 404 can mean disabled Admin API or
wrong group, 401 means missing/invalid token, and 403 means rejected request IP.
A connection failure warrants checking the configured port and process before
restarting. An HTTP error alone does not establish that the simulator is stopped.

## Choose the operation

| User intent                            | Operation / guidance                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| Inspect runtime state                  | `GET /contexts`, then `GET /contexts/{path}`                                     |
| Discover endpoint behavior             | `GET /routes`, inspect the contract and consuming handlers                       |
| Inspect configuration                  | `GET /config` or `GET /config/proxy`                                             |
| Add data or change a failure condition | Inspect implementation, then choose the mutation interface below                 |
| Switch proxy routing                   | `PATCH /config/proxy`; inspect existing settings and verify the affected request |

For exact payloads and responses, read the
[endpoint reference](references/admin-api.md). Context paths are hierarchical:
lookups can select a parent context. `GET /contexts/{path}` echoes the requested
path even when it returns a parent's context. Discover registered paths with
`GET /contexts` and inspect the owning file before editing.

## Choose the mutation interface before changing state

Inspect the context implementation and the routes that consume it. JSON
readback does not expose prototype methods or prove a route uses a posted flag.

- For class-backed contexts or domain operations, use existing context/scenario
  methods through the interactive REPL. If that interface is unavailable, report
  the limitation before changing state.
- Use `POST /contexts/{path}` only when plain-object JSON update semantics fit
  the context and the consuming routes already support the intended behavior.
  Target an exact registered path from `GET /contexts` unless creating an
  override is intentional: a POST to an unregistered descendant creates a new
  context there, while a GET at that path can return its parent. For example,
  with only `/` registered, GET `/contexts/users` reads root state but POST to
  that URL creates `/users` and leaves `/` unchanged. POST `/contexts/` returns
  404; use existing REPL/context methods to change the root context.
  JSON updates can remove class prototype methods. The first update to an unseen
  registry path can replace its context; subsequent updates compare against
  cached inputs. Equal cached scalar values can leave live route mutations
  intact, and omitted properties can remain. A JSON POST is not a general reset.
- Inspect state before changing it. Preserve unrelated state; use the project's
  named scenario/reset methods when those operations exist. Read
  [scenario guidance](../scenario/SKILL.md) when authoring setup flows.

After every mutation, read back the affected context/configuration and exercise
the affected API endpoint before confirming the outcome. If behavior is missing
from the handler, report the required implementation change instead of claiming
that setting a flag implemented it.

## Conditional detail

- Read [examples](examples.md) for data setup, failures, proxying, partial clears,
  pagination, registration, and cart workflows.
- Read [troubleshooting](references/troubleshooting.md) for access errors,
  hierarchical lookup, cached-input diffing, and proxy precedence.
- For repository CLI/server internals, use
  [CLI runtime](../counterfact-cli-runtime/SKILL.md) or
  [runtime architecture](../counterfact-runtime-architecture/SKILL.md).
