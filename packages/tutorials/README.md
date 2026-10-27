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

Start Counterfact with the returned document and project directory. After generation finishes, call `finalizeTour(tour.destination)` to snapshot the generated baseline, then open the returned walkthrough path on its bound HTTP origin. The CLI does this automatically. The [CLI guided-example chapter](https://counterfact.dev/docs/manual/guided-example) describes the reader experience.

The new project supplies walkthrough infrastructure and the bundled OpenAPI document. The normal generator creates product and order random stubs, an empty context class, its default scenario file, and named Product and OrderItem schema types. Context and helper code import those generated types. The learner builds behavior through twelve lessons, using small edits rather than replacing whole files.

Each new demo stores a baseline snapshot and an attributed change journal in its own hidden walkthrough state file. No Git installation, repository initialization, staging, or commits are required. Existing demo repositories remain untouched. The CLI captures the generated baseline before opening the walkthrough; custom launchers can call the package’s `finalizeTour` export after generation.

The journal watches the four lesson files: `routes/products.ts`, `routes/orders.ts`, `routes/_.context.ts`, and `scenarios/index.ts`. It records before/after text for each saved change. The explicit preparation operation records Milo’s edits; source polling records learner saves, including incomplete code, deletions, and reversions. The browser renders expandable line diffs within the attributed conversation turns and retains them across reloads. Changes outside those lesson files are not collected. Source text stays in the local demo and browser; it is not included in telemetry.

Milo, a coffee-shop owner and Counterfact tutor, guides the learner through a persistent conversation. His opening turn explains the back-and-forth editing workflow and explains how both participants’ file diffs appear in the conversation. He proposes an edit, and **Yes, make these edits** approves it. Approval explicitly installs the described supporting code: catalog data, a failure branch, typed context fields and method stubs, baseline scenario scaffolding, stock methods, the empty inventory helper, or an empty restock scenario. The learner supplies the behavior that connects it: return statements, the failure switch, context method bodies, the startup export, the 409 branch, the inventory loop, and the restock assignment. Milo’s applied changes appear immediately as a diff in the conversation, and learner saves add their own diff turns. Preparation is durable and idempotent, preserves other declarations, and refuses conflicts rather than replacing learner code. It never executes a scenario. A failed checkpoint offers a retry before completion is credited. Lesson completion is recorded separately from the file-change journal.

The storefront renders arbitrary schema-generated products, uses explicit refresh instead of product polling, and displays actual request/response bodies. File checks run against isolated snapshots, while progress also observes the running API. Source checks and snapshots include missing or partially implemented context and scenario files. A saved scenario does not mutate live state. Earlier tutor and learner turns remain visible. The learner replies **I’m ready. What’s next?** after a completed lesson to reveal the next turn. There are no Back or preview controls. Approval replies, quiz answers, explanations, and completion feedback are retained across reloads in the same API session.

Tutorial session identity belongs to the infrastructure, outside the learner's context. New browser state is stored separately as walkthrough version 2. Existing generated demos keep their numeric saved-file and telemetry helper interfaces. Keep the package installation available when restarting: generated infrastructure loads its helper modules from that installation.

## Walkthrough milestones

The generated `/tutorial-event` route accepts allowlisted event names and stable phase IDs defined in the shared lesson inventory. Events are published on Node's `counterfact:walkthrough` diagnostics channel. The CLI owns transport, consent, and opt-outs; this package sends no external analytics requests.

Version 2 properties include `tour: "coffee-shop"`, `walkthroughVersion: 2`, `phaseId`, the displayed lesson number, and elapsed whole seconds. A temporary opaque identity connects events within a server session. Deduplication covers reloads and revisits. Neither file paths nor source, request bodies, response bodies, cart contents, or context snapshots enter telemetry.

| Event                         | Trigger                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `walkthrough_opened`          | Browser initializes.                                                                                  |
| `walkthrough_started`         | Learner explicitly refreshes the initial generated response.                                          |
| `walkthrough_phase_completed` | Required source and live observations succeed; the inventory question also requires a correct answer. |
| `walkthrough_lesson_skipped`  | Legacy milestone; retained for existing generated pages with preview controls.                        |
| `walkthrough_finished`        | Last lesson completes, with completed-phase count and whether all required phases were observed.      |
| `walkthrough_completed`       | Every phase in the shared inventory has completed.                                                    |

Version 1 numeric events remain accepted for existing generated demos and retain their original completion semantics. Version 2 phase IDs and completion totals come from `PHASES`; do not duplicate numeric lesson boundaries across the browser, schemas, checks, and telemetry.

## Add another tour

Keep tour-specific files under their own directory in `src/`, alongside `src/coffee-shop/`. Add preparation/selection in `src/prepare-tour.ts` and expose caller-facing capabilities through `src/index.ts`. Keep browser presentation, lesson progression, and checks in this package; use ordinary Counterfact routes and documented runtime exports for the exercises. Extend shared machinery when a second tour demonstrates the need.

This package depends only on public runtime exports. It must not import the CLI facade or CLI internals. The CLI consumes the package root export; coffee-shop internals are not public entry points.

Run `yarn test:tutorials` from the repository root. The isolated package-closure check runs [the preparation example](./examples/prepare-coffee-shop.mjs); the facade's packed-consumer check starts an installed tour and exercises its browser and saved-handler endpoints.
