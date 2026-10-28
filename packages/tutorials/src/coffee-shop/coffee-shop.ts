import { PHASES, WALKTHROUGH_VERSION } from "./coffee-shop-lessons.js";
import { coffeeShopPage } from "./coffee-shop-page.js";

const validationModule = new URL("./coffee-shop-checks.js", import.meta.url)
  .href;

const workspaceModule = new URL("./coffee-shop-workspace.js", import.meta.url)
  .href;

const telemetryModule = new URL("./coffee-shop-telemetry.js", import.meta.url)
  .href;

const orderItem = {
  type: "object",
  required: ["productId", "quantity"],
  properties: {
    productId: { type: "string", minLength: 1 },
    quantity: { type: "integer", minimum: 1 },
  },
};
const item = { $ref: "#/components/schemas/OrderItem" };
const product = {
  type: "object",
  required: ["id", "name", "description", "price", "stock"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 32 },
    name: { type: "string", minLength: 1, maxLength: 40 },
    description: { type: "string", maxLength: 120 },
    price: { type: "integer", minimum: 500, maximum: 2500 },
    stock: { type: "integer", minimum: 0, maximum: 20 },
  },
};
const jsonResponse = (schema: object) => ({
  description: "Coffee shop response",
  content: { "application/json": { schema } },
});
const errorResponse = jsonResponse({
  type: "object",
  required: ["error"],
  properties: { error: { type: "string" } },
});
export const SHOP_DOCUMENT = {
  openapi: "3.0.3",
  info: { title: "Counterfact Coffee", version: "1.0.0" },
  components: { schemas: { Product: product, OrderItem: orderItem } },
  paths: {
    "/tutorial-info": {
      get: {
        parameters: [
          { in: "header", name: "origin", schema: { type: "string" } },
          { in: "header", name: "host", schema: { type: "string" } },
        ],
        responses: {
          "403": errorResponse,
          "200": jsonResponse({
            type: "object",
            required: ["projectPath", "sessionId"],
            properties: {
              projectPath: { type: "string" },
              sessionId: { type: "string" },
              revision: { type: "string" },
            },
          }),
        },
      },
    },
    "/tutorial-event": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["event", "phaseId"],
                additionalProperties: false,
                properties: {
                  event: {
                    type: "string",
                    enum: [
                      "opened",
                      "started",
                      "phase_completed",
                      "lesson_skipped",
                      "finished",
                    ],
                  },
                  phaseId: {
                    type: "string",
                    enum: PHASES.map((phase) => phase.id),
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": jsonResponse({
            type: "object",
            required: ["ok"],
            properties: { ok: { type: "boolean" } },
          }),
        },
      },
    },
    "/tutorial-workspace": {
      post: {
        parameters: [
          { in: "header", name: "origin", schema: { type: "string" } },
          { in: "header", name: "host", schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["action", "phaseId", "sessionId"],
                properties: {
                  action: {
                    type: "string",
                    enum: ["preview", "prepare", "checkpoint"],
                  },
                  revision: { type: "string" },
                  phaseId: {
                    type: "string",
                    enum: PHASES.map((phase) => phase.id),
                  },
                  sessionId: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": jsonResponse({
            type: "object",
            required: ["ok", "message"],
            properties: {
              ok: { type: "boolean" },
              message: { type: "string" },
            },
          }),
        },
      },
    },
    "/tutorial-check": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["phaseId"],
                properties: {
                  phaseId: {
                    type: "string",
                    enum: PHASES.filter((phase) => phase.check).map(
                      (phase) => phase.id,
                    ),
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": jsonResponse({
            type: "object",
            required: ["revision", "ok", "message"],
            properties: {
              revision: { type: "string" },
              ok: { type: "boolean" },
              message: { type: "string" },
            },
          }),
        },
      },
    },
    "/products": {
      get: {
        responses: {
          "200": jsonResponse({
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: { $ref: "#/components/schemas/Product" },
          }),
        },
      },
    },
    "/orders": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["items"],
                properties: {
                  items: { type: "array", minItems: 1, items: item },
                },
              },
            },
          },
        },
        responses: {
          "201": jsonResponse({
            type: "object",
            required: ["orderId", "items"],
            properties: {
              orderId: { type: "integer" },
              items: { type: "array", items: item },
            },
          }),
          "409": jsonResponse({
            type: "object",
            required: ["error", "shortages"],
            properties: {
              error: { type: "string" },
              shortages: {
                type: "array",
                items: {
                  type: "object",
                  required: ["productId", "requested", "available"],
                  properties: {
                    productId: { type: "string" },
                    requested: { type: "integer" },
                    available: { type: "integer", minimum: 0 },
                  },
                },
              },
            },
          }),
          "503": errorResponse,
        },
      },
    },
    "/walkthrough": {
      get: {
        responses: {
          "200": {
            description: "Guided coffee shop",
            content: { "text/html": { schema: { type: "string" } } },
          },
        },
      },
    },
  },
};

