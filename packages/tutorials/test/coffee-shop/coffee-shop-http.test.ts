import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { expect, it, jest } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";
import { prepareTour, createTourRequestHandler } from "../../src/index.js";
import { emptyInput } from "../../src/coffee-shop/lessons/runtime.js";
import { CATALOG } from "../../src/coffee-shop/coffee-shop-lessons.js";

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
    let tutorial = await createTourRequestHandler(
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
      const post = async (path: string, body: Record<string, unknown>) =>
        (
          await fetch(origin + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: info.sessionId, ...body }),
          })
        ).json();
      expect(
        (
          await post("/tutorial/workspace", {
            action: "advance",
            phaseId: "orientation",
          })
        ).message,
      ).toContain("Complete this lesson");
      const checkpoint = await fetch(origin + "/tutorial/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkpoint",
          phaseId: "orientation",
          sessionId: info.sessionId,
        }),
      });
      expect(await checkpoint.json()).toMatchObject({
        ok: true,
        flow: { status: "await_next_lesson", nextPhaseId: "explore" },
      });
      // Recreate the graph as on a server restart: progress comes from disk.
      tutorial = await createTourRequestHandler(
        tour.destination,
        () => context,
      );
      expect(
        await post("/tutorial/workspace", {
          action: "advance",
          phaseId: "orientation",
        }),
      ).toMatchObject({
        ok: true,
        flow: { status: "advance", nextPhaseId: "explore" },
      });
      expect(
        await post("/tutorial/check", { phaseId: "catalog" }),
      ).toMatchObject({
        ok: false,
        flow: { status: "await_edit" },
      });
      expect(
        await post("/tutorial/lesson", {
          phaseId: "orientation",
          input: {
            ...emptyInput(),
            event: "order",
            status: 201,
            response: { orderId: 1 },
          },
        }),
      ).toMatchObject({ complete: true });
      const productsBefore = await $.read("demo/routes/products.ts");
      const unapproved = await post("/tutorial/lesson", {
        phaseId: "catalog",
        input: {
          ...emptyInput(),
          event: "products",
          source: "manual",
          ready: true,
          prepared: true,
          products: CATALOG,
          catalogReads: 1,
          lastCatalog: JSON.stringify(CATALOG),
        },
      });
      expect(unapproved.complete).not.toBe(true);
      expect(await $.read("demo/routes/products.ts")).toBe(productsBefore);
      expect(
        await post("/tutorial/lesson", {
          phaseId: "catalog",
          input: { event: "unknown" },
        }),
      ).toMatchObject({ ok: false });
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

it("returns safe HTTP failures and saved-check results while retaining authored guidance", async () => {
  const diagnostics = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    await usingTemporaryFiles(async ($) => {
      const tour = await prepareTour($.path("."), "demo");
      for (const file of [
        "routes/_.context.ts",
        "routes/products.ts",
        "routes/orders.ts",
        "scenarios/index.ts",
      ])
        await $.add("demo/" + file, "export {};\n");
      let failure: unknown;
      const tutorial = await createTourRequestHandler(tour.destination, () => {
        if (failure !== undefined) throw failure;
        return {};
      });
      const server = createServer((request, response) => {
        void tutorial!(request, response);
      }).listen(0, "127.0.0.1");
      try {
        await once(server, "listening");
        const origin =
          "http://127.0.0.1:" + (server.address() as AddressInfo).port;
        const post = (path: string, body: string) =>
          fetch(origin + path, { method: "POST", body });
        for (const error of [
          new Error(
            "/private/server/secret.ts\\nRequire stack: internal-loader",
          ),
          "/private/server/secret.ts\\nRequire stack: internal-loader",
          { message: "/private/server/secret.ts", stack: "internal-loader" },
        ]) {
          failure = error;
          const response = await fetch(origin + "/tutorial/info");
          expect(response.status).toBe(400);
          expect(await response.json()).toEqual({
            ok: false,
            message:
              "Could not complete the tutorial request. Check the server terminal for details and try again.",
          });
          expect(diagnostics).toHaveBeenLastCalledWith(
            "Tutorial operation failed:",
            error,
          );
        }
        failure = undefined;
        diagnostics.mockClear();
        for (const [body, message] of [
          ['{"private-secret":', "Send a valid JSON object."],
          ["[]", "Expected a JSON object."],
          [" ".repeat(65537), "Tutorial request is too large."],
        ]) {
          expect(
            await (await post("/tutorial/check", body)).json(),
          ).toMatchObject({ ok: false, message });
        }
        expect(
          await (
            await post(
              "/tutorial/workspace",
              JSON.stringify({ sessionId: "stale" }),
            )
          ).json(),
        ).toMatchObject({
          message: "Reload the walkthrough before changing its workspace.",
        });
        expect(diagnostics).not.toHaveBeenCalled();
        await $.add("demo/routes/_.context.ts", "export class Context {}");
        await $.add(
          "demo/routes/products.ts",
          'import "./missing-private-module.js"; export const GET = () => {};',
        );
        await $.add("demo/routes/orders.ts", "export const POST = () => {};");
        const checked = await post(
          "/tutorial/check",
          JSON.stringify({ phaseId: "catalog" }),
        );
        expect(checked.status).toBe(200);
        const result = await checked.json();
        expect(result).toMatchObject({
          ok: false,
          message: expect.stringContaining("server terminal"),
        });
        expect(JSON.stringify(result)).not.toMatch(
          /Require stack|missing-private-module|compiled|\.cjs/u,
        );
        expect(diagnostics).toHaveBeenCalled();
        await $.add(
          "demo/routes/products.ts",
          "export const GET = $ => $.response.status(200).random();",
        );
        expect(
          await (
            await post(
              "/tutorial/check",
              JSON.stringify({ phaseId: "catalog" }),
            )
          ).json(),
        ).toMatchObject({
          ok: false,
          message:
            "Replace the random product stub with a JSON product response.",
        });
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });
  } finally {
    diagnostics.mockRestore();
  }
});
