import { PHASES } from "./coffee-shop-lessons.js";
import { coffeeShopPage } from "./coffee-shop-page.js";

const validationModule = new URL("./coffee-shop-checks.js", import.meta.url)
  .href;

const telemetryModule = new URL("./coffee-shop-telemetry.js", import.meta.url)
  .href;

const item = {
  type: "object",
  required: ["productId", "quantity"],
  properties: {
    productId: { type: "string", minLength: 1 },
    quantity: { type: "integer", minimum: 1 },
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
  paths: {
    "/tutorial-info": {
      get: {
        responses: {
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
            items: {
              type: "object",
              required: ["id", "name", "description", "price", "stock"],
              properties: {
                id: { type: "string", minLength: 1, maxLength: 32 },
                name: { type: "string", minLength: 1, maxLength: 40 },
                description: { type: "string", maxLength: 120 },
                price: { type: "integer", minimum: 500, maximum: 2500 },
                stock: { type: "integer", minimum: 0, maximum: 20 },
              },
            },
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
  return $.response.status(200).json(await (await helpers).walkthroughInfo(${project}, $.context));
};
`,
    "routes/tutorial-check.ts": `import type { HTTP_POST } from "../types/paths/tutorial-check.types.js";
${helpersImport}
export const POST: HTTP_POST = async function ($) {
  return $.response.status(200).json(await (await helpers).checkWalkthroughSave(${project}, $.body.phaseId));
};
`,
    "routes/tutorial-event.ts": `import type { HTTP_POST } from "../types/paths/tutorial-event.types.js";
${helpersImport}
const telemetry = new Function("url", "return import(url)")(${JSON.stringify(telemetryModule)});
export const POST: HTTP_POST = async function ($) {
  try {
    const info = await (await helpers).walkthroughInfo(${project}, $.context);
    (await telemetry).reportWalkthroughEvent(info.sessionId, $.body.event, $.body.phaseId);
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
