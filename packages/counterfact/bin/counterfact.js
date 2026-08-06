#!/usr/bin/env node
/* eslint-disable security/detect-non-literal-fs-filename -- this bootstrap writes only fixed probe files under a fresh mkdtemp directory it just created. */

/**
 * bin/counterfact.js — Minimal bootstrap for the `counterfact` CLI.
 *
 * This file is intentionally kept as thin as possible.  Its sole
 * responsibilities are:
 *
 *  1. Enforce the minimum Node.js version (must run before any imports).
 *  2. Detect whether the current runtime can execute TypeScript natively
 *     (must run before any .ts imports).
 *  3. Dynamically import the real CLI entry point from `src/cli/run.ts`
 *     (native TS) or `dist/cli/run.js` (compiled JS) and delegate to it.
 *
 * All CLI logic — Commander setup, option parsing, migration, telemetry,
 * banner, update check, and server startup — lives in src/cli/ as TypeScript.
 */

import fs from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MIN_NODE_VERSION = 17;

if (
  Number.parseInt(process.versions.node.split(".")[0], 10) < MIN_NODE_VERSION
) {
  process.stdout.write(
    `Counterfact works with Node version ${MIN_NODE_VERSION}+. You are running version ${process.version}`,
  );

  process.exit(1);
}

const __binDir = nodePath.dirname(fileURLToPath(import.meta.url));

// Probe whether the current runtime can natively execute TypeScript with
// erasable type annotations AND resolve .js imports to .ts files.
// This must be inlined here because we need the result before we can
// import any .ts files from src/.
async function runtimeCanExecuteErasableTs() {
  const dir = fs.mkdtempSync(nodePath.join(tmpdir(), "ts-probe-"));
  // helper.ts is imported via .js extension — the TypeScript convention used
  // throughout this codebase. If the runtime resolves helper.js → helper.ts,
  // it is fully capable of running the TypeScript source tree.
  fs.writeFileSync(
    nodePath.join(dir, "helper.ts"),
    'export const value: string = "ok";\n',
    "utf8",
  );
  fs.writeFileSync(
    nodePath.join(dir, "main.ts"),
    'import { value } from "./helper.js"; export default value;\n',
    "utf8",
  );
  try {
    const mod = await import(pathToFileURL(nodePath.join(dir, "main.ts")).href);
    return mod?.default === "ok";
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const nativeTs = await runtimeCanExecuteErasableTs();

const toFileUrl = (rel) => pathToFileURL(nodePath.join(__binDir, rel)).href;

const { runCli } = await import(
  toFileUrl(nativeTs ? "../src/cli/run.ts" : "../dist/cli/run.js")
);

await runCli(process.argv);
