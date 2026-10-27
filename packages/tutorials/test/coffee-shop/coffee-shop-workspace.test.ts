import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "@jest/globals";
import {
  CodeGenerator,
  Repository,
  ScenarioFileGenerator,
} from "@counterfact/generator";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";
import { prepareTour } from "../../src/prepare-tour.js";
import { checkWalkthroughSave } from "../../src/coffee-shop/coffee-shop-checks.js";
import {
  checkpointWalkthroughStep as checkpoint,
  prepareWalkthroughStep as prepare,
  walkthroughWorkspace as workspace,
} from "../../src/coffee-shop/coffee-shop-workspace.js";
import { PHASES } from "../../src/coffee-shop/coffee-shop-lessons.js";

const exec = promisify(execFile);
const git = async (root: string, ...args: string[]) =>
  (await exec("git", args, { cwd: root })).stdout.trim();
async function generate(root: string, source: string) {
  const repository = new Repository();
  await new CodeGenerator(source, root, { routes: true, types: true }).generate(
    repository,
  );
  await repository.finished();
  const scenarios = new ScenarioFileGenerator(root);
  await scenarios.generate();
}

it("prepares focused changes, preserves learner edits, and records all twelve lessons in a private local history", async () => {
  await usingTemporaryFiles(async ($) => {
    const tour = await prepareTour($.path("."), "demo");
    await generate(tour.destination, tour.source);
    const root = tour.destination;
    await workspace(root);
    expect(await git(root, "log", "--format=%s")).toBe(
      "Start with Counterfact generated stubs",
    );
    expect(await git(root, "status", "--porcelain")).toBe("");
    await expect(prepare(root, "context")).rejects.toThrow("preceding lesson");
    await checkpoint(root, "explore");
    await prepare(root, "catalog");
    expect(await $.read("demo/routes/products.ts")).toContain(".random()");
    expect(await git(root, "diff", "--name-only")).toBe("routes/products.ts");
    // Apply exactly the small edits displayed by each lesson, leaving imports and other code alone.
    const replace = async (file: string, before: string, after: string) => {
      const text = await $.read("demo/" + file);
      expect(text).toContain(before);
      await $.add("demo/" + file, text.replace(before, after));
    };
    const append = async (file: string, text: string) =>
      $.add("demo/" + file, (await $.read("demo/" + file)) + "\n" + text);
    await replace(
      "routes/products.ts",
      "return $.response.status(200).random();",
      PHASES.find((p) => p.id === "catalog")!.edits[0]!.code,
    );
    await append("routes/products.ts", "// Keep my note.");
    await prepare(root, "catalog");
    expect(await $.read("demo/routes/products.ts")).toContain("Keep my note");
    expect((await checkWalkthroughSave(root, "catalog")).ok).toBe(true);
    await $.add("demo/notes.md", "my unrelated staged notes");
    await git(root, "add", "notes.md");
    await checkpoint(root, "catalog");
    expect(await git(root, "diff", "--cached", "--name-only")).toBe("notes.md");
    await git(root, "reset", "HEAD", "--", "notes.md");
    await $.remove("demo/notes.md");
    await replace(
      "routes/orders.ts",
      "return $.response.status(201).random();",
      PHASES.find((p) => p.id === "order")!.edits[0]!.code,
    );
    await checkpoint(root, "order");
    await prepare(root, "fail");
    await replace(
      "routes/orders.ts",
      "ordersAvailable = true",
      "ordersAvailable = false",
    );
    expect((await checkWalkthroughSave(root, "fail")).ok).toBe(true);
    await checkpoint(root, "fail");
    expect((await workspace(root)).checkpoints).not.toContain(4);
    await replace(
      "routes/orders.ts",
      "ordersAvailable = false",
      "ordersAvailable = true",
    );
    await checkpoint(root, "retry");
    await prepare(root, "context");
    expect((await checkWalkthroughSave(root, "context")).ok).toBe(false);
    await replace(
      "routes/_.context.ts",
      "return [];",
      "return this.catalog.map(product => ({ ...product, stock: this.inventory[product.id] ?? 0 }));",
    );
    await replace(
      "routes/_.context.ts",
      "orderId: 0",
      "orderId: this.nextOrderId++",
    );
    expect((await checkWalkthroughSave(root, "context")).ok).toBe(true);
    expect(await $.read("demo/routes/_.context.ts")).not.toContain(
      "export type",
    );
    await checkpoint(root, "context");
    await append("scenarios/index.ts", 'export const myNote = "keep this";');
    await prepare(root, "seed");
    expect(await $.read("demo/scenarios/index.ts")).toContain(
      'myNote = "keep this"',
    );
    expect(await $.read("demo/scenarios/index.ts")).toContain(
      "export const help",
    );
    await append(
      "scenarios/index.ts",
      "export const startup: Scenario = reset;",
    );
    expect((await checkWalkthroughSave(root, "seed")).ok).toBe(true);
    await checkpoint(root, "seed");
    await replace(
      "routes/products.ts",
      "return $.response.status(200).json(catalog);",
      PHASES.find((p) => p.id === "connect")!.edits[0]!.code,
    );
    await replace(
      "routes/orders.ts",
      "return $.response.status(201).json({ orderId: 1, items: $.body.items });",
      PHASES.find((p) => p.id === "connect")!.edits[1]!.code,
    );
    await checkpoint(root, "connect");
    await checkpoint(root, "decaf");
    await prepare(root, "rules");
    await replace(
      "routes/orders.ts",
      "return $.response.status(201)",
      PHASES.find((p) => p.id === "rules")!.edits[0]!.code +
        "return $.response.status(201)",
    );
    expect((await checkWalkthroughSave(root, "rules")).ok).toBe(true);
    await checkpoint(root, "rules");
    await prepare(root, "reduce");
    expect((await checkWalkthroughSave(root, "reduce")).ok).toBe(false);
    await replace(
      "routes/orders.ts",
      "// TODO: For each item, subtract its quantity from inventory[item.productId].",
      PHASES.find((p) => p.id === "reduce")!.edits[0]!.code,
    );
    expect((await checkWalkthroughSave(root, "reduce")).ok).toBe(true);
    await checkpoint(root, "reduce");
    await checkpoint(root, "restock");
    await prepare(root, "scenario");
    await replace(
      "scenarios/index.ts",
      "// TODO: set Dark Roast inventory to 5.",
      PHASES.find((p) => p.id === "scenario")!.edits[0]!.code,
    );
    expect((await checkWalkthroughSave(root, "scenario")).ok).toBe(true);
    await checkpoint(root, "scenario");
    await checkpoint(root, "scenario");
    expect((await git(root, "log", "--format=%s")).split("\n")).toHaveLength(
      13,
    );
    expect(await git(root, "status", "--porcelain")).toBe("");
    expect(await git(root, "remote")).toBe("");
    // Compile the final exercises against the real generated schema/handler types.
    const program = ts.createProgram(
      [
        $.path("demo/routes/_.context.ts"),
        $.path("demo/routes/products.ts"),
        $.path("demo/routes/orders.ts"),
        $.path("demo/scenarios/index.ts"),
        $.path("demo/routes/tutorial-workspace.ts"),
      ],
      {
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        allowImportingTsExtensions: true,
        baseUrl: process.cwd(),
        paths: {
          "@counterfact/types": ["packages/types/dist/index.d.ts"],
          counterfact: ["packages/counterfact/dist/index.d.ts"],
        },
        ignoreDeprecations: "6.0",
      },
    );
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")),
    ).toEqual([]);
  });
});

it("never touches an existing project or overwrites conflicting learner code", async () => {
  await usingTemporaryFiles(async ($) => {
    expect((await workspace($.path("."))).enabled).toBe(false);
    await expect(prepare($.path("."), "catalog")).rejects.toThrow("baseline");
    await git($.path("."), "init");
    await $.add("parent-notes.md", "keep the parent repository intact");
    await git($.path("."), "add", "parent-notes.md");
    const tour = await prepareTour($.path("."), "demo");
    await generate(tour.destination, tour.source);
    await workspace(tour.destination);
    expect(await git($.path("."), "diff", "--cached", "--name-only")).toBe(
      "parent-notes.md",
    );
    await checkpoint(tour.destination, "explore");
    await $.add(
      "demo/routes/products.ts",
      'export const catalog = "my own catalog";',
    );
    await expect(prepare(tour.destination, "catalog")).rejects.toThrow(
      "already exists",
    );
    expect(await $.read("demo/routes/products.ts")).toContain("my own catalog");
    expect((await workspace(tour.destination)).prepared).toEqual([]);
  });
});
