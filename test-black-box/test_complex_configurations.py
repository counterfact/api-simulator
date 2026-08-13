"""Black-box coverage for multi-spec Counterfact configurations.

Each test starts the packaged CLI and observes its HTTP interface.  The specs,
configuration, generated files, and server process are isolated in a temporary
directory so the test does not depend on implementation internals.
"""

from contextlib import contextmanager
import os
import shutil
import socket
import subprocess
import tempfile
import time

import requests


TEST_BLACK_BOX_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TEST_BLACK_BOX_DIR)
COUNTERFACT_BIN = os.path.join(
    REPO_ROOT, "packages", "counterfact", "bin", "counterfact.js"
)
REQUEST_TIMEOUT = 10


def _free_port():
    """Reserve a currently unused local port for one short-lived test server."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _write_spec(path, title, paths):
    """Write a minimal OpenAPI document with text responses for each operation."""
    lines = [
        "openapi: 3.0.3",
        "info:",
        f"  title: {title}",
        "  version: '1.0.0'",
        "paths:",
    ]
    for route, operations in paths.items():
        lines.append(f"  {route}:")
        for method, response_text in operations.items():
            lines.extend(
                [
                    f"    {method}:",
                    "      responses:",
                    "        '200':",
                    "          description: ok",
                    "          content:",
                    "            text/plain:",
                    "              schema:",
                    "                type: string",
                    "              examples:",
                    "                default:",
                    f"                  value: {response_text}",
                ]
            )
    with open(path, "w") as spec_file:
        spec_file.write("\n".join(lines) + "\n")


def _write_config(path, specs, port):
    """Write the CLI configuration for a generated and served multi-spec API."""
    lines = ["spec:"]
    for spec in specs:
        lines.extend([f"  - source: {spec['source']}"])
        for key in ("group", "version", "prefix"):
            if key in spec:
                lines.append(f"    {key}: {spec[key]}")
    lines.extend(
        [
            "destination: out",
            f"port: {port}",
            "serve: true",
            "generate: true",
            "buildCache: true",
        ]
    )
    with open(path, "w") as config_file:
        config_file.write("\n".join(lines) + "\n")


def _wait_for_server(base_url, log_path, timeout=30):
    """Wait until Counterfact responds over HTTP or show its startup log."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            requests.get(f"{base_url}/counterfact/health", timeout=2)
            return
        except requests.exceptions.RequestException:
            pass
        time.sleep(0.2)
    with open(log_path) as log_file:
        log_contents = log_file.read()
    raise TimeoutError(f"Counterfact did not start within {timeout} seconds:\n{log_contents}")


@contextmanager
def _running_multi_spec_server(specifications):
    """Start a configured server and always terminate it and its temp directory."""
    temp_dir = tempfile.mkdtemp(prefix="counterfact-complex-config-")
    process = None
    log_file = None
    try:
        specs = []
        for name, title, paths, options in specifications:
            spec_path = os.path.join(temp_dir, f"{name}.yaml")
            _write_spec(spec_path, title, paths)
            specs.append({"source": spec_path, **options})

        port = _free_port()
        config_path = os.path.join(temp_dir, "counterfact.yaml")
        _write_config(config_path, specs, port)
        log_path = os.path.join(temp_dir, "server.log")
        log_file = open(log_path, "w")  # noqa: SIM115
        process = subprocess.Popen(
            ["node", COUNTERFACT_BIN, "--config", config_path],
            cwd=temp_dir,
            env={**os.environ, "CHOKIDAR_USEPOLLING": "1"},
            stdout=log_file,
            stderr=log_file,
        )
        base_url = f"http://127.0.0.1:{port}"
        _wait_for_server(base_url, log_path)
        yield base_url, temp_dir
    finally:
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        if log_file is not None:
            log_file.close()
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_shared_root_prefix_falls_through_to_later_spec():
    """Distinct root-mounted specs retain both canonical paths."""
    with _running_multi_spec_server(
        [
            ("customers", "Customers", {"/customers": {"get": "customers"}}, {"group": "customers"}),
            ("products", "Products", {"/products": {"get": "products"}}, {"group": "products"}),
        ]
    ) as (base_url, _):
        customers = requests.get(f"{base_url}/customers", timeout=REQUEST_TIMEOUT)
        products = requests.get(f"{base_url}/products", timeout=REQUEST_TIMEOUT)

    assert customers.status_code == 200
    assert customers.text == "customers"
    assert products.status_code == 200
    assert products.text == "products"


