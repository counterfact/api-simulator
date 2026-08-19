"""Black-box tests for Counterfact.

These tests run counterfact as an external process and verify its behaviour
from the outside — no knowledge of internals required.
"""

import os
import shutil
import subprocess
import tempfile
import time

import requests

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
