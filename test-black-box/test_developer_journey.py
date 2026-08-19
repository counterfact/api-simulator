"""One product-level tripwire for Counterfact's documented developer journey.

The test operates the shipped CLI through a real terminal, edits only the
generated project a developer owns, and observes generated files, terminal
output, and HTTP responses. It deliberately avoids package and implementation
imports so a passing result means the complete public workflow held together.
"""

from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import tempfile
import time

import pytest
from pytest_bdd import given, scenario, then, when
import requests


REPO_ROOT = Path(__file__).resolve().parents[1]
COUNTERFACT_BIN = REPO_ROOT / "packages" / "counterfact" / "bin" / "counterfact.js"
REQUEST_TIMEOUT = 10
STARTUP_TIMEOUT = 30
RELOAD_TIMEOUT = 30
PROMPT = "⬣> ".encode()
ANSI_ESCAPE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


OPENAPI_DOCUMENT = {
    "openapi": "3.0.3",
    "info": {"title": "Developer Journey Pet API", "version": "1.0.0"},
    "paths": {
        "/pets": {
            "get": {
                "responses": {
                    "200": {
                        "description": "All pets",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "array",
                                    "items": {"$ref": "#/components/schemas/Pet"},
                                }
                            }
                        },
                    }
                }
            },
            "post": {
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/NewPet"}
                        }
                    },
                },
                "responses": {
                    "201": {
                        "description": "Created pet",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/Pet"}
                            }
                        },
                    }
                },
            },
        },
        "/pets/{petId}": {
            "get": {
                "parameters": [
                    {
                        "name": "petId",
                        "in": "path",
                        "required": True,
                        "schema": {"type": "integer"},
                    }
                ],
                "responses": {
                    "200": {
                        "description": "One pet",
                        "headers": {
                            "X-Tripwire-Revision": {"schema": {"type": "string"}}
                        },
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/Pet"}
                            }
                        },
                    },
                    "404": {
                        "description": "Pet not found",
                        "content": {
                            "text/plain": {"schema": {"type": "string"}}
                        },
                    },
                    "503": {
                        "description": "Service unavailable",
                        "content": {
                            "text/plain": {"schema": {"type": "string"}}
                        },
                    },
                }
            },
        },
    },
    "components": {
        "schemas": {
            "NewPet": {
                "type": "object",
                "required": ["name", "status"],
                "properties": {
                    "name": {"type": "string"},
                    "status": {
                        "type": "string",
                        "enum": ["available", "pending"],
                    },
                },
            },
            "Pet": {
                "allOf": [
                    {"$ref": "#/components/schemas/NewPet"},
                    {
                        "type": "object",
                        "required": ["id"],
                        "properties": {"id": {"type": "integer"}},
                    },
                ]
            },
        }
    },
}


CONTEXT = """\
export class Context {
  pets = new Map();
  nextId = 1;
  serviceUnavailable = false;

  reset() {
    this.pets.clear();
    this.nextId = 1;
    this.serviceUnavailable = false;
  }

  add(pet) {
    const created = { ...pet, id: this.nextId++ };
    this.pets.set(created.id, created);
    return structuredClone(created);
  }

  get(id) {
    const pet = this.pets.get(Number(id));
    return pet === undefined ? undefined : structuredClone(pet);
  }

  list() {
    return [...this.pets.values()].map((pet) => structuredClone(pet));
  }
}
"""


PETS_ROUTE = """\
export const GET = ($) => $.response[200].json($.context.list());

export const POST = ($) => $.response[201].json($.context.add($.body));
"""


PET_BY_ID_ROUTE = """\
export const GET = ($) => {
  if ($.context.serviceUnavailable) {
    return $.response[503].text("Service unavailable");
  }
  const pet = $.context.get($.path.petId);
  return pet === undefined
    ? $.response[404].text(`Pet ${$.path.petId} not found`)
    : $.response[200].json(pet);
};
"""


RELOADED_PET_BY_ID_ROUTE = """\
export const GET = ($) => {
  if ($.context.serviceUnavailable) {
    return $.response[503].text("Service unavailable");
  }
  const pet = $.context.get($.path.petId);
  return pet === undefined
    ? $.response[404].text(`Pet ${$.path.petId} not found`)
    : $.response[200]
        .header("X-Tripwire-Revision", "2")
        .json(pet);
};
"""


