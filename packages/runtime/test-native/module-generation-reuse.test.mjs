import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { usingTemporaryFiles } from "using-temporary-files";
import { ModuleGeneration } from "../dist/server/module-generation.js";

test("watcher forks reuse an unchanged context while refreshing its importing route", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "context.mjs",
      "export class Context { #count=0; increment=()=>++this.#count; }",
    );
    await $.add(
      "route.mjs",
      "export {Context} from './context.mjs'; export const value=1;",
    );
    const first = new ModuleGeneration();
    const a = await first.import($.path("route.mjs"));
    const context = new a.Context();
    assert.equal(context.increment(), 1);
    await $.add(
      "route.mjs",
      "export {Context} from './context.mjs'; export const value=2;",
    );
    const second = await first.refresh();
    const b = await second.import($.path("route.mjs"));
    assert.notEqual(a, b);
    assert.equal(a.Context, b.Context);
    assert.ok(context instanceof b.Context);
    assert.equal(context.increment(), 2);
    assert.equal(b.value, 2);
    const third = await second.refresh();
    assert.equal(
      await third.import($.path("context.mjs")),
      await first.import($.path("context.mjs")),
    );
  });
});

test("changed transitive dependencies invalidate their importing context, including cycles", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("helper.mjs", "import './context.mjs'; export const value=1;");
    await $.add(
      "context.mjs",
      "import {value} from './helper.mjs'; export class Context { read(){return value} }",
    );
    const first = new ModuleGeneration();
    const a = await first.import($.path("context.mjs"));
    await $.add("helper.mjs", "import './context.mjs'; export const value=2;");
    const second = await first.refresh();
    const b = await second.import($.path("context.mjs"));
    assert.notEqual(a.Context, b.Context);
    assert.equal(new b.Context().read(), 2);
  });
});

test("JSON dependencies are tracked and changed content invalidates importers", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("data.json", '{"value":1}');
    await $.add(
      "context.mjs",
      "import data from './data.json' with {type:'json'}; export const value=data.value;",
    );
    const first = new ModuleGeneration();
    assert.equal((await first.import($.path("context.mjs"))).value, 1);
    await $.add("data.json", '{"value":2}');
    assert.equal(
      (await (await first.refresh()).import($.path("context.mjs"))).value,
      2,
    );
  });
});

test("dynamic imports retain their evaluated graphs but refresh conservatively", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("helper.mjs", "export const value=1;");
    await $.add("context.mjs", "export const get=()=>import('./helper.mjs');");
    const first = new ModuleGeneration();
    const a = await first.import($.path("context.mjs"));
    assert.equal((await a.get()).value, 1);
    const second = await first.refresh();
    const b = await second.import($.path("context.mjs"));
    assert.notEqual(a, b);
    assert.equal((await b.get()).value, 1);
    await $.add("helper.mjs", "export const value=2;");
    const c = await (await second.refresh()).import($.path("context.mjs"));
    assert.equal((await c.get()).value, 2);
    assert.equal((await a.get()).value, 1);
  });
});

test("failed generations and explicit loads are fresh even with unchanged files", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("context.mjs", "export class Context {}");
    const first = new ModuleGeneration();
    const a = await first.import($.path("context.mjs"));
    first.markFailed();
    const b = await (await first.refresh()).import($.path("context.mjs"));
    assert.notEqual(a.Context, b.Context);
    const c = await new ModuleGeneration().import($.path("context.mjs"));
    assert.notEqual(b.Context, c.Context);
    await $.add("bad.mjs", "import './missing.mjs'; export const value=1;");
    const failed = new ModuleGeneration();
    await assert.rejects(failed.import($.path("bad.mjs")));
    await $.add("missing.mjs", "export const ready=true;");
    assert.equal(
      (await (await failed.refresh()).import($.path("bad.mjs"))).value,
      1,
    );
  });
});

