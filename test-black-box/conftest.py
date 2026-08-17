import os
import shutil
import subprocess
import tempfile
import time

import pytest
import requests

TEST_BLACK_BOX_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TEST_BLACK_BOX_DIR)
SERVER_PORT = 3100
BASE_URL = f"http://localhost:{SERVER_PORT}"
SERVER_STARTUP_TIMEOUT = 60


def wait_for_server(timeout=SERVER_STARTUP_TIMEOUT):
    """Poll the server until it responds or the timeout is reached."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            response = requests.get(f"{BASE_URL}/counterfact/swagger", timeout=2)
            if response.status_code == 200:
                return
        except requests.exceptions.RequestException:
            # Includes ConnectionError, ReadTimeout, and other transient errors
            pass
        time.sleep(0.5)
    raise TimeoutError(
        f"Counterfact server at {BASE_URL} did not start within {timeout} seconds"
    )


@pytest.fixture(scope="session")
def server():
    """Start the counterfact server and tear it down after all tests.

    The server is started with CWD set to a temporary directory under the OS's
    temp directory so that generated files land in a clean, isolated location
    and the repository working directory is never dirtied.  The OpenAPI spec
    is passed as an absolute path so it can be found regardless of CWD.

    stdout and stderr are written to a log file rather than subprocess.PIPE to
    avoid pipe-buffer deadlocks on Windows (the pipe buffer is ~4 KB on Windows
    vs ~64 KB on Linux; with debug output enabled the buffer can fill before the
    server finishes starting, causing the subprocess to block on write()).
    """
    temp_work_dir = tempfile.mkdtemp(prefix="counterfact-work-")
    openapi_spec = os.path.join(TEST_BLACK_BOX_DIR, "openapi.yaml")
    counterfact_bin = os.path.join(
        REPO_ROOT, "packages", "counterfact", "bin", "counterfact.js"
    )
    log_path = os.path.join(temp_work_dir, "server.log")

    log_file = open(log_path, "w")  # noqa: SIM115
    process = subprocess.Popen(
        [
            "node",
            counterfact_bin,
            openapi_spec,
            "out",
            "--port",
            str(SERVER_PORT),
            "--serve",
            "--generate",
            "--build-cache",
        ],
        cwd=temp_work_dir,
        stdout=log_file,
        stderr=log_file,
    )

    try:
        wait_for_server()
    except TimeoutError:
        log_file.flush()
        try:
            with open(log_path) as f:
                server_logs = f.read()
        except OSError:
            server_logs = "(could not read server log)"
        process.kill()
        log_file.close()
        shutil.rmtree(temp_work_dir, ignore_errors=True)
        raise TimeoutError(
            f"Counterfact server at {BASE_URL} did not start within"
            f" {SERVER_STARTUP_TIMEOUT} seconds.\nServer log:\n{server_logs}"
        )

    yield {"out_dir": os.path.join(temp_work_dir, "out"), "process": process}

    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()

    log_file.close()
    shutil.rmtree(temp_work_dir, ignore_errors=True)
