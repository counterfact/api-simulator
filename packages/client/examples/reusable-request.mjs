import http from "node:http";

import {
  createOpenApiRouteCatalog,
  createRouteFunction,
} from "@counterfact/client";

const server = http.createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ path: request.url }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected the HTTP server to use a TCP port");
  }

  const catalog = createOpenApiRouteCatalog({
    paths: {
      "/pets/{petId}": {
        get: {
          parameters: [
            {
              in: "path",
              name: "petId",
              required: true,
              type: "integer",
            },
          ],
          responses: { 200: { description: "A pet" } },
        },
      },
    },
  });
  const route = createRouteFunction(address.port, "127.0.0.1", catalog);
  const pet = route("/pets/{petId}").method("get").path({ petId: 42 });

  await pet.send();
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
