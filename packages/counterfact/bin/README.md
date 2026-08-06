# `bin/` — CLI Entry Point

This directory contains the executable script that is run when a developer invokes `npx counterfact` (or `counterfact` after a global install).

## Files

| File | Description |
|---|---|
| `counterfact.js` | Thin bootstrap: enforces minimum Node version, probes for native TypeScript execution, then delegates to `src/cli/run.ts` (or `dist/cli/run.js`) |
| `taglines.txt` | One-per-line list of random taglines shown in the startup banner |

## Architecture

Most of the CLI logic lives in **`src/cli/`** as TypeScript:

| Module | Description |
|---|---|
| `src/cli/run.ts` | Commander program setup, `main()` action handler, and the `runCli()` entry point |
| `src/cli/banner.ts` | Startup banner utilities: `padTagLine`, `createWatchMessage`, `createIntroduction` |
| `src/cli/check-for-updates.ts` | npm update check: `isOutdated`, `checkForUpdates` |
| `src/cli/telemetry.ts` | PostHog telemetry: `isTelemetryEnabled`, `sendTelemetry` |

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
│  1. Read version from package.json             │
│  2. Read taglines from bin/taglines.txt        │
│  3. Fire telemetry (if enabled)                │
│  4. Parse args (Commander)                     │
│  5. Load counterfact.yaml                      │
│  6. Merge config + args                        │
│  7. Resolve paths                              │
│  8. Build Config object                        │
│  9. Run migrations if old layout detected      │
│ 10. Print startup banner                       │
│ 11. Call start(config) from src/app.ts         │
└────────────────────────────────────────────────┘
```

### Key CLI Options

| Option | Description |
|---|---|
| `--port <number>` | HTTP server port (default: `3100`) |
| `-o, --open` | Open the dashboard in a browser after startup |
| `-g, --generate` | Generate route and type files from the OpenAPI spec |
| `-w, --watch` | Re-generate whenever the spec changes |
| `-s, --serve` | Start the HTTP server |
| `-r, --repl` | Start the interactive REPL |
| `--spec <path>` | Path or URL to the OpenAPI document (alternative to positional argument) |
| `--proxy-url <url>` | Forward all unmatched requests to this upstream URL |
| `--prefix <path>` | Base path prefix for all routes (e.g. `/api/v1`) |
| `--no-update-check` | Disable the npm update check on startup |
| `--no-validate-request` | Disable request validation against the OpenAPI spec |
| `--config <path>` | Path to a `counterfact.yaml` config file (default: `counterfact.yaml` in the current directory) |

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