def test_shared_path_routes_to_spec_that_supports_requested_method():
    """Specs sharing a path cooperate when each declares a different method."""
    with _running_multi_spec_server(
        [
            ("read", "Read", {"/orders": {"get": "listed"}}, {"group": "read"}),
            ("write", "Write", {"/orders": {"post": "created"}}, {"group": "write"}),
        ]
    ) as (base_url, _):
        listed = requests.get(f"{base_url}/orders", timeout=REQUEST_TIMEOUT)
        created = requests.post(f"{base_url}/orders", timeout=REQUEST_TIMEOUT)

    assert listed.status_code == 200
    assert listed.text == "listed"
    assert created.status_code == 200
    assert created.text == "created"


def test_shared_path_combines_allow_headers_across_specs():
    """A cross-spec method mismatch advertises every declared operation."""
    with _running_multi_spec_server(
        [
            ("read", "Read", {"/orders": {"get": "listed"}}, {"group": "read"}),
            ("write", "Write", {"/orders": {"post": "created"}}, {"group": "write"}),
        ]
    ) as (base_url, _):
        response = requests.put(f"{base_url}/orders", timeout=REQUEST_TIMEOUT)

    assert response.status_code == 405
    assert set(response.headers["allow"].split(", ")) == {"GET", "POST"}


def test_first_declared_spec_wins_for_same_path_and_method():
    """Declaration order resolves otherwise identical operations deterministically."""
    with _running_multi_spec_server(
        [
            ("primary", "Primary", {"/status": {"get": "first"}}, {"group": "primary"}),
            ("secondary", "Secondary", {"/status": {"get": "second"}}, {"group": "secondary"}),
        ]
    ) as (base_url, _):
        response = requests.get(f"{base_url}/status", timeout=REQUEST_TIMEOUT)

    assert response.status_code == 200
    assert response.text == "first"


def test_three_root_specs_fall_through_in_declaration_order():
    """A third root-mounted API remains reachable after two earlier misses."""
    with _running_multi_spec_server(
        [
            ("alpha", "Alpha", {"/alpha": {"get": "alpha"}}, {"group": "alpha"}),
            ("beta", "Beta", {"/beta": {"get": "beta"}}, {"group": "beta"}),
            ("gamma", "Gamma", {"/gamma": {"get": "gamma"}}, {"group": "gamma"}),
        ]
    ) as (base_url, _):
        response = requests.get(f"{base_url}/gamma", timeout=REQUEST_TIMEOUT)

    assert response.status_code == 200
    assert response.text == "gamma"


def test_groups_do_not_change_explicit_prefix_routing():
    """Group names organize generated code without leaking into public URLs."""
    with _running_multi_spec_server(
        [
            ("billing", "Billing", {"/invoices": {"get": "invoices"}}, {"group": "billing", "prefix": "/api"}),
            ("inventory", "Inventory", {"/stock": {"get": "stock"}}, {"group": "inventory", "prefix": "/api"}),
        ]
    ) as (base_url, _):
        invoices = requests.get(f"{base_url}/api/invoices", timeout=REQUEST_TIMEOUT)
        stock = requests.get(f"{base_url}/api/stock", timeout=REQUEST_TIMEOUT)
        group_path = requests.get(f"{base_url}/billing/invoices", timeout=REQUEST_TIMEOUT)

    assert invoices.text == "invoices"
    assert stock.text == "stock"
    assert group_path.status_code == 404


def test_versioned_specs_share_grouped_routes_at_distinct_prefixes():
    """Versioned specs generate one group and serve both versioned public URLs."""
    with _running_multi_spec_server(
        [
            ("catalog-v1", "Catalog v1", {"/items": {"get": "v1-items"}}, {"group": "catalog", "version": "v1", "prefix": "/api/v1"}),
            ("catalog-v2", "Catalog v2", {"/items": {"get": "v2-items"}}, {"group": "catalog", "version": "v2", "prefix": "/api/v2"}),
        ]
    ) as (base_url, temp_dir):
        first = requests.get(f"{base_url}/api/v1/items", timeout=REQUEST_TIMEOUT)
        second = requests.get(f"{base_url}/api/v2/items", timeout=REQUEST_TIMEOUT)
        shared_routes = os.path.join(temp_dir, "out", "catalog", "routes", "items.ts")
        versions = os.path.join(temp_dir, "out", "catalog", "types", "versions.ts")

        assert os.path.exists(shared_routes)
        assert os.path.exists(versions)

    assert first.status_code == 200
    assert first.text == "v1-items"
    assert second.status_code == 200
    assert second.text == "v2-items"
