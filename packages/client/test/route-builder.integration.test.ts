import net from "node:net";

import { describe, expect, it } from "@jest/globals";

import { RouteBuilder, createOpenApiRouteCatalog } from "../src/index.js";

async function captureRequest(): Promise<{
  port: number;
  request: Promise<string>;
}> {
  let resolveRequest!: (raw: string) => void;
  let rejectRequest!: (error: Error) => void;
  const request = new Promise<string>((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });
  const server = net.createServer((socket) => {
    const chunks: Buffer[] = [];

    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      const headEnd = raw.indexOf("\r\n\r\n");

      if (headEnd === -1) return;

      const head = raw.subarray(0, headEnd).toString("utf8");
      const contentLength = Number(
        head.match(/^content-length:\s*(?<length>\d+)/imu)?.groups?.[
          "length"
        ] ?? "0",
      );

      if (raw.byteLength < headEnd + 4 + contentLength) return;

      socket.end(
        "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK",
      );
      server.close();
      resolveRequest(raw.toString("utf8"));
    });

    socket.on("error", rejectRequest);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  server.on("error", rejectRequest);

  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("RouteBuilder capture server did not bind to an IP port");
  }

  return { port: address.port, request };
}

describe("RouteBuilder request integration", () => {
  it("merges encoded cookies and defaults OpenAPI 2 form data to URL-encoded", async () => {
    const capture = await captureRequest();
    const catalog = createOpenApiRouteCatalog({
      paths: {
        "/submit": {
          post: {
            parameters: [
              {
                in: "formData",
                name: "display name",
                required: true,
                type: "string",
              },
            ],
          },
        },
      },
    });
    const builder = new RouteBuilder("/submit", {
      host: "127.0.0.1",
      port: capture.port,
      routeCatalog: catalog,
    })
      .method("post")
      .headers({ cookie: "session=existing" })
      .cookies({ theme: "dark mode", token: "a/b" })
      .form({ "display name": "Patrick McElhaney" });

    await builder.send();
    const raw = await capture.request;

    expect(raw).toMatch(
      /cookie: session=existing; theme=dark%20mode; token=a%2Fb\r\n/iu,
    );
    expect(raw).toMatch(
      /content-type: application\/x-www-form-urlencoded\r\n/iu,
    );
    expect(raw).toContain("display+name=Patrick+McElhaney");
  });

  it("sends text-only multipart when it is the sole declared form type", async () => {
    const capture = await captureRequest();
    const catalog = createOpenApiRouteCatalog({
      paths: {
        "/upload": {
          post: {
            requestBody: {
              content: {
                "multipart/form-data": { schema: { type: "object" } },
              },
              required: true,
            },
          },
        },
      },
    });
    const builder = new RouteBuilder("/upload", {
      host: "127.0.0.1",
      port: capture.port,
      routeCatalog: catalog,
    })
      .method("post")
      .body({ ignored: true })
      .form({ count: 2, name: "Rex" });

    await builder.send();
    const raw = await capture.request;
    const boundary = raw.match(
      /content-type: multipart\/form-data; boundary=(?<boundary>[^\r\n]+)/iu,
    )?.groups?.["boundary"];

    expect(boundary).toMatch(/^counterfact-[a-f\d]{32}$/u);
    expect(raw).toContain('Content-Disposition: form-data; name="count"');
    expect(raw).toContain("\r\n\r\n2\r\n");
    expect(raw).toContain('Content-Disposition: form-data; name="name"');
    expect(raw).toContain("\r\n\r\nRex\r\n");
    expect(raw).toContain(`--${boundary}--\r\n`);
    expect(raw).not.toContain("ignored");
  });

  it("sends JSON when body() follows form()", async () => {
    const capture = await captureRequest();
    const catalog = createOpenApiRouteCatalog({
      paths: {
        "/pets": {
          post: {
            requestBody: {
              content: {
                "application/json": { schema: { type: "object" } },
                "application/x-www-form-urlencoded": {
                  schema: { type: "object" },
                },
              },
              required: true,
            },
          },
        },
      },
    });
    const builder = new RouteBuilder("/pets", {
      host: "127.0.0.1",
      port: capture.port,
      routeCatalog: catalog,
    })
      .method("post")
      .form({ ignored: "yes" })
      .body({ name: "Fluffy" });

    await builder.send();
    const raw = await capture.request;

    expect(raw).toMatch(/content-type: application\/json\r\n/iu);
    expect(raw).toContain('{"name":"Fluffy"}');
    expect(raw).not.toContain("ignored=yes");
  });
});
