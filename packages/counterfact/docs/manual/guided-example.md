# Build a coffee-shop API from generated stubs

Learn Counterfact by replacing generated responses with behavior you write. The
bundled coffee shop starts against the same random handlers Counterfact generates
for your own OpenAPI document. OpenAPI, formerly Swagger, describes the requests
and responses; your handlers add the behavior.

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
The first lesson links to your actual local API address, normally
`http://localhost:3100`.

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

Expand **Latest API requests and responses** to inspect the actual GET and POST
traffic: the URL, request body, response status, and response body. The shop does
not substitute a working catalog or silently install backend implementations.

## Add one behavior at a time

The twelve steps build on the code you have already written:

| Step | What you add                                                             | What to observe                                                                       |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1    | Inspect and refresh the generated API                                    | The handler generates each response from its schema.                                  |
| 2    | An explicit product response                                             | Repeated requests return the same three coffees.                                      |
| 3    | An order response using `$.body.items`                                   | The confirmation reflects the submitted cart.                                         |
| 4    | A 503 branch and recovery switch                                         | A rejected order keeps its cart; restoring the handler lets the same request succeed. |
| 5    | An empty Context class with catalog, inventory, and confirmation methods | You can inspect the running object in the REPL before routes use it.                  |
| 6    | A baseline `reset` scenario and `startup` export                         | Nothing is seeded until you explicitly run `.scenario reset`.                         |
| 7    | Handlers calling context methods                                         | Products read shared state and successive orders receive successive IDs.              |
| 8    | A Decaf inventory assignment in the REPL                                 | The next product request reads the changed quantity.                                  |
| 9    | Stock validation and shortage methods                                    | Oversized orders return HTTP 409 with requested and available quantities.             |
| 10   | `reduceInventory(items, inventory)`                                      | Successful purchases now change the quantity returned by later product requests.      |
| 11   | Requests that sell out and REPL commands that restock                    | The same handlers produce different responses as shared state evolves.                |
| 12   | A focused `restockDarkRoast` scenario                                    | A reusable setup changes one product while preserving other inventory and order IDs.  |

Each phase explains the Counterfact facility being used and names the file to edit.
**Prepare this step** adds the supporting code described above the button. Review
that change in your IDE, then make the small edit supplied under **Show code**.
You keep your existing file and change only the indicated return statement, branch,
method body, or assignment. Counterfact prepares the surrounding structure and
data; you connect the behavior. Preparation never runs a scenario or resets state. **Open in VSCode** and **Copy file
path** help you find the file. File names in the prose also open in VSCode.
Counterfact formats the supplied walkthrough infrastructure; the generator creates
the initial product and order stubs, context, and default scenario file.

New instructions and code hints appear when they become relevant. Earlier
instructions stay visible. **Continue** moves between completed lessons;
**Back** revisits them. **Preview next lesson** shows later instructions and the
first missing prerequisite, with a return link. Previewing never applies code or
marks an exercise complete.

## Follow changes in your IDE

Git must be installed. Your new demo has its own local Git repository, with a
commit of the generated starting point. Each completed step creates another
commit, including steps that only use HTTP requests or the REPL. Open the demo
folder in your IDE and use its Source Control view to inspect the current step’s
uncommitted changes. Both prepared code and your edits stay visible until that
step completes.

These commits stay local. Counterfact uses a walkthrough identity for its Git
commands without changing your personal Git settings. A failed commit leaves
your work in place and offers **Retry Git checkpoint** before you continue.
Preparation remembers what it has added across reloads and refuses to replace
conflicting code. Existing demos keep their files and history; start a new demo
to use guided preparation and automatic checkpoints.

## Save, exercise, and compare

Saved-file detection runs in the background without requesting new products.
Checks call snapshots of your saved functions with fresh, isolated context, so
they do not consume the running shop’s inventory or its order IDs. Missing methods
and incomplete implementations produce guidance. Fix the code and save again, or
click **Check progress** to retry.

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

## Make state changes explicit

The context starts empty. Preparation adds its fields and method stubs; you fill
in the two method bodies. `Product` and `OrderItem` are imported from the schema
types Counterfact generated from the bundled OpenAPI document. There are no
duplicate model type definitions in your context file. The baseline
scenario contains the example catalog and starting quantities; `startup`
delegates to that scenario on subsequent server starts. Saving a scenario does
not apply it to an already running session. Run it explicitly:

```text
.scenario reset
```

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
the same API session. Back and preview navigation preserve your source files and
running state. If a revisited exercise needs inventory, use the REPL or your
named scenario to establish that state explicitly; navigation never resets it.

The final lesson prints the restart command and the directory to run it from.
The command includes your current port. Restarting keeps your source edits,
runs your `startup` scenario, and begins a new browser lesson session. It does
not overwrite your implementations. Existing generated demos remain untouched;
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
