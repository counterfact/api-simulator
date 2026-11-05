import assert from "node:assert/strict";
import { once, EventEmitter } from "node:events";
import { usingTemporaryFiles } from "using-temporary-files";
import {
  ModuleLoader,
  Registry,
  ContextRegistry,
  Dispatcher,
  ScenarioRegistry,
} from "@counterfact/runtime";

await usingTemporaryFiles(async ($) => {
  await $.add(
    "identity/_.context.mjs",
    "export class DomainError extends Error {} export class Context { fail(){throw new DomainError('failure');} }",
  );
  await $.add(
    "identity/item.mjs",
    "import {Context,DomainError} from './_.context.mjs'; export function GET($){try{$.context.fail();}catch(e){return {status:200,body:[$.context instanceof Context,e instanceof DomainError]};}}",
  );
  const identityRoutes = new Registry(),
    identityContexts = new ContextRegistry();
  await new ModuleLoader(
    $.path("identity"),
    identityRoutes,
    identityContexts,
  ).load();
  const result = await new Dispatcher(identityRoutes, identityContexts).request(
    {
      method: "GET",
      path: "/item",
      body: undefined,
      headers: {},
      query: {},
      req: {},
    },
  );
  assert.deepEqual(result.body, [true, true]);

  await $.add("two/item.mjs", "export const GET=()=>({body:'original'});");
  await $.add("two-scenarios/seed.mjs", "export const seed=()=> 'original';");
  const first = new Registry(),
    firstScenarios = new ScenarioRegistry();
  await new ModuleLoader(
    $.path("two"),
    first,
    undefined,
    $.path("two-scenarios"),
    firstScenarios,
  ).load();
  await $.add("two/item.mjs", "export const GET=()=>({body:'edited'});");
  await $.add("two-scenarios/seed.mjs", "export const seed=()=> 'edited';");
  const second = new Registry(),
    secondScenarios = new ScenarioRegistry();
  await new ModuleLoader(
    $.path("two"),
    second,
    undefined,
    $.path("two-scenarios"),
    secondScenarios,
  ).load();
  assert.equal(second.handler("/item", "GET").module.GET({}).body, "edited");
  assert.equal(secondScenarios.getModule("seed").seed(), "edited");

  await $.add(
    "retry/_.context.mjs",
    "export class Context { constructor(){throw new Error('broken constructor');} }",
  );
  const contexts = new ContextRegistry(),
    retry = new ModuleLoader($.path("retry"), new Registry(), contexts);
  await assert.rejects(retry.load(), /broken constructor/u);
  await $.add("retry/_.context.mjs", "export class Context { value='fixed'; }");
  await retry.load();
  assert.equal(contexts.find("/").value, "fixed");

  await $.addDirectory("watch");
  await $.addDirectory("watch-scenarios");
  const routes = new Registry(),
    scenarios = new ScenarioRegistry(),
    events = new EventEmitter();
  const add = scenarios.add.bind(scenarios);
  scenarios.add = (key, module) => {
    add(key, module);
    events.emit("scenario");
  };
  const watcher = new ModuleLoader(
    $.path("watch"),
    routes,
    undefined,
    $.path("watch-scenarios"),
    scenarios,
  );
  await watcher.watch();
  try {
    const added = once(watcher, "add");
    await $.add("watch/item.mjs", "export const GET=()=>({body:'original'});");
    await added;
    const changed = once(watcher, "add");
    await $.add("watch/item.mjs", "export const GET=()=>({body:'edited'});");
    await changed;
    assert.equal(routes.handler("/item", "GET").module.GET({}).body, "edited");
    const seeded = once(events, "scenario");
    await $.add(
      "watch-scenarios/seed.mjs",
      "export const seed=()=> 'original';",
    );
    await seeded;
    const reseeded = once(events, "scenario");
    await $.add("watch-scenarios/seed.mjs", "export const seed=()=> 'edited';");
    await reseeded;
    assert.equal(scenarios.getModule("seed").seed(), "edited");
  } finally {
    await watcher.stopWatching();
  }
});
