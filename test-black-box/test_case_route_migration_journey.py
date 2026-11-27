"""Verify the real CLI migrates and serves a case-variant route."""

from pytest_bdd import given, scenario, then, when


@scenario(
    "features/case_route_migration.feature",
    "Migrate an edited route and serve both spellings",
)
def test_case_route_migration():
    """Bind the route migration journey."""


@given("a typed route edited before a case-variant path was added")
def edited_route(journey):
    journey.output = journey.project / "api"
    journey.original = (
        'import type { Routes } from "../types/index.js";\n'
        'import { reply } from "./helper.js";\n'
        'export const GET: Routes["/pet"]["GET"] = ($) =>\n'
        '  $.response.status(200).text(reply);\n'
        'export const post: Routes["/pet"]["POST"] = ($) =>\n'
        '  $.response.status(200).text("authored lower-case export");\n'
    )
    journey.write_text("api/routes/pet.ts", journey.original)
    journey.write_text('api/routes/helper.ts', 'export const reply = "authored";\n')

    def response(value, *alternatives):
        return {
            "responses": {
                "200": {
                    "description": value,
                    "content": {
                        "text/plain": {
                            "schema": {"type": "string", "enum": [value, *alternatives]},
                        }
                    },
                }
            }
        }

    journey.spec_path = journey.write_json(
        "case-openapi.json",
        {
            "openapi": "3.0.3",
            "info": {"title": "Case Variants", "version": "1.0.0"},
            "paths": {
                "/Pet": {"get": response("generated")},
                "/pet": {"get": response("authored"), "post": response("generated default", "authored lower-case export")},
            },
        },
    )


@when("I generate and serve the case-variant contract")
def generate_and_serve(journey):
    journey.allocate_port()
    journey.start_cli(
        journey.spec_path,
        journey.output,
        "--port",
        journey.port,
        "--generate",
        "--serve",
        "--prune",
        "--no-update-check",
    )
    journey.wait_for_http("/pet", lambda result: result.status_code == 200)


@then("the route spellings have distinct HTTP behavior")
def distinct_routes(journey):
    assert journey.request("GET", "/Pet").text == "generated"
    assert journey.request("GET", "/pet").text == "authored"
    assert journey.request("POST", "/pet").text == "authored lower-case export"
    assert journey.request("POST", "/Pet").status_code in (404, 405)
    assert journey.request("GET", "/PET").status_code == 404


@then("the shared route retains the original implementation and its backup")
def preserved_route(journey):
    routes = journey.output / "routes"
    aliases = [
        entry.name for entry in routes.iterdir() if entry.name.lower() == "pet.ts"
    ]
    assert aliases == ["Pet.ts"]
    assert "legacy1.GET" in (routes / "Pet.ts").read_text(encoding="utf-8")
    assert (routes / "helper.ts").is_file()
    backup = list(journey.output.glob(".counterfact-route-migration-*-original"))
    assert len(backup) == 1
    assert (backup[0] / "pet.ts").read_text(encoding="utf-8") == journey.original
