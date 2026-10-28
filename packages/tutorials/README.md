# @counterfact/tutorials

Guided, hands-on tours for Counterfact. This package owns the coffee-shop UI,
conversation, lesson progression, local file journal, checks, and tutorial HTTP
handler. The CLI owns menu and port selection, simulator lifecycle, browser
launch, and telemetry transport.

## Prepare and host a tour

```js
import { findTourDirectory, prepareTour } from "@counterfact/tutorials";

const root = process.cwd();
const directory = await findTourDirectory(root);
const tour = await prepareTour(root, directory, "coffee-shop");
```

`prepareTour` exclusively creates the demo directory and writes `openapi.yaml`
and the hidden walkthrough state. It rejects existing files, directories, and
symlinks. `findTourDirectory` proposes an unused numbered name without reserving
it. The root directory must exist.

Start Counterfact with `tour.source` and `tour.destination`. The facade recognizes
a managed version 4, 5, or 6 marker, mounts the simulated API under `/shop`, and hosts
`createTourRequestHandler` before the simulator's HTTP callback. After generation,
`finalizeTour(tour.destination)` captures the baseline. The CLI does this and opens
`tour.walkthroughPath`, `/tutorial/`, on the bound HTTP origin.

The shop spec contains only `/products` and `/orders`, with `/shop` as its server
base. Counterfact generates their random handlers, the empty context, default
scenario, and schema types. There are no generated tutorial handlers or tutorial
operations in the shop spec.

The independent tutorial HTTP handler owns:

- `GET /tutorial/`: the browser UI.
- `GET /tutorial/info`: session identity, current state, source revision, and local history.
- `POST /tutorial/check`: isolated checks of saved learner code.
- `POST /tutorial/workspace`: review, explicit apply, and checkpoint operations.
- `POST /tutorial/event`: allowlisted milestone reporting.

Tutorial requests are checked against the page's origin, JSON bodies are bounded,
and workspace changes require the current tutorial session. The handler reads
context through an accessor, so it sees the current instance after reload/reset.
It does not enter Counterfact route dispatch, validation, proxying, or generated
types. `/walkthrough` redirects to `/tutorial/` for existing links.

## Learning flow

Fourteen lessons start with placing a coffee order to learn the shop and chat.
The introduction explains `GET /shop/products` and `POST /shop/orders`. The next lesson inspects the generated
handler and bundled OpenAPI 3.1 schema. Names start with ten coffee examples,
while descriptions start as random strings. Lesson three adds description
examples; subsequent lessons add explicit responses, shared
state, stock rules, and reusable scenarios.

Milo proposes supporting edits as exact diffs before writing them. **Apply
changes** saves a reviewed proposal, and its status changes to **Changes applied**.
Learners implement their part from instructions, without solution snippets or
prepared REPL commands. Stale proposals require a new review and never replace a
learner save. Preparation is idempotent and does not run scenarios or seed live
state.

**Okay** only continues an explanation. Action prompts wait for real approval,
saves, REPL submissions, or shop experiments. A **Hint** button appears while
waiting for learner work and reveals precise instructions for that particular
action. Revealing a hint does not approve edits, run requests, or complete lessons;
revealed hints remain in the conversation across reloads. Each prompt ends at its instruction,
with necessary context and expected results before it. Editing prompts stop at
saving; a verified save reveals the shop or REPL test. Completion is detected
automatically from verified saves and the running state, without a manual check
button. Refreshes and responses
unlock subsequent order, cleanup, and quiz steps. Live requests still earn the
required observations.
**Next Lesson** names the next concept. The divider resizes the panels; new text
types out and scrolling follows it, respecting reduced-motion preferences.

Each explicit shop action keeps its own collapsed request/response snapshot and
handler link. Background checks do not generate shopping traffic or learner
messages. Missing, malformed, and rejected responses remain inspectable without
inventing successful outcomes.

## Local history and compatibility

The journal watches only `openapi.yaml`, `routes/products.ts`, `routes/orders.ts`,
`routes/_.context.ts`, and `scenarios/index.ts`. It records attributed before/after
text, including incomplete edits, deletions, and reversions. Changes elsewhere
are not collected. No Git initialization or commits are required.

Contiguous project checkpoints survive server restarts through **Resume this
project**. Cart, HTTP, quiz, and experiment observations belong to the current
server session. Browser storage preserves revealed messages and disclosure
choices across reloads without completing exercises. Saved checks use isolated
snapshots, never the running shop's inventory or order counter.

Version 6 connects routes to context and introduces the terminal REPL in lesson
eight, before scenarios in lesson nine. The learner changes the shared context
in the REPL and observes that state through a real shop request. Version 5
started with ten coffee-name examples and teaches description examples
in lesson three. Version 4 added the orientation lesson and independent tutorial
HTTP. Existing version 2, 3, 4, and 5 projects retain their lesson inventory, saved
helpers, and milestone interpretation; their generated pages and handlers remain unchanged.
New projects need the installed tutorials package available when restarting.

## Milestones and REPL history

`/tutorial/event` accepts bounded event names and stable phase IDs and publishes
on Node's `counterfact:walkthrough` diagnostics channel. The CLI owns transport,
consent, and opt-outs. This package sends no external analytics requests.
Version 4, 5, and 6 events include the tour, walkthrough version, phase ID, lesson number,
and elapsed seconds. Session identities are opaque and temporary; reporting is
deduplicated. Paths, source, request/response bodies, carts, and context snapshots
are excluded from telemetry.

`walkthrough_started` follows the first coffee order. Phase completion depends on
source and live observations; finishing and completing all phases are distinct
milestones. Earlier numeric and version 2/3 callers retain their original meaning.

For managed demos, `createTourReplObserver` records submitted input as local learner
turns. It does not evaluate commands, collect their output, or credit completion.
Repeated submissions remain distinct. The observer detaches on REPL exit, and raw
input is never sent through telemetry.

## Package boundaries and verification

Tutorial code depends only on public runtime exports and never imports the CLI
facade. Counterfact consumes this package's root exports. Future tours belong in
this package, alongside the coffee shop.

Run `yarn test:tutorials` for browser, progression, file, and native HTTP checks.
The package-closure check runs [the preparation example](./examples/prepare-coffee-shop.mjs).
The facade's packed-consumer check starts an installed demo and verifies the
independent tutorial endpoints and shop simulation.
