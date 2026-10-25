import { test, expect } from "./fixtures.js";

test("starts with baseline projects and allows mutation", async ({
  request,
  simulatorURL,
}) => {
  const initial = await request.get(`${simulatorURL}/projects`);
  expect(await initial.json()).toEqual([{ id: 1, name: "Customer portal" }]);
  await request.delete(`${simulatorURL}/projects`);
  const emptied = await request.get(`${simulatorURL}/projects`);
  expect(await emptied.json()).toEqual([]);
});

test("restores projects before the next test on this worker", async ({
  request,
  simulatorURL,
}) => {
  const response = await request.get(`${simulatorURL}/projects`);
  expect(await response.json()).toEqual([{ id: 1, name: "Customer portal" }]);
});

test.describe("empty projects", () => {
  test.use({ scenarioName: "emptyProjects" });

  test("applies the optional scenario after reset", async ({
    request,
    simulatorURL,
  }) => {
    const response = await request.get(`${simulatorURL}/projects`);
    expect(await response.json()).toEqual([]);
  });
});