SCENARIOS = """\
export const reset = ($) => {
  // This tripwire needs an empty world to prove 404, reset, and ID reuse.
  $.context.reset();
};

export const startup = ($) => {
  reset($);
};

export const addPendingPet = ($) => {
  $.context.add({ name: "Rex", status: "pending" });
};

export const serviceUnavailable = ($) => {
  $.context.serviceUnavailable = true;
};

export const restoreService = ($) => {
  $.context.serviceUnavailable = false;
};
"""


def _free_port():
    """Return a currently unused loopback port for one short-lived server."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def _strip_terminal_control(text):
    return ANSI_ESCAPE.sub("", text).replace("\r", "")


class ReplTerminal:
    """Drive the user-facing REPL and retain its full transcript for failures."""

    def __init__(self, process_id, terminal):
        self.process_id = process_id
        self.terminal = terminal
        self.output = bytearray()

    def transcript(self):
        return _strip_terminal_control(self.output.decode(errors="replace"))

    def wait_for(self, expected, timeout, start=0):
        if isinstance(expected, str):
            expected = expected.encode()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            found = self.output.find(expected, start)
            if found >= 0:
                return found
            import select

            readable, _, _ = select.select([self.terminal], [], [], 0.25)
            if not readable:
                continue
            try:
                self.output.extend(os.read(self.terminal, 4096))
            except OSError:
                break
        raise AssertionError(
            f"REPL did not emit {expected!r} within {timeout} seconds.\n"
            f"Terminal transcript:\n{self.transcript()}"
        )

    def command(self, command, timeout=10):
        start = len(self.output)
        os.write(self.terminal, command.encode() + b"\r")
        prompt_position = self.wait_for(PROMPT, timeout, start=start)
        end = prompt_position + len(PROMPT)
        quiet_deadline = time.monotonic() + 0.25
        hard_deadline = time.monotonic() + 1
        while time.monotonic() < min(quiet_deadline, hard_deadline):
            import select

            readable, _, _ = select.select([self.terminal], [], [], 0.05)
            if not readable:
                continue
            try:
                self.output.extend(os.read(self.terminal, 4096))
            except OSError:
                break
            quiet_deadline = time.monotonic() + 0.25
            later_prompt = self.output.rfind(PROMPT, start)
            if later_prompt >= 0:
                end = later_prompt + len(PROMPT)
        return _strip_terminal_control(
            self.output[start:end].decode(errors="replace")
        )

    def autocomplete(self, partial, expected, timeout=10):
        start = len(self.output)
        os.write(self.terminal, partial.encode() + b"\t")
        self.wait_for(expected, timeout, start=start)
        os.write(self.terminal, b"\x03")
        self.wait_for(PROMPT, timeout, start=len(self.output))

    def close(self):
        try:
            os.write(self.terminal, b"\x04")
        except OSError:
            pass

        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                waited, _ = os.waitpid(self.process_id, os.WNOHANG)
            except ChildProcessError:
                waited = self.process_id
            if waited == self.process_id:
                break
            time.sleep(0.1)
        else:
            try:
                os.kill(self.process_id, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                os.waitpid(self.process_id, 0)
            except ChildProcessError:
                pass

        os.close(self.terminal)


def _assert_repl_scalar(output, expected, transcript):
    pattern = rf"(?:^|\n){re.escape(str(expected))}(?:\n|$)"
    assert re.search(pattern, output), (
        f"Expected REPL result {expected!r} in command output:\n{output}\n"
        f"Terminal transcript:\n{transcript}"
    )


def _assert_repl_http_status(output, expected, transcript):
    assert f"HTTP/1.1 {expected}" in output, (
        f"Expected REPL HTTP status {expected!r} in command output:\n{output}\n"
        f"Terminal transcript:\n{transcript}"
    )


def _wait_for_http(url, terminal, predicate, timeout=RELOAD_TIMEOUT):
    deadline = time.monotonic() + timeout
    last_response = None
    last_error = None
    while time.monotonic() < deadline:
        try:
            last_response = requests.get(url, timeout=2)
            if predicate(last_response):
                return last_response
        except requests.RequestException as error:
            last_error = error
        time.sleep(0.25)
    details = (
        f"last response was {last_response.status_code}: {last_response.text}"
        if last_response is not None
        else f"last request error was {last_error!r}"
    )
    raise AssertionError(
        f"Timed out waiting for {url}; {details}.\n"
        f"Terminal transcript:\n{terminal.transcript()}"
    )


pytestmark = pytest.mark.skipif(
    os.name == "nt", reason="Windows does not provide pty"
)


@dataclass
class Journey:
    temporary_project: tempfile.TemporaryDirectory
    project: Path
    spec_path: Path
    output: Path
    environment: dict
    port: int | None = None
    base_url: str | None = None
    terminal: ReplTerminal | None = None
    pet_by_id_path: Path | None = None
    repl_output: str = ""
    response: requests.Response | None = None
    generated: subprocess.CompletedProcess | None = None

    def transcript(self):
        return self.terminal.transcript() if self.terminal is not None else ""


@pytest.fixture
def journey():
    temporary_project = tempfile.TemporaryDirectory(
        prefix="counterfact-developer-journey-bdd-"
    )
    project = Path(temporary_project.name)
    world = Journey(
        temporary_project=temporary_project,
        project=project,
        spec_path=project / "openapi.json",
        output=project / "api",
        environment={
            **os.environ,
            "CHOKIDAR_USEPOLLING": "1",
            "COUNTERFACT_TELEMETRY_DISABLED": "true",
            "TERM": "xterm-256color",
        },
    )
    try:
        yield world
    finally:
        if world.terminal is not None:
            world.terminal.close()
        temporary_project.cleanup()


@scenario(
    "features/developer_journey.feature",
    "Shape and steer a stateful Pet API",
)
def test_stateful_developer_journey_through_cli_http_and_repl():
    """Bind the readable journey to its product-level step definitions."""


@given("an OpenAPI contract for a stateful Pet API")
def write_openapi_contract(journey):
    _write_json(journey.spec_path, OPENAPI_DOCUMENT)


@when("I generate the Counterfact project")
def generate_counterfact_project(journey):
    journey.generated = subprocess.run(
        [
            "node",
            str(COUNTERFACT_BIN),
            str(journey.spec_path),
            str(journey.output),
            "--generate",
            "--no-update-check",
        ],
        cwd=journey.project,
        env=journey.environment,
        timeout=30,
        check=False,
        capture_output=True,
        text=True,
    )


@then("the documented project artifacts exist")
def documented_artifacts_exist(journey):
    generated = journey.generated
    assert generated.returncode == 0, (
        f"Generation failed.\nstdout:\n{generated.stdout}\n"
        f"stderr:\n{generated.stderr}"
    )
    expected_artifacts = [
        journey.output / "routes" / "_.context.ts",
        journey.output / "routes" / "pets.ts",
        journey.output / "routes" / "pets" / "{petId}.ts",
        journey.output / "types" / "_.context.ts",
        journey.output / "types" / "paths" / "pets.types.ts",
        journey.output / "types" / "paths" / "pets" / "{petId}.types.ts",
        journey.output / "scenarios" / "index.ts",
    ]
    assert all(path.exists() for path in expected_artifacts), (
        "Generation omitted documented artifacts: "
        + ", ".join(
            str(path.relative_to(journey.project))
            for path in expected_artifacts
            if not path.exists()
        )
    )


@given("I author deterministic pet handlers and named scenarios")
def author_pet_simulation(journey):
    (journey.output / "routes" / "_.context.ts").write_text(
        CONTEXT, encoding="utf-8"
    )
    (journey.output / "routes" / "pets.ts").write_text(
        PETS_ROUTE, encoding="utf-8"
    )
    journey.pet_by_id_path = (
        journey.output / "routes" / "pets" / "{petId}.ts"
    )
    journey.pet_by_id_path.write_text(
        PET_BY_ID_ROUTE, encoding="utf-8"
    )
    (journey.output / "scenarios" / "index.ts").write_text(
        SCENARIOS, encoding="utf-8"
    )


@when("I start Counterfact with watching, serving, and the REPL")
def start_counterfact(journey):
    import pty

    journey.port = _free_port()
    journey.base_url = f"http://127.0.0.1:{journey.port}"
    command = [
        "node",
        str(COUNTERFACT_BIN),
        str(journey.spec_path),
        str(journey.output),
        "--port",
        str(journey.port),
        "--watch",
        "--serve",
        "--repl",
        "--build-cache",
        "--no-update-check",
    ]
    process_id, terminal_fd = pty.fork()
    if process_id == 0:
        os.chdir(journey.project)
        os.execvpe(command[0], command, journey.environment)
    journey.terminal = ReplTerminal(process_id, terminal_fd)


@then("the REPL and Swagger UI are ready")
def repl_and_swagger_are_ready(journey):
    journey.terminal.wait_for(PROMPT, STARTUP_TIMEOUT)
    displayed_url = f"http://localhost:{journey.port}"
    assert displayed_url in journey.transcript(), journey.transcript()
    journey.response = _wait_for_http(
        f"{journey.base_url}/counterfact/swagger",
        journey.terminal,
        lambda response: response.status_code == 200,
    )
    assert journey.response.status_code == 200, journey.transcript()


@then("the route builder distinguishes a missing and supplied pet ID")
def route_builder_reports_readiness(journey):
    missing_path = journey.terminal.command(
        'route("/pets/{petId}").method("get").ready()'
    )
    _assert_repl_scalar(missing_path, "false", journey.transcript())
    ready_path = journey.terminal.command(
        'route("/pets/{petId}").method("get").path({ petId: 1 }).ready()'
    )
    _assert_repl_scalar(ready_path, "true", journey.transcript())


@then("a REPL request for the missing pet returns 404")
def repl_observes_missing_pet(journey):
    journey.repl_output = journey.terminal.command(
        'void (await client.get("/pets/1"))'
    )
    _assert_repl_http_status(
        journey.repl_output, "404 Not Found", journey.transcript()
    )


@then("request validation rejects an invalid pet")
def invalid_pet_is_rejected(journey):
    journey.response = requests.post(
        f"{journey.base_url}/pets",
        json={},
        timeout=REQUEST_TIMEOUT,
    )
    assert journey.response.status_code == 400, (
        f"Expected invalid body to return 400, got "
        f"{journey.response.status_code}: {journey.response.text}\n"
        f"{journey.transcript()}"
    )
    assert "required property 'name'" in journey.response.text, (
        f"Unexpected validation error: {journey.response.text}\n"
        f"{journey.transcript()}"
    )


@when("I create Fluffy through the REPL")
def create_fluffy(journey):
    journey.repl_output = journey.terminal.command(
        'void (await client.post("/pets", '
        '{ name: "Fluffy", status: "available" }))'
    )
    _assert_repl_http_status(
        journey.repl_output, "201 Created", journey.transcript()
    )


@then("Fluffy is available as pet 1")
def fluffy_is_pet_one(journey):
    journey.response = requests.get(
        f"{journey.base_url}/pets/1", timeout=REQUEST_TIMEOUT
    )
    assert journey.response.status_code == 200, journey.transcript()
    assert journey.response.json() == {
        "name": "Fluffy",
        "status": "available",
        "id": 1,
    }, journey.transcript()


@when("I apply the addPendingPet scenario")
def apply_add_pending_pet(journey):
    journey.repl_output = journey.terminal.command(".scenario addPendingPet")
    assert "Applied addPendingPet" in journey.repl_output, journey.transcript()


@then("the additive scenario preserves Fluffy and adds Rex")
def additive_scenario_preserves_existing_state(journey):
    journey.response = requests.get(
        f"{journey.base_url}/pets", timeout=REQUEST_TIMEOUT
    )
    assert journey.response.status_code == 200, journey.transcript()
    assert journey.response.json() == [
        {"name": "Fluffy", "status": "available", "id": 1},
        {"name": "Rex", "status": "pending", "id": 2},
    ], journey.transcript()


@when("I apply the serviceUnavailable scenario")
def apply_service_unavailable(journey):
    journey.repl_output = journey.terminal.command(
        ".scenario serviceUnavailable"
    )
    assert "Applied serviceUnavailable" in journey.repl_output, (
        journey.transcript()
    )


@then("the REPL observes a service unavailable response")
def repl_observes_service_unavailable(journey):
    journey.repl_output = journey.terminal.command(
        'void (await client.get("/pets/1"))'
    )
    _assert_repl_http_status(
        journey.repl_output,
        "503 Service Unavailable",
        journey.transcript(),
    )


@when("I apply the restoreService scenario")
def apply_restore_service(journey):
    journey.repl_output = journey.terminal.command(".scenario restoreService")
    assert "Applied restoreService" in journey.repl_output, journey.transcript()


@then("the REPL observes a successful response again")
def repl_observes_recovery(journey):
    journey.repl_output = journey.terminal.command(
        'void (await client.get("/pets/1"))'
    )
    _assert_repl_http_status(
        journey.repl_output, "200 OK", journey.transcript()
    )


@when("I hot reload the pet route")
def hot_reload_pet_route(journey):
    journey.pet_by_id_path.write_text(
        RELOADED_PET_BY_ID_ROUTE, encoding="utf-8"
    )


@then("the new route revision is served without losing state")
def reloaded_route_preserves_state(journey):
    journey.response = _wait_for_http(
        f"{journey.base_url}/pets/1",
        journey.terminal,
        lambda response: (
            response.status_code == 200
            and response.headers.get("X-Tripwire-Revision") == "2"
        ),
    )
    assert journey.response.json() == {
        "name": "Fluffy",
        "status": "available",
        "id": 1,
    }, journey.transcript()


@when("I add a pet history operation to the OpenAPI contract")
def add_history_operation(journey):
    updated_spec = json.loads(json.dumps(OPENAPI_DOCUMENT))
    updated_spec["paths"]["/pets/{petId}/history"] = {
        "get": {
            "parameters": [
                {
                    "name": "petId",
                    "in": "path",
                    "required": True,
                    "schema": {"type": "integer"},
                }
            ],
            "responses": {
                "200": {
                    "description": "Pet history",
                    "content": {
                        "text/plain": {
                            "schema": {"type": "string"},
                            "examples": {
                                "default": {"value": "history ready"}
                            },
                        }
                    },
                }
            },
        }
    }
    _write_json(journey.spec_path, updated_spec)


@then("the history route is generated and served")
def history_route_is_generated_and_served(journey):
    journey.response = _wait_for_http(
        f"{journey.base_url}/pets/1/history",
        journey.terminal,
        lambda response: (
            response.status_code == 200 and response.text == "history ready"
        ),
    )
    assert journey.response.text == "history ready", journey.transcript()
    assert (
        journey.output / "routes" / "pets" / "{petId}" / "history.ts"
    ).exists(), journey.transcript()


@then("the open REPL autocompletes the history route")
def repl_autocompletes_history(journey):
    journey.terminal.autocomplete(
        'client.get("/pets/{petId}/h', "/pets/{petId}/history"
    )


@then("the original pet state still exists")
def original_pet_state_still_exists(journey):
    journey.response = requests.get(
        f"{journey.base_url}/pets/1", timeout=REQUEST_TIMEOUT
    )
    assert journey.response.status_code == 200, journey.transcript()
    assert journey.response.json()["name"] == "Fluffy", journey.transcript()


@when("I apply the reset scenario")
def apply_reset(journey):
    journey.repl_output = journey.terminal.command(".scenario reset")
    assert "Applied reset" in journey.repl_output, journey.transcript()


@then("the empty baseline is restored")
def empty_baseline_is_restored(journey):
    journey.response = requests.get(
        f"{journey.base_url}/pets/1", timeout=REQUEST_TIMEOUT
    )
    assert journey.response.status_code == 404, journey.transcript()


@when("I create Bella through the REPL")
def create_bella(journey):
    journey.repl_output = journey.terminal.command(
        'void (await client.post("/pets", '
        '{ name: "Bella", status: "available" }))'
    )
    _assert_repl_http_status(
        journey.repl_output, "201 Created", journey.transcript()
    )


@then("Bella is available as pet 1")
def bella_is_pet_one(journey):
    journey.response = requests.get(
        f"{journey.base_url}/pets/1", timeout=REQUEST_TIMEOUT
    )
    assert journey.response.status_code == 200, journey.transcript()
    assert journey.response.json() == {
        "name": "Bella",
        "status": "available",
        "id": 1,
    }, journey.transcript()
