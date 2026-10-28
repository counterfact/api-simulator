/* eslint-disable security/detect-non-literal-fs-filename -- Fixed tutorial files are copied into an isolated snapshot for checks. */
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transpiler } from "@counterfact/runtime";
import { CATALOG, PHASES } from "./coffee-shop-lessons.js";

import { walkthroughWorkspace } from "./coffee-shop-workspace.js";

import { readTourReplSubmissions } from "./coffee-shop-repl.js";

const sessionIds = new Map<string, string>();
const paths = [
  "routes/products.ts",
  "routes/orders.ts",
  "routes/_.context.ts",
  "scenarios/index.ts",
];
const require = createRequire(import.meta.url);
type Item = { productId: string; quantity: number };
type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
};
type Context = {
  catalog?: Omit<Product, "stock">[];
  inventory?: Record<string, number>;
  listProducts?: () => Product[];
  confirmOrder?: (items: Item[]) => { orderId: number; items: Item[] };
};
type Result = { status: number; body: unknown; random?: boolean };
type Handler = (request: {
  context: Context;
  body: { items: Item[] };
  response: unknown;
}) => Result | Promise<Result>;
type Scenario = (request: { context: Context }) => unknown;
async function snapshot(root: string) {
  return Promise.all(
    paths.map(async (path) => {
      try {
        return await readFile(join(root, path), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
        throw error;
      }
    }),
  );
}
const revisionOf = (sources: string[]) =>
  createHash("sha256").update(JSON.stringify(sources)).digest("hex");
export async function walkthroughInfo(
  root: string,
  context: Context,
  includeChanges = false,
) {
  if (!sessionIds.has(root)) {
    if (sessionIds.size >= 128)
      sessionIds.delete(sessionIds.keys().next().value!);
    sessionIds.set(root, randomUUID());
  }
  const workspace = await walkthroughWorkspace(root);
  return {
    workspace: includeChanges ? workspace : { ...workspace, changes: [] },
    replSubmissions: includeChanges ? await readTourReplSubmissions(root) : [],
    projectPath: root,
    sessionId: sessionIds.get(root)!,
    walkthroughVersion: 2,
    revision: revisionOf(await snapshot(root)),
    state: {
      catalog: context.catalog ?? null,
      inventory: context.inventory ?? null,
    },
  };
}
const equal = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Run learner functions against fresh state, never the running shop's context. */
export async function checkWalkthroughSave(root: string, phaseId: string) {
  let revision = "unavailable";
  let directory: string | undefined;
  const loaded: string[] = [];
  try {
    ensure(
      PHASES.some((phase) => phase.id === phaseId && phase.check),
      "This phase has no saved-file check.",
    );
    const sources = await snapshot(root);
    revision = revisionOf(sources);
    directory = await mkdtemp(join(tmpdir(), "counterfact-walkthrough-v2-"));
    const source = join(directory, "source"),
      output = join(directory, "compiled");
    for (const [index, path] of paths.entries()) {
      if (!sources[index]) continue;
      const destination = join(source, path);
      await mkdir(join(destination, ".."), { recursive: true });
      await writeFile(destination, sources[index]!);
    }
    const compiler = new Transpiler(source, output, "commonjs");
    try {
      await compiler.watch();
    } finally {
      await compiler.stopWatching();
    }
    function load(path: string): Record<string, unknown> {
      const file = join(output, path + ".cjs");
      loaded.push(file);
      // eslint-disable-next-line security/detect-non-literal-require
      return require(file) as Record<string, unknown>;
    }
    const { Context: ContextClass } = load("routes/_.context");
    const context = new (ContextClass as new () => Context)();
    const response = Object.fromEntries(
      [200, 201, 409, 503].map((status) => [
        status,
        {
          json: (body: unknown): Result => ({ status, body }),
          random: (): Result => ({ status, body: null, random: true }),
        },
      ]),
    );
    const builder = {
      ...response,
      status: (status: number) => response[status],
    };
    const products = load("routes/products").GET as Handler;
    const orders = load("routes/orders").POST as Handler;
    const items = [{ productId: "dark-roast", quantity: 2 }];
    const request = (orderedItems = items) => ({
      context,
      body: { items: orderedItems },
      response: builder,
    });
    const readProducts = async () => {
      const result = await products(request());
      ensure(
        result.status === 200 && !result.random && Array.isArray(result.body),
        "Replace the random product stub with a JSON product response.",
      );
      return result.body as Product[];
    };
    const confirm = async (orderedItems = items) => {
      const result = await orders(request(orderedItems));
      ensure(
        result.status === 201 && !result.random,
        "Expected an explicit HTTP 201 confirmation, not a random response.",
      );
      const body = result.body as { orderId: number; items: Item[] };
      ensure(
        Number.isInteger(body?.orderId) && equal(body.items, orderedItems),
        "Return an orderId and the exact items from $.body.items.",
      );
      return body;
    };
    if (phaseId === "catalog") {
      const first = await readProducts();
      ensure(
        equal(first, CATALOG) && equal(first, await readProducts()),
        "Return the three example coffees with their initial stock on repeated requests.",
      );
    } else if (["order", "fail", "retry"].includes(phaseId)) {
      if (phaseId === "fail")
        ensure(
          (await orders(request())).status === 503,
          "Expected HTTP 503 while ordersAvailable is false.",
        );
      else {
        await confirm();
        await confirm([{ productId: "house-blend", quantity: 1 }]);
      }
    } else {
      ensure(
        Array.isArray(context.catalog) &&
          context.inventory &&
          typeof context.listProducts === "function" &&
          typeof context.confirmOrder === "function",
        "Add catalog, inventory, listProducts(), and confirmOrder() to Context first.",
      );
      if (phaseId === "context") {
        ensure(
          context.catalog.length === 0 &&
            Object.keys(context.inventory).length === 0,
          "Start with empty catalog and inventory fields; the scenario will supply data later.",
        );
        ensure(
          equal(context.listProducts(), []),
          "listProducts() should read the initially empty catalog.",
        );
        ensure(
          context.confirmOrder(items).orderId === 1 &&
            context.confirmOrder(items).orderId === 2,
          "confirmOrder() must advance the order ID counter.",
        );
        context.catalog = [
          {
            id: "sample-bean",
            name: "Sample Bean",
            description: "A test catalog entry.",
            price: 900,
          },
          {
            id: "no-stock",
            name: "No Stock",
            description: "No inventory entry yet.",
            price: 1100,
          },
        ];
        context.inventory = { "sample-bean": 7, unrelated: 19 };
        ensure(
          equal(
            context.listProducts(),
            context.catalog.map((product) => ({
              ...product,
              stock: product.id === "sample-bean" ? 7 : 0,
            })),
          ),
          "Implement listProducts(): combine each catalog product with its inventory quantity, using 0 when its ID has no inventory entry.",
        );
      } else {
        const scenarios = load("scenarios/index");
        ensure(
          typeof scenarios.reset === "function" &&
            typeof scenarios.startup === "function",
          "Create reset and startup in scenarios/index.ts.",
        );
        await (scenarios.reset as Scenario)({ context });
        ensure(
          equal(context.listProducts(), CATALOG),
          "The reset scenario should initialize the example catalog and inventory.",
        );
        if (phaseId === "seed") {
          context.inventory["dark-roast"] = 0;
          context.confirmOrder(items);
          await (scenarios.startup as Scenario)({ context });
          ensure(
            equal(context.listProducts(), CATALOG) &&
              context.confirmOrder(items).orderId === 1,
            "startup must restore the baseline and its order counter through reset.",
          );
        } else if (phaseId === "connect") {
          context.inventory.decaf = 7;
          ensure(
            (await readProducts()).find((product) => product.id === "decaf")
              ?.stock === 7,
            "The product handler must read the live context.",
          );
          const first = await confirm(),
            second = await confirm();
          ensure(
            second.orderId === first.orderId + 1 &&
              context.inventory["dark-roast"] === 3,
            "Use context.confirmOrder() for successive IDs without reducing inventory yet.",
          );
        } else if (phaseId === "rules") {
          const before = JSON.stringify(context.inventory);
          const duplicate = await orders(request([...items, ...items]));
          ensure(
            duplicate.status === 409 &&
              equal((duplicate.body as { shortages: unknown }).shortages, [
                { productId: "dark-roast", requested: 4, available: 3 },
              ]),
            "Combine repeated product IDs and return HTTP 409 with requested and available quantities.",
          );
          ensure(
            (await orders(request([{ productId: "dark-roast", quantity: 0 }])))
              .status === 409,
            "Reject zero or invalid quantities.",
          );
          ensure(
            before === JSON.stringify(context.inventory),
            "Rejected orders must preserve inventory.",
          );
          await confirm();
        } else if (phaseId === "reduce") {
          await confirm();
          ensure(
            context.inventory["dark-roast"] === 1 &&
              (await readProducts()).find(
                (product) => product.id === "dark-roast",
              )?.stock === 1,
            "Buying 2 Dark Roast from stock 3 must leave 1 in context and the product response.",
          );
          ensure(
            context.inventory["house-blend"] === 5 &&
              context.inventory.decaf === 0,
            "Change only purchased products.",
          );
        } else if (phaseId === "scenario") {
          ensure(
            typeof scenarios.restockDarkRoast === "function",
            "Export restockDarkRoast from scenarios/index.ts.",
          );
          context.inventory["dark-roast"] = 0;
          context.inventory.decaf = 4;
          context.inventory["house-blend"] = 2;
          context.confirmOrder(items);
          const catalogBefore = JSON.stringify(context.catalog);
          await (scenarios.restockDarkRoast as Scenario)({ context });
          ensure(
            context.inventory["dark-roast"] === 5 &&
              context.inventory.decaf === 4 &&
              context.inventory["house-blend"] === 2 &&
              context.confirmOrder(items).orderId === 2 &&
              JSON.stringify(context.catalog) === catalogBefore,
            "restockDarkRoast must change only Dark Roast inventory and preserve the order counter.",
          );
        }
      }
    }
    return {
      revision,
      ok: true,
      message:
        "Saved implementation verified. Now try it against your running API.",
    };
  } catch (error) {
    return {
      revision,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    for (const file of loaded) delete require.cache[file];
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
