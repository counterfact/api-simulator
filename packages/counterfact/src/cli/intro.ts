import { isAbsolute } from "node:path";
import { createInterface } from "node:readline/promises";

import open from "open";

import { discoverOpenApiSpecs } from "./discover-openapi.js";
import { findTourDirectory, prepareTour } from "@counterfact/tutorials";
import { isPortAvailable } from "./is-port-available.js";

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

export type IntroSelection = {
  source: string;
  destination: string;
  port: number;
  walkthroughPath?: string;
};

export async function runIntro(): Promise<IntroSelection | undefined> {
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
  const safe = (text: string) => text.replace(/[\p{Cc}\p{Cf}]/gu, "?");
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
  const choosePort = async (): Promise<number | undefined> => {
    while (!cancellation.signal.aborted) {
      const answer = await question("Server port [3100]: ");
      if (answer === undefined) return undefined;
      const port = answer === "" ? 3100 : Number(answer);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        write("Choose a port between 1 and 65535, or q to quit.");
      } else if (!(await isPortAvailable(port))) {
        write(`Port ${port} is already in use. Choose another port.`);
      } else return port;
    }
    return undefined;
  };
  try {
    write("\nWelcome to Counterfact!");
    write("Build your frontend against a local API you can change.");
    while (!cancellation.signal.aborted) {
      write("\n1) Try a guided example (recommended)");
      write("2) Use my OpenAPI document");
      write("3) Open documentation");
      write("q) Quit (Ctrl+C or Ctrl+D also cancels)");
      const answer = await question("Choose [1]: ");
      if (answer === undefined) break;
      if (answer === "3") {
        write(`Documentation: ${DOCS_URL}`);
        try {
          await open(DOCS_URL);
        } catch {
          write("Could not open a browser. Open the documentation link above.");
        }
        return undefined;
      }
      if (answer === "" || answer === "1") {
        const destination = await findTourDirectory(process.cwd());
        write(
          `\nShop for coffee, change the API in your editor, and restock through the REPL.`,
        );
        write(
          `This creates ${destination}/ and starts a local server. No download needed.`,
        );
        write(
          "The walkthrough opens in your browser. Keep this terminal open and use your own editor. Your files are kept.",
        );
        let port = 3100;
        while (!cancellation.signal.aborted) {
          write(`Server: http://localhost:${port}`);
          const start = await question(
            "Start [Enter] (p: change port, b: back, q: quit): ",
          );
          if (start === undefined) return undefined;
          if (start === "b") break;
          if (start === "p") {
            const chosen = await choosePort();
            if (chosen === undefined) return undefined;
            port = chosen;
            continue;
          }
          if (start !== "") {
            write(
              "Press Enter to start, p to change port, b to go back, or q to quit.",
            );
            continue;
          }
          if (!(await isPortAvailable(port))) {
            write(`Port ${port} is already in use. Choose another port.`);
            const chosen = await choosePort();
            if (chosen === undefined) return undefined;
            port = chosen;
            continue;
          }
          if (cancellation.signal.aborted) return undefined;
          try {
            const prepared = await prepareTour(process.cwd(), destination);
            return { ...prepared, port };
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST") {
              write(
                "That directory was created while you were choosing. Nothing was overwritten; choose the example again for a new directory.",
              );
              break;
            }
            throw error;
          }
        }
        continue;
      }
      if (answer !== "2") {
        write("Choose one of the listed numbers, or q to quit.");
        continue;
      }
      write("\nLooking for local OpenAPI documents…");
      const discovered = await discoverOpenApiSpecs(
        process.cwd(),
        cancellation.signal,
      );
      if (discovered.limited)
        write(
          "Search limits reached; some files were skipped. Enter a path or URL to use another document.",
        );
      if (discovered.unreadable)
        write(
          "Some files or directories could not be read; they were skipped.",
        );
      if (cancellation.signal.aborted) break;
      while (!cancellation.signal.aborted) {
        for (const [index, spec] of discovered.specs.entries())
          write(`${index + 1}) ${safe(spec)}`);
        if (discovered.specs.length === 0)
          write("No local OpenAPI documents found.");
        write("p) Enter a path or URL\nb) Back\nq) Quit");
        const choice = await question("Choose a document: ");
        if (choice === undefined) return undefined;
        if (choice === "b") break;
        let source: string;
        if (choice === "p") {
          const entered = await question("OpenAPI path or URL (b: back): ");
          if (entered === undefined) return undefined;
          if (entered === "b") continue;
          if (!entered) {
            write("Enter a path or URL.");
            continue;
          }
          source =
            /^https?:\/\//iu.test(entered) ||
            isAbsolute(entered) ||
            entered.startsWith("./") ||
            entered.startsWith("../")
              ? entered
              : `./${entered}`;
        } else {
          const index = Number(choice);
          const spec =
            Number.isInteger(index) && index > 0
              ? discovered.specs.at(index - 1)
              : undefined;
          if (!spec) {
            write("Choose a listed document, p, b, or q.");
            continue;
          }
          source = `./${spec}`;
        }
        write(
          "Generated files go in the output directory; existing route edits are preserved.",
        );
        const destination = await question(
          "Output directory [api] (b: back): ",
        );
        if (destination === undefined) return undefined;
        if (destination === "b") continue;
        const port = await choosePort();
        if (port === undefined) return undefined;
        return { source, destination: destination || "api", port };
      }
    }
    write("\nIntro cancelled. Run npx counterfact again when you're ready.");
    return undefined;
  } finally {
    terminal.close();
  }
}
