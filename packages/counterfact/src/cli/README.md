# `src/cli/` — CLI Logic (TypeScript)

This directory contains all the business logic for the `counterfact` command-line interface.  The thin JavaScript bootstrap in `bin/counterfact.js` delegates to `run.ts` after detecting whether the runtime supports native TypeScript execution.

## Modules

| File | Exported symbols | Description |
|---|---|---|
| `run.ts` | `runCli(argv)` | Commander program setup and main CLI action handler |
| `banner.ts` | `padTagLine`, `createWatchMessage`, `createIntroduction` | Startup banner utilities |
| `check-for-updates.ts` | `isOutdated`, `checkForUpdates` | npm version check |
| `telemetry.ts` | `isTelemetryEnabled`, `sendTelemetry` | PostHog telemetry (fire-and-forget) |
