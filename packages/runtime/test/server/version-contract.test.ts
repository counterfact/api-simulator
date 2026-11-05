import { ContextRegistry } from "../../src/server/context-registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { Registry } from "../../src/server/registry.js";

it("gates versioned operations before invoking a shared handler", async () => {
  const registry = new Registry();
  let calls = 0;
  const handler = () => {
    calls++;
    return { status: 200 };
  };
  registry.add("/old", { GET: handler });
  registry.add("/shared", { GET: handler, POST: handler });
  const document = { paths: { "/shared": { get: { responses: {} } } } };
  const dispatcher = new Dispatcher(
    registry,
    new ContextRegistry(),
    document,
    { validateRequests: false, validateResponses: false },
    "v2",
    ["v1", "v2"],
  );
  const request = { body: undefined, headers: {}, query: {}, req: {} };
  expect(
    (await dispatcher.request({ ...request, method: "GET", path: "/old" }))
      .status,
  ).toBe(404);
  const removedMethod = await dispatcher.request({
    ...request,
    method: "POST",
    path: "/shared",
  });
  expect(removedMethod.status).toBe(405);
  expect(removedMethod.headers?.allow).toBe("GET");
  expect(calls).toBe(0);
  expect(
    (await dispatcher.request({ ...request, method: "GET", path: "/shared" }))
      .status,
  ).toBe(200);
  const unversioned = new Dispatcher(registry, new ContextRegistry(), document);
  expect(
    (await unversioned.request({ ...request, method: "GET", path: "/old" }))
      .status,
  ).toBe(200);
  expect(calls).toBe(2);
});
