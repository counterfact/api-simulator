/* eslint-disable security/detect-non-literal-fs-filename -- Reads fixed lesson files in the generated project and compiles snapshots in a fresh temporary directory. */
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Transpiler } from "@counterfact/runtime";

const files = ["_.context.ts", "products.ts", "orders.ts"];
const require = createRequire(import.meta.url);

type ShopContext = {
  inventory: Record<string, number>;
  nextOrderId: number;
};
type Result = { status: number; body: unknown };
type Handler = (request: {
  context: ShopContext;
  body: { items: { productId: string; quantity: number }[] };
  response: Record<number, { json: (body: unknown) => Result }>;
}) => Result | Promise<Result>;

async function snapshot(root: string) {
  return Promise.all(
    files.map(async (file) => readFile(join(root, "routes", file), "utf8")),
  );
}
function revision(sources: string[]) {
  return createHash("sha256").update(JSON.stringify(sources)).digest("hex");
}
export async function shopRevision(root: string): Promise<string> {
  try {
    return revision(await snapshot(root));
  } catch {
    return "unavailable";
  }
}

// Run the saved functions with a fresh Context, never the running shop's state.
export async function checkShopSave(root: string, step: number) {
  let savedRevision = "unavailable";
  let directory: string | undefined;
  const loaded: string[] = [];
  try {
    if (![2, 4, 5, 7].includes(step))
      throw Error("This lesson has no saved-file check.");
    const sources = await snapshot(root);
    savedRevision = revision(sources);
    directory = await mkdtemp(join(tmpdir(), "counterfact-shop-check-"));
    const source = join(directory, "source"),
      output = join(directory, "compiled");
    await mkdir(source);
    for (const [index, file] of files.entries())
      await writeFile(join(source, file), sources[index]!);
    const compiler = new Transpiler(source, output, "commonjs");
    try {
      await compiler.watch();
    } finally {
      await compiler.stopWatching();
    }
    function load(file: string): Record<string, unknown> {
      const path = join(output, file + ".cjs");
      loaded.push(path);
      // Only fixed lesson modules compiled from this snapshot can be loaded.
      // eslint-disable-next-line security/detect-non-literal-require
      return require(path) as Record<string, unknown>;
    }
    const { Context } = load("_.context");
    const context = new (Context as new () => ShopContext)();
    context.inventory = { "house-blend": 5, "dark-roast": 3, decaf: 0 };
    context.nextOrderId = 1;
    const products = load("products").GET as Handler;
    const orders = load("orders").POST as Handler;
    const response = Object.fromEntries(
      [200, 201, 409, 503].map((status) => [
        status,
        { json: (body: unknown) => ({ status, body }) },
      ]),
    );
    const request = {
      context,
      response,
      body: { items: [{ productId: "dark-roast", quantity: 2 }] },
    };
    const expectResult = (condition: boolean, message: string) => {
      if (!condition) throw Error(message);
    };
    const before = await products(request);
    const catalog = before?.body as { id: string; stock: number }[];
    expectResult(
      before?.status === 200 && Array.isArray(catalog),
      "Expected the products handler to return HTTP 200 with a product list.",
    );
    if (step === 2) {
      const stock = catalog.find((product) => product.id === "decaf")?.stock;
      expectResult(
        Number.isSafeInteger(stock) && (stock ?? 0) > 0,
        `Expected a positive whole-number Decaf stock; the products handler returned ${String(stock)}.`,
      );
    } else {
      const result = await orders(request);
      const expected = step === 4 ? 503 : 201;
      expectResult(
        result?.status === expected,
        `Expected HTTP ${expected}; the order handler returned HTTP ${String(result?.status)}.`,
      );
      if (expected === 201)
        expectResult(
          Number.isInteger((result.body as { orderId?: number })?.orderId),
          "Expected a successful order confirmation with an orderId.",
        );
      if (step === 4 || step === 7) {
        const after = await products(request);
        const expectedStock = step === 7 ? 1 : 3;
        const stock = (after?.body as typeof catalog)?.find(
          (product) => product.id === "dark-roast",
        )?.stock;
        expectResult(
          after?.status === 200 &&
            stock === expectedStock &&
            context.inventory["dark-roast"] === expectedStock,
          `Test order: 2 Dark Roast from stock 3. Expected ${expectedStock} remaining; the products handler returned ${String(stock)}.`,
        );
        expectResult(
          context.inventory["house-blend"] === 5 &&
            context.inventory.decaf ===
              catalog.find((product) => product.id === "decaf")?.stock,
          "The test order changed inventory for a coffee that was not ordered.",
        );
      }
    }
    return {
      revision: savedRevision,
      ok: true,
      message: "Saved change verified.",
    };
  } catch (error) {
    return {
      revision: savedRevision,
      ok: false,
      message:
        "Saved change did not pass the lesson check. " +
        (error instanceof Error ? error.message : String(error)),
    };
  } finally {
    for (const path of loaded) delete require.cache[path];
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
