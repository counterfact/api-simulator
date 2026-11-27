import { fileURLToPath } from "node:url";
import { generateApi } from "swagger-typescript-api";

// Keep the real client, HTTP implementation, and models together in this app.
// Enum style intentionally remains nominal, rather than a string union.
await generateApi({
  input: fileURLToPath(new URL("../openapi.yaml", import.meta.url)),
  output: fileURLToPath(new URL("../src/generated/sdk", import.meta.url)),
  modular: true,
  fileNames: { dataContracts: "models" },
  generateClient: true,
  httpClientType: "fetch",
  enumStyle: "enum",
  addReadonly: false,
});
