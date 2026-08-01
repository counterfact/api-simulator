import path from "node:path";
import { fileURLToPath } from "node:url";
import { counterfact } from "../../../src/app.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function startSandbox(port) {
  const config = {
    alwaysFakeOptionals: false,
    basePath: path.join(here, "server"),
    buildCache: false,
    generate: { routes: false, types: false },
    openApiPath: path.join(here, "..", "openapi.yaml"),
    port,
    prefix: "",
    proxyPaths: new Map(),
    proxyUrl: "",
    startRepl: false,
    startServer: true,
    validateRequests: true,
    validateResponses: true,
    watch: { routes: false, types: false },
  };

  const app = await counterfact(config);
  const { stop } = await app.start(config);
  return { baseUrl: `http://127.0.0.1:${port}`, stop };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.argv[2] ?? "4310", 10);
  const sandbox = await startSandbox(port);
  process.stdout.write(`${sandbox.baseUrl}\n`);

  const shutdown = async () => {
    await sandbox.stop();
    process.exitCode = 0;
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
