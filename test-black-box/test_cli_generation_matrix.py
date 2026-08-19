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
