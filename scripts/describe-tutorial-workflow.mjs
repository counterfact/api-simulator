import { curriculum } from "../packages/tutorials/dist/coffee-shop/coffee-shop-curriculum.js";

const sections = [
  "# Coffee-shop lesson graphs",
  "Generated from the executable LangGraph definitions. Read the curriculum in `packages/tutorials/src/coffee-shop/coffee-shop-curriculum.ts`; each phase has its script, actions, and evidence in `lessons/<phase>.ts`.",
  "Each invocation handles one learner event. An edge to `__end__` at a wait means the workflow stops until another approval, save, request, REPL observation, or answer arrives. It does not perform that learner action automatically. Milo's file-writing nodes call their tools only for an explicit approved edit, and checks run only for check events. The browser controls message pacing; the project journal records durable lesson completion.",
  "After a phase completes, the parent workflow saves progress and either continues within the same lesson or waits for Next Lesson. Older project protocols keep their original lesson inventory.",
  "Regenerate after building tutorials: `node scripts/describe-tutorial-workflow.mjs > packages/tutorials/WORKFLOW.md`.",
];
for (const { lesson, graph } of curriculum) {
  const diagram = (await graph.getGraphAsync()).drawMermaid();
  sections.push(
    `## Lesson ${lesson.lesson}: ${lesson.title} (${lesson.id})`,
    `[Read the script and graph](./src/coffee-shop/lessons/${lesson.id}.ts#L1).`,
    `\`\`\`mermaid\n${diagram}\n\`\`\``,
  );
}
process.stdout.write(sections.join("\n\n") + "\n");
