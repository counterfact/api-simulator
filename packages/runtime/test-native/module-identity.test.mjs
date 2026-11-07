import assert from "node:assert/strict";
import { it } from "node:test";
import { usingTemporaryFiles } from "using-temporary-files";
import { ContextRegistry } from "../dist/server/context-registry.js";
import { Dispatcher } from "../dist/server/dispatcher.js";
import { ModuleLoader } from "../dist/server/module-loader.js";
import { Registry } from "../dist/server/registry.js";

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
    assert.deepEqual(response.body, {
      context: true,
      error: true,
      singleton: true,
    });
  });
});
