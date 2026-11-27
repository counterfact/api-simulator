import { fileURLToPath } from "node:url";

import { generate } from "openapi-typescript-codegen";

// Generate the full client the application would already use, including its
// runtime, services and models. Keep the default nominal string enums.
await generate({
  input: fileURLToPath(new URL("../openapi.yaml", import.meta.url)),
  output: fileURLToPath(new URL("../src/generated/sdk", import.meta.url)),
  httpClient: "fetch",
  useUnionTypes: false,
  exportCore: true,
  exportServices: true,
  exportModels: true,
});
