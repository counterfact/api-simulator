/* eslint-disable security/detect-non-literal-fs-filename -- Only fixed lesson paths inside an explicitly created demo are editable. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { format } from "prettier";
import ts from "typescript";
import {
  BASELINE_SCENARIO,
  CATALOG,
  CONTEXT,
  INVENTORY_TODO,
  phasesForVersion,
  WALKTHROUGH_VERSION,
  RESET_METHOD,
  RESTOCK_SCENARIO,
  STOCK_METHODS,
} from "./coffee-shop-lessons.js";

const marker = ".counterfact-walkthrough.json";
const statePath = ".counterfact-walkthrough-state.json";
export type FileChange = { file: string; before: string; after: string };
export type EditEvent = {
  id: number;
  actor: "milo" | "you";
  phaseId?: string;
  files: FileChange[];
};
const baseLessonFiles = [
  "routes/products.ts",
  "routes/orders.ts",
  "routes/_.context.ts",
  "scenarios/index.ts",
];
type State = {
  version?: number;
  prepared: string[];
  checkpoints: number[];
  baseline: boolean;
  snapshots: Record<string, string>;
  changes: EditEvent[];
};
const queues = new Map<string, Promise<unknown>>();
async function serial<T>(root: string, action: () => Promise<T>): Promise<T> {
  const previous = queues.get(root) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(action);
  queues.set(root, current);
  try {
    return await current;
  } finally {
    if (queues.get(root) === current) queues.delete(root);
  }
}
async function readState(root: string): Promise<State | undefined> {
  try {
    await fs.access(join(root, marker));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  try {
    return JSON.parse(
      await fs.readFile(join(root, statePath), "utf8"),
    ) as State;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // Older demos keep their repositories; importing their progress never invokes Git.
    try {
      const legacy = JSON.parse(
        await fs.readFile(
          join(root, ".git/counterfact-walkthrough.json"),
          "utf8",
        ),
      );
      return {
        prepared: legacy.prepared ?? [],
        checkpoints: legacy.checkpoints ?? [],
        baseline: false,
        snapshots: {},
        changes: [],
      };
    } catch (legacyError) {
      if ((legacyError as NodeJS.ErrnoException).code !== "ENOENT")
        throw legacyError;
      throw new Error(
        "The walkthrough's saved state is missing. Start a new demo; your files have been kept.",
        { cause: legacyError },
      );
    }
  }
}
async function writeState(root: string, state: State) {
  const destination = join(root, statePath);
  await fs.writeFile(destination + ".tmp", JSON.stringify(state));
  await fs.rename(destination + ".tmp", destination);
}
async function captureChanges(
  root: string,
  state: State,
  actor: EditEvent["actor"],
  phaseId?: string,
) {
  const files: FileChange[] = [];
  for (const file of state.version === 3
    ? [...baseLessonFiles, "openapi.json"]
    : baseLessonFiles) {
    let after = "";
    try {
      after = await readEditable(root, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const before = state.snapshots[file] ?? "";
    if (after !== before) files.push({ file, before, after });
    state.snapshots[file] = after;
  }
  if (files.length)
    state.changes.push({
      id: (state.changes.at(-1)?.id ?? 0) + 1,
      actor,
      ...(phaseId ? { phaseId } : {}),
      files,
    });
}
/** Only the exclusively created demo receives walkthrough state. No repository is created. */
export async function initializeWalkthroughWorkspace(root: string) {
  await fs.writeFile(
    join(root, marker),
    JSON.stringify({ version: WALKTHROUGH_VERSION }),
  );
  await writeState(root, {
    version: WALKTHROUGH_VERSION,
    prepared: [],
    checkpoints: [],
    baseline: false,
    snapshots: {},
    changes: [],
  });
}
export async function walkthroughWorkspace(root: string) {
  return serial(root, async () => {
    const state = await readState(root);
    if (!state)
      return {
        version: 2,
        enabled: false,
        prepared: [],
        checkpoints: [],
        changes: [],
      };
    if (!state.baseline) {
      for (const file of state.version === 3
        ? [...baseLessonFiles, "openapi.json"]
        : baseLessonFiles)
        state.snapshots[file] = await readEditable(root, file);
      state.baseline = true;
    } else await captureChanges(root, state, "you");
    await writeState(root, state);
    return {
      version: state.version ?? 2,
      enabled: true,
      prepared: state.prepared,
      checkpoints: state.checkpoints,
      changes: state.changes,
    };
  });
}
function source(text: string) {
  const parsed = ts.createSourceFile(
    "lesson.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  if (
    (parsed as ts.SourceFile & { parseDiagnostics: readonly unknown[] })
      .parseDiagnostics.length
  )
    throw new Error(
      "Fix the TypeScript syntax errors before preparing this step.",
    );
  return parsed;
}
function contextClass(text: string) {
  const found = source(text).statements.find(
    (node) => ts.isClassDeclaration(node) && node.name?.text === "Context",
  );
  if (!found || !ts.isClassDeclaration(found))
    throw new Error("Keep the exported Context class in routes/_.context.ts.");
  return found;
}
function addContextMethods(text: string, methods: string, names: string[]) {
  const declaration = contextClass(text);
  if (
    declaration.members.some((member) =>
      names.includes(member.name?.getText() ?? ""),
    )
  )
    throw new Error(
      "A method for this step already exists. Keep your edits and complete the exercise directly; preparation will not overwrite it.",
    );
  const position = declaration.end - 1;
  return text.slice(0, position) + "\n" + methods + text.slice(position);
}
function orderBody(text: string) {
  const statement = source(text).statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (decl) => decl.name.getText() === "POST",
      ),
  );
  if (!statement || !ts.isVariableStatement(statement))
    throw new Error("Keep the generated POST handler declaration.");
  const initializer = statement.declarationList.declarations.find(
    (decl) => decl.name.getText() === "POST",
  )?.initializer;
  if (
    !initializer ||
    !(
      ts.isFunctionExpression(initializer) || ts.isArrowFunction(initializer)
    ) ||
    !ts.isBlock(initializer.body)
  )
    throw new Error(
      "Keep the POST handler's function body so preparation can add its supporting code.",
    );
  return initializer.body;
}
async function readEditable(root: string, file: string) {
  const path = join(root, file);
  const realRoot = await fs.realpath(root);
  const realFile = await fs.realpath(path);
  if (resolve(realFile) !== resolve(realRoot, file))
    throw new Error(
      "Preparation will not follow a symlink outside its lesson file.",
    );
  return fs.readFile(path, "utf8");
}
/** Visible scaffolding only; no scenario is executed and the learner supplies the key behavior. */
export async function previewWalkthroughStep(root: string, phaseId: string) {
  return prepareWalkthroughStep(root, phaseId, { preview: true });
}
export async function prepareWalkthroughStep(
  root: string,
  phaseId: string,
  options: { preview?: boolean; revision?: string } = {},
) {
  return serial(root, async () => {
    const state = await readState(root);
    if (!state?.baseline)
      throw new Error(
        "Open the walkthrough to establish its generated baseline first.",
      );
    const phases = phasesForVersion(state.version ?? 2);
    const phase = phases.find(
      (candidate) => candidate.id === phaseId && candidate.preparation,
    );
    if (!phase) throw new Error("This phase needs no preparation.");
    if (state.prepared.includes(phaseId))
      return {
        ok: true,
        message: "Already prepared; your edits have been kept.",
      };
    if (phase.lesson > 1 && !state.checkpoints.includes(phase.lesson - 1))
      throw new Error(
        "Complete the preceding lesson before preparing this step. Previews never change files.",
      );
    const originals = new Map<string, string>();
    const read = async (file: string) => {
      const text = await readEditable(root, file);
      originals.set(file, text);
      return text;
    };
    const changes: [string, string][] = [];
    if (phaseId === "catalog") {
      const text = await read("routes/products.ts");
      const parsed = source(text);
      if (
        parsed.statements.some(
          (node) =>
            ts.isVariableStatement(node) &&
            node.declarationList.declarations.some(
              (decl) => decl.name.getText() === "catalog",
            ),
        )
      )
        throw new Error(
          "A catalog already exists. Preparation will not replace your code.",
        );
      const position =
        parsed.statements
          .find((node) => !ts.isImportDeclaration(node))
          ?.getStart() ?? text.length;
      changes.push([
        "routes/products.ts",
        text.slice(0, position) +
          `const catalog = ${JSON.stringify(CATALOG, null, 2)};\n\n` +
          text.slice(position),
      ]);
    } else if (phaseId === "fail") {
      let text = await read("routes/orders.ts");
      if (/\bordersAvailable\b/u.test(text))
        throw new Error(
          "ordersAvailable already exists. Preparation will not replace your code.",
        );
      const body = orderBody(text);
      text =
        text.slice(0, body.getStart() + 1) +
        '\nif (!ordersAvailable) { return $.response.status(503).json({ error: "Ordering is temporarily unavailable." }); }\n' +
        text.slice(body.getStart() + 1);
      changes.push([
        "routes/orders.ts",
        "const ordersAvailable = true;\n" + text,
      ]);
    } else if (phaseId === "context") {
      const text = await read("routes/_.context.ts");
      if (
        contextClass(text).members.some(
          (member) => !ts.isConstructorDeclaration(member),
        )
      )
        throw new Error(
          "Context already has your code. Preparation will not replace it.",
        );
      changes.push([
        "routes/_.context.ts",
        CONTEXT.replace(
          "return this.catalog.map(product => ({ ...product, stock: this.inventory[product.id] ?? 0 }));",
          "// TODO: combine catalog and inventory.\n    return [];",
        ).replace(
          "return { orderId: this.nextOrderId++, items };",
          "// TODO: use and advance nextOrderId.\n    return { orderId: 0, items };",
        ),
      ]);
    } else if (phaseId === "seed") {
      const text = await read("routes/_.context.ts");
      const scenarios = await read("scenarios/index.ts");
      const parsed = source(scenarios);
      // Replace only the generated no-op startup; preserve help and unrelated exports.
      const startup = parsed.statements.find(
        (node) =>
          ts.isVariableStatement(node) &&
          node.declarationList.declarations.some(
            (decl) => decl.name.getText() === "startup",
          ),
      );
      const declaration =
        startup &&
        ts.isVariableStatement(startup) &&
        startup.declarationList.declarations.length === 1
          ? startup.declarationList.declarations[0]
          : undefined;
      if (
        !startup ||
        !declaration?.initializer ||
        !ts.isArrowFunction(declaration.initializer) ||
        !ts.isBlock(declaration.initializer.body) ||
        declaration.initializer.body.statements.some(
          (statement) =>
            !(
              ts.isExpressionStatement(statement) &&
              ts.isVoidExpression(statement.expression)
            ),
        )
      )
        throw new Error(
          "startup already has behavior. Preparation will not replace it.",
        );
      if (
        parsed.statements.some(
          (node) =>
            ts.isVariableStatement(node) &&
            node.declarationList.declarations.some(
              (decl) => decl.name.getText() === "reset",
            ),
        )
      )
        throw new Error(
          "reset already exists. Preparation will not replace it.",
        );
      changes.push([
        "routes/_.context.ts",
        addContextMethods(text, RESET_METHOD, ["reset"]),
      ]);
      const baseline = BASELINE_SCENARIO.replace(
        'import type { Scenario } from "../types/_.context.js";',
        "",
      ).replace(
        "export const startup: Scenario = reset;",
        "// Add the startup export after inspecting this baseline.",
      );
      changes.push([
        "scenarios/index.ts",
        scenarios.slice(0, startup.getFullStart()) +
          baseline +
          scenarios.slice(startup.end),
      ]);
    } else if (phaseId === "rules") {
      const text = await read("routes/_.context.ts");
      changes.push([
        "routes/_.context.ts",
        addContextMethods(text, STOCK_METHODS, [
          "canFulfill",
          "getShortages",
          "quantitiesFor",
        ]),
      ]);
    } else if (phaseId === "reduce") {
      let text = await read("routes/orders.ts");
      if (/\breduceInventory\b/u.test(text))
        throw new Error(
          "reduceInventory already exists. Preparation will not replace your implementation.",
        );
      const statement = orderBody(text).statements.find(
        (node) =>
          ts.isReturnStatement(node) && node.getText().includes("status(201)"),
      );
      if (!statement)
        throw new Error(
          "Keep the successful 201 return after your stock checks.",
        );
      const position = statement.getStart();
      text =
        text.slice(0, position) +
        "reduceInventory($.body.items, $.context.inventory);\n" +
        text.slice(position);
      changes.push([
        "routes/orders.ts",
        `import type { OrderItem } from "../types/components/schemas/OrderItem.js";\nfunction reduceInventory(items: OrderItem[], inventory: Record<string, number>) {\n${INVENTORY_TODO}\n}\n` +
          text,
      ]);
    } else if (phaseId === "scenario") {
      const text = await read("scenarios/index.ts");
      if (/\brestockDarkRoast\b/u.test(text))
        throw new Error(
          "restockDarkRoast already exists. Keep your implementation and complete the exercise directly.",
        );
      changes.push([
        "scenarios/index.ts",
        text +
          RESTOCK_SCENARIO.replace(
            '$.context.inventory["dark-roast"] = 5;',
            "// TODO: set Dark Roast inventory to 5.",
          ),
      ]);
    }
    // Validate/format every edit before writing any, so a conflict never partially prepares a step.
    const formatted = await Promise.all(
      changes.map(
        async ([file, text]) =>
          [file, await format(text, { parser: "typescript" })] as const,
      ),
    );
    for (const [file] of formatted) {
      if ((await readEditable(root, file)) !== originals.get(file))
        throw new Error(
          "This file changed while I was preparing the edit. Review your changes and try again.",
        );
    }
    const files = formatted.map(([file, after]) => ({
      file,
      before: originals.get(file)!,
      after,
    }));
    const revision = createHash("sha256")
      .update(JSON.stringify({ phaseId, files }))
      .digest("hex");
    if (options.preview)
      return {
        ok: true,
        message: "Review these changes before applying them.",
        files,
        revision,
      };
    if (options.revision !== undefined && options.revision !== revision)
      throw new Error(
        "Your files changed since this preview. Review the updated diff, then apply it again.",
      );
    await captureChanges(root, state, "you");
    for (const [file] of formatted) {
      if ((await readEditable(root, file)) !== originals.get(file))
        throw new Error(
          "Your files changed while applying this edit. Review the updated diff and try again.",
        );
    }
    for (const [file, text] of formatted)
      await fs.writeFile(join(root, file), text);
    await captureChanges(root, state, "milo", phaseId);
    state.prepared.push(phaseId);
    await writeState(root, state);
    return {
      ok: true,
      message: `Updated ${formatted.map(([file]) => file).join(" and ")}. Review the diff in our conversation, then make your edit.`,
      changes: state.changes,
    };
  });
}
export async function checkpointWalkthroughStep(root: string, phaseId: string) {
  return serial(root, async () => {
    const state = await readState(root);
    if (!state?.baseline)
      return {
        ok: true,
        message: "This existing demo keeps its original file workflow.",
      };
    const phases = phasesForVersion(state.version ?? 2);
    const phase = phases.find((candidate) => candidate.id === phaseId);
    if (!phase) throw new Error("Unknown phase.");
    const next = phases[phases.indexOf(phase) + 1];
    if (next?.lesson === phase.lesson)
      return {
        ok: true,
        message: "Continue this lesson before its checkpoint.",
      };
    if (!state.checkpoints.includes(phase.lesson)) {
      if (phase.lesson > 1 && !state.checkpoints.includes(phase.lesson - 1))
        throw new Error("Complete the preceding lesson first.");
      await captureChanges(root, state, "you");
      state.checkpoints.push(phase.lesson);
      await writeState(root, state);
    }
    return {
      ok: true,
      message: `Lesson ${phase.lesson} progress saved.`,
    };
  });
}
