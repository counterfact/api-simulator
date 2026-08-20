"""Steps for generating and serving a legacy Swagger contract."""

from pytest_bdd import given, scenario, then, when


SWAGGER_DOCUMENT = {
    "swagger": "2.0",
    "info": {"title": "Legacy API Journey", "version": "1.0.0"},
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
}


@scenario("features/legacy_swagger.feature", "Run a legacy Swagger contract")
def test_run_legacy_swagger_contract():
    """Bind the legacy Swagger journey to its step definitions."""


@given("a deterministic Swagger 2 contract")
def write_swagger_contract(journey):
    journey.spec_path = journey.write_json("swagger.json", SWAGGER_DOCUMENT)
    journey.output = journey.project / "legacy-api"


@when("I generate and serve the legacy API")
def start_legacy_api(journey):
    journey.allocate_port()
    journey.start_cli(
        journey.spec_path,
        journey.output,
        "--port",
        journey.port,
        "--generate",
        "--build-cache",
        "--serve",
        "--no-update-check",
    )


@then("the legacy response is deterministic")
def legacy_response_is_deterministic(journey):
    response = journey.wait_for_http(
        "/legacy-ping",
        lambda candidate: (
            candidate.status_code == 200 and candidate.text == "legacy-pong"
        ),
    )
    assert response.text == "legacy-pong"


@then("the legacy route and cache artifacts exist")
def legacy_artifacts_exist(journey):
    expected = [
        journey.output / "routes" / "legacy-ping.ts",
        journey.output / ".cache" / "legacy-ping.cjs",
    ]
    assert all(path.exists() for path in expected), (
        "Missing legacy artifacts: "
        + ", ".join(str(path) for path in expected if not path.exists())
        + f"\n{journey.logs()}"
    )
