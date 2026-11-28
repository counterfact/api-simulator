function isBinary(value: unknown): value is Blob | Uint8Array {
  return value instanceof Blob || value instanceof Uint8Array;
}

function escapeParameter(value: string): string {
  return value
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A")
    .replaceAll('"', "%22");
}

function partContentType(
  declared: string | undefined,
  blobType: string,
  fallback: string | undefined,
): string | undefined {
  if (!declared) return blobType || fallback;
  // OpenAPI permits a list of alternatives and media ranges. Emit a concrete
  // type, preferring the type we can infer from the value.
  const choices = declared.split(",").map((choice) => choice.trim());
  const inferred = blobType || fallback || "text/plain";
  const essence = inferred.split(";")[0]?.trim().toLowerCase();
  const matched = choices.find((choice) => {
    const range = choice.split(";")[0]?.trim().toLowerCase();
    return (
      range === essence ||
      range === "*/*" ||
      (range?.endsWith("/*") && essence?.startsWith(range.slice(0, -1)))
    );
  });
  if (matched) return matched.split(";")[0]?.includes("*") ? inferred : matched;
  if (fallback === "application/json") {
    const json = choices.find(isJsonContentType);
    if (json) return json;
  }
  return (
    choices.find((choice) => choice && !choice.split(";")[0]?.includes("*")) ??
    (blobType || fallback)
  );
}

function isJsonContentType(value: string | undefined): boolean {
  const essence = value?.split(";")[0]?.trim().toLowerCase();
  return essence === "application/json" || essence?.endsWith("+json") === true;
}

/** Encode native multipart fields with their per-part types and file names. */
export function encodeMultipartBody(
  fields: Iterable<[string, unknown]>,
  contentTypes: Readonly<Record<string, string>> | undefined,
): Blob {
  const boundary = `counterfact-${Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("")}`;
  const chunks: (string | Blob | Uint8Array<ArrayBuffer>)[] = [];
  const declaredTypes = new Map(Object.entries(contentTypes ?? {}));
  for (const [name, value] of fields) {
    for (const part of Array.isArray(value) ? (value as unknown[]) : [value]) {
      if (part === undefined) continue;
      const blob = part instanceof Blob ? part : undefined;
      const filename = isBinary(part)
        ? part instanceof File
          ? part.name
          : "blob"
        : undefined;
      const object =
        typeof part === "object" && part !== null && filename === undefined;
      const contentType = partContentType(
        declaredTypes.get(name),
        blob?.type ?? "",
        filename === undefined
          ? object
            ? "application/json"
            : undefined
          : "application/octet-stream",
      );
      const json = isJsonContentType(contentType);
      if (object && !json)
        throw new TypeError(
          `Multipart field "${name}" requires a pre-encoded part for ${contentType}`,
        );
      const header = contentType
        ? `Content-Type: ${new Headers({ "content-type": contentType }).get("content-type")}\r\n`
        : "";
      const disposition =
        `form-data; name="${escapeParameter(name)}"` +
        (filename === undefined
          ? ""
          : `; filename="${escapeParameter(filename)}"`);
      chunks.push(
        `--${boundary}\r\nContent-Disposition: ${disposition}\r\n${header}\r\n`,
        part instanceof Uint8Array
          ? new Uint8Array(part)
          : (blob ??
              (json
                ? JSON.stringify(part)
                : String(part).replaceAll(/\r\n|\r|\n/gu, "\r\n"))),
        "\r\n",
      );
    }
  }
  chunks.push(`--${boundary}--\r\n`);
  return new Blob(chunks, {
    type: `multipart/form-data; boundary=${boundary}`,
  });
}

/** Add multipart fields, preserving file parts and the selected array convention. */
export function appendMultipartField(
  form: FormData,
  name: string,
  value: unknown,
  repeatArrays = false,
): void {
  const parts =
    Array.isArray(value) && (repeatArrays || value.some(isBinary))
      ? (value as unknown[])
      : [value];
  for (const part of parts) {
    const field =
      part instanceof Blob
        ? part
        : part instanceof Uint8Array
          ? new Blob([new Uint8Array(part)], {
              type: "application/octet-stream",
            })
          : typeof part === "object" && part !== null
            ? JSON.stringify(part)
            : String(part);
    form.append(name, field);
  }
}
