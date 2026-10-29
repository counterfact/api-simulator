/* eslint-disable security/detect-non-literal-fs-filename -- Only the managed demo marker is read here. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { coffeeShopPage } from "./coffee-shop-page.js";
import { checkWalkthroughSave, walkthroughInfo } from "./coffee-shop-checks.js";
import { phasesForVersion } from "./coffee-shop-lessons.js";
import { createWalkthroughWorkflow } from "./coffee-shop-workflow.js";
import type { WorkflowRequest } from "./coffee-shop-workflow.js";
import {
  checkpointWalkthroughStep,
  prepareWalkthroughStep,
  previewWalkthroughStep,
  walkthroughWorkspace,
} from "./coffee-shop-workspace.js";
import { reportWalkthroughEvent } from "./coffee-shop-telemetry.js";

async function readBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    length += bytes.length;
    if (length > 65_536) {
      tooLarge = true;
      continue;
    }
    chunks.push(bytes);
  }
  if (tooLarge) throw new Error("Tutorial request is too large.");
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("Expected a JSON object.");
  return body as Record<string, unknown>;
}

/** Tutorial HTTP is handled before the simulator, without generated routes or a spec. */
export async function createTourRequestHandler(
  root: string,
  context: () => Record<string, unknown>,
) {
  let marker: { version?: number };
  try {
    marker = JSON.parse(
      await readFile(join(root, ".counterfact-walkthrough.json"), "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (marker.version !== 4 && marker.version !== 5 && marker.version !== 6)
    return;
  const version = marker.version;
  const workflow = createWalkthroughWorkflow(phasesForVersion(version), {
    workspace: () => walkthroughWorkspace(root),
    preview: (phaseId) => previewWalkthroughStep(root, phaseId),
    prepare: (phaseId, revision) =>
      prepareWalkthroughStep(root, phaseId, { revision }),
    check: (phaseId) => checkWalkthroughSave(root, phaseId),
    checkpoint: (phaseId) => checkpointWalkthroughStep(root, phaseId),
  });
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (
      path !== "/tutorial" &&
      !path.startsWith("/tutorial/") &&
      path !== "/walkthrough"
    )
      return false;
    const json = (status: number, value: unknown) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify(value));
    };
    try {
      if (
        request.headers.origin &&
        new URL(request.headers.origin).host !== request.headers.host
      ) {
        json(403, {
          error: "Tutorial requests must come from this walkthrough’s origin.",
        });
        return true;
      }
      if (
        (path === "/tutorial" || path === "/walkthrough") &&
        request.method === "GET"
      ) {
        response.writeHead(302, { Location: "/tutorial/" });
        response.end();
        return true;
      }
      if (path === "/tutorial/" && request.method === "GET") {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        response.end(coffeeShopPage(root, version));
        return true;
      }
      if (path === "/tutorial/info" && request.method === "GET") {
        json(200, await walkthroughInfo(root, context(), true));
        return true;
      }
      if (
        !["/tutorial/check", "/tutorial/workspace", "/tutorial/event"].includes(
          path,
        )
      ) {
        json(404, { error: "Unknown tutorial endpoint." });
        return true;
      }
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        json(405, { error: "Use POST for this tutorial endpoint." });
        return true;
      }
      const body = await readBody(request);
      const phaseId = typeof body.phaseId === "string" ? body.phaseId : "";
      if (path === "/tutorial/check") {
        json(200, await workflow.invoke({ action: "check", phaseId }));
        return true;
      }
      const info = await walkthroughInfo(root, context());
      if (path === "/tutorial/event") {
        reportWalkthroughEvent(info.sessionId, body.event, phaseId, version);
        json(200, { ok: true });
        return true;
      }
      if (body.sessionId !== info.sessionId)
        throw new Error(
          "Reload the walkthrough before changing its workspace.",
        );
      if (
        !["preview", "prepare", "checkpoint", "advance"].includes(
          String(body.action),
        )
      )
        throw new Error("Unknown workspace action.");
      const result = await workflow.invoke({
        action: body.action as WorkflowRequest["action"],
        phaseId,
        revision: typeof body.revision === "string" ? body.revision : undefined,
      });
      json(200, result);
    } catch (error) {
      json(400, {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  };
}
