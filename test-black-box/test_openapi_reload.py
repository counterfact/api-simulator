"""Black-box tests for OpenAPI document live-reload.

These tests verify that when the OpenAPI spec file is modified on disk while
counterfact is running, the server picks up the changes — specifically that the
response-builder examples exposed by the updated spec are used for subsequent
requests.

A dedicated server process is started on port 3101 (separate from the
session-scoped server on 3100) so this test has full control over the spec
file without affecting other tests.
"""

import os
import shutil
import subprocess
import tempfile
import time

import requests

RELOAD_PORT = 3101
RELOAD_BASE_URL = f"http://localhost:{RELOAD_PORT}"
REQUEST_TIMEOUT = 10
SERVER_STARTUP_TIMEOUT = 60

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Minimal spec with a single /status endpoint whose example is "original".
INITIAL_SPEC = """\
openapi: 3.0.3
info:
  version: 1.0.0
  title: Reload Test API
paths:
  /status:
    get:
      operationId: getStatus
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: string
              examples:
                value:
                  value: original
"""

# Same spec with the example value changed to "reloaded".
UPDATED_SPEC = """\
openapi: 3.0.3
info:
  version: 1.0.0
  title: Reload Test API
paths:
  /status:
    get:
      operationId: getStatus
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: string
              examples:
                value:
                  value: reloaded
"""


def _wait_for_server(base_url: str, timeout: int = SERVER_STARTUP_TIMEOUT) -> None:
    """Poll until the server responds or the timeout is reached."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            response = requests.get(
                f"{base_url}/counterfact/swagger", timeout=2
            )
            if response.status_code == 200:
                return
        except requests.exceptions.RequestException:
            pass
        time.sleep(0.5)
    raise TimeoutError(
        f"Server at {base_url} did not start within {timeout} seconds"
    )


def test_openapi_document_reload_updates_response_examples():
    """Changes to the OpenAPI spec file are picked up without restarting.

    After the spec is rewritten with a new example value, the server should
    start returning that updated value for the next request.
    """
    temp_work_dir = tempfile.mkdtemp(prefix="counterfact-reload-test-")
    spec_path = os.path.join(temp_work_dir, "openapi.yaml")
    out_dir = os.path.join(temp_work_dir, "out")
    log_path = os.path.join(temp_work_dir, "server.log")
    counterfact_bin = os.path.join(
        REPO_ROOT, "packages", "counterfact", "bin", "counterfact.js"
    )

    # Write the initial spec.
    with open(spec_path, "w") as f:
        f.write(INITIAL_SPEC)

    log_file = open(log_path, "w")  # noqa: SIM115
    process = subprocess.Popen(
        [
            "node",
            counterfact_bin,
            spec_path,
            out_dir,
            "--port",
            str(RELOAD_PORT),
            "--serve",
            "--generate",
            "--build-cache",
        ],
        cwd=temp_work_dir,
        stdout=log_file,
        stderr=log_file,
    )

    try:
        try:
            _wait_for_server(RELOAD_BASE_URL)
        except TimeoutError:
            log_file.flush()
            try:
                with open(log_path) as f:
                    server_logs = f.read()
            except OSError:
                server_logs = "(could not read server log)"
            raise TimeoutError(
                f"Reload-test server did not start.\nServer log:\n{server_logs}"
            )

        # Verify the server responds with the original example value.
        initial_response = requests.get(
            f"{RELOAD_BASE_URL}/status", timeout=REQUEST_TIMEOUT
        )
        assert initial_response.status_code == 200
        assert initial_response.text == "original"

        # Overwrite the spec with the updated example.
        with open(spec_path, "w") as f:
            f.write(UPDATED_SPEC)

        # Poll until the server returns the updated example value.
        deadline = time.monotonic() + 30
        last_response = None
        while time.monotonic() < deadline:
            try:
                response = requests.get(
                    f"{RELOAD_BASE_URL}/status", timeout=REQUEST_TIMEOUT
                )
                if response.status_code == 200 and response.text == "reloaded":
                    last_response = response
                    break
                last_response = response
            except requests.exceptions.RequestException:
                pass
            time.sleep(0.5)

        assert last_response is not None, "No response received from /status after spec update"
        assert last_response.status_code == 200, (
            f"Expected 200 but got {last_response.status_code}"
        )
        assert last_response.text == "reloaded", (
            f"Expected 'reloaded' but got '{last_response.text}' — "
            "the server did not pick up the updated OpenAPI spec"
        )

    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        log_file.close()
        shutil.rmtree(temp_work_dir, ignore_errors=True)
