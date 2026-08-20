"""Steps for safely evolving a split and overlaid OpenAPI contract."""

import copy

from pytest_bdd import given, scenario, then, when


def text_response(value):
    return {
        "description": "ok",
        "content": {
            "text/plain": {
                "schema": {"type": "string"},
                "examples": {"default": {"value": value}},
            }
        },
    }


INITIAL_SPEC = {
    "openapi": "3.0.3",
    "info": {"title": "Contract Evolution Journey", "version": "1.0.0"},
    "paths": {
        "/pet": {
            "get": {
                "responses": {
                    "200": {
                        "description": "external pet",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "./schemas.json#/Pet"}
                            }
                        },
                    }
                }
            }
        },
        "/greeting": {"get": {"responses": {"200": text_response("original")}}},
        "/status": {"get": {"responses": {"200": text_response("original")}}},
        "/removed-by-overlay": {
            "get": {"responses": {"200": text_response("remove me")}}
        },
        "/obsolete": {
            "get": {"responses": {"200": text_response("obsolete")}}
        },
    },
}


EXTERNAL_SCHEMAS = {
    "Pet": {
        "type": "object",
        "required": ["id", "name"],
        "properties": {
            "id": {"type": "string", "example": "external-id"},
            "name": {"type": "string", "example": "external-name"},
        },
    }
}


GREETING_TARGET = (
    "$.paths['/greeting'].get.responses['200']"
    ".content['text/plain'].examples.default"
)


@scenario("features/contract_evolution.feature", "Evolve a split contract safely")
def test_evolve_split_contract_safely():
    """Bind the contract-evolution journey to its step definitions."""


@given("a split OpenAPI contract with an obsolete route")
def write_split_contract(journey):
    journey.spec_document = copy.deepcopy(INITIAL_SPEC)
    journey.spec_path = journey.write_json("openapi.json", journey.spec_document)
    journey.write_json("schemas.json", EXTERNAL_SCHEMAS)
    journey.output = journey.project / "evolving-api"


@given("two ordered overlays update a response and remove a route")
def write_ordered_overlays(journey):
    journey.first_overlay = journey.write_json(
        "first-overlay.json",
        {
            "overlay": "1.0.0",
            "info": {"title": "First", "version": "1.0.0"},
            "actions": [
                {"target": GREETING_TARGET, "update": {"value": "first"}}
            ],
        },
    )
    journey.second_overlay = journey.write_json(
        "second-overlay.json",
        {
            "overlay": "1.0.0",
            "info": {"title": "Second", "version": "1.0.0"},
            "actions": [
                {"target": GREETING_TARGET, "update": {"value": "second"}},
                {"target": "$.paths['/removed-by-overlay']", "remove": True},
            ],
        },
    )


@when("I generate and serve the composed contract")
def start_composed_contract(journey):
    journey.allocate_port()
    journey.start_cli(
        journey.spec_path,
        journey.output,
        "--port",
        journey.port,
        "--generate",
        "--build-cache",
        "--serve",
        "--watch",
        "--overlay",
        journey.first_overlay,
        "--overlay",
        journey.second_overlay,
        "--no-update-check",
    )
    journey.wait_for_http(
        "/counterfact/swagger", lambda response: response.status_code == 200
    )


@then("the external schema drives generated types and a deterministic response")
def external_schema_is_used(journey):
    response = journey.request("get", "/pet")
    assert response.status_code == 200
    assert response.json() == {"id": "external-id", "name": "external-name"}
    assert (journey.output / "types" / "paths" / "pet.types.ts").exists()


@then("the last overlay update wins")
def last_overlay_wins(journey):
    response = journey.request("get", "/greeting")
    assert (response.status_code, response.text) == (200, "second")


@then("the overlay-removed route has no generated artifact")
def removed_overlay_route_is_omitted(journey):
    assert not (journey.output / "routes" / "removed-by-overlay.ts").exists()
    assert journey.request("get", "/removed-by-overlay").status_code == 404


@when("I change an existing response example in the source contract")
def change_existing_example(journey):
    journey.spec_document["paths"]["/status"]["get"]["responses"]["200"] = (
        text_response("reloaded")
    )
    journey.write_json("openapi.json", journey.spec_document)


@then("the live server returns the changed example")
def live_server_uses_changed_example(journey):
    response = journey.wait_for_http(
        "/status",
        lambda candidate: (
            candidate.status_code == 200 and candidate.text == "reloaded"
        ),
    )
    assert response.text == "reloaded"


@when("I remove the obsolete operation and regenerate with prune")
def remove_source_operation_and_prune(journey):
    journey.obsolete_route = journey.output / "routes" / "obsolete.ts"
    assert journey.obsolete_route.exists(), journey.logs()
    del journey.spec_document["paths"]["/obsolete"]
    journey.write_json("openapi.json", journey.spec_document)
    result = journey.run_cli(
        journey.spec_path,
        journey.output,
        "--generate",
        "--prune",
        "--overlay",
        journey.first_overlay,
        "--overlay",
        journey.second_overlay,
        "--no-update-check",
        name="prune",
    )
    assert result.returncode == 0, (
        f"Prune generation failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )


@then("the obsolete generated route is deleted")
def obsolete_route_is_deleted(journey):
    assert not journey.obsolete_route.exists()
