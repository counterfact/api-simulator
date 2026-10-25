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

The generated project contains ordinary routes, context, and a startup scenario. Its lesson-check routes load helpers from this package's installed location. Keep that installation available when restarting the project; the generated exercise is editable but is not a standalone distribution of the tutorial system. Handler checks use separate temporary inventory and leave the running shop untouched.

## Add another tour

Keep tour-specific files under their own directory in `src/`, alongside `src/coffee-shop/`. Add preparation/selection in `src/prepare-tour.ts` and expose caller-facing capabilities through `src/index.ts`. Keep browser presentation, lesson progression, and checks in this package; use ordinary Counterfact routes and documented runtime exports for the exercises. Extend shared machinery when a second tour demonstrates the need.

This package depends only on public runtime exports. It must not import the CLI facade or CLI internals. The CLI consumes the package root export; coffee-shop internals are not public entry points.

Run `yarn test:tutorials` from the repository root. The isolated package-closure check runs [the preparation example](./examples/prepare-coffee-shop.mjs); the facade's packed-consumer check starts an installed tour and exercises its browser and saved-handler endpoints.
