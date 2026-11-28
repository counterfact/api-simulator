import { expect, it } from "@jest/globals";

import { encodeMultipartBody } from "../src/multipart-form.js";

it("writes repeated fields, preserves file bytes, and uses declared part types", async () => {
  const payload = encodeMultipartBody(
    [
      ["label", ["one", undefined, "two"]],
      ["details", { active: true }],
      ["file", new File(["payload"], "photo.png", { type: "image/png" })],
      ["bytes", new Uint8Array([0, 255])],
      ["caption", null],
    ],
    {
      details: "text/plain, application/vnd.upload+json",
      file: "*/*",
      bytes: "application/octet-stream",
    },
  );
  const form = await new Response(payload).formData();
  expect(form.getAll("label")).toEqual(["one", "two"]);
  expect(form.get("details")).toBe('{"active":true}');
  expect(form.get("caption")).toBe("null");
  const file = form.get("file") as File;
  expect(file.name).toBe("photo.png");
  expect(file.type).toBe("image/png");
  expect(await file.text()).toBe("payload");
  const bytes = form.get("bytes") as File;
  expect(bytes.name).toBe("blob");
  expect(bytes.type).toBe("application/octet-stream");
  expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(
    new Uint8Array([0, 255]),
  );
  expect(await payload.text()).toContain(
    "Content-Type: application/vnd.upload+json\r\n",
  );
});

it("escapes multipart names and filenames and normalizes text line endings", async () => {
  const payload = encodeMultipartBody(
    [
      ['line\r\n"name', "a\nb\rc\r\nd"],
      ["file", new File(["payload"], 'a"b.txt', { type: "text/plain" })],
    ],
    undefined,
  );
  const raw = await payload.text();
  expect(raw).toContain('name="line%0D%0A%22name"\r\n\r\na\r\nb\r\nc\r\nd');
  expect(raw).toContain('filename="a%22b.txt"');
});

it("rejects objects for non-JSON parts rather than sending a stringified object", () => {
  expect(() =>
    encodeMultipartBody([["details", { active: true }]], {
      details: "application/xml",
    }),
  ).toThrow('Multipart field "details" requires a pre-encoded part');
});
