"""Black-box tests for Counterfact.

These tests run counterfact as an external process and verify its behaviour
from the outside — no knowledge of internals required.
"""

import base64
import os
import shutil
import subprocess
import tempfile
import time

import pytest
import requests

BASE_URL = "http://localhost:3100"
TEST_BLACK_BOX_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TEST_BLACK_BOX_DIR)
OPENAPI_SPEC = os.path.join(TEST_BLACK_BOX_DIR, "openapi.yaml")

REQUEST_TIMEOUT = 10


def wait_for_url(url, timeout=30):
    """Poll a URL until it returns HTTP 200 or the timeout is reached."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            response = requests.get(url, timeout=2)
            if response.status_code == 200:
                return
        except requests.exceptions.RequestException:
            pass
        time.sleep(0.5)
    raise TimeoutError(f"{url} did not return HTTP 200 within {timeout} seconds")


def test_home_page(server):
    """The Swagger UI is served at /counterfact/swagger."""
    response = requests.get(f"{BASE_URL}/counterfact/swagger", timeout=REQUEST_TIMEOUT)
    assert response.status_code == 200


def test_creates_route_file_for_ping(server):
    """A TypeScript route file is generated for every path in the spec."""
    out_dir = server["out_dir"]
    ping_file = os.path.join(out_dir, "routes", "ping.ts")
    assert os.path.exists(ping_file), f"Expected generated file at {ping_file}"
    with open(ping_file) as f:
        content = f.read()
    assert "export const GET" in content


def test_compiles_route_file(server):
    """Generated TypeScript route files are compiled to .cjs for hot-reload."""
    out_dir = server["out_dir"]
    ping_cjs = os.path.join(out_dir, ".cache", "ping.cjs")
    assert os.path.exists(ping_cjs), f"Expected compiled cache file at {ping_cjs}"


def test_ping_returns_pong(server):
    """GET /ping returns the expected 'pong' response."""
    response = requests.get(f"{BASE_URL}/ping", timeout=REQUEST_TIMEOUT)
    assert response.status_code == 200
    assert response.text == "pong"


def test_items_returns_list(server):
    """GET /items returns the expected JSON array."""
    response = requests.get(f"{BASE_URL}/items", timeout=REQUEST_TIMEOUT)
    assert response.status_code == 200
    assert response.json() == ["apple", "banana", "cherry"]


def test_handles_path_with_colon(server):
    """Paths containing a colon are handled correctly."""
    response = requests.get(f"{BASE_URL}/path/with:colon", timeout=REQUEST_TIMEOUT)
    assert response.status_code == 200
    assert response.text == "colon handled"


def test_disallowed_method_returns_allow_header(server):
    """A known path rejects unsupported methods and advertises allowed ones."""
    response = requests.post(f"{BASE_URL}/ping", timeout=REQUEST_TIMEOUT)
    assert response.status_code == 405
    assert response.headers.get("allow") == "GET"
    assert response.text == "The POST method is not allowed for /ping\n"


def test_unacceptable_response_media_type_returns_not_acceptable(server):
    """A route returns HTTP 406 when it cannot satisfy the Accept header."""
    response = requests.get(
        f"{BASE_URL}/items",
        headers={"Accept": "text/plain"},
        timeout=REQUEST_TIMEOUT,
    )
    assert response.status_code == 406
    assert response.text == (
        "Not Acceptable: could not produce a response matching any of the "
        "following content types: text/plain"
    )


def test_required_header_validation_is_case_insensitive(server):
    """Required headers accept HTTP's case-insensitive field names."""
    missing_header = requests.get(f"{BASE_URL}/guard", timeout=REQUEST_TIMEOUT)
    assert missing_header.status_code == 400
    assert "header parameter 'X-Trace-ID' is required" in missing_header.text

    lowercase_header = requests.get(
        f"{BASE_URL}/guard",
        headers={"x-trace-id": "trace-1"},
        timeout=REQUEST_TIMEOUT,
    )
    assert lowercase_header.status_code == 200
    assert lowercase_header.text == "trace accepted"


def test_request_body_validation_rejects_invalid_json(server):
    """Invalid JSON bodies are rejected before valid requests reach the route."""
    invalid_body = requests.post(
        f"{BASE_URL}/widgets",
        json={},
        timeout=REQUEST_TIMEOUT,
    )
    assert invalid_body.status_code == 400
    assert "body must have required property 'name'" in invalid_body.text

    valid_body = requests.post(
        f"{BASE_URL}/widgets",
        json={"name": "example widget"},
        timeout=REQUEST_TIMEOUT,
    )
    assert valid_body.status_code == 200
    assert valid_body.text == "accepted"


