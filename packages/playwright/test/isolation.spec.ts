import { test, expect } from "./fixtures.js";

// A second file runs on another worker. Repeated mutations must never leak.
for (let index = 0; index < 4; index += 1) {
  test(`isolates worker state ${index}`, async ({
    simulator,
    simulatorURL,
    request,
  }) => {
    expect(
      await (await request.get(`${simulatorURL}/projects`)).json(),
    ).toEqual([{ id: 1, name: "Customer portal" }]);
    const context = simulator.loadContext("/") as {
      store: { projects: unknown[] };
    };
    context.store.projects.length = 0;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      await (await request.get(`${simulatorURL}/projects`)).json(),
    ).toEqual([]);
  });
}