test("CommonJS watcher refresh preserves unchanged contexts and refreshes changed dependency graphs", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "context.cjs",
      "exports.Context=class { #n=0; increment=()=>++this.#n; }",
    );
    await $.add(
      "route.cjs",
      "exports.Context=require('./context.cjs').Context; exports.value=1;",
    );
    const first = new ModuleGeneration();
    const a = await first.importCommonJS($.path("route.cjs"));
    const live = new a.Context();
    assert.equal(live.increment(), 1);
    await $.add(
      "route.cjs",
      "exports.Context=require('./context.cjs').Context; exports.value=2;",
    );
    const second = await first.refresh();
    const b = await second.importCommonJS($.path("route.cjs"));
    assert.equal(b.Context, a.Context);
    assert.equal(b.value, 2);
    assert.equal(live.increment(), 2);
    assert.equal(
      (await second.importCommonJS($.path("context.cjs"))).Context,
      a.Context,
    );
    await $.add("context.cjs", "exports.Context=class { value=3; }");
    const third = await second.refresh();
    const context = await third.importCommonJS($.path("context.cjs"));
    const c = await third.importCommonJS($.path("route.cjs"));
    assert.equal(c.Context, context.Context);
    assert.notEqual(c.Context, a.Context);
    assert.equal(new c.Context().value, 3);
    assert.notEqual(
      (await new ModuleGeneration().importCommonJS($.path("context.cjs")))
        .Context,
      c.Context,
    );
  });
});

test("CommonJS JSON changes and failed generations do not reuse cached contexts", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("data.json", '{"value":1}');
    await $.add(
      "context.cjs",
      "exports.Context=class { value=require('./data.json').value; }; exports.data=require('./data.json');",
    );
    const first = new ModuleGeneration();
    const a = await first.importCommonJS($.path("context.cjs"));
    await $.add("data.json", '{"value":2}');
    const second = await first.refresh();
    const b = await second.importCommonJS($.path("context.cjs"));
    assert.notEqual(a.Context, b.Context);
    assert.equal(new b.Context().value, 2);
    second.markFailed();
    const c = await (
      await second.refresh()
    ).importCommonJS($.path("context.cjs"));
    assert.notEqual(b.Context, c.Context);
  });
});

test("CommonJS late requires are invalidated when their evaluation snapshot is unknown", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("helper.cjs", "exports.value=1;");
    await $.add(
      "context.cjs",
      "exports.get=()=>require('./helper.cjs').value;",
    );
    const first = new ModuleGeneration();
    const a = await first.importCommonJS($.path("context.cjs"));
    assert.equal(a.get(), 1);
    await $.add("helper.cjs", "exports.value=2;");
    const b = await (
      await first.refresh()
    ).importCommonJS($.path("context.cjs"));
    assert.equal(b.get(), 2);
  });
});

test("native erasable TypeScript modules retain identity on watcher refresh", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("package.json", '{"type":"module"}');
    await $.add(
      "context.ts",
      "export class Context { count: number = 0; increment = (): number => ++this.count; }",
    );
    const first = new ModuleGeneration();
    const a = await first.import($.path("context.ts"));
    const b = await (await first.refresh()).import($.path("context.ts"));
    assert.equal(a.Context, b.Context);
  });
});

test("native CommonJS TypeScript contexts retain identity on watcher refresh", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "context.cts",
      "class Context { count: number = 0; increment = (): number => ++this.count; } module.exports={Context};",
    );
    const first = new ModuleGeneration();
    const a = await first.importCommonJS($.path("context.cts"));
    const b = await (
      await first.refresh()
    ).importCommonJS($.path("context.cts"));
    assert.equal(a.Context, b.Context);
  });
});

test("unobserved dynamic dependencies refresh together with their static importers", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "lazy.mjs",
      "export async function get(){return (await import /* lazy */ ('./helper.mjs')).value}",
    );
    await $.add("route.mjs", "export {get} from './lazy.mjs';");
    await $.add("helper.mjs", "export const value=1;");
    const first = new ModuleGeneration();
    const a = await first.import($.path("route.mjs"));
    await first.import($.path("helper.mjs"));
    await $.add("helper.mjs", "export const value=2;");
    const second = await first.refresh();
    const b = await second.import($.path("route.mjs"));
    assert.notEqual(a, b);
    assert.equal((await second.import($.path("helper.mjs"))).value, 2);
    assert.equal(await b.get(), 2);
    assert.equal(await a.get(), 1);
  });
});