def test_spec_flag_generates_route_files():
    """The --spec flag allows passing the OpenAPI spec path as a named option."""
    temp_dir = tempfile.mkdtemp(prefix="counterfact-spec-test-")
    try:
        counterfact_bin = os.path.join(
            REPO_ROOT, "packages", "counterfact", "bin", "counterfact.js"
        )
        result = subprocess.run(
            [
                "node",
                counterfact_bin,
                "--spec",
                OPENAPI_SPEC,
                temp_dir,
                "--generate",
            ],
            timeout=30,
            check=False,
        )
        assert result.returncode in (0, None), (
            f"Process exited with unexpected code {result.returncode}"
        )
        ping_file = os.path.join(temp_dir, "routes", "ping.ts")
        assert os.path.exists(ping_file), f"Expected generated file at {ping_file}"
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.mark.skipif(os.name == "nt", reason="Windows does not provide pty")
def test_repl_autocompletes_routes_from_the_cli():
    """The CLI REPL autocompletes initial and live-reloaded API paths."""
    import pty
    import select
    import signal

    temp_dir = tempfile.mkdtemp(prefix="counterfact-repl-autocomplete-")
    openapi_spec = os.path.join(temp_dir, "openapi.yaml")
    shutil.copyfile(OPENAPI_SPEC, openapi_spec)
    counterfact_bin = os.path.join(
        REPO_ROOT, "packages", "counterfact", "bin", "counterfact.js"
    )
    command = [
        "node",
        counterfact_bin,
        openapi_spec,
        os.path.join(temp_dir, "out"),
        "--port",
        "0",
        "--generate",
        "--serve",
        "--repl",
        "--no-update-check",
    ]
    environment = {
        **os.environ,
        "CHOKIDAR_USEPOLLING": "1",
        "COUNTERFACT_TELEMETRY_DISABLED": "true",
        "TERM": "xterm-256color",
    }
    process_id, terminal = pty.fork()

    if process_id == 0:
        os.execvpe(command[0], command, environment)

    output = bytearray()

    def read_until(expected, timeout):
        deadline = time.monotonic() + timeout
        while expected not in output and time.monotonic() < deadline:
            readable, _, _ = select.select([terminal], [], [], 0.25)
            if not readable:
                continue
            try:
                output.extend(os.read(terminal, 4096))
            except OSError:
                break
        return expected in output

    try:
        prompt = "⬣> ".encode()
        assert read_until(prompt, 30), output.decode(errors="replace")

        os.write(terminal, b'client.get("/\t')
        time.sleep(0.2)
        os.write(terminal, b"\t")

        assert read_until(b"/ping", 5), output.decode(errors="replace")
        assert b'client.get("/' in output
        assert b"/items" in output

        with open(openapi_spec, "a") as spec:
            spec.write(
                "\n  /late-route:\n"
                "    get:\n"
                "      responses:\n"
                '        "200":\n'
                "          description: Added after the REPL opened\n"
            )

        reload_deadline = time.monotonic() + 10
        while b"/late-route" not in output and time.monotonic() < reload_deadline:
            os.write(terminal, b"\x03")
            time.sleep(0.1)
            os.write(terminal, b'client.get("/l\t')
            read_until(b"/late-route", 0.75)

        assert b"/late-route" in output, output.decode(errors="replace")
    finally:
        try:
            os.write(terminal, b"\x04")
        except OSError:
            pass
        try:
            os.kill(process_id, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            os.waitpid(process_id, 0)
        except ChildProcessError:
            pass
        os.close(terminal)
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_binary_response(server):
    """GET /binary-file returns binary data with application/octet-stream content type.

    The generated handler is replaced with one that calls $.response[200].binary()
    with a base64-encoded payload.  After hot-reload picks up the change, the
    server should serve the decoded bytes with the correct Content-Type header.
    """
    out_dir = server["out_dir"]
    route_file = os.path.join(out_dir, "routes", "binary-file.ts")

    binary_data = b"hello binary"
    base64_data = base64.b64encode(binary_data).decode("ascii")

    with open(route_file, "w") as f:
        f.write(
            'import type { HTTP_GET } from "counterfact";\n\n'
            "export const GET: HTTP_GET = ($) => {\n"
            f'  return $.response[200].binary("{base64_data}");\n'
            "};\n"
        )

    # Poll until the hot-reloaded handler serves the expected binary body.
    deadline = time.monotonic() + 30
    response = None
    while time.monotonic() < deadline:
        try:
            response = requests.get(f"{BASE_URL}/binary-file", timeout=REQUEST_TIMEOUT)
            if (
                response.status_code == 200
                and response.content == binary_data
            ):
                break
        except requests.exceptions.RequestException:
            pass
        time.sleep(0.5)

    assert response is not None, "No response received from /binary-file"
    assert response.status_code == 200
    assert "application/octet-stream" in response.headers.get("content-type", "")
    assert response.content == binary_data


def test_multiple_api_config_serves_prefixed_routes():
    """A config with multiple specs serves each API under its configured prefix."""
    temp_dir = tempfile.mkdtemp(prefix="counterfact-multi-api-serve-")
    try:
        counterfact_bin = os.path.join(
            REPO_ROOT, "packages", "counterfact", "bin", "counterfact.js"
        )
        second_spec = os.path.join(temp_dir, "openapi-two.yaml")
        with open(second_spec, "w") as f:
            f.write(
                "openapi: 3.0.3\n"
                "info:\n"
                "  title: API Two\n"
                "  version: '1.0.0'\n"
                "paths:\n"
                "  /ping:\n"
                "    get:\n"
                "      responses:\n"
                "        '200':\n"
                "          description: ok\n"
                "          content:\n"
                "            text/plain:\n"
                "              schema:\n"
                "                type: string\n"
                "                enum:\n"
                "                  - pong-two\n"
            )

        config_path = os.path.join(temp_dir, "counterfact.yaml")
        with open(config_path, "w") as f:
            f.write(
                "spec:\n"
                f"  - source: {OPENAPI_SPEC}\n"
                "    prefix: /api-one\n"
                "    group: one\n"
                f"  - source: {second_spec}\n"
                "    prefix: /api-two\n"
                "    group: two\n"
                "destination: out\n"
                "port: 3110\n"
                "serve: true\n"
                "generate: true\n"
                "buildCache: true\n"
            )

        log_path = os.path.join(temp_dir, "server.log")
        with open(log_path, "w") as log_file:
            process = subprocess.Popen(
                ["node", counterfact_bin, "--config", config_path],
                cwd=temp_dir,
                stdout=log_file,
                stderr=log_file,
            )
            try:
                wait_for_url("http://localhost:3110/api-one/ping")
                wait_for_url("http://localhost:3110/api-two/ping")

                response_one = requests.get(
                    "http://localhost:3110/api-one/ping",
                    timeout=REQUEST_TIMEOUT,
                )
                response_two = requests.get(
                    "http://localhost:3110/api-two/ping",
                    timeout=REQUEST_TIMEOUT,
                )
                response_unprefixed = requests.get(
                    "http://localhost:3110/ping",
                    timeout=REQUEST_TIMEOUT,
                )

                assert response_one.status_code == 200
                assert response_one.text == "pong"
                assert response_two.status_code == 200
                assert response_two.text == "pong-two"
                assert response_unprefixed.status_code == 404
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_overlay_removes_path_from_generated_routes():
    """The --overlay flag with a remove action omits the removed path from generated files."""
    temp_dir = tempfile.mkdtemp(prefix="counterfact-overlay-gen-")
    try:
        counterfact_bin = os.path.join(
            REPO_ROOT, "packages", "counterfact", "bin", "counterfact.js"
        )

        spec_path = os.path.join(temp_dir, "spec.yaml")
        with open(spec_path, "w") as f:
            f.write(
                "openapi: 3.0.3\n"
                "info:\n"
                "  title: Test API\n"
                "  version: '1.0.0'\n"
                "paths:\n"
                "  /alpha:\n"
                "    get:\n"
                "      responses:\n"
                "        '200':\n"
                "          description: ok\n"
                "          content:\n"
                "            text/plain:\n"
                "              schema:\n"
                "                type: string\n"
                "              example: alpha\n"
                "  /beta:\n"
                "    get:\n"
                "      responses:\n"
                "        '200':\n"
                "          description: ok\n"
                "          content:\n"
                "            text/plain:\n"
                "              schema:\n"
                "                type: string\n"
                "              example: beta\n"
            )

        overlay_path = os.path.join(temp_dir, "remove-beta.yaml")
        with open(overlay_path, "w") as f:
            f.write(
                "overlay: 1.0.0\n"
                "info:\n"
                "  title: Remove beta\n"
                "  version: 1.0.0\n"
                "actions:\n"
                "  - target: \"$.paths['/beta']\"\n"
                "    remove: true\n"
            )

        result = subprocess.run(
            [
                "node",
                counterfact_bin,
                spec_path,
                os.path.join(temp_dir, "out"),
                "--generate",
                "--overlay",
                overlay_path,
            ],
            cwd=temp_dir,
            timeout=30,
            check=False,
        )
        assert result.returncode == 0, (
            f"Process exited with unexpected code {result.returncode}"
        )

        alpha_file = os.path.join(temp_dir, "out", "routes", "alpha.ts")
        assert os.path.exists(alpha_file), f"Expected generated file at {alpha_file}"

        beta_file = os.path.join(temp_dir, "out", "routes", "beta.ts")
        assert not os.path.exists(beta_file), (
            f"Unexpected file at {beta_file}; overlay should have removed /beta"
        )
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_overlay_update_changes_served_response():
    """The --overlay flag with an update action changes what the server returns."""
    temp_dir = tempfile.mkdtemp(prefix="counterfact-overlay-serve-")
    overlay_port = 3120
    try:
        counterfact_bin = os.path.join(
            REPO_ROOT, "packages", "counterfact", "bin", "counterfact.js"
        )

        spec_path = os.path.join(temp_dir, "spec.yaml")
        with open(spec_path, "w") as f:
            f.write(
                "openapi: 3.0.3\n"
                "info:\n"
                "  title: Test API\n"
                "  version: '1.0.0'\n"
                "paths:\n"
                "  /greeting:\n"
                "    get:\n"
                "      responses:\n"
                "        '200':\n"
                "          description: ok\n"
                "          content:\n"
                "            application/json:\n"
                "              schema:\n"
                "                type: string\n"
                "              examples:\n"
                "                greeting:\n"
                "                  value: hello\n"
            )

        overlay_path = os.path.join(temp_dir, "change-greeting.yaml")
        with open(overlay_path, "w") as f:
            target = (
                "$.paths['/greeting'].get"
                ".responses['200']"
                ".content['application/json']"
                ".examples.greeting"
            )
            f.write(
                "overlay: 1.0.0\n"
                "info:\n"
                "  title: Change greeting\n"
                "  version: 1.0.0\n"
                "actions:\n"
                f"  - target: \"{target}\"\n"
                "    update:\n"
                "      value: hello-from-overlay\n"
            )

        log_path = os.path.join(temp_dir, "server.log")
        with open(log_path, "w") as log_file:
            process = subprocess.Popen(
                [
                    "node",
                    counterfact_bin,
                    spec_path,
                    os.path.join(temp_dir, "out"),
                    "--port",
                    str(overlay_port),
                    "--serve",
                    "--generate",
                    "--build-cache",
                    "--overlay",
                    overlay_path,
                ],
                cwd=temp_dir,
                stdout=log_file,
                stderr=log_file,
            )
            try:
                wait_for_url(
                    f"http://localhost:{overlay_port}/counterfact/swagger"
                )
                response = requests.get(
                    f"http://localhost:{overlay_port}/greeting",
                    timeout=REQUEST_TIMEOUT,
                )
                assert response.status_code == 200
                assert response.text == "hello-from-overlay"
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_multiple_api_config_generates_grouped_route_files():
    """A config with multiple specs writes each API's files under its group."""
    temp_dir = tempfile.mkdtemp(prefix="counterfact-multi-api-generate-")
    try:
        counterfact_bin = os.path.join(
            REPO_ROOT, "packages", "counterfact", "bin", "counterfact.js"
        )
        second_spec = os.path.join(temp_dir, "openapi-two.yaml")
        with open(second_spec, "w") as f:
            f.write(
                "openapi: 3.0.3\n"
                "info:\n"
                "  title: API Two\n"
                "  version: '1.0.0'\n"
                "paths:\n"
                "  /status:\n"
                "    get:\n"
                "      responses:\n"
                "        '200':\n"
                "          description: ok\n"
                "          content:\n"
                "            text/plain:\n"
                "              schema:\n"
                "                type: string\n"
                "              example: healthy\n"
            )

        config_path = os.path.join(temp_dir, "counterfact.yaml")
        with open(config_path, "w") as f:
            f.write(
                "spec:\n"
                f"  - source: {OPENAPI_SPEC}\n"
                "    group: one\n"
                f"  - source: {second_spec}\n"
                "    group: two\n"
                "destination: out\n"
                "generate: true\n"
                "buildCache: true\n"
            )

        result = subprocess.run(
            ["node", counterfact_bin, "--config", config_path],
            cwd=temp_dir,
            timeout=30,
            check=False,
        )
        assert result.returncode == 0, (
            f"Process exited with unexpected code {result.returncode}"
        )

        one_ping = os.path.join(temp_dir, "out", "one", "routes", "ping.ts")
        two_status = os.path.join(temp_dir, "out", "two", "routes", "status.ts")
        assert os.path.exists(one_ping), f"Expected generated file at {one_ping}"
        assert os.path.exists(two_status), f"Expected generated file at {two_status}"
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
