# Build a coffee-shop API from generated stubs

Learn Counterfact by replacing generated responses with behavior you write. The
bundled coffee shop starts against the same random handlers Counterfact generates
for your own OpenAPI document. OpenAPI, formerly Swagger, describes the requests
and responses; your handlers add the behavior.

If a saved-code check or tutorial request fails unexpectedly, inspect the server
terminal for diagnostics, fix the problem, and try again. The browser shows
lesson guidance and recovery instructions without internal exception details.

## Start the example

```sh
npx counterfact@latest
```

With no arguments and no `counterfact.yaml`, choose **Try a guided example**.
Counterfact shows the new `counterfact-demo/` directory and server address before
starting. Press Enter to start, `p` to change the port, or `b` to go back. Existing
directories are preserved by choosing a new numbered name.

The walkthrough opens in your browser. Instructions stay on the left and the
working shop stays on the right. Use a desktop browser at least 1100px wide. Keep
Counterfact running in its terminal and make the edits in your own editor.
Drag the divider between the panels left or right to resize them. You can also
focus it with Tab and use the arrow keys, or Home and End. Reloading preserves
your chosen split.
The conversation scrolls to the latest message as replies and saved edits arrive.
Long explanations arrive in smaller messages. Click **Okay** to reveal the next
part; the messages already revealed stay visible. Reloading keeps your place.
**Okay** reveals text without applying changes or completing an exercise.
Each user action reveals at most one new Milo message. When he has more to say,
**Okay** continues the explanation. When he asks you to edit a file, approve a
proposal, run a scenario, or try the shop, the instructions stay visible while
he waits for that action. **Okay** does not appear as a substitute for doing the
exercise. Saved edits and API results determine when he responds and when the
lesson is complete.
Background checks do not advance reading pauses. The first lesson needs no editor;
open the demo folder from its link when the next lesson asks you to inspect the handler.
New Milo messages type out progressively as the conversation scrolls smoothly
to keep them in view. Messages already seen do not replay their typing effect on
reload. Reduced-motion preferences show the text immediately and use instant
scrolling.
Your action bubbles contain the HTTP results. Milo adds lesson feedback and
guidance rather than repeating routine request summaries.
The introduction names the shop endpoints and explains that the tutorial has its
own HTTP endpoints. The API inspection lesson links to your actual local address, normally
`http://localhost:3100`.

Before inspecting the starting handler, Milo explains OpenAPI and schemas and
links to your demo’s `openapi.yaml`. Counterfact bundles this coffee-shop API
description and saves a copy in the demo folder, then generates the starting
handlers and TypeScript types from it.
File links open at the relevant line in VS Code. Lesson links follow the current
saved file as your edits move code; diff links open at the first changed line.

Keep the terminal application running while using the walkthrough. If the browser
loses contact with the server, an alert explains how to restart Counterfact from
the original directory on the same port. The page retries automatically and clears
the alert when the server responds. A restarted server offers **Resume this
project** using your saved lesson checkpoints.

## Try the tutorial before editing code

The browser opens at `/tutorial/`. The shop calls `GET /shop/products` to load
coffee and `POST /shop/orders` to place orders. Counterfact governs those two
shop operations through the bundled OpenAPI document.

The `/tutorial/*` endpoints serve the conversation, progress, file history,
checks, and edit proposals. They run outside simulation dispatch and are absent
from the shop spec and generated route files. A broken shop handler does not
break the tutorial page.

In the first lesson, click **Add to cart** on a coffee with stock, then click
**Place order**. Expand the **HTTP** details in your order message to inspect its
request and response. This introduces the storefront and conversation before
asking you to edit code. A generated confirmation does not yet have to match
your cart; the later lessons connect that behavior.

## Start with the generated behavior

The initial product handler calls:

```ts
return $.response.status(200).random();
```

The order handler similarly generates an HTTP 201 response. Counterfact builds
these responses from the bundled spec. Product names, IDs, prices, and stock may
change with each request; the generated order response does not yet reflect your
cart or update any state.

