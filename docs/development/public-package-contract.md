# Public Package Compatibility Contract

This document records the current consumer-visible compatibility contract.
It began as the package-oriented monorepo migration baseline and now includes
subsequent explicit compatibility decisions. Package, tarball, and
temporary-consumer tests verify this contract.

## Package entry point

The published package remains named `counterfact`. It has one supported module
entry point: the package root.

```ts
import { counterfact } from "counterfact";
```

The package exports map exposes only `.`. Paths below the package root,
including paths into `dist/`, are not public entry points. Moving a file or
changing a compiled filename does not require a compatibility layer unless it
changes the root entry point.

### Runtime exports

The package root provides these five runtime values:

| Export                | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `counterfact`         | Create and configure a Counterfact simulator |
| `createMswHandlers`   | Register routes for MSW integration          |
| `handleMswRequest`    | Dispatch an intercepted MSW request          |
| `loadOpenApiDocument` | Load an OpenAPI document                     |
| `runStartupScenario`  | Run a configured startup scenario            |

### Type exports

The package root also provides these type-only exports:

| Export                    | Purpose                                                                          |
| ------------------------- | -------------------------------------------------------------------------------- |
| `Config`                  | Describe the complete simulator configuration                                    |
| `CounterfactOptions`      | Configure an embedded simulator with `basePath` and optional settings            |
| `CounterfactStartOptions` | Override selected settings when starting a configured simulator                  |
| `CounterfactStatus`       | Describe resolved configuration and HTTP listener status without the admin token |
| `Simulator`               | Describe the simulator handle returned by `counterfact()`                        |
| `SpecConfig`              | Describe one configured OpenAPI specification                                    |
| `MockRequest`             | Describe a request passed through MSW                                            |

These names do not exist as JavaScript values. Other types, classes, and
functions that happen to be exported by source files are internal unless the
package root explicitly exports them.

## Command and runtime support

Installing the package provides the `counterfact` command. Both an installed
binary and `npx counterfact` must continue to invoke the CLI. The filename that
implements the command is internal; the command name and behavior are the
compatibility contract.

The current `counterfact` manifest requires Node.js 22.22 or newer for
Chokidar 6 compatibility.
The [package manifest](../../packages/counterfact/package.json) and
[consumer compatibility fixture](../../packages/counterfact/test/package/fixtures/compatibility-manifest.json)
must agree on this floor. Changing it requires an explicit compatibility
decision and corresponding consumer validation.

Installing `counterfact` is sufficient to use its CLI and library API. A
consumer must not need to know the workspace layout or separately install a
focused Counterfact package to retain existing behavior.

## Generated output

Generation preserves the existing user-visible output layout, including
`routes/`, `types/`, and the layouts for grouped and versioned APIs. The
generated project also receives a local `counterfact-types/` directory.

Generated type files import the shared Counterfact types from that local
directory with relative imports. As a result, generated handlers remain
self-contained: they do not acquire a dependency on `@counterfact/types`,
another new workspace package, or a deep path in the installed `counterfact`
package. Extracting `@counterfact/types` for Counterfact's own internal use does
not change this generated-code behavior.

Authored route handlers and contexts import their contract-specific types and
helpers from the generated `types/index.js` entrypoint. It exports `Routes`,
`Schemas`, `Components`, `Context$`, `Scenario`, `Scenario$`, and the
directory-indexed `Middleware` map. The generator retains the underlying
operation/component files for compatibility and uses `counterfact-types/`
internally for shared contracts.

The compiled source location from which Counterfact copies
`counterfact-types/` is internal. The destination directory and the generated
imports that resolve to it are consumer-visible and therefore stable.

## Documentation in the package

The npm package continues to ship the user documentation needed to use the
installed tool:

- `README.md` and `llms.txt`;
- `docs/comparison.md` and `docs/faq.md`;
- `docs/features/`;
- `docs/first-10-minutes.md` and `docs/getting-started.md`;
- `docs/manual.md` and `docs/manual/`;
- `docs/api.md` and `docs/api/`;
- `docs/patterns/`; and
- `docs/usage.md`.

The [packed-file inventory](../../packages/counterfact/test/package/fixtures/pack-files.json)
records the exact shipped paths. The API reference is organized under `api/`;
the former `docs/reference.md` source has been retired.

Repository-only material stays outside the package. This includes ADRs, bug
reports, development notes, persona studies, telemetry discussion artifacts,
and the website implementation. Tests and package-content checks should prevent
those files from entering the published tarball.

## Stable contract and incidental details

Compatibility checks should assert consumer-observable behavior:

- the package name and root-only entry point;
- the runtime and type export names above;
- the `counterfact` command and supported Node.js floor;
- install-and-run behavior from outside the repository;
- the generated public type entrypoint and self-contained shared contracts; and
- the included and excluded documentation categories above.

They should not freeze incidental implementation details such as:

- release numbers such as the current `counterfact` version;
- dependency versions;
- compiled targets such as `dist/app.js` or declaration-file locations;
- the internal path of the binary implementation;
- internal module, class, or source-directory names; or
- tar entry ordering, timestamps, or archive hashes.

Those details may change as long as a consumer
using the supported package root, command, generated output, and documentation
continues to see the contract described here.
