# @counterfact/tutorials

Guided, hands-on tours for Counterfact. This package owns tour projects, browser instructions and storefronts, lesson progression, and saved-handler checks. The coffee shop is the first tour; future chapter tours belong in this package too.

Counterfact installs this package as a regular dependency, so the first-run example works offline after installation. The CLI owns its menu, port selection, simulator lifecycle, and browser launch. This package prepares editable files and returns the locations the caller needs; it does not start a server or REPL.

## Prepare a tour

```js
import { findTourDirectory, prepareTour } from "@counterfact/tutorials";

const root = process.cwd();
const directory = await findTourDirectory(root);
const tour = await prepareTour(root, directory, "coffee-shop");
// tour.source: absolute OpenAPI document path
// tour.destination: absolute project directory
// tour.walkthroughPath: HTTP path to open after the simulator starts
```

`findTourDirectory(root)` proposes an unused `counterfact-demo` name, adding a numeric suffix when needed. It does not reserve the name. `prepareTour(root, directory, tourId?)` creates that directory exclusively and rejects an existing file, directory, or symlink. It defaults to `coffee-shop` and rejects unknown IDs before writing files. The root must already exist. A concurrent creator can still claim the proposed name; handle `EEXIST` by choosing again.

Start Counterfact with the returned document and project directory, then open the returned walkthrough path on its bound HTTP origin. The [CLI guided-example chapter](https://counterfact.dev/docs/manual/guided-example) describes the reader experience.

The prepared project supplies only walkthrough infrastructure and the bundled OpenAPI document. The normal generator creates product and order random stubs, an empty context class, and its default scenario file. The learner adds business behavior through twelve lessons. Copyable implementations live in the lesson definitions; preparation never installs them.

The storefront renders arbitrary schema-generated products, uses explicit refresh instead of product polling, and displays actual request/response bodies. File checks run against isolated snapshots, while progress also observes the running API. Source checks and snapshots include missing or partially implemented context and scenario files. A saved scenario does not mutate live state. Previewing a later lesson shows missing prerequisites without applying code or earning completion.

Tutorial session identity belongs to the infrastructure, outside the learner's context. New browser state is stored separately as walkthrough version 2. Existing generated demos keep their numeric saved-file and telemetry helper interfaces. Keep the package installation available when restarting: generated infrastructure loads its helper modules from that installation.

## Walkthrough milestones

The generated `/tutorial-event` route accepts allowlisted event names and stable phase IDs defined in the shared lesson inventory. Events are published on Node's `counterfact:walkthrough` diagnostics channel. The CLI owns transport, consent, and opt-outs; this package sends no external analytics requests.

Version 2 properties include `tour: "coffee-shop"`, `walkthroughVersion: 2`, `phaseId`, the displayed lesson number, and elapsed whole seconds. A temporary opaque identity connects events within a server session. Deduplication covers reloads and revisits. Neither file paths nor source, request bodies, response bodies, cart contents, or context snapshots enter telemetry.

| Event                         | Trigger                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `walkthrough_opened`          | Browser initializes.                                                                                  |
| `walkthrough_started`         | Learner explicitly refreshes the initial generated response.                                          |
| `walkthrough_phase_completed` | Required source and live observations succeed; the inventory question also requires a correct answer. |
| `walkthrough_lesson_skipped`  | Learner previews a later lesson without completion credit.                                            |
| `walkthrough_finished`        | Last lesson completes, with completed-phase count and whether all required phases were observed.      |
| `walkthrough_completed`       | Every phase in the shared inventory has completed.                                                    |

Version 1 numeric events remain accepted for existing generated demos and retain their original completion semantics. Version 2 phase IDs and completion totals come from `PHASES`; do not duplicate numeric lesson boundaries across the browser, schemas, checks, and telemetry.

## Add another tour

Keep tour-specific files under their own directory in `src/`, alongside `src/coffee-shop/`. Add preparation/selection in `src/prepare-tour.ts` and expose caller-facing capabilities through `src/index.ts`. Keep browser presentation, lesson progression, and checks in this package; use ordinary Counterfact routes and documented runtime exports for the exercises. Extend shared machinery when a second tour demonstrates the need.

This package depends only on public runtime exports. It must not import the CLI facade or CLI internals. The CLI consumes the package root export; coffee-shop internals are not public entry points.

Run `yarn test:tutorials` from the repository root. The isolated package-closure check runs [the preparation example](./examples/prepare-coffee-shop.mjs); the facade's packed-consumer check starts an installed tour and exercises its browser and saved-handler endpoints.
