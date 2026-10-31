# `bin/` — CLI Entry Point

This directory contains the executable invoked by `npx counterfact` or an
installed `counterfact` command. The supported runtime floor is Node.js 22.22,
as declared in the [package manifest](../package.json).

## Files

| File             | Responsibility                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `counterfact.js` | Early version check, native TypeScript capability probe, and delegation to `runCli(process.argv)`                      |
| `taglines.txt`   | Startup tagline choices read by `runCli`; the CLI selects one when the file is available and uses a fallback otherwise |

## Bootstrap flow

The executable performs an initial Node major-version check before loading the
CLI. That coarse check is separate from the package manifest's supported
runtime floor.

It then creates a temporary TypeScript probe to check both erasable type
annotations and `.js` imports resolving to `.ts` source. When the probe
succeeds it imports `src/cli/run.ts`; otherwise it imports `dist/cli/run.js`.
The probe directory is removed after either outcome, and the selected
`runCli` receives `process.argv`.

This probe selects the CLI entrypoint. Route execution and compilation are
configured separately by the application/runtime layer.

## CLI policy and public options

The [CLI source guide](../src/cli/README.md) describes option/config resolution,
first-run selection, startup progress, migrations, and telemetry ownership.
Tutorial content and lesson progression belong to `@counterfact/tutorials`.

Use the canonical [CLI reference](../docs/api/cli.md) for options, configuration
keys, action defaults, and precedence. Run `npx counterfact@latest --help` for
the installed release's option list. From a source checkout,
`yarn go:first-run` builds and runs that checkout's CLI with no arguments.
