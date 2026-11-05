import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { usingTemporaryFiles } from "using-temporary-files";
import { ContextRegistry } from "../../src/server/context-registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { ModuleLoader } from "../../src/server/module-loader.js";
import { Registry } from "../../src/server/registry.js";

it("shares initial ESM context constructors, errors, and singletons with routes", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "_.context.mjs",
      [
        "export const singleton = {};",
        "export class DomainError extends Error {}",
        "export class Context { marker = singleton; fail() { throw new DomainError('failure'); } }",
      ].join("\n"),
    );
    await $.add(
      "identity.mjs",
      [
        "import { Context, DomainError, singleton } from './_.context.mjs';",
        "export function GET($) {",
        "try { $.context.fail(); } catch (error) {",
        "return { status: 200, body: {context: $.context instanceof Context, error: error instanceof DomainError, singleton: $.context.marker === singleton} };",
        "} }",
      ].join("\n"),
    );
    const registry = new Registry();
    const contexts = new ContextRegistry();
    const loader = new ModuleLoader($.path(""), registry, contexts);
    await loader.load();
    const response = await new Dispatcher(registry, contexts).request({
      method: "GET",
      path: "/identity",
      body: undefined,
      headers: {},
      query: {},
      req: {},
    });
    expect(response.body).toEqual({
      context: true,
      error: true,
      singleton: true,
    });
  });
});

it("preserves native Node identity while retrying and reloading ESM entries", async () => {
  await promisify(execFile)(
    process.execPath,
    [
      fileURLToPath(
        new URL("../fixtures/module-loader-cache.mjs", import.meta.url),
      ),
    ],
    { timeout: 15000, env: { ...process.env, CHOKIDAR_USEPOLLING: "1" } },
  );
}, 20000);
