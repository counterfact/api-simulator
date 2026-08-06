import net from "node:net";

import { RawHttpClient } from "../../src/repl/raw-http-client.js";

/**
 * Starts a minimal TCP server that accepts one connection,
 * captures the raw request text, immediately responds with
 * a minimal HTTP 200, and resolves with the captured request.
 */
function captureRequest(
  port: number,
  responseBody = "",
  contentType = "application/json",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      let raw = "";

      socket.on("data", (chunk) => {
        raw += chunk.toString("utf8");

        // Respond once we have a complete HTTP request head
        if (raw.includes("\r\n\r\n")) {
          const body = responseBody;
          const contentTypeHeader = body
            ? `Content-Type: ${contentType}\r\n`
            : "";
          socket.write(
            `HTTP/1.1 200 OK\r\n${contentTypeHeader}Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
          );
          socket.end();
          server.close();
          resolve(raw);
        }
      });

      socket.on("error", reject);
    });

    server.listen(port);
  });
}

describe("RawHttpClient", () => {
  it("automatically adds Content-Type: application/json when body is an object", async () => {
    const port = 59_100;
    const capture = captureRequest(port);
    const client = new RawHttpClient("localhost", port);

    client.post("/test", { name: "Homer" });

    const raw = await capture;

    expect(raw).toMatch(/content-type:\s*application\/json/i);
  });

  it("does not override an explicit content-type header provided by the caller", async () => {
    const port = 59_101;
    const capture = captureRequest(port);
    const client = new RawHttpClient("localhost", port);

    client.post("/test", { name: "Homer" }, { "Content-Type": "text/plain" });

    const raw = await capture;

    // Should carry exactly what the caller specified
    expect(raw).toMatch(/content-type:\s*text\/plain/i);
    // And must NOT duplicate application/json
    expect(raw).not.toMatch(/application\/json/i);
  });

  it("does not add Content-Type when body is a plain string", async () => {
    const port = 59_102;
    const capture = captureRequest(port);
    const client = new RawHttpClient("localhost", port);

    client.post("/test", "raw string body");

    const raw = await capture;

    expect(raw).not.toMatch(/content-type/i);
  });

  it("sends Content-Type: application/json for PUT with object body", async () => {
    const port = 59_103;
    const capture = captureRequest(port);
    const client = new RawHttpClient("localhost", port);

    client.put("/test", { id: 1 });

    const raw = await capture;

    expect(raw).toMatch(/content-type:\s*application\/json/i);
  });

  it("sends Content-Type: application/json for PATCH with object body", async () => {
    const port = 59_104;
    const capture = captureRequest(port);
    const client = new RawHttpClient("localhost", port);

    client.patch("/test", { id: 1 });

    const raw = await capture;

    expect(raw).toMatch(/content-type:\s*application\/json/i);
  });

  it("sends a GET request with the correct method and path", async () => {
    const port = 59_105;
    const capture = captureRequest(port);
    const client = new RawHttpClient("localhost", port);

    client.get("/pets");

    const raw = await capture;

    expect(raw).toMatch(/^GET \/pets HTTP\/1\.1/);
  });

  it("sends a HEAD request with the correct method and path", async () => {
    const port = 59_106;
    const capture = captureRequest(port);
    const client = new RawHttpClient("localhost", port);

    client.head("/status");

    const raw = await capture;

    expect(raw).toMatch(/^HEAD \/status HTTP\/1\.1/);
  });

  it("sends a DELETE request with the correct method and path", async () => {
    const port = 59_107;
    const capture = captureRequest(port);
    const client = new RawHttpClient("localhost", port);

    client.delete("/pets/1");

    const raw = await capture;

    expect(raw).toMatch(/^DELETE \/pets\/1 HTTP\/1\.1/);
  });

  it("sends a CONNECT request with the correct method", async () => {
    const port = 59_108;
    const capture = captureRequest(port);
    const client = new RawHttpClient("localhost", port);

    client.connect("/tunnel");

    const raw = await capture;

    expect(raw).toMatch(/^CONNECT \/tunnel HTTP\/1\.1/);
  });

  it("sends an OPTIONS request with the correct method", async () => {
    const port = 59_109;
    const capture = captureRequest(port);
    const client = new RawHttpClient("localhost", port);

    client.options("/pets");

    const raw = await capture;

    expect(raw).toMatch(/^OPTIONS \/pets HTTP\/1\.1/);
  });

  it("sends a TRACE request with the correct method", async () => {
    const port = 59_110;
    const capture = captureRequest(port);
    const client = new RawHttpClient("localhost", port);

    client.trace("/pets");

    const raw = await capture;

    expect(raw).toMatch(/^TRACE \/pets HTTP\/1\.1/);
  });

  it("increments the requestNumber counter across requests", async () => {
    const port = 59_111;
    const client = new RawHttpClient("localhost", port);
    const capture1 = captureRequest(port);

    client.get("/one");
    await capture1;
    expect(client.requestNumber).toBe(1);

    const capture2 = captureRequest(port);
    client.get("/two");
    await capture2;
    expect(client.requestNumber).toBe(2);
  });

  it("accepts custom headers for GET requests", async () => {
    const port = 59_112;
    const capture = captureRequest(port);
    const client = new RawHttpClient("localhost", port);

    client.get("/pets", { "X-Custom": "value" });

    const raw = await capture;

    expect(raw).toMatch(/X-Custom: value/);
  });

  it("handles a JSON response body without throwing", async () => {
    const port = 59_113;
    const jsonBody = JSON.stringify({ active: true, count: 3, name: null });
    const capture = captureRequest(port, jsonBody);
    const client = new RawHttpClient("localhost", port);

    client.get("/pets");

    const raw = await capture;
    expect(raw).toMatch(/^GET \/pets HTTP\/1\.1/);
    // Allow the event loop to flush the client's "data"/"end" socket events so
    // that #printResponse (including highlightJson with boolean/null values) runs.
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it("handles an invalid-JSON response body without throwing", async () => {
    const port = 59_114;
    // Server sends a body with content-type: application/json but malformed
    // content — exercises the catch branch in highlightJson.
    const capture = captureRequest(port, "not valid json {{{");
    const client = new RawHttpClient("localhost", port);

    client.get("/pets");

    const raw = await capture;
    expect(raw).toMatch(/^GET \/pets HTTP\/1\.1/);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it("handles a plain-text response body without throwing", async () => {
    const port = 59_115;
    // Server sends a plain text body — exercises the non-JSON branch in
    // #printResponse (the `: body` arm of the `isLikelyJson` ternary).
    const capture = captureRequest(port, "plain text response", "text/plain");
    const client = new RawHttpClient("localhost", port);

    client.get("/status");

    const raw = await capture;
    expect(raw).toMatch(/^GET \/status HTTP\/1\.1/);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});
