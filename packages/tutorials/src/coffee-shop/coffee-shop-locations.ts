import ts from "typescript";
import { isMap, isScalar, LineCounter, parseDocument } from "yaml";
import type { LessonPhase } from "./coffee-shop-lessons.js";

/** Resolve editor destinations from saved source, including learner-added lines. */
export function lessonLocations(
  snapshots: Record<string, string>,
  phases: LessonPhase[],
) {
  const locations: Record<string, Record<string, number>> = {};
  const sources = Object.entries(snapshots).map(([file, text]) => ({
    file,
    text,
    parsed: file.endsWith(".ts")
      ? ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
      : undefined,
  }));
  for (const phase of phases) {
    const files: Record<string, number> = {};
    locations[phase.id] = files;
    for (const { file, text, parsed } of sources) {
      if (!parsed) {
        files[file] = 1;
        if (phase.id === "name-example") {
          const lineCounter = new LineCounter();
          const document = parseDocument(text, { lineCounter });
          const properties = document.getIn(
            ["components", "schemas", "Product", "properties"],
            true,
          );
          const key = isMap(properties)
            ? properties.items.find(
                (item) => isScalar(item.key) && item.key.value === "name",
              )?.key
            : undefined;
          if (isScalar(key) && key.range)
            files[file] = lineCounter.linePos(key.range[0]).line;
        }
        continue;
      }
      let target: ts.Node | undefined;
      let targetPosition: number | undefined;
      const symbol =
        file === "routes/products.ts"
          ? "GET"
          : file === "routes/orders.ts"
            ? ["fail", "retry"].includes(phase.id)
              ? "ordersAvailable"
              : phase.id === "reduce"
                ? "reduceInventory"
                : "POST"
            : file === "routes/_.context.ts"
              ? phase.id === "seed"
                ? "reset"
                : "listProducts"
              : file === "scenarios/index.ts"
                ? phase.id === "scenario"
                  ? "restockDarkRoast"
                  : "startup"
                : undefined;
      function visit(node: ts.Node) {
        if (
          (ts.isVariableDeclaration(node) ||
            ts.isFunctionDeclaration(node) ||
            ts.isMethodDeclaration(node)) &&
          node.name?.getText(parsed) === symbol
        ) {
          target = node;
          const fn = ts.isVariableDeclaration(node) ? node.initializer : node;
          if (
            fn &&
            (ts.isFunctionExpression(fn) ||
              ts.isArrowFunction(fn) ||
              ts.isFunctionDeclaration(fn) ||
              ts.isMethodDeclaration(fn)) &&
            fn.body &&
            ts.isBlock(fn.body)
          ) {
            target =
              symbol === "restockDarkRoast"
                ? (fn.body.statements.at(-1) ?? fn.body)
                : (fn.body.statements.find(ts.isReturnStatement) ??
                  fn.body.statements[0] ??
                  fn.body);
            if (["reduceInventory", "restockDarkRoast"].includes(symbol!)) {
              const commentStart =
                symbol === "restockDarkRoast"
                  ? (fn.body.statements.at(-1)?.end ??
                    fn.body.getStart(parsed) + 1)
                  : fn.body.getStart(parsed) + 1;
              targetPosition = ts
                .getLeadingCommentRanges(text, commentStart)
                ?.find((comment) =>
                  text.slice(comment.pos, comment.end).includes("TODO"),
                )?.pos;
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      if (symbol) visit(parsed);
      files[file] = target
        ? parsed.getLineAndCharacterOfPosition(
            targetPosition ?? target.getStart(parsed),
          ).line + 1
        : file === "scenarios/index.ts" && phase.id === "seed"
          ? text.split("\n").length
          : 1;
    }
  }
  return locations;
}