The shop renders the real responses, including arbitrary product IDs. Click
**Refresh products** to request another catalog. There is no background product
polling. Refreshing a random catalog clears its previous cart because IDs and
prices may change. Invalid responses or duplicate product IDs produce an
explanation and can be retried with **Refresh products**.

Expand the **HTTP** details attached to your action in the chat to inspect the
URL, request body, response status, and response body. The shop does
not substitute a working catalog or silently install backend implementations.

The starting OpenAPI 3.1 file supplies ten sensible coffee-name examples. The
description field initially has only a string type and length limit, so its
values are random strings.

Before replacing the handler, add a few sensible coffee descriptions to
`components.schemas.Product.properties.description.examples` in `openapi.yaml`,
while preserving its existing type and length limit. Save the file. When Milo
verifies the edit, refresh products to compare the descriptions with your
examples. Counterfact reloads the spec while the product handler keeps calling
`.random()`. Examples guide generation; they do not install a fixed catalog or a
business rule. The next lesson replaces the response with three explicit coffees.

## Connect context, routes, and the REPL

After implementing the context methods, connect the product and order handlers
to them. The class in `routes/_.context.ts` defines one running context instance.
Handlers access it through `$.context`; the terminal’s `context` variable refers
to that same object. The ⬣> prompt is a REPL (read–eval–print loop), where JavaScript
expressions run against the live API process.

Lesson eight asks you to add a single practice coffee and its stock through the
REPL, then refresh the shop. Its Hint supplies the exact fields and values while
leaving you to write the expressions. A real product response demonstrates the
connection before lesson nine introduces scenarios as reusable setup functions.

## Add one behavior at a time

The fourteen lessons start with using the tutorial, then build on your code:

| Step | What you add                                                             | What to observe                                                                                                            |
| ---- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1    | Place an order without editing code                                      | Learn the shop, cart, and HTTP details in the conversation.                                                                |
| 2    | Inspect and refresh the generated API                                    | The handler generates each response from its schema.                                                                       |
| 3    | Description examples in `openapi.yaml`                                   | The existing `.random()` handler uses meaningful coffee descriptions; IDs, prices, and stock are still generated.          |
| 4    | An explicit product response                                             | Repeated requests return the same three coffees.                                                                           |
| 5    | An order response using `$.body.items`                                   | The confirmation reflects the submitted cart.                                                                              |
| 6    | A 503 branch and recovery switch                                         | A rejected order keeps its cart; restoring the handler lets the same request succeed.                                      |
| 7    | An empty Context class with catalog, inventory, and confirmation methods | You can inspect the running object in the REPL before routes use it.                                                       |
| 8    | Handlers reading shared context and a live REPL experiment               | The REPL’s `context` and handlers’ `$.context` refer to the same instance; a coffee added in the REPL appears in the shop. |
| 9    | A baseline `reset` scenario and `startup` export                         | A named scenario repeats the setup you first performed manually in the REPL; startup reuses it on restart.                 |
| 10   | A Decaf inventory assignment in the REPL                                 | The next product request reads the changed quantity.                                                                       |
| 11   | Stock validation and shortage methods                                    | Oversized orders return HTTP 409 with requested and available quantities.                                                  |
| 12   | `reduceInventory(items, inventory)`                                      | Successful purchases now change the quantity returned by later product requests.                                           |
| 13   | Requests that sell out and REPL commands that restock                    | The same handlers produce different responses as shared state evolves.                                                     |
| 14   | A focused `restockDarkRoast` scenario                                    | A reusable setup changes one product while preserving other inventory and order IDs.                                       |

