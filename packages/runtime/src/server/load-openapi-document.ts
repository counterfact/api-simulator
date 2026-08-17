import { OpenApiDocument } from "./openapi-document.js";
import type { RuntimeEventReporter } from "../runtime-config.js";

export async function loadOpenApiDocument(
  source: string,
  overlays: readonly string[] = [],
  reportEvent?: RuntimeEventReporter,
) {
  const document = new OpenApiDocument(source, overlays, reportEvent);

  await document.load();

  return document;
}
