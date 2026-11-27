import { fileURLToPath } from "node:url";
import { createClient } from "@hey-api/openapi-ts";

await createClient({
  input: fileURLToPath(new URL("./openapi.json", import.meta.url)),
  output: fileURLToPath(new URL("./src/generated", import.meta.url)),
  plugins: ["@hey-api/typescript"],
});
