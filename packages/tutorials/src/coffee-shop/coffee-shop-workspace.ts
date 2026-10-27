/* eslint-disable security/detect-non-literal-fs-filename -- Only fixed lesson paths inside an explicitly created demo are editable. */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { format } from "prettier";
import ts from "typescript";
import {
  BASELINE_SCENARIO,
  CATALOG,
  CONTEXT,
  INVENTORY_TODO,
  PHASES,
  RESET_METHOD,
  RESTOCK_SCENARIO,
  STOCK_METHODS,
} from "./coffee-shop-lessons.js";

const exec = promisify(execFile);
const marker = ".counterfact-walkthrough.json";
const statePath = ".git/counterfact-walkthrough.json";
type State = { prepared: string[]; checkpoints: number[]; baseline: boolean };
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
async function git(root: string, ...args: string[]) {
  const { stdout } = await exec(
    "git",
    [
      "-c",
      "user.name=Counterfact Walkthrough",
      "-c",
      "user.email=walkthrough@counterfact.local",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=.git/counterfact-no-hooks",
      ...args,
    ],
    {
      cwd: root,
      maxBuffer: 1024 * 1024,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
      ),
    },
  );
  return stdout.trim();
}
async function readState(root: string): Promise<State | undefined> {
  try {
    await fs.access(join(root, marker));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const dotGit = await fs.lstat(join(root, ".git"));
  if (!dotGit.isDirectory() || dotGit.isSymbolicLink())
    throw new Error("This demo must have its own local Git repository.");
  const top = await git(root, "rev-parse", "--show-toplevel");
  if ((await fs.realpath(root)) !== (await fs.realpath(top)))
    throw new Error("Refusing to change a Git repository outside this demo.");
  return JSON.parse(await fs.readFile(join(root, statePath), "utf8")) as State;
}
const writeState = (root: string, state: State) =>
  fs.writeFile(join(root, statePath), JSON.stringify(state));
const trackedPaths = [
  ".gitignore",
  marker,
  "openapi.json",
  "routes",
  "scenarios",
  "types",
  "counterfact-types",
];
async function commit(root: string, message: string) {
  // --only includes exactly these project paths, leaving unrelated staged files alone.
  await git(root, "add", "--", ...trackedPaths);
  await git(
    root,
    "commit",
    "--only",
    "--allow-empty",
    "-m",
    message,
    "--",
    ...trackedPaths,
  );
}
/** Called only for the new, exclusively created demo, before normal generation. */
export async function initializeWalkthroughRepository(root: string) {
  await git(root, "init", "--initial-branch=walkthrough");
  await fs.writeFile(join(root, marker), JSON.stringify({ version: 2 }));
  await fs.writeFile(
    join(root, statePath),
    JSON.stringify({ prepared: [], checkpoints: [], baseline: false }),
  );
  // The generator may extend this ignore file; generated types remain visible and tracked.
  await fs.writeFile(join(root, ".gitignore"), ".cache/\nnode_modules/\n");
}
export async function walkthroughWorkspace(root: string) {
  return serial(root, async () => {
    const state = await readState(root);
    if (!state) return { enabled: false, prepared: [], checkpoints: [] };
    if (!state.baseline) {
      // /tutorial-info is first served after the normal generator has finished.
      for (const path of [
        "routes/products.ts",
        "routes/orders.ts",
        "routes/_.context.ts",
        "scenarios/index.ts",
      ])
        await fs.access(join(root, path));
      await commit(root, "Start with Counterfact generated stubs");
      state.baseline = true;
      await writeState(root, state);
    }
    return {
      enabled: true,
      prepared: state.prepared,
      checkpoints: state.checkpoints,
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
export async function prepareWalkthroughStep(root: string, phaseId: string) {
  return serial(root, async () => {
    const state = await readState(root);
    if (!state?.baseline)
      throw new Error(
        "Open the walkthrough to establish its generated baseline first.",
      );
    const phase = PHASES.find(
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
    const changes: [string, string][] = [];
    if (phaseId === "catalog") {
      const text = await readEditable(root, "routes/products.ts");
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
      let text = await readEditable(root, "routes/orders.ts");
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
      const text = await readEditable(root, "routes/_.context.ts");
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
      const text = await readEditable(root, "routes/_.context.ts");
      const scenarios = await readEditable(root, "scenarios/index.ts");
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
      const text = await readEditable(root, "routes/_.context.ts");
      changes.push([
        "routes/_.context.ts",
        addContextMethods(text, STOCK_METHODS, [
          "canFulfill",
          "getShortages",
          "quantitiesFor",
        ]),
      ]);
    } else if (phaseId === "reduce") {
      let text = await readEditable(root, "routes/orders.ts");
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
      const text = await readEditable(root, "scenarios/index.ts");
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
    for (const [file, text] of formatted)
      await fs.writeFile(join(root, file), text);
    state.prepared.push(phaseId);
    await writeState(root, state);
    return {
      ok: true,
      message: `Prepared ${formatted.map(([file]) => file).join(" and ")}. Review the uncommitted diff in your IDE, then make the exercise edit.`,
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
    const phase = PHASES.find((candidate) => candidate.id === phaseId);
    if (!phase) throw new Error("Unknown phase.");
    const next = PHASES[PHASES.indexOf(phase) + 1];
    if (next?.lesson === phase.lesson)
      return {
        ok: true,
        message: "Continue this lesson before its checkpoint.",
      };
    if (!state.checkpoints.includes(phase.lesson)) {
      if (phase.lesson > 1 && !state.checkpoints.includes(phase.lesson - 1))
        throw new Error("Complete the preceding lesson first.");
      await commit(root, `Step ${phase.lesson}: ${phase.title}`);
      state.checkpoints.push(phase.lesson);
      await writeState(root, state);
    }
    return {
      ok: true,
      message: `Step ${phase.lesson} committed locally. Your IDE is ready to show the next changes.`,
    };
  });
}
