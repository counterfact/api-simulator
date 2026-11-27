"""Operate the shipped CLI to verify handler opt-in, fallbacks and HAR reload."""
import time

from pytest_bdd import given, scenario, then, when


@scenario("features/har_lookup.feature", "Replay, fall back and update a recording without restarting")
def test_har_lookup_journey():
    pass


def recording(text):
    return {"log": {"version": "1.2", "entries": [{
        "request": {"method": "GET", "url": "https://captured.example/api/items?kind=recorded", "headers": [{"name": "X-ID", "value": "recorded"}]},
        "response": {"status": 200, "headers": [{"name": "Content-Type", "value": "text/plain"}], "content": {"text": text}},
    }]}}


@given("a generated API with a HAR-aware handler")
def generate(journey):
    spec = journey.write_json("openapi.json", {
        "openapi": "3.0.3", "info": {"title": "HAR API", "version": "1"},
        "paths": {"/items": {"get": {"responses": {
            "200": {"description": "Recorded", "content": {"text/plain": {"schema": {"type": "string"}}}},
            "404": {"description": "Fallback", "content": {"text/plain": {"schema": {"type": "string"}}}},
        }}}},
    })
    journey.spec_path = spec
    result = journey.run_cli(spec, journey.output, "--generate", "--no-update-check")
    assert result.returncode == 0, result.stdout + result.stderr
    journey.write_text("out/routes/items.ts", 'import type { HTTP_GET } from "../types/paths/items.types.js";\nexport const GET: HTTP_GET = ($) => $.har(({ defaultMatch, match }) => defaultMatch && match("header", "x-id")) ?? $.response[404].text("fallback");\n')
    journey.write_json("out/har/session.har", recording("recorded"))


@when("I start the HAR-aware API")
def start(journey):
    journey.allocate_port()
    journey.start_cli(journey.spec_path, journey.output, "--prefix", "/api", "--port", journey.port, "--serve", "--watch", "--no-update-check")


@then("matching requests return the recorded response")
def recorded(journey):
    journey.wait_for_http("/api/items?kind=recorded", lambda response: response.status_code == 200 and response.text == "recorded", headers={"x-id": "recorded"})


@then("unmatched requests use the handler fallback")
def fallback(journey):
    response = journey.request("get", "/api/items?kind=other")
    assert response.status_code == 404 and response.text == "fallback"


@when("I replace the recording with an invalid file")
def invalid(journey):
    journey.write_text("out/har/session.har", "{invalid private payload")


@then("the last good recorded response remains available")
def retained(journey):
    deadline = time.monotonic() + 10
    while "retaining the last good collection" not in journey.logs():
        assert time.monotonic() < deadline, journey.logs()
        time.sleep(0.05)
    assert "private payload" not in journey.logs()
    recorded(journey)


@when("I update the recorded response")
def update(journey):
    journey.write_json("out/har/session.har", recording("updated"))


@then("the updated recording is served without restarting")
def updated(journey):
    journey.wait_for_http("/api/items?kind=recorded", lambda response: response.status_code == 200 and response.text == "updated", headers={"x-id": "recorded"})


@when("I remove the recording")
def remove(journey):
    (journey.output / "har" / "session.har").unlink()


@then("matching requests use the handler fallback")
def removed(journey):
    journey.wait_for_http("/api/items?kind=recorded", lambda response: response.status_code == 404 and response.text == "fallback", headers={"x-id": "recorded"})


@then("requests with a different header use the handler fallback")
def different_header(journey):
    response = journey.request("get", "/api/items?kind=recorded", headers={"x-id": "other"})
    assert response.status_code == 404 and response.text == "fallback"


@when("I move HAR lookup into root middleware")
def middleware(journey):
    journey.write_text("out/routes/items.ts", 'import type { HTTP_GET } from "../types/paths/items.types.js";\nexport const GET: HTTP_GET = ($) => $.response[404].text("fallback");\n')
    journey.wait_for_http("/api/items?kind=recorded", lambda response: response.status_code == 404 and response.text == "fallback", headers={"x-id": "recorded"})
    journey.write_text("out/routes/_.middleware.ts", 'import type { Middleware } from "../types/_.middleware.js";\nexport const middleware: Middleware = ($, respondTo) => $.har(({ defaultMatch, match }) => defaultMatch && match("header", "x-id")) ?? respondTo($);\n')
