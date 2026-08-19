"""Steps for generating, serving, and customizing an OpenAPI API."""

from pytest_bdd import given, scenario, then, when


OPENAPI_DOCUMENT = {
    "openapi": "3.0.3",
    "info": {"title": "Generated API Journey", "version": "1.0.0"},
    "paths": {
        "/ping": {
            "get": {
                "responses": {
                    "200": {
                        "description": "pong",
                        "content": {
                            "application/json": {
                                "schema": {"type": "string"},
                                "examples": {"pong": {"value": "pong"}},
                            }
                        },
                    }
                }
            }
        },
        "/items": {
            "get": {
                "responses": {
                    "200": {
                        "description": "items",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "examples": {
                                    "fruit": {
                                        "value": ["apple", "banana", "cherry"]
                                    }
                                },
                            }
                        },
                    }
                }
            }
        },
        "/path/with:colon": {
            "get": {
                "responses": {
                    "200": {
                        "description": "colon",
                        "content": {
                            "application/json": {
                                "schema": {"type": "string"},
                                "examples": {
                                    "colon": {"value": "colon handled"}
                                },
                            }
                        },
                    }
                }
            }
        },
        "/guard": {
            "get": {
                "parameters": [
                    {
                        "name": "X-Trace-ID",
                        "in": "header",
                        "required": True,
                        "schema": {"type": "string"},
                    }
                ],
                "responses": {
                    "200": {
                        "description": "accepted",
                        "content": {
                            "application/json": {
                                "schema": {"type": "string"},
                                "examples": {
                                    "accepted": {"value": "trace accepted"}
                                },
                            }
                        },
                    }
                },
            }
        },
        "/widgets": {
            "post": {
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["name"],
                                "properties": {"name": {"type": "string"}},
                            }
                        }
                    },
                },
                "responses": {
                    "200": {
                        "description": "accepted",
                        "content": {
                            "application/json": {
                                "schema": {"type": "string"},
                                "examples": {
                                    "accepted": {"value": "accepted"}
                                },
                            }
                        },
                    }
                },
            }
        },
        "/binary-file": {
            "get": {
                "responses": {
                    "200": {
                        "description": "binary",
                        "content": {
                            "application/octet-stream": {
                                "schema": {"type": "string", "format": "binary"}
                            }
                        },
                    }
                }
            }
        },
    },
}


BINARY_HANDLER = """\
export const GET = ($) => {
  return $.response[200].binary("aGVsbG8gYmluYXJ5");
};
"""


@scenario(
    "features/generated_openapi.feature",
    "Generate, serve, and customize an OpenAPI API",
)
def test_generate_serve_and_customize_openapi_api():
    """Bind the OpenAPI developer journey to its step definitions."""


@given("a deterministic OpenAPI contract with validation and binary routes")
def write_openapi_contract(journey):
    journey.spec_path = journey.write_json("openapi.json", OPENAPI_DOCUMENT)
    journey.output = journey.project / "generated-api"
    journey.prefix = "/api/v9"


@when("I start the generated API with the named spec option and an explicit prefix")
def start_generated_api(journey):
    journey.allocate_port()
    journey.start_cli(
        "--spec",
        journey.spec_path,
        journey.output,
        "--prefix",
        journey.prefix,
        "--port",
        journey.port,
        "--generate",
        "--build-cache",
        "--serve",
        "--watch",
        "--no-update-check",
    )


@then("the generated API and Swagger UI are ready")
def generated_api_is_ready(journey):
    swagger = journey.wait_for_http(
        "/counterfact/swagger", lambda response: response.status_code == 200
    )
    assert swagger.status_code == 200, journey.logs()


@then("its route, type, and cache artifacts exist")
def generated_artifacts_exist(journey):
    expected = [
        journey.output / "routes" / "ping.ts",
        journey.output / "types" / "paths" / "ping.types.ts",
        journey.output / ".cache" / "ping.cjs",
    ]
    assert all(path.exists() for path in expected), (
        "Missing generated artifacts: "
        + ", ".join(str(path) for path in expected if not path.exists())
        + f"\n{journey.logs()}"
    )
    assert "export const GET" in expected[0].read_text(encoding="utf-8")


@then("deterministic scalar and array examples are served below the prefix")
def deterministic_examples_are_served(journey):
    ping = journey.request("get", f"{journey.prefix}/ping", name="ping")
    items = journey.request("get", f"{journey.prefix}/items", name="items")
    assert (ping.status_code, ping.text) == (200, "pong")
    assert items.status_code == 200
    assert items.json() == ["apple", "banana", "cherry"]


@then("a contract path containing a colon is served literally")
def colon_path_is_served(journey):
    response = journey.request("get", f"{journey.prefix}/path/with:colon")
    assert (response.status_code, response.text) == (200, "colon handled")


@then("the same routes are not served without the prefix")
def unprefixed_route_is_absent(journey):
    assert journey.request("get", "/ping").status_code == 404


@then("an unsupported method returns 405 with its Allow header")
def unsupported_method_reports_allow(journey):
    response = journey.request("post", f"{journey.prefix}/ping")
    assert response.status_code == 405
    assert response.headers.get("allow") == "GET"
    assert response.text == "The POST method is not allowed for /ping\n"


@then("unacceptable response negotiation returns 406")
def unacceptable_media_type_is_rejected(journey):
    response = journey.request(
        "get", f"{journey.prefix}/items", headers={"Accept": "text/plain"}
    )
    assert response.status_code == 406
    assert response.text == (
        "Not Acceptable: could not produce a response matching any of the "
        "following content types: text/plain"
    )


@then("a required header is enforced case-insensitively")
def required_header_is_case_insensitive(journey):
    missing = journey.request("get", f"{journey.prefix}/guard")
    lowercase = journey.request(
        "get",
        f"{journey.prefix}/guard",
        headers={"x-trace-id": "trace-1"},
    )
    assert missing.status_code == 400
    assert "header parameter 'X-Trace-ID' is required" in missing.text
    assert (lowercase.status_code, lowercase.text) == (200, "trace accepted")


@then("invalid bodies are rejected while valid bodies are accepted")
def request_bodies_are_validated(journey):
    invalid = journey.request("post", f"{journey.prefix}/widgets", json={})
    valid = journey.request(
        "post",
        f"{journey.prefix}/widgets",
        json={"name": "example widget"},
    )
    assert invalid.status_code == 400
    assert "body must have required property 'name'" in invalid.text
    assert (valid.status_code, valid.text) == (200, "accepted")


@when("I customize the generated binary handler")
def customize_binary_handler(journey):
    (journey.output / "routes" / "binary-file.ts").write_text(
        BINARY_HANDLER, encoding="utf-8"
    )


@then("the hot-reloaded handler serves the expected bytes and content type")
def binary_handler_is_hot_reloaded(journey):
    response = journey.wait_for_http(
        f"{journey.prefix}/binary-file",
        lambda candidate: (
            candidate.status_code == 200
            and candidate.content == b"hello binary"
        ),
    )
    assert "application/octet-stream" in response.headers.get("content-type", "")
    assert response.content == b"hello binary"
