"""One product-level tripwire for Counterfact's documented developer journey.

The test operates the shipped CLI through a real terminal, edits only the
generated project a developer owns, and observes generated files, terminal
output, and HTTP responses. It deliberately avoids package and implementation
imports so a passing result means the complete public workflow held together.
"""

import json
import os
import re

import pytest
from pytest_bdd import given, scenario, then, when

from support.journey import PROMPT, STARTUP_TIMEOUT


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


pytestmark = pytest.mark.skipif(
    os.name == "nt", reason="Windows does not provide pty"
)


@scenario(
    "features/developer_journey.feature",
    "Shape and steer a stateful Pet API",
)
def test_stateful_developer_journey_through_cli_http_and_repl():
    """Bind the readable journey to its product-level step definitions."""


@given("an OpenAPI contract for a stateful Pet API")
def write_openapi_contract(journey):
    journey.spec_path = journey.write_json("openapi.json", OPENAPI_DOCUMENT)
    journey.output = journey.project / "api"


@when("I generate the Counterfact project")
def generate_counterfact_project(journey):
    journey.generated = journey.run_cli(
        journey.spec_path,
        journey.output,
        "--generate",
        "--no-update-check",
    )


@then("the documented project artifacts exist")
def documented_artifacts_exist(journey):
    generated = journey.generated
    assert generated.returncode == 0, (
        f"Generation failed.\nstdout:\n{generated.stdout}\n"
        f"stderr:\n{generated.stderr}"
    )
    assert "\x1b[" not in generated.stdout, generated.stdout
    assert str(journey.spec_path) not in generated.stdout, generated.stdout
    assert str(journey.output) not in generated.stdout, generated.stdout
    assert generated.stdout.index("Counterfact v") < generated.stdout.index(
        "→ Reading OpenAPI document…"
    ) < generated.stdout.index("✓ OpenAPI document ready") < generated.stdout.index(
        "→ Generating routes and types…"
    ) < generated.stdout.index("✓ Generated routes and types")
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
    journey.allocate_port()
    journey.start_cli(
        str(journey.spec_path),
        str(journey.output),
        "--port",
        str(journey.port),
        "--watch",
        "--serve",
        "--repl",
        "--build-cache",
        "--no-update-check",
        terminal=True,
    )


@then("the REPL and Swagger UI are ready")
def repl_and_swagger_are_ready(journey):
    journey.terminal.wait_for(PROMPT, STARTUP_TIMEOUT)
    displayed_url = f"http://localhost:{journey.port}"
    transcript = journey.transcript()
    assert b"\x1b[" in journey.terminal.output
    assert displayed_url in transcript, transcript
    assert transcript.index("Counterfact v") < transcript.index(
        "→ Reading OpenAPI document…"
    ) < transcript.index("✓ OpenAPI document ready") < transcript.index(
        "→ Generating routes and types…"
    ) < transcript.index("✓ Generated routes and types") < transcript.index(
        f"✓ Mock server → {displayed_url}"
    ) < transcript.index("✓ Swagger UI →") < transcript.index(
        "✓ Watching routes and types"
    ) < transcript.index("⬣> ")
    journey.response = journey.wait_for_http(
        "/counterfact/swagger",
        lambda response: response.status_code == 200,
    )
    assert journey.response.status_code == 200, journey.transcript()


@then("the open REPL autocompletes the initial pet routes")
def repl_autocompletes_initial_routes(journey):
    journey.terminal.autocomplete('client.get("/pets/', "/pets/{petId}")


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
    journey.response = journey.request(
        "post",
        "/pets",
        json={},
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
    journey.response = journey.request("get", "/pets/1")
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
    journey.response = journey.request("get", "/pets")
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
    journey.response = journey.wait_for_http(
        "/pets/1",
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
    journey.write_json("openapi.json", updated_spec)


@then("the history route is generated and served")
def history_route_is_generated_and_served(journey):
    journey.response = journey.wait_for_http(
        "/pets/1/history",
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
    journey.response = journey.request("get", "/pets/1")
    assert journey.response.status_code == 200, journey.transcript()
    assert journey.response.json()["name"] == "Fluffy", journey.transcript()


@when("I apply the reset scenario")
def apply_reset(journey):
    journey.repl_output = journey.terminal.command(".scenario reset")
    assert "Applied reset" in journey.repl_output, journey.transcript()


@then("the empty baseline is restored")
def empty_baseline_is_restored(journey):
    journey.response = journey.request("get", "/pets/1")
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
    journey.response = journey.request("get", "/pets/1")
    assert journey.response.status_code == 200, journey.transcript()
    assert journey.response.json() == {
        "name": "Bella",
        "status": "available",
        "id": 1,
    }, journey.transcript()
