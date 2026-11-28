function isBinary(value: unknown): value is Blob | Uint8Array {
  return value instanceof Blob || value instanceof Uint8Array;
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