test("preexisting CommonJS children have unknown source provenance and invalidate importers", async () => {
  await usingTemporaryFiles(async ($) => {
    const require = createRequire(import.meta.url);
    await $.add("helper.cjs", "exports.value=1;");
    await $.add(
      "route.cjs",
      "const helper=require('./helper.cjs'); exports.get=()=>helper.value;",
    );
    // eslint-disable-next-line security/detect-non-literal-require -- Load our isolated temporary fixture.
    require($.path("helper.cjs"));
    await $.add("helper.cjs", "exports.value=2;");
    const first = new ModuleGeneration();
    assert.equal((await first.importCommonJS($.path("route.cjs"))).get(), 1);
    assert.equal((await first.importCommonJS($.path("helper.cjs"))).value, 2);
    const second = await first.refresh();
    assert.equal((await second.importCommonJS($.path("route.cjs"))).get(), 2);
  });
});

test("preexisting CommonJS children are refreshed even without a separate child import", async () => {
  await usingTemporaryFiles(async ($) => {
    const require = createRequire(import.meta.url);
    await $.add("helper.cjs", "exports.value=1;");
    await $.add("route.cjs", "exports.value=require('./helper.cjs').value;");
    // eslint-disable-next-line security/detect-non-literal-require -- Load our isolated temporary fixture.
    require($.path("helper.cjs"));
    await $.add("helper.cjs", "exports.value=2;");
    const first = new ModuleGeneration();
    assert.equal((await first.importCommonJS($.path("route.cjs"))).value, 1);
    const second = await first.refresh();
    assert.equal((await second.importCommonJS($.path("route.cjs"))).value, 2);
  });
});

test(
  "comment-heavy static imports do not trigger backtracking or prevent reuse",
  { timeout: 5000 },
  async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("helper.mjs", "export const value=1;");
      await $.add(
        "context.mjs",
        `import ${"/* */".repeat(2000)} {value} from './helper.mjs'; export {value};`,
      );
      const first = new ModuleGeneration();
      const context = await first.import($.path("context.mjs"));
      assert.equal(context.value, 1);
      assert.equal(
        await (await first.refresh()).import($.path("context.mjs")),
        context,
      );
    });
  },
);

test("dynamic imports separated by comments and inside template expressions are invalidated", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("helper.mjs", "export const value=1;");
    await $.add(
      "context.mjs",
      "export const get=async()=>`value:${(await import /* comment */ ('./helper.mjs')).value}`;",
    );
    const first = new ModuleGeneration();
    const before = await first.import($.path("context.mjs"));
    await $.add("helper.mjs", "export const value=2;");
    const after = await (await first.refresh()).import($.path("context.mjs"));
    assert.notEqual(before, after);
    assert.equal(await after.get(), "value:2");
  });
});

test("failed entries retry without invalidating successfully evaluated siblings", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "context.mjs",
      "export class Context { #n=0; next=()=>++this.#n; }",
    );
    await $.add("route.mjs", "export const GET = ;");
    const first = new ModuleGeneration();
    const context = await first.import($.path("context.mjs"));
    await assert.rejects(first.import($.path("route.mjs")), SyntaxError);
    await $.add("route.mjs", "export const GET = ()=>1;");
    const second = await first.refresh();
    assert.equal(
      (await second.import($.path("context.mjs"))).Context,
      context.Context,
    );
    assert.equal((await second.import($.path("route.mjs"))).GET(), 1);
  });
});

test("failed transitive evaluations are not reused even when source is unchanged", async () => {
  await usingTemporaryFiles(async ($) => {
    const key = "counterfactFailedDependencyReady";
    try {
      globalThis[key] = false;
      await $.add(
        "helper.mjs",
        `if (!globalThis.${key}) throw new Error('not ready'); export const value=1;`,
      );
      await $.add("route.mjs", "export {value} from './helper.mjs';");
      const first = new ModuleGeneration();
      await assert.rejects(first.import($.path("route.mjs")), /not ready/u);
      globalThis[key] = true;
      const second = await first.refresh();
      assert.equal((await second.import($.path("route.mjs"))).value, 1);
    } finally {
      delete globalThis[key];
    }
  });
});