export function coffeeShopFiles(projectPath: string): Record<string, string> {
  const project = JSON.stringify(projectPath);
  const helpersImport = `const helpers = new Function("url", "return import(url)")(${JSON.stringify(validationModule)});`;
  return {
    // Only walkthrough infrastructure is supplied. The normal generator writes
    // products.ts, orders.ts, the empty Context, and the default scenario file.
    "routes/tutorial-info.ts": `import type { HTTP_GET } from "../types/paths/tutorial-info.types.js";
${helpersImport}
export const GET: HTTP_GET = async function ($) {
  if ($.headers.origin && new URL($.headers.origin).host !== $.headers.host) {
    const denied = { error: "File history is available only to this walkthrough's origin." };
    return $.response.status(403).json(denied);
  }
  return $.response.status(200).json(await (await helpers).walkthroughInfo(${project}, $.context, true));
};
`,
    "routes/tutorial-check.ts": `import type { HTTP_POST } from "../types/paths/tutorial-check.types.js";
${helpersImport}
export const POST: HTTP_POST = async function ($) {
  return $.response.status(200).json(await (await helpers).checkWalkthroughSave(${project}, $.body.phaseId));
};
`,
    "routes/tutorial-workspace.ts": `import type { HTTP_POST } from "../types/paths/tutorial-workspace.types.js";
${helpersImport}
const workspace = new Function("url", "return import(url)")(${JSON.stringify(workspaceModule)});
export const POST: HTTP_POST = async function ($) {
  try {
    if ($.headers.origin && new URL($.headers.origin).host !== $.headers.host)
      throw new Error("Workspace changes must come from this walkthrough's origin.");
    const info = await (await helpers).walkthroughInfo(${project}, $.context);
    if ($.body.sessionId !== info.sessionId) throw new Error("Reload the walkthrough before changing its workspace.");
    const module = await workspace;
    const result = $.body.action === "preview"
      ? await module.previewWalkthroughStep(${project}, $.body.phaseId)
      : $.body.action === "prepare"
        ? await module.prepareWalkthroughStep(${project}, $.body.phaseId, { revision: $.body.revision })
        : await module.checkpointWalkthroughStep(${project}, $.body.phaseId);
    return $.response.status(200).json(result);
  } catch (error) {
    const result = { ok: false, message: error instanceof Error ? error.message : String(error) };
    return $.response.status(200).json(result);
  }
};
`,
    "routes/tutorial-event.ts": `import type { HTTP_POST } from "../types/paths/tutorial-event.types.js";
${helpersImport}
const telemetry = new Function("url", "return import(url)")(${JSON.stringify(telemetryModule)});
export const POST: HTTP_POST = async function ($) {
  try {
    const info = await (await helpers).walkthroughInfo(${project}, $.context);
    (await telemetry).reportWalkthroughEvent(info.sessionId, $.body.event, $.body.phaseId, ${WALKTHROUGH_VERSION});
  } catch { /* Reporting never blocks learning. */ }
  return $.response.status(200).json({ ok: true });
};
`,
    "routes/walkthrough.ts": `import type { HTTP_GET } from "../types/paths/walkthrough.types.js";
export const GET: HTTP_GET = function ($) {
  return $.response.status(200).html(${JSON.stringify(coffeeShopPage(projectPath))});
};
`,
  };
}
