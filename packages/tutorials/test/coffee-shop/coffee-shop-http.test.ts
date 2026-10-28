import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";
import { prepareTour, createTourRequestHandler } from "../../src/index.js";

it("serves tutorial controls outside simulation dispatch without generated tutorial handlers", async () => {
  await usingTemporaryFiles(async ($) => {
    const tour = await prepareTour($.path("."), "demo");
    for (const file of [
      "routes/products.ts",
      "routes/orders.ts",
      "routes/_.context.ts",
      "scenarios/index.ts",
    ])
      await $.add("demo/" + file, "export {};\n");
    const context = { inventory: { "house-blend": 5 } };
    const tutorial = await createTourRequestHandler(
      tour.destination,
      () => context,
    );
    let simulatedRequests = 0;
    const server = createServer((request, response) => {
      void tutorial!(request, response).then((handled) => {
        if (!handled) {
          simulatedRequests++;
          response.writeHead(418);
          response.end("simulation");
        }
        return undefined;
      });
    }).listen(0, "127.0.0.1");
    try {
      await once(server, "listening");
      const origin =
        "http://127.0.0.1:" + (server.address() as AddressInfo).port;
      const page = await fetch(origin + "/tutorial/");
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("Counterfact Coffee");
      const info = await (await fetch(origin + "/tutorial/info")).json();
      expect(info.walkthroughVersion).toBe(6);
      expect(info.state.inventory["house-blend"]).toBe(5);
      context.inventory["house-blend"] = 3;
      expect(
        (await (await fetch(origin + "/tutorial/info")).json()).state.inventory[
          "house-blend"
        ],
      ).toBe(3);
      expect((await fetch(origin + "/tutorial/unknown")).status).toBe(404);
      expect(
        (
          await fetch(origin + "/tutorial/info", {
            headers: { Origin: "https://other.example" },
          })
        ).status,
      ).toBe(403);
      const denied = await fetch(origin + "/tutorial/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkpoint",
          phaseId: "orientation",
          sessionId: "stale",
        }),
      });
      expect((await denied.json()).message).toContain("Reload");
      const checkpoint = await fetch(origin + "/tutorial/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkpoint",
          phaseId: "orientation",
          sessionId: info.sessionId,
        }),
      });
      expect((await checkpoint.json()).ok).toBe(true);
      expect(simulatedRequests).toBe(0);
      expect((await fetch(origin + "/shop/products")).status).toBe(418);
      expect(simulatedRequests).toBe(1);
      await expect(
        $.read("demo/routes/tutorial-info.ts"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

it("does not install a native tutorial handler for ordinary or legacy projects", async () => {
  await usingTemporaryFiles(async ($) => {
    expect(
      await createTourRequestHandler($.path("."), () => ({})),
    ).toBeUndefined();
    await $.add(
      ".counterfact-walkthrough.json",
      JSON.stringify({ version: 3 }),
    );
    expect(
      await createTourRequestHandler($.path("."), () => ({})),
    ).toBeUndefined();
  });
});