test("CommonJS watcher graphs retain their own contexts when another loader replaces Node's cache", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "context.cjs",
      "exports.Context=class Context { #n=0; increment=()=>++this.#n; }",
    );
    await $.add(
      "route.cjs",
      "exports.Context=require('./context.cjs').Context; exports.value=1;",
    );
    const first = new ModuleGeneration();
    const context = await first.importCommonJS($.path("context.cjs"));
    await first.importCommonJS($.path("route.cjs"));
    const live = new context.Context();
    assert.equal(live.increment(), 1);
    const foreign = new ModuleGeneration();
    const otherContext = await foreign.importCommonJS($.path("context.cjs"));
    await foreign.importCommonJS($.path("route.cjs"));
    assert.notEqual(otherContext.Context, context.Context);
    await $.add(
      "route.cjs",
      "exports.Context=require('./context.cjs').Context; exports.value=2;",
    );
    const second = await first.refresh();
    const route = await second.importCommonJS($.path("route.cjs"));
    assert.equal(route.value, 2);
    assert.equal(route.Context, context.Context);
    assert.equal(
      (await second.importCommonJS($.path("context.cjs"))).Context,
      context.Context,
    );
    assert.ok(live instanceof route.Context);
    assert.equal(live.increment(), 2);
  });
});

test("CommonJS pending invalidations survive interleaved foreign generation imports", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("helper.cjs", "exports.value=1;");
    await $.add("route.cjs", "exports.value=require('./helper.cjs').value;");
    await $.add("other.cjs", "exports.value=1;");
    const first = new ModuleGeneration();
    await first.importCommonJS($.path("route.cjs"));
    await first.importCommonJS($.path("other.cjs"));
    const foreign = await first.refresh();
    await foreign.importCommonJS($.path("route.cjs"));
    await $.add("helper.cjs", "exports.value=2;");
    await $.add("other.cjs", "exports.value=2;");
    const second = await first.refresh();
    assert.equal((await second.importCommonJS($.path("other.cjs"))).value, 2);
    assert.equal((await foreign.importCommonJS($.path("route.cjs"))).value, 1);
    assert.equal((await second.importCommonJS($.path("route.cjs"))).value, 2);
  });
});

for (const kind of ["esm", "commonjs"]) {
  test(`a failed ${kind} constructor invalidates only its graph`, async () => {
    await usingTemporaryFiles(async ($) => {
      const extension = kind === "esm" ? "mjs" : "cjs";
      const source =
        kind === "esm"
          ? "export class Context {}"
          : "exports.Context=class Context {};";
      await $.add(`good.${extension}`, source);
      await $.add(`bad.${extension}`, source);
      const first = new ModuleGeneration();
      const load = (generation, name) =>
        kind === "esm"
          ? generation.import($.path(`${name}.${extension}`))
          : generation.importCommonJS($.path(`${name}.${extension}`));
      const good = await load(first, "good");
      const bad = await load(first, "bad");
      first.markFailed($.path(`bad.${extension}`));
      const next = await first.refresh();
      assert.equal((await load(next, "good")).Context, good.Context);
      assert.notEqual((await load(next, "bad")).Context, bad.Context);
    });
  });
}

test("a caught dynamic import rejection does not certify the failed dependency", async () => {
  await usingTemporaryFiles(async ($) => {
    const key = "counterfactCaughtDynamicReady";
    try {
      globalThis[key] = false;
      await $.add(
        "helper.mjs",
        `if (!globalThis.${key}) throw new Error('not ready'); export const value=1;`,
      );
      await $.add(
        "route.mjs",
        "let value=0; try { value=(await import('./helper.mjs')).value; } catch {} export {value};",
      );
      const first = new ModuleGeneration();
      assert.equal((await first.import($.path("route.mjs"))).value, 0);
      globalThis[key] = true;
      const second = await first.refresh();
      assert.equal((await second.import($.path("route.mjs"))).value, 1);
    } finally {
      delete globalThis[key];
    }
  });
});
