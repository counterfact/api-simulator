import { parse, stringify } from "yaml";
import { expect, it } from "@jest/globals";
import {
  CodeGenerator,
  Repository,
  ScenarioFileGenerator,
} from "@counterfact/generator";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";
import { prepareTour } from "../../src/prepare-tour.js";
import {
  checkWalkthroughSave,
  walkthroughInfo,
} from "../../src/coffee-shop/coffee-shop-checks.js";
import {
  checkpointWalkthroughStep as checkpoint,
  prepareWalkthroughStep as prepare,
  previewWalkthroughStep as preview,
  walkthroughWorkspace as workspace,
} from "../../src/coffee-shop/coffee-shop-workspace.js";
import {
  PHASES,
  CONTEXT,
  LESSON_COUNT,
  INVENTORY_LOOP,
  RULES_ORDERS,
} from "../../src/coffee-shop/coffee-shop-lessons.js";

async function generate(root: string, source: string) {
  const repository = new Repository();
  await new CodeGenerator(source, root, { routes: true, types: true }).generate(
    repository,
  );
  await repository.finished();
  const scenarios = new ScenarioFileGenerator(root);
  await scenarios.generate();
}

it("keeps tracking the JSON spec in an existing version 3 demo", async () => {
  await usingTemporaryFiles(async ($) => {
    const tour = await prepareTour($.path("."), "demo");
    await generate(tour.destination, tour.source);
    const spec = parse(await $.read("demo/openapi.yaml"));
    await $.add("demo/openapi.json", JSON.stringify(spec, null, 2));
    await $.remove("demo/openapi.yaml");
    const state = JSON.parse(
      await $.read("demo/.counterfact-walkthrough-state.json"),
    );
    delete state.schemaFile;
    state.version = 3;
    await $.add(
      "demo/.counterfact-walkthrough-state.json",
      JSON.stringify(state),
    );
    const initial = await workspace(tour.destination);
    expect(initial.schemaFile).toBe("openapi.json");
    spec.components.schemas.Product.properties.name.example = "House Blend";
    await $.add("demo/openapi.json", JSON.stringify(spec, null, 2));
    const updated = await workspace(tour.destination);
    expect(updated.changes.at(-1)?.files[0]?.file).toBe("openapi.json");
    expect(
      (await checkWalkthroughSave(tour.destination, "name-example")).ok,
    ).toBe(true);
  });
});

it("prepares focused changes, preserves learner edits, and records all current lessons in a attributed file history without Git", async () => {
  await usingTemporaryFiles(async ($) => {
    const tour = await prepareTour($.path("."), "demo");
    await generate(tour.destination, tour.source);
    const root = tour.destination;
    const previewAndApply = async (phaseId: string) => {
      const lessonFiles = [
        "routes/products.ts",
        "routes/orders.ts",
        "routes/_.context.ts",
        "scenarios/index.ts",
        "openapi.yaml",
      ];
      const before = await Promise.all(
        lessonFiles.map((file) => $.read("demo/" + file)),
      );
      const beforeState = await $.read(
        "demo/.counterfact-walkthrough-state.json",
      );
      const proposal = await preview(root, phaseId);
      expect(
        await Promise.all(lessonFiles.map((file) => $.read("demo/" + file))),
      ).toEqual(before);
      expect(await $.read("demo/.counterfact-walkthrough-state.json")).toBe(
        beforeState,
      );
      await prepare(root, phaseId, { revision: proposal.revision });
      for (const file of proposal.files!)
        expect(await $.read("demo/" + file.file)).toBe(file.after);
    };
    await workspace(root);
    expect((await workspace(root)).changes).toEqual([]);
    await expect($.read("demo/.git/HEAD")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(prepare(root, "context")).rejects.toThrow("preceding lesson");
    await checkpoint(root, "orientation");
    await checkpoint(root, "explore");
    const document = parse(await $.read("demo/openapi.yaml"));
    document.components.schemas.Product.properties.description.examples = [
      "Chocolate and caramel.",
      "Rich cocoa and a bold finish.",
    ];
    await $.add("demo/openapi.yaml", stringify(document));
    expect((await checkWalkthroughSave(root, "description-example")).ok).toBe(
      true,
    );
    await checkpoint(root, "description-example");

    const original = await $.read("demo/routes/products.ts");
    expect(original).toContain(
      'import type { Routes } from "../types/index.js"',
    );
    expect(original).toContain('type Route = Routes["/products"]');
    expect(original).toContain('GET: Route["GET"]');
    expect(await $.read("demo/routes/orders.ts")).toContain(
      'POST: Route["POST"]',
    );
    const originalState = await $.read(
      "demo/.counterfact-walkthrough-state.json",
    );
    const proposal = await preview(root, "catalog");
    expect(proposal.files).toEqual([
      {
        file: "routes/products.ts",
        before: original,
        after: expect.stringContaining("const catalog"),
      },
    ]);
    expect(await $.read("demo/routes/products.ts")).toBe(original);
    expect(await $.read("demo/.counterfact-walkthrough-state.json")).toBe(
      originalState,
    );
    // A save made after review invalidates the proposal instead of being overwritten.
    await $.add("demo/routes/products.ts", original + "\n// Keep my save.\n");
    await expect(
      prepare(root, "catalog", { revision: proposal.revision }),
    ).rejects.toThrow("changed since this preview");
    expect(await $.read("demo/routes/products.ts")).toContain("Keep my save.");
    const updated = await preview(root, "catalog");
    await prepare(root, "catalog", { revision: updated.revision });
    expect(await $.read("demo/routes/products.ts")).toBe(
      updated.files![0]!.after,
    );
    expect(await $.read("demo/routes/products.ts")).toContain(".random()");
    const prepared = (await workspace(root)).changes!;
    expect(prepared).toHaveLength(3);
    expect(prepared[2]).toMatchObject({
      actor: "milo",
      phaseId: "catalog",
      files: [{ file: "routes/products.ts" }],
    });
    expect(prepared[2]!.files[0]!.before).not.toContain("const catalog");
    expect(prepared[2]!.files[0]!.after).toContain("const catalog");
    // Implement each instructed behavior independently, leaving imports and other code alone.
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
      "return $.response.status(200).json(catalog);",
    );
    await append("routes/products.ts", "// Keep my note.");
    await prepare(root, "catalog");
    expect(await $.read("demo/routes/products.ts")).toContain("Keep my note");
    expect((await checkWalkthroughSave(root, "catalog")).ok).toBe(true);
    await $.add(
      "demo/notes.md",
      "unrelated notes stay outside the tutorial history",
    );
    await checkpoint(root, "catalog");
    const observed = (await workspace(root)).changes!;
    expect(observed).toHaveLength(4);
    expect(observed[3]).toMatchObject({
      actor: "you",
      files: [{ file: "routes/products.ts" }],
    });
    expect(observed[3]!.files[0]!.before).toContain(".random()");
    expect(observed[3]!.files[0]!.after).toContain(".json(catalog)");
    expect((await workspace(root)).changes).toHaveLength(4);
    await replace(
      "routes/orders.ts",
      "return $.response.status(201).random();",
      "return $.response.status(201).json({ orderId: 1, items: $.body.items });",
    );
    await checkpoint(root, "order");
    await previewAndApply("fail");
    await replace(
      "routes/orders.ts",
      "ordersAvailable = true",
      "ordersAvailable = false",
    );
    expect((await checkWalkthroughSave(root, "fail")).ok).toBe(true);
    await checkpoint(root, "fail");
    expect((await workspace(root)).checkpoints).not.toContain(
      PHASES.find((p) => p.id === "fail")!.lesson,
    );
    await replace(
      "routes/orders.ts",
      "ordersAvailable = false",
      "ordersAvailable = true",
    );
    await checkpoint(root, "retry");
    await previewAndApply("context");
    expect(await $.read("demo/routes/_.context.ts")).toContain(
      "listProducts(): Product[]",
    );
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
    await replace(
      "routes/products.ts",
      "return $.response.status(200).json(catalog);",
      "return $.response.status(200).json($.context.listProducts());",
    );
    await replace(
      "routes/orders.ts",
      "return $.response.status(201).json({ orderId: 1, items: $.body.items });",
      "return $.response.status(201).json($.context.confirmOrder($.body.items));",
    );
    expect((await checkWalkthroughSave(root, "connect")).ok).toBe(true);
    expect(await $.read("demo/scenarios/index.ts")).not.toContain(
      "export const reset",
    );
    await checkpoint(root, "connect");
    await checkpoint(root, "context-repl");

    await append("scenarios/index.ts", 'export const myNote = "keep this";');
    await previewAndApply("seed");
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
    await checkpoint(root, "decaf");
    await previewAndApply("rules");
    await replace(
      "routes/orders.ts",
      "return $.response.status(201)",
      RULES_ORDERS.slice(
        RULES_ORDERS.indexOf("  if (!$.context.canFulfill"),
        RULES_ORDERS.indexOf("  return $.response.status(201)"),
      ) + "return $.response.status(201)",
    );
    expect((await checkWalkthroughSave(root, "rules")).ok).toBe(true);
    await checkpoint(root, "rules");
    await previewAndApply("reduce");
    expect((await checkWalkthroughSave(root, "reduce")).ok).toBe(false);
    await replace(
      "routes/orders.ts",
      "// TODO: For each item, subtract its quantity from inventory[item.productId].",
      INVENTORY_LOOP,
    );
    expect((await checkWalkthroughSave(root, "reduce")).ok).toBe(true);
    await checkpoint(root, "reduce");
    await checkpoint(root, "restock");
    await previewAndApply("scenario");
    await replace(
      "scenarios/index.ts",
      "// TODO: set Dark Roast inventory to 5.",
      '$.context.inventory["dark-roast"] = 5;',
    );
    expect((await checkWalkthroughSave(root, "scenario")).ok).toBe(true);
    await checkpoint(root, "scenario");
    await checkpoint(root, "scenario");
    expect((await workspace(root)).checkpoints).toEqual(
      Array.from({ length: LESSON_COUNT }, (_, i) => i + 1),
    );
    await expect($.read("demo/.git/HEAD")).rejects.toMatchObject({
      code: "ENOENT",
    });
    // Compile the final exercises against the real generated schema/handler types.
    const finalProducts = await $.read("demo/routes/products.ts");
    const finalOrders = await $.read("demo/routes/orders.ts");
    const finalContext = await $.read("demo/routes/_.context.ts");
    const finalScenarios = await $.read("demo/scenarios/index.ts");
    expect(finalProducts).toContain('GET: Route["GET"]');
    expect(finalOrders).toContain('POST: Route["POST"]');
    expect(finalOrders).toContain('OrderItem = Schemas["OrderItem"]');
    expect(finalContext).toContain('Product = Schemas["Product"]');
    expect(finalContext).toContain('OrderItem = Schemas["OrderItem"]');
    expect(finalScenarios).toContain(
      'import type { Scenario } from "../types/index.js"',
    );
    for (const text of [
      finalProducts,
      finalOrders,
      finalContext,
      finalScenarios,
    ]) {
      expect(text).not.toContain("../types/paths/");
      expect(text).not.toContain("../types/components/");
      expect(text).not.toContain("../types/_.context.js");
    }
    const program = ts.createProgram(
      [
        $.path("demo/routes/_.context.ts"),
        $.path("demo/routes/products.ts"),
        $.path("demo/routes/orders.ts"),
        $.path("demo/scenarios/index.ts"),
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

it("keeps version 2 checkpoints and its four-file journal compatible with existing demos", async () => {
  await usingTemporaryFiles(async ($) => {
    const tour = await prepareTour($.path("."), "older-demo");
    await generate(tour.destination, tour.source);
    const state = JSON.parse(
      await $.read("older-demo/.counterfact-walkthrough-state.json"),
    );
    delete state.version;
    await $.add(
      "older-demo/.counterfact-walkthrough-state.json",
      JSON.stringify(state),
    );
    await $.add(
      "older-demo/.counterfact-walkthrough.json",
      JSON.stringify({ version: 2 }),
    );
    await workspace(tour.destination);
    await checkpoint(tour.destination, "explore");
    await prepare(tour.destination, "catalog");
    expect(
      (await walkthroughInfo(tour.destination, {})).walkthroughVersion,
    ).toBe(2);
    await $.add("older-demo/openapi.json", "{}");
    expect((await workspace(tour.destination)).changes).toHaveLength(1);
    await checkpoint(tour.destination, "catalog");
    expect((await workspace(tour.destination)).checkpoints).toEqual([1, 2]);
  });
});

it("never touches an existing project or overwrites conflicting learner code", async () => {
  await usingTemporaryFiles(async ($) => {
    expect((await workspace($.path("."))).enabled).toBe(false);
    await expect(prepare($.path("."), "catalog")).rejects.toThrow("baseline");
    await $.add(".git/index", "parent index must not change");
    const tour = await prepareTour($.path("."), "demo");
    await generate(tour.destination, tour.source);
    await workspace(tour.destination);
    expect(await $.read(".git/index")).toBe("parent index must not change");
    await checkpoint(tour.destination, "orientation");
    await checkpoint(tour.destination, "explore");
    await checkpoint(tour.destination, "description-example");
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

it("records learner edits before tutor edits, including deletions and reversions", async () => {
  await usingTemporaryFiles(async ($) => {
    const tour = await prepareTour($.path("."), "demo");
    await generate(tour.destination, tour.source);
    await workspace(tour.destination);
    await checkpoint(tour.destination, "orientation");
    await checkpoint(tour.destination, "explore");
    await checkpoint(tour.destination, "description-example");
    const original = await $.read("demo/routes/orders.ts");
    await $.add("demo/routes/orders.ts", original + "\n// My experiment\n");
    await prepare(tour.destination, "catalog");
    const changes = (await workspace(tour.destination)).changes!;
    expect(changes.map((change) => change.actor)).toEqual(["you", "milo"]);
    expect(
      (await walkthroughInfo(tour.destination, {})).workspace.changes,
    ).toEqual([]);
    expect(
      (await walkthroughInfo(tour.destination, {}, true)).workspace.changes,
    ).toHaveLength(2);
    await $.remove("demo/routes/orders.ts");
    const deleted = (await workspace(tour.destination)).changes!.at(-1)!;
    expect(deleted).toMatchObject({
      actor: "you",
      files: [{ file: "routes/orders.ts", after: "" }],
    });
    await $.add("demo/routes/orders.ts", original);
    const restored = (await workspace(tour.destination)).changes!.at(-1)!;
    expect(restored.files[0]).toEqual({
      file: "routes/orders.ts",
      before: "",
      after: original,
    });
    expect(
      (await workspace(tour.destination)).changes!.map((change) => change.id),
    ).toEqual([1, 2, 3, 4]);
  });
});

it("imports earlier progress without changing the existing repository", async () => {
  await usingTemporaryFiles(async ($) => {
    const tour = await prepareTour($.path("."), "demo");
    await generate(tour.destination, tour.source);
    await $.remove("demo/.counterfact-walkthrough-state.json");
    await $.add("demo/.git/HEAD", "ref: refs/heads/keep-my-history");
    await $.add(
      "demo/.git/counterfact-walkthrough.json",
      JSON.stringify({
        prepared: ["catalog"],
        checkpoints: [1],
        baseline: true,
      }),
    );
    expect(await workspace(tour.destination)).toMatchObject({
      prepared: ["catalog"],
      checkpoints: [1],
      changes: [],
    });
    expect(await $.read("demo/.git/HEAD")).toBe(
      "ref: refs/heads/keep-my-history",
    );
    expect(
      JSON.parse(await $.read("demo/.git/counterfact-walkthrough.json")),
    ).toMatchObject({ prepared: ["catalog"], checkpoints: [1] });
  });
});

it("uses the generated Product return type to catch inventory instead of stock", async () => {
  await usingTemporaryFiles(async ($) => {
    const tour = await prepareTour($.path("."), "typed-context");
    await generate(tour.destination, tour.source);
    const file = "typed-context/routes/_.context.ts";
    const diagnostics = () =>
      ts
        .getPreEmitDiagnostics(
          ts.createProgram([$.path(file)], {
            noEmit: true,
            strict: true,
            skipLibCheck: true,
            types: [],
            target: ts.ScriptTarget.ES2023,
            module: ts.ModuleKind.NodeNext,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
          }),
        )
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        );
    await $.add(file, CONTEXT);
    expect(diagnostics()).toEqual([]);
    await $.add(
      file,
      CONTEXT.replace(
        "stock: this.inventory[product.id] ?? 0",
        "inventory: this.inventory[product.id] ?? 0",
      ),
    );
    expect(diagnostics()).toEqual([
      expect.stringContaining("Property 'stock' is missing"),
    ]);
  });
});

it("preserves existing handler annotations while preparing a resumed demo", async () => {
  await usingTemporaryFiles(async ($) => {
    const tour = await prepareTour($.path("."), "resumed");
    await generate(tour.destination, tour.source);
    const legacy =
      'import type { HTTP_GET } from "../types/paths/products.types.js";\nexport const GET: HTTP_GET = function ($) {\n  return $.response.status(200).random();\n};\n// Keep this learner note.\n';
    await $.add("resumed/routes/products.ts", legacy);
    await workspace(tour.destination);
    for (const phase of PHASES) {
      if (phase.id === "catalog") break;
      await checkpoint(tour.destination, phase.id);
    }
    const proposal = await preview(tour.destination, "catalog");
    expect(proposal.files?.[0]?.before).toBe(legacy);
    await prepare(tour.destination, "catalog", { revision: proposal.revision });
    const prepared = await $.read("resumed/routes/products.ts");
    expect(prepared).toContain(
      'import type { HTTP_GET } from "../types/paths/products.types.js"',
    );
    expect(prepared).toContain("GET: HTTP_GET");
    expect(prepared).toContain("Keep this learner note.");
    expect(prepared).toContain("const catalog");
  });
});
