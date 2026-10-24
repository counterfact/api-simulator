# `bin/` — CLI Entry Point

This directory contains the executable script that is run when a developer invokes `npx counterfact` (or `counterfact` after a global install).

## Files

| File             | Description                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `counterfact.js` | Thin bootstrap: enforces minimum Node version, probes for native TypeScript execution, then delegates to `src/cli/run.ts` (or `dist/cli/run.js`) |
| `taglines.txt`   | Legacy tagline list; not used by the current startup output                                                                                      |

## Architecture

Most of the CLI logic lives in **`src/cli/`** as TypeScript:

| Module                         | Description                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `src/cli/run.ts`               | Commander program setup, `main()` action handler, and the `runCli()` entry point |
| `src/cli/startup-output.ts`    | Semantic title, progress, success, warning, and summary helpers                  |
| `src/cli/check-for-updates.ts` | npm update check: `isOutdated`, `checkForUpdates`                                |
| `src/cli/telemetry.ts`         | PostHog telemetry: `isTelemetryEnabled`, `sendTelemetry`                         |

## How It Works

```
npx counterfact@latest openapi.yaml ./api [options]
        │
        ▼
┌────────────────────────────────────────────────┐
│  bin/counterfact.js  (thin bootstrap)          │
│                                                │
│  1. Enforce minimum Node.js version            │
│  2. Probe native TypeScript execution          │
│  3. Import runCli() from src/cli/run.ts        │
│     (or dist/cli/run.js when compiled)         │
│  4. Call runCli(process.argv)                  │
└────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────┐
│  src/cli/run.ts  (all CLI logic)               │
│                                                │
│  1. Read version and parse args (Commander)    │
│  2. Load counterfact.yaml and merge args      │
│  3. Resolve paths and build Config            │
│  4. Print title and migration progress        │
│  5. Initialize app and read OpenAPI           │
│  6. Migrate route type imports if needed      │
│  7. Print generation/loading progress         │
│  8. Await start(config) from src/app.ts       │
│  9. Report completed generation/server/watch  │
│ 10. Send telemetry (if enabled)               │
│ 11. Start the REPL if enabled                 │
└────────────────────────────────────────────────┘
```

### Key CLI Options

| Option                  | Description                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `--port <number>`       | HTTP server port (default: `3100`)                                                              |
| `-o, --open`            | Open the dashboard in a browser after startup                                                   |
| `-g, --generate`        | Generate route and type files from the OpenAPI spec                                             |
| `-w, --watch`           | Re-generate whenever the spec changes                                                           |
| `-s, --serve`           | Start the HTTP server                                                                           |
| `-r, --repl`            | Start the interactive REPL                                                                      |
| `--spec <path>`         | Path or URL to the OpenAPI document (alternative to positional argument)                        |
| `--proxy-url <url>`     | Enable upstream proxying for all paths by default; per-path toggles can override                |
| `--prefix <path>`       | Base path prefix for all routes (e.g. `/api/v1`)                                                |
| `--no-update-check`     | Disable the npm update check on startup                                                         |
| `--no-validate-request` | Disable request validation against the OpenAPI spec                                             |
| `--config <path>`       | Path to a `counterfact.yaml` config file (default: `counterfact.yaml` in the current directory) |

Run `npx counterfact@latest --help` to see the full option list.

### Config File

Any CLI option can also be specified in a `counterfact.yaml` file in the current working directory. Command-line options always take precedence.

```yaml
# counterfact.yaml
spec: ./openapi.yaml
port: 8080
serve: true
repl: true
watch: true
proxy-url: https://api.example.com
prefix: /api/v1
```

Use `--config <path>` to load a config file from a non-default location.
