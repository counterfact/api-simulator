# `src/cli/` — CLI Logic (TypeScript)

This directory owns command-line policy and startup orchestration. The thin
JavaScript bootstrap in `bin/counterfact.js` probes native TypeScript execution
and delegates to `runCli` in source or compiled output.

## Modules

| File                   | Responsibility                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `run.ts`               | Commander setup, CLI/config precedence, startup orchestration, compatibility migrations, and integration with the simulator            |
| `intro.ts`             | First-run eligibility, terminal choices, selected contract/port                                                                        |
| `discover-openapi.ts`  | Bounded local specification discovery after the user chooses their own contract; recognition does not resolve references or fetch URLs |
| `is-port-available.ts` | Port availability checks used by first-run selection                                                                                   |
| `startup-output.ts`    | Semantic summaries, color handling, transient progress reporting, and terminal cleanup                                                 |
| `check-for-updates.ts` | Installed-versus-latest npm version comparison and update notices                                                                      |
| `telemetry.ts`         | Telemetry eligibility, location hashing, and fire-and-forget transport                                                                 |

## Ownership boundaries

`runCli(argv)` is the entrypoint. It resolves options, selects first-run behavior,
invokes legacy compatibility checks, and starts the configured simulator.
Programmatic consumers enter through `counterfact()` in `app.ts` and do not
receive the CLI's prompts or migration checks.

Simulator orchestration and per-API generation/loading belong to `app.ts` and
`api-runner.ts`; the HTTP/runtime implementation lives in
[`@counterfact/runtime`](../../../runtime/README.md).

Use [`test/cli/`](../../test/cli/) for focused contributor tests and
[`test-black-box/`](../../../../test-black-box/) for shipped CLI/HTTP/terminal
journeys. The [CLI reference](../../docs/api/cli.md) is the public source for
options, configuration, and user-facing defaults.
