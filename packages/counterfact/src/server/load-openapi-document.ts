import { OpenApiDocument } from "./openapi-document.js";

export async function loadOpenApiDocument(
  source: string,
  overlays: readonly string[] = [],
) {
  const document = new OpenApiDocument(source, overlays);

  await document.load();

  return document;
}
