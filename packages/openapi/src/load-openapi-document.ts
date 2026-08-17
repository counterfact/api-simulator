import { bundle, dereference } from "@apidevtools/json-schema-ref-parser";

import { applyOverlays } from "./apply-overlay.js";

export type OpenApiDocument = Record<string, unknown>;

const parserOptions = {
  resolve: { http: { safeUrlResolver: false } },
} as const;

async function loadDocument(
  source: string,
  overlays: readonly string[],
  mode: "bundle" | "dereference",
): Promise<OpenApiDocument> {
  try {
    const document = (await (mode === "bundle"
      ? bundle(source, parserOptions)
      : dereference(source, parserOptions))) as OpenApiDocument;

    if (overlays.length > 0) {
      await applyOverlays(document, overlays);
    }

    return document;
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not load the OpenAPI spec from "${source}".\n${details}`,
      { cause: error },
    );
  }
}

/** Loads, dereferences, and overlays an OpenAPI document without starting Counterfact. */
export async function loadOpenApiDocument(
  source: string,
  overlays: readonly string[] = [],
): Promise<OpenApiDocument> {
  return loadDocument(source, overlays, "dereference");
}

/** Bundles external references and applies overlays while retaining internal references. */
export async function bundleOpenApiDocument(
  source: string,
  overlays: readonly string[] = [],
): Promise<OpenApiDocument> {
  return loadDocument(source, overlays, "bundle");
}
