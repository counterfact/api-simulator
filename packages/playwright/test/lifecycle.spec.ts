import { test, expect } from "./fixtures.js";

let firstURL: string;
let firstPath: string;
let firstWorker: number;
let firstStore: unknown;

test("awaits baseline startup, composes fixtures and exposes live state", async ({
  simulator,
  simulatorURL,
  greeting,
  workerGreeting,
  request,
}, info) => {
  expect(greeting).toBe("hello world");
  expect(workerGreeting).toBe("hello");
  expect(simulator.status().address?.port).toBe(
    Number(new URL(simulatorURL).port),
  );
  expect(simulator.status().port).toBe(0);
  firstURL = simulatorURL;
  firstPath = simulator.status().basePath;
  firstWorker = info.workerIndex;
  firstStore = simulator.store;
  const context = simulator.loadContext("/") as {
    store: { projects: unknown[] };
  };
  expect(context.store.projects).toEqual([{ id: 1, name: "Customer portal" }]);
  context.store.projects.length = 0;
  expect(await (await request.get(`${simulatorURL}/projects`)).json()).toEqual(
    [],
  );
});

test("automatic reset completes even when simulator is not requested", async ({
  simulatorURL,
  request,
}) => {
  expect(simulatorURL).toBe(firstURL);
  expect(await (await request.get(`${simulatorURL}/projects`)).json()).toEqual([
    { id: 1, name: "Customer portal" },
  ]);
});

test.describe("test-scoped scenario", () => {
  test.use({ scenarioName: "emptyProjects" });
  test("keeps the worker and listener when the option changes", async ({
    simulator,
    simulatorURL,
    request,
  }, info) => {
    expect(info.workerIndex).toBe(firstWorker);
    expect(simulatorURL).toBe(firstURL);
    expect(simulator.status().basePath).toBe(firstPath);
    expect(simulator.store).not.toBe(firstStore);
    expect(
      await (await request.get(`${simulatorURL}/projects`)).json(),
    ).toEqual([]);
  });
});

test("restores baseline after scenario selection", async ({
  simulatorURL,
  request,
}) => {
  expect(simulatorURL).toBe(firstURL);
  expect(await (await request.get(`${simulatorURL}/projects`)).json()).toEqual([
    { id: 1, name: "Customer portal" },
  ]);
});
