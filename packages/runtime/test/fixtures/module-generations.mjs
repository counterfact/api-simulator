import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { usingTemporaryFiles } from "using-temporary-files";
import {
  ModuleLoader,
  Registry,
  ContextRegistry,
  Dispatcher,
} from "@counterfact/runtime";

function runtime($) {
  const registry = new Registry();
  const contexts = new ContextRegistry();
  const loader = new ModuleLoader($.path("."), registry, contexts);
  const dispatcher = new Dispatcher(registry, contexts);
  return {
    registry,
    contexts,
    loader,
    request: () =>
      dispatcher.request({
        method: "GET",
        path: "/probe",
        headers: {},
        query: {},
        req: {},
      }),
  };
}

test("fresh loaders recover after a missing dependency is created", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "probe.mjs",
      'import {value} from "./helper.mjs"; export const GET = () => ({status: 200, body: value});',
    );
    const first = runtime($);
    await first.loader.load();
    assert.equal((await first.request()).status, 500);
    await $.add("helper.mjs", 'export const value = "recovered";');
    const second = runtime($);
    await second.loader.load();
    assert.equal((await second.request()).body, "recovered");
  });
});

test("fresh loaders recover after a transient evaluation failure", async () => {
  await usingTemporaryFiles(async ($) => {
    const key = "counterfactGenerationEvaluationReady";
    try {
      globalThis[key] = false;
      await $.add(
        "probe.mjs",
        `if (!globalThis.${key}) throw new Error("not ready"); export const GET = () => ({status: 200, body: "recovered"});`,
      );
      const first = runtime($);
      await first.loader.load();
      assert.equal((await first.request()).status, 500);
      globalThis[key] = true;
      const second = runtime($);
      await second.loader.load();
      assert.equal((await second.request()).body, "recovered");
    } finally {
      delete globalThis[key];
    }
  });
});

test("fresh loaders and same-loader retries recover after constructor failure", async () => {
  await usingTemporaryFiles(async ($) => {
    const key = "counterfactGenerationConstructorReady";
    try {
      globalThis[key] = false;
      await $.add(
        "_.context.mjs",
        `const ready = globalThis.${key}; export class Context { constructor(){ if (!ready) throw new Error("not ready"); } }`,
      );
      await $.add(
        "probe.mjs",
        'import {Context} from "./_.context.mjs"; export const GET = $ => ({status: 200, body: $.context instanceof Context});',
      );
      const first = runtime($);
      await assert.rejects(first.loader.load(), /not ready/u);
      globalThis[key] = true;
      const second = runtime($);
      await second.loader.load();
      assert.equal((await second.request()).body, true);
      await first.loader.load();
      assert.equal((await first.request()).body, true);
    } finally {
      delete globalThis[key];
    }
  });
});

test("stale canonical imports cannot poison a loader's generation", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "probe.mjs",
      'export const GET = () => ({status: 200, body: "old"});',
    );
    const direct = await import(pathToFileURL($.path("probe.mjs")).href);
    assert.equal(direct.GET().body, "old");
    await $.add(
      "probe.mjs",
      'export const GET = () => ({status: 200, body: "new"});',
    );
    for (let run = 0; run < 2; run++) {
      const current = runtime($);
      await current.loader.load();
      assert.equal((await current.request()).body, "new");
    }
    assert.equal(direct.GET().body, "old");
  });
});

test("reloads refresh local dependencies while preserving live context state", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("helper.mjs", 'export const value = "old";');
    await $.add(
      "_.context.mjs",
      'import {value} from "./helper.mjs"; export class DomainError extends Error {} export class Context { count = 0; value(){return value;} fail(){throw new DomainError("failure");} }',
    );
    await $.add(
      "probe.mjs",
      'import {Context,DomainError} from "./_.context.mjs"; export const GET = async $ => {const dynamic = await import("./_.context.mjs"); let error=false;try{$.context.fail();}catch(e){error=e instanceof DomainError;} return {status:200,body:{context:$.context instanceof Context,dynamic:$.context instanceof dynamic.Context,error,count:$.context.count,value:$.context.value()}};};',
    );
    const current = runtime($);
    await current.loader.load();
    current.contexts.find("/").count = 7;
    assert.deepEqual((await current.request()).body, {
      context: true,
      dynamic: true,
      error: true,
      count: 7,
      value: "old",
    });
    await $.add("helper.mjs", 'export const value = "new";');
    await current.loader.load();
    assert.deepEqual((await current.request()).body, {
      context: true,
      dynamic: true,
      error: true,
      count: 7,
      value: "new",
    });
  });
});

test("generation routing preserves cycles, package aliases, and delayed imports", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "package.json",
      JSON.stringify({
        type: "module",
        imports: { "#context": "./_.context.mjs" },
      }),
    );
    await $.add(
      "_.context.mjs",
      'import {contextClass} from "./helper.mjs"; export class Context { count = 0; constructor(){if(contextClass() !== Context) throw new Error("cycle identity");} }',
    );
    await $.add(
      "helper.mjs",
      'import {Context} from "#context"; export const contextClass = () => Context;',
    );
    await $.add(
      "probe.mjs",
      'import {Context} from "#context"; import assert from "node:assert/strict"; export const GET = async $ => {const dynamic = await import(new URL("./_.context.mjs", import.meta.url)); assert.ok($.context instanceof Context); return {status:200, body:[$.context instanceof dynamic.Context,$.context.count]};};',
    );
    const first = runtime($);
    await first.loader.load();
    first.contexts.find("/").count = 17;
    const second = runtime($);
    await second.loader.load();
    assert.deepEqual((await first.request()).body, [true, 17]);
    assert.deepEqual((await second.request()).body, [true, 0]);
  });
});
