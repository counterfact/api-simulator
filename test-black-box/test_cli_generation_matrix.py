"""Black-box coverage for CLI configuration, generation, and serving."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

import requests


REPO_ROOT = Path(__file__).resolve().parents[1]
COUNTERFACT_BIN = REPO_ROOT / "packages" / "counterfact" / "bin" / "counterfact.js"


def _write(path, document):
    Path(path).write_text(json.dumps(document), encoding="utf-8")


def _run(*args, cwd):
    return subprocess.run(
        ["node", str(COUNTERFACT_BIN), *map(str, args)],
        cwd=cwd,
        timeout=30,
        check=False,
        capture_output=True,
        text=True,
    )


def _start(*args, cwd, log_path):
    log_file = open(log_path, "w", encoding="utf-8")  # noqa: SIM115
    process = subprocess.Popen(
        ["node", str(COUNTERFACT_BIN), *map(str, args)],
        cwd=cwd,
        env={**os.environ, "CHOKIDAR_USEPOLLING": "1"},
        stdout=log_file,
        stderr=log_file,
    )
    return process, log_file


def _wait_for_ok(url, process, log_path):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            response = requests.get(url, timeout=2)
            if response.status_code == 200:
                return response
        except requests.RequestException:
            pass
        if process.poll() is not None:
            break
        time.sleep(0.25)
    logs = Path(log_path).read_text(encoding="utf-8")
    raise AssertionError(f"Server did not return 200 from {url}.\n{logs}")


def _stop(process, log_file):
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
    log_file.close()


def _text_response(value):
    return {
        "description": "ok",
        "content": {
            "text/plain": {
                "schema": {"type": "string"},
                "examples": {"default": {"value": value}},
            }
        },
    }


def test_swagger_2_spec_generates_and_serves_a_response():
    """A Swagger 2.0 document supports the full CLI generate-and-serve flow."""
    port = 3131
    with tempfile.TemporaryDirectory(prefix="counterfact-swagger-2-") as temp_dir:
        spec, output, log_path = (Path(temp_dir) / name for name in ("swagger.json", "out", "server.log"))
        _write(
            spec,
            {
                "swagger": "2.0",
                "info": {"title": "Legacy API", "version": "1"},
                "produces": ["text/plain"],
                "paths": {
                    "/legacy-ping": {
                        "get": {
                            "responses": {
                                "200": {
                                    "description": "ok",
                                    "schema": {
                                        "type": "string",
                                        "enum": ["legacy-pong"],
                                    },
                                }
                            }
                        }
                    }
                },
            },
        )
        process, log_file = _start(spec, output, "--port", port, "--generate", "--build-cache", "--serve", cwd=temp_dir, log_path=log_path)
        try:
            response = _wait_for_ok(f"http://localhost:{port}/legacy-ping", process, log_path)
            assert response.text == "legacy-pong"
            assert (output / "routes" / "legacy-ping.ts").exists()
            assert (output / ".cache" / "legacy-ping.cjs").exists()
        finally:
            _stop(process, log_file)


def test_external_reference_is_loaded_for_generation_and_runtime():
    """A local external schema reference is dereferenced for code and responses."""
    port = 3132
    with tempfile.TemporaryDirectory(prefix="counterfact-external-ref-") as temp_dir:
        spec, schemas, output, log_path = (Path(temp_dir) / name for name in ("openapi.json", "schemas.json", "out", "server.log"))
        _write(schemas, {"Pet": {"type": "object", "required": ["id", "name"], "properties": {"id": {"type": "string", "example": "external-id"}, "name": {"type": "string", "example": "external-name"}}}})
        _write(spec, {"openapi": "3.0.3", "info": {"title": "External references", "version": "1"}, "paths": {"/pet": {"get": {"responses": {"200": {"description": "ok", "content": {"application/json": {"schema": {"$ref": "./schemas.json#/Pet"}}}}}}}}})
        process, log_file = _start(spec, output, "--port", port, "--generate", "--build-cache", "--serve", cwd=temp_dir, log_path=log_path)
        try:
            response = _wait_for_ok(f"http://localhost:{port}/pet", process, log_path)
            assert response.json() == {"id": "external-id", "name": "external-name"}
            assert (output / "types" / "paths" / "pet.types.ts").exists()
        finally:
            _stop(process, log_file)


def test_ordered_overlays_apply_in_cli_order_before_serving():
    """Repeated --overlay flags compose in order, with the last update visible."""
    port = 3133
    with tempfile.TemporaryDirectory(prefix="counterfact-overlay-order-") as temp_dir:
        spec, first, second, output, log_path = (Path(temp_dir) / name for name in ("openapi.json", "first.json", "second.json", "out", "server.log"))
        _write(spec, {"openapi": "3.0.3", "info": {"title": "Overlay order", "version": "1"}, "paths": {"/greeting": {"get": {"responses": {"200": _text_response("original")}}}}})
        target = "$.paths['/greeting'].get.responses['200'].content['text/plain'].examples.default"
        _write(first, {"overlay": "1.0.0", "info": {"title": "First", "version": "1"}, "actions": [{"target": target, "update": {"value": "first"}}]})
        _write(second, {"overlay": "1.0.0", "info": {"title": "Second", "version": "1"}, "actions": [{"target": target, "update": {"value": "second"}}]})
        process, log_file = _start(spec, output, "--port", port, "--generate", "--build-cache", "--serve", "--overlay", first, "--overlay", second, cwd=temp_dir, log_path=log_path)
        try:
            response = _wait_for_ok(f"http://localhost:{port}/greeting", process, log_path)
            assert response.text == "second"
        finally:
            _stop(process, log_file)


def test_prefix_serves_routes_only_below_configured_base_path():
    """The CLI --prefix option mounts generated routes under its base path."""
    port = 3134
    with tempfile.TemporaryDirectory(prefix="counterfact-prefix-") as temp_dir:
        spec, output, log_path = (Path(temp_dir) / name for name in ("openapi.json", "out", "server.log"))
        _write(spec, {"openapi": "3.0.3", "info": {"title": "Prefixed API", "version": "1"}, "paths": {"/ready": {"get": {"responses": {"200": _text_response("prefixed-ready")}}}}})
        process, log_file = _start(spec, output, "--port", port, "--prefix", "/api/v9", "--generate", "--build-cache", "--serve", cwd=temp_dir, log_path=log_path)
        try:
            response = _wait_for_ok(f"http://localhost:{port}/api/v9/ready", process, log_path)
            assert response.text == "prefixed-ready"
            assert requests.get(f"http://localhost:{port}/ready", timeout=10).status_code == 404
        finally:
            _stop(process, log_file)


def test_multi_spec_config_uses_cli_port_override_for_both_apis():
    """A multi-spec config honors a CLI port override while serving both APIs."""
    config_port, cli_port = 3135, 3136
    with tempfile.TemporaryDirectory(prefix="counterfact-multi-config-") as temp_dir:
        first, second, config, log_path = (Path(temp_dir) / name for name in ("orders.json", "catalog.json", "counterfact.json", "server.log"))
        _write(first, {"openapi": "3.0.3", "info": {"title": "Orders", "version": "1"}, "paths": {"/health": {"get": {"responses": {"200": _text_response("orders-ok")}}}}})
        _write(second, {"openapi": "3.0.3", "info": {"title": "Catalog", "version": "1"}, "paths": {"/health": {"get": {"responses": {"200": _text_response("catalog-ok")}}}}})
        _write(config, {"spec": [{"source": str(first), "prefix": "/orders", "group": "orders"}, {"source": str(second), "prefix": "/catalog", "group": "catalog"}], "destination": "out", "port": config_port, "generate": True, "buildCache": True, "serve": True})
        process, log_file = _start("--config", config, "--port", cli_port, cwd=temp_dir, log_path=log_path)
        try:
            orders = _wait_for_ok(f"http://localhost:{cli_port}/orders/health", process, log_path)
            catalog = _wait_for_ok(f"http://localhost:{cli_port}/catalog/health", process, log_path)
            assert orders.text == "orders-ok"
            assert catalog.text == "catalog-ok"
            assert not (Path(temp_dir) / "out" / "routes" / "health.ts").exists()
        finally:
            _stop(process, log_file)


def test_prune_removes_generated_route_absent_from_updated_spec():
    """--prune removes an obsolete generated route after an OpenAPI update."""
    with tempfile.TemporaryDirectory(prefix="counterfact-prune-") as temp_dir:
        spec, output = (Path(temp_dir) / name for name in ("openapi.json", "out"))
        _write(spec, {"openapi": "3.0.3", "info": {"title": "Pruning API", "version": "1"}, "paths": {"/obsolete": {"get": {"responses": {"200": _text_response("obsolete")}}}}})
        first = _run(spec, output, "--generate", cwd=temp_dir)
        assert first.returncode == 0, first.stderr
        obsolete_route = output / "routes" / "obsolete.ts"
        assert obsolete_route.exists()
        _write(spec, {"openapi": "3.0.3", "info": {"title": "Pruning API", "version": "1"}, "paths": {}})
        second = _run(spec, output, "--generate", "--prune", cwd=temp_dir)
        assert second.returncode == 0, second.stderr
        assert not obsolete_route.exists()