Each phase explains the Counterfact facility being used and names the file to edit.
Milo, a coffee-shop owner and your Counterfact tutor, proposes the supporting
edits before making them and shows the proposed diff in his chat bubble. Review
the diff, then click **Apply changes** to save it. The same bubble updates to
**Changes applied** and keeps the diff visible. Then implement the behavior
described in the exercise. For example, the catalog lesson asks you to replace
`.random()` with `.json(catalog)` while keeping the existing status and imports.
Exercises explain where to edit and what the result should do, without supplying
solution snippets or prepared REPL commands.
The proposal’s status confirms the edit; applying it does not add separate
approval or acknowledgment messages to the conversation.
You keep your existing file and change only the indicated return statement, branch,
method body, or assignment. Counterfact prepares the surrounding structure and
data; you connect the behavior. Preparation never runs a scenario or resets state. **Open in VSCode** and **Copy file
path** help you find the file. File names in the prose also open in VSCode.
Counterfact formats the supplied walkthrough infrastructure; the generator creates
the initial product and order stubs, context, and default scenario file.

New handlers import `Routes` from `types/index.ts` and declare a local `Route`
alias for their endpoint. The product handler uses `Route["GET"]`; the order
handler uses `Route["POST"]`. Context and inventory helpers select `Product` and
`OrderItem` from `Schemas`, and scenarios import `Scenario` from the same entry
point. These generated types come from the OpenAPI document; keep them generated
and make the lesson edits in your own handlers, context, and scenarios. Existing
handler annotations remain valid when resuming an older demo.

The guide is a conversation with Milo. You take turns: he explains what he wants
to edit, you approve it, then he directs your own small edit and an API experiment.
After the result is verified, click the button naming the next lesson, such as
**Next Lesson: Replace random products**, to continue.
The next lesson opens after your current lesson's progress has been saved. If
starting it fails, Milo keeps the completed lesson visible and explains the
problem. Click **Next Lesson** again to retry.
Each lesson starts with a distinct heading outside Milo’s chat bubbles.
Earlier turns stay visible so you can scroll back without changing the current
exercise. Applied proposal statuses, quiz replies, and Milo’s explanations survive a reload
within the same running API session. Shop actions join that history too: product
refreshes, cart changes, order attempts, retries, and restoring a failed cart.
Each action includes its actual HTTP result, so you can follow what happened in
order. Milo adds feedback when it helps explain the behavior. These turns survive
reloads alongside your code diffs. There are no Back or preview controls.

Commands you submit in the REPL also appear as your own turns, with the input in
a code block. This includes context inspections, assignments, and `.scenario`
commands. These turns record submitted input; the terminal shows its result and
the guide checks the resulting behavior separately. Commands stay in the local
walkthrough history across page reloads and are not sent through telemetry.

Expand the **HTTP** detail under a refresh, order, or retry turn to inspect that
action’s request and response. The summary shows the method, path, and response
status. Inside are the request URL, headers set by the shop, request body, and
the actual response body. Response headers have their own disclosure. The **Handler** link opens the file that
handles the request. Orders also include the product refresh that follows them.
Earlier exchanges stay attached to their own actions when new requests arrive.

## Follow changes in the conversation

Milo shows each proposed edit as a diff before changing any files. Green lines
with `+` will be added; red lines with `-` will be removed. **Apply changes**
saves the reviewed edit and marks that same proposal bubble **Changes applied**.
Each diff names its file and can be expanded or collapsed. Your disclosure choices
stay in place through shop actions, new transcript turns, and page reloads.
If you save a file after the preview, Milo refreshes the diff and asks you to
apply it again. He preserves your save instead of applying an outdated proposal.

Make your part of the change in your editor and save. A **Your saved changes**
turn appears automatically with your diff, even if the edit is incomplete or has
a syntax error. You can compare both sides of the work directly in the
conversation. These diffs stay in the history when you continue or reload.

The walkthrough records changes to the OpenAPI document, product handler, order
handler, shared context, and scenario file. It keeps a local baseline and change journal; Git
is not required. Existing repositories are left alone. File changes and lesson
completion are separate: seeing a diff does not mark an exercise complete.

## Save, exercise, and compare

Saved-file detection runs in the background without requesting new products.
Checks call snapshots of your saved functions with fresh, isolated context, so
they do not consume the running shop’s inventory or its order IDs. Missing methods
and incomplete implementations produce guidance. Saving a correction triggers
another check automatically. Use **Hint** whenever Milo is waiting for you to
reveal precise instructions for the current action.

When your saved code passes, Milo adds feedback to the conversation that names
the behavior you implemented and suggests the next experiment. Repeated checks
of the same saved code do not repeat that message.

A passing saved-file check is only part of an exercise. Follow the instructions
to refresh products, place orders, or run a command against the live API. Handler
and context reloads are asynchronous; if the old behavior is still visible just
after saving, repeat the observation after the reload completes.

In the inventory lesson, buy Dark Roast and answer whether that order also
subtracted stock. A wrong answer explains the observed before/after quantities
and offers **Try again**. A correct answer reveals the helper exercise. The answer
uses the actual purchase result, including when you revisit with an already
implemented handler. Reloading preserves an unanswered question and its observed
quantities.

For stock rejection, add two bags while stock is sufficient, lower the running
quantity in the REPL, refresh, and place the order. The cart is preserved on
rejection. Empty it and restore stock before continuing. Missing confirmations
are described as unknown; inspect the request and inventory before retrying.
During the failure/recovery lesson, **Restore original cart** brings back the
original failed order if you have changed its items.
To exercise the 503 response, save the unavailable switch, click **Add to cart**
on House Blend, then click **Place order**. Expand the order’s **HTTP** details
in the chat to check the 503 response and confirm that House Blend stays in the
cart. After restoring availability in your handler, click **Try again** with the
same cart and check for a 201 response and an empty cart.

## Make state changes explicit

The context starts empty. Preparation adds its fields and method stubs; you fill
in the two method bodies. `Product` and `OrderItem` are imported from the schema
types Counterfact generated from the bundled OpenAPI document. There are no
duplicate model type definitions in your context file. The baseline
scenario contains the example catalog and starting quantities; `startup`
delegates to that scenario on subsequent server starts. Saving a scenario does
not apply it to an already running session. Use the REPL’s `.scenario` command to
run the named `reset` scenario explicitly.

This restores the entire shop baseline, including order IDs. A focused scenario
such as `restockDarkRoast` changes only its named condition. It preserves other
products and the order counter. The three-product catalog is deliberately small
so stock changes and selling out are easy to observe.

The terminal’s `⬣>` prompt is the REPL. Its `context` is the same running object
routes access as `$.context`. After a direct assignment or scenario command,
click **Refresh products** to request the updated state. There is no special
Decaf setter or automatic reset hidden in the product handler.

## Revisit or restart

Browser reloads preserve the current lesson, completed phases, and cart within
the same API session. Scrolling through earlier conversation turns preserves your source files and
running state. If a revisited exercise needs inventory, use the REPL or your
named scenario to establish that state explicitly; navigation never resets it.

The final lesson prints the restart command and the directory to run it from.
The command includes your current port. Restarting keeps your source edits,
runs your `startup` scenario, and begins a new browser session. Choose **Resume
this project** to continue after the last completed lesson. Completed projects
return to the final lesson so you can keep experimenting. Your saved code and
lesson checkpoints are preserved; cart, request, and quiz observations start fresh.
An open guide detects a server restart and reloads into this handoff.

If you return to the initialization lesson after `startup` has already seeded
the inventory, Milo explains how to make reset observable: set Dark Roast to 0
in the REPL, wait for Milo to observe that change, then run the reset scenario.
Milo detects the restored baseline automatically.
Resuming never resets state or edits your files. Existing generated demos remain untouched;
start a new guided example to use the rebuilt walkthrough.

The generated tutorial infrastructure references helpers in the Counterfact
installation that created it. Keep that installation available when restarting.
For a lasting exercise, install Counterfact in your project; see
[project installation](../patterns/lifecycle-setup.md). Legacy generated demos
retain their original saved-file and telemetry helper interfaces.

## Continue learning

- [Generate an API from OpenAPI](../getting-started.md)
- [Custom route handlers](../features/routes.md)
- [Stateful contexts](../features/state.md)
- [Scenario scripts](../patterns/scenario-scripts.md)
- [Interactive REPL](../features/repl.md)
- [CLI and configuration](../api/cli.md#first-run-intro)
