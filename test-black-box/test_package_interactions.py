"""Consumer-style black-box checks across Counterfact's public packages."""

import json
import os
import subprocess
import textwrap
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGES_ROOT = REPO_ROOT / "packages"


def _consumer_with_packages(tmp_path: Path, *package_names: str) -> Path:
    """Create a temporary consumer whose imports resolve through package names.

    Symlinks deliberately point to built package roots.  The scripts therefore
    exercise each package's declared export map rather than source files.
    """
    consumer = tmp_path / "consumer"
    consumer.mkdir()
    (consumer / "package.json").write_text(
        json.dumps({"name": "black-box-consumer", "private": True}) + "\n"
    )
    node_modules = consumer / "node_modules"
    node_modules.mkdir()

    for package_name in package_names:
        if package_name.startswith("@counterfact/"):
            scope = node_modules / "@counterfact"
            scope.mkdir(exist_ok=True)
            package_directory = package_name.removeprefix("@counterfact/")
            link = scope / package_directory
        else:
            package_directory = package_name
            link = node_modules / package_name
        os.symlink(PACKAGES_ROOT / package_directory, link)

    return consumer


def _run_node_script(consumer: Path, script: str, *, timeout: int = 60) -> subprocess.CompletedProcess:
    script_path = consumer / "consume.mjs"
    script_path.write_text(textwrap.dedent(script))
    result = subprocess.run(
        ["node", script_path],
        cwd=consumer,
        env={**os.environ, "CHOKIDAR_USEPOLLING": "true"},
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    assert result.returncode == 0, (
        f"Node consumer failed with exit code {result.returncode}\n"
        f"stdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )
    return result


def test_openapi_applies_multiple_overlays_in_declared_order(tmp_path):
    """The public loader composes multiple overlays predictably for a consumer."""
    consumer = _consumer_with_packages(tmp_path, "@counterfact/openapi")
    _run_node_script(
        consumer,
        """
        import assert from "node:assert/strict";
        import { writeFile } from "node:fs/promises";
        import path from "node:path";
        import { loadOpenApiDocument } from "@counterfact/openapi";

        const spec = path.resolve("source.yaml");
        const first = path.resolve("first-overlay.yaml");
        const second = path.resolve("second-overlay.yaml");
        await writeFile(spec, `openapi: 3.0.3
        info: { title: Original, version: 1.0.0 }
        paths:
          /health:
            get:
              deprecated: true
              responses: { "200": { description: ok } }
        `);
        await writeFile(first, `overlay: 1.0.0
        actions:
          - target: $.info
            update: { title: First overlay, x-origin: first }
          - target: $.paths['/health'].get
            update: { deprecated: false }
        `);
        await writeFile(second, `overlay: 1.0.0
        actions:
          - target: $.info
            update: { title: Second overlay, x-origin: second }
        `);

        const document = await loadOpenApiDocument(spec, [first, second]);
        assert.equal(document.info.title, "Second overlay");
        assert.equal(document.info["x-origin"], "second");
        assert.equal(document.paths["/health"].get.deprecated, false);
        """,
    )


def test_generator_consumes_overlay_and_writes_public_artifacts(tmp_path):
    """The generator accepts overlays and emits route and type files together."""
    consumer = _consumer_with_packages(
        tmp_path, "@counterfact/generator", "@counterfact/openapi", "@counterfact/types"
    )
    _run_node_script(
        consumer,
        """
        import assert from "node:assert/strict";
        import { access, readFile, writeFile } from "node:fs/promises";
        import path from "node:path";
        import { CodeGenerator } from "@counterfact/generator";

        const spec = path.resolve("source.yaml");
        const overlay = path.resolve("overlay.yaml");
        const output = path.resolve("generated");
        await writeFile(spec, `openapi: 3.0.3
        info: { title: Generator consumer, version: 1.0.0 }
        paths:
          /old:
            get:
              operationId: getOld
              responses: { "200": { description: old } }
        `);
        await writeFile(overlay, `overlay: 1.0.0
        actions:
          - target: $.paths
            update:
              /new:
                get:
                  operationId: getNew
                  responses: { "200": { description: new } }
          - target: $.paths['/old']
            remove: true
        `);

        await new CodeGenerator(spec, output, { routes: true, types: true }, "", [overlay]).generate();
        const route = await readFile(path.join(output, "routes", "new.ts"), "utf8");
        const types = await readFile(path.join(output, "types", "paths", "new.types.ts"), "utf8");
        assert.match(route, /export const GET/);
        assert.match(types, /export type getNew/);
        await access(path.join(output, "counterfact-types", "index.ts"));
        await assert.rejects(access(path.join(output, "routes", "old.ts")));
        """,
    )


def test_client_calls_multi_spec_counterfact_facade_runtime(tmp_path):
    """A public client can call two live facade-hosted specs under prefixes."""
    consumer = _consumer_with_packages(
        tmp_path,
        "counterfact",
        "@counterfact/client",
        "@counterfact/generator",
        "@counterfact/openapi",
        "@counterfact/repl",
        "@counterfact/runtime",
        "@counterfact/types",
    )
    _run_node_script(
        consumer,
        """
        import assert from "node:assert/strict";
        import net from "node:net";
        import { mkdir, writeFile } from "node:fs/promises";
        import path from "node:path";
        import { RawHttpClient } from "@counterfact/client";
        import { counterfact } from "counterfact";

        const port = await new Promise((resolve, reject) => {
          const reservation = net.createServer();
          reservation.once("error", reject);
          reservation.listen(0, "127.0.0.1", () => {
            const address = reservation.address();
            if (!address || typeof address === "string") reject(new Error("Expected TCP port"));
            else reservation.close((error) => error ? reject(error) : resolve(address.port));
          });
        });
        const basePath = path.resolve("api");
        const firstSpec = path.resolve("one.yaml");
        const secondSpec = path.resolve("two.yaml");
        await Promise.all([
          mkdir(path.join(basePath, "one", "routes"), { recursive: true }),
          mkdir(path.join(basePath, "one", ".cache"), { recursive: true }),
          mkdir(path.join(basePath, "two", "routes"), { recursive: true }),
          mkdir(path.join(basePath, "two", ".cache"), { recursive: true }),
          writeFile(firstSpec, `openapi: 3.0.3
info: { title: One, version: 1.0.0 }
paths: { /ping: { get: { responses: { "200": { description: ok } } } } }
`),
          writeFile(secondSpec, `openapi: 3.0.3
info: { title: Two, version: 1.0.0 }
paths: { /ping: { get: { responses: { "200": { description: ok } } } } }
`),
        ]);
        const routeFiles = [
          ["one", "one"], ["two", "two"],
        ].flatMap(([group, body]) => [
          writeFile(path.join(basePath, group, "routes", "ping.js"),
            `export function GET() { return { body: "${body}", contentType: "text/plain", status: 200 }; }\n`),
          writeFile(path.join(basePath, group, ".cache", "ping.cjs"),
            `exports.GET = () => ({ body: "${body}", contentType: "text/plain", status: 200 });\n`),
        ]);
        await Promise.all(routeFiles);

        const config = {
          alwaysFakeOptionals: false, basePath, buildCache: false,
          generate: { routes: false, types: false }, openApiPath: firstSpec,
          port, prefix: "", proxyPaths: new Map(), proxyUrl: "",
          startRepl: false, startServer: true, validateRequests: true,
          validateResponses: true, watch: { routes: false, types: false },
        };
        const simulator = await counterfact(config, [
          { source: firstSpec, prefix: "/one", group: "one" },
          { source: secondSpec, prefix: "/two", group: "two" },
        ]);
        const running = await simulator.start(config);
        try {
          const client = new RawHttpClient("127.0.0.1", port);
          assert.ok((await client.get("/one/ping")).endsWith("one"));
          assert.ok((await client.get("/two/ping")).endsWith("two"));
        } finally {
          await running.stop();
        }
        """,
        timeout=90,
    )


def test_facade_reexports_runtime_msw_handler_api(tmp_path):
    """The facade's MSW re-exports register and dispatch an intercepted route."""
    consumer = _consumer_with_packages(
        tmp_path,
        "counterfact",
        "@counterfact/client",
        "@counterfact/generator",
        "@counterfact/openapi",
        "@counterfact/repl",
        "@counterfact/runtime",
        "@counterfact/types",
    )
    _run_node_script(
        consumer,
        """
        import assert from "node:assert/strict";
        import { writeFile } from "node:fs/promises";
        import path from "node:path";
        import { createMswHandlers, handleMswRequest } from "counterfact";

        const spec = path.resolve("msw.yaml");
        await writeFile(spec, `openapi: 3.0.3
info: { title: MSW, version: 1.0.0 }
paths: { /health: { get: { responses: { "200": { description: ok } } } } }
`);
        class ConsumerModuleLoader {
          constructor(_basePath, registry) { this.registry = registry; }
          async load() {
            this.registry.add("/health", { get: () => ({ body: "intercepted", contentType: "text/plain", status: 200 }) });
          }
        }
        const config = {
          alwaysFakeOptionals: false, basePath: path.resolve("modules"),
          buildCache: false, generate: { routes: false, types: false },
          openApiPath: spec, port: 0, prefix: "", proxyPaths: new Map(), proxyUrl: "",
          startRepl: false, startServer: false, validateRequests: true,
          validateResponses: true, watch: { routes: false, types: false },
        };
        assert.deepEqual(await createMswHandlers(config, ConsumerModuleLoader), [{ method: "get", path: "/health" }]);
        const response = await handleMswRequest({
          method: "get", rawPath: "/health", path: "/health", body: undefined,
          headers: {}, query: {}, req: {},
        });
        assert.deepEqual(response, { body: "intercepted", contentType: "text/plain", status: 200 });
        """,
    )


def test_runtime_koa_export_serves_a_public_runtime_runner(tmp_path):
    """The Koa subpath export bridges a public runtime runner to real HTTP."""
    consumer = _consumer_with_packages(tmp_path, "@counterfact/runtime", "@counterfact/openapi", "@counterfact/types")
    _run_node_script(
        consumer,
        """
        import assert from "node:assert/strict";
        import { writeFile } from "node:fs/promises";
        import path from "node:path";
        import { ContextRegistry, Registry } from "@counterfact/runtime";
        import { createKoaApp } from "@counterfact/runtime/koa";

        const spec = path.resolve("koa.yaml");
        await writeFile(spec, `openapi: 3.0.3
info: { title: Koa, version: 1.0.0 }
paths: { /health: { get: { responses: { "200": { description: ok } } } } }
`);
        const registry = new Registry();
        registry.add("/health", { GET() {} });
        const dispatcher = {
          registry,
          async request(request) {
            return { body: { method: request.method, path: request.path }, status: 200 };
          },
        };
        const app = createKoaApp({
          runners: [{ contextRegistry: new ContextRegistry(), dispatcher, openApiPath: spec, overlays: [], prefix: "/v1", registry, subdirectory: "" }],
          config: { port: 0, proxyPaths: new Map(), proxyUrl: "", startAdminApi: false },
        });
        const server = app.listen(0, "127.0.0.1");
        await new Promise((resolve) => server.once("listening", resolve));
        try {
          const address = server.address();
          assert(address && typeof address !== "string");
          const response = await fetch(`http://127.0.0.1:${address.port}/v1/health`);
          assert.equal(response.status, 200);
          assert.equal(response.headers.get("access-control-allow-origin"), "*");
          assert.deepEqual(await response.json(), { method: "GET", path: "/health" });
        } finally {
          await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        }
        """,
    )


def test_repl_completer_combines_client_catalog_and_runtime_scenarios(tmp_path):
    """REPL completion joins client OpenAPI paths with grouped runtime scenarios."""
    consumer = _consumer_with_packages(
        tmp_path, "@counterfact/client", "@counterfact/repl", "@counterfact/runtime", "@counterfact/openapi", "@counterfact/types"
    )
    _run_node_script(
        consumer,
        """
        import assert from "node:assert/strict";
        import { createOpenApiRouteCatalog } from "@counterfact/client";
        import { createCompleter } from "@counterfact/repl";
        import { ScenarioRegistry } from "@counterfact/runtime";

        const catalog = createOpenApiRouteCatalog({ paths: { "/pets/{petId}": { get: {} } } });
        const pets = new ScenarioRegistry();
        pets.add("index", { reset() {}, seed() {} });
        const orders = new ScenarioRegistry();
        orders.add("index", { clear() {} });
        const completer = createCompleter({ routes: [{ methods: {}, path: "/fallback" }] }, undefined, catalog, undefined, { pets, orders });
        const complete = (line) => new Promise((resolve, reject) => completer(line, (error, value) => error ? reject(error) : resolve(value)));
        assert.deepEqual(await complete('route("/pe'), [["/pets/{petId}"], "/pe"]);
        assert.deepEqual(await complete(".scenario p"), [["pets"], "p"]);
        assert.deepEqual(await complete(".scenario pets re"), [["reset"], "re"]);
        """,
    )


def test_types_package_declarations_compile_in_a_consumer_project(tmp_path):
    """Public type declarations remain usable from a separate consumer project."""
    consumer = _consumer_with_packages(tmp_path, "@counterfact/types")
    (consumer / "typecheck.ts").write_text(
        textwrap.dedent(
            """
            import type { Middleware, OpenApiOperation, ResponseBuilder } from "@counterfact/types";

            const operation: OpenApiOperation = {
              responses: { 200: { content: { "application/json": { schema: { type: "object" } } } } },
            };
            const middleware: Middleware<{ authenticated: boolean }> = async ($, respondTo) => {
              if (!$.context.authenticated) return $.response[401].json({ error: "unauthorized" });
              return respondTo($);
            };
            declare const response: ResponseBuilder;
            const sent: ResponseBuilder = response.header("x-consumer", "yes").json({ operation, middleware });
            void sent;
            """
        )
    )
    result = subprocess.run(
        [
            "node",
            REPO_ROOT / "node_modules" / "typescript" / "bin" / "tsc",
            "--noEmit",
            "--module",
            "NodeNext",
            "--moduleResolution",
            "NodeNext",
            "--target",
            "ES2022",
            "typecheck.ts",
        ],
        cwd=consumer,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, (
        f"TypeScript consumer failed with exit code {result.returncode}\n"
        f"stdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )
