import { createInterface } from "node:readline/promises";

import open from "open";

import { discoverOpenApiSpecs } from "./discover-openapi.js";

const DOCS_URL = "https://counterfact.dev/docs/getting-started/";
const PETSTORE_URL = "https://petstore3.swagger.io/api/v3/openapi.json";

export function canRunIntro(
  inputIsTTY: boolean | undefined,
  outputIsTTY: boolean | undefined,
  ci: string | undefined,
): boolean {
  return Boolean(
    inputIsTTY && outputIsTTY && (!ci || ci === "false" || ci === "0"),
  );
}

export async function runIntro(): Promise<
  { source: string; destination: string; port: number } | undefined
> {
  if (
    !canRunIntro(process.stdin.isTTY, process.stdout.isTTY, process.env["CI"])
  ) {
    process.stdout.write(
      "Welcome to Counterfact! Run in an interactive terminal for the intro.\n" +
        `Documentation: ${DOCS_URL}\n` +
        `Start with a spec: npx counterfact ${PETSTORE_URL} api\n` +
        "Run without OpenAPI: npx counterfact _\n",
    );
    return undefined;
  }

  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort();
  terminal.on("SIGINT", cancel);
  terminal.on("close", cancel);

  const write = (text: string) => process.stdout.write(`${text}\n`);
  const question = async (prompt: string): Promise<string | undefined> => {
    if (cancellation.signal.aborted) return undefined;
    try {
      const answer = (
        await terminal.question(prompt, { signal: cancellation.signal })
      ).trim();
      return /^q(?:uit)?$/iu.test(answer) ? undefined : answer;
    } catch (error) {
      if (cancellation.signal.aborted) return undefined;
      throw error;
    }
  };

  try {
    write("\nWelcome to Counterfact!");
    write(
      "Turn an OpenAPI document into a local API with editable routes and live state.",
    );
    write("Looking for local OpenAPI documents…");
    const discovered = await discoverOpenApiSpecs(
      process.cwd(),
      cancellation.signal,
    );
    if (discovered.limited) {
      write(
        "Search limits reached; some files were skipped. Pass a spec explicitly to use it.",
      );
    }
    if (discovered.unreadable)
      write("Some files or directories could not be read; they were skipped.");

    while (!cancellation.signal.aborted) {
      write("\n1) Start with Swagger Petstore (default)");
      write("2) View documentation");
      write("3) Guided tour");
      for (const [index, spec] of discovered.specs.entries()) {
        // Filenames are untrusted terminal text; never emit control sequences.
        write(`${index + 4}) ${spec.replace(/[\p{Cc}\p{Cf}]/gu, "?")}`);
      }
      if (discovered.specs.length === 0)
        write("No local OpenAPI documents found.");
      write("q) Quit (Ctrl+C or Ctrl+D also cancels)");
      const answer = await question("Choose [1]: ");
      if (answer === undefined) break;

      if (answer === "2") {
        write(`Documentation: ${DOCS_URL}`);
        try {
          await open(DOCS_URL);
        } catch {
          write("Could not open a browser. Open the documentation link above.");
        }
        return undefined;
      }

      if (answer === "3") {
        const steps = [
          "1/3 — Start a local API\n" +
            "Choose Petstore or a local spec. Counterfact generates routes/ (editable handlers)\n" +
            "and types/ (generated contracts), then starts a mock server and REPL.",
          "2/3 — Make a request\n" +
            "Open the Swagger UI URL printed on startup, or point your frontend at the mock URL.\n" +
            'With Petstore, try GET /pet/1. In the REPL, try: await client.get("/pet/1")',
          "3/3 — Make the behavior yours\n" +
            "Edit a handler under routes/ and save; Counterfact hot-reloads it. Leave types/ generated.\n" +
            "Add a _.context.ts to share state, then inspect it with context in the REPL.\n" +
            `Continue the getting-started guide: ${DOCS_URL}`,
        ];
        for (const step of steps) {
          write(`\n${step}`);
          if (
            (await question("Press Enter to continue (q to quit): ")) ===
            undefined
          ) {
            return undefined;
          }
        }
        continue;
      }

      const choice = answer === "" ? 1 : Number(answer);
      const localSpec = discovered.specs.at(choice - 4);
      if (
        !Number.isInteger(choice) ||
        (choice !== 1 && (choice < 4 || localSpec === undefined))
      ) {
        write("Choose one of the listed numbers, or q to quit.");
        continue;
      }
      const source = choice === 1 ? PETSTORE_URL : localSpec!;
      write(
        "Generated files will go in the output directory; existing route edits are preserved.",
      );
      const destination = await question("Output directory [api]: ");
      if (destination === undefined) break;
      while (!cancellation.signal.aborted) {
        const answer = await question("Server port [3100]: ");
        if (answer === undefined) break;
        const port = answer === "" ? 3100 : Number(answer);
        if (Number.isInteger(port) && port > 0 && port <= 65535) {
          return { source, destination: destination || "api", port };
        }
        write("Choose a port between 1 and 65535, or q to quit.");
      }
      break;
    }

    write("\nIntro cancelled. Run npx counterfact again when you're ready.");
    return undefined;
  } finally {
    terminal.close();
  }
}
