"""Exercise streaming through generated routes and the shipped CLI."""

import requests
from pytest_bdd import given, scenario, then, when


@scenario("features/streaming.feature", "Stream named events and resume from the last received id")
def test_stream_and_resume():
    """Bind the streaming developer journey."""


@given("a generated OpenAPI 3.2 project with explicit and legacy streams")
def generate_streaming_project(journey):
    event_content = {"text/event-stream": {"itemSchema": {
        "type": "object",
        "properties": {
            "data": {"type": "string"}, "event": {"type": "string"},
            "id": {"type": "string"}, "retry": {"type": "integer"},
            "comment": {"type": "string"},
        },
    }}}
    journey.spec_path = journey.write_json("openapi.json", {
        "openapi": "3.2.0",
        "info": {"title": "Streaming", "version": "1"},
        "paths": {
            "/events": {
                "get": {
                    "operationId": "feed",
                    "parameters": [{"name": "last-event-id", "in": "header", "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "events", "content": event_content}},
                },
                "post": {"responses": {"200": {"description": "release", "content": {"text/plain": {"schema": {"type": "string"}}}}}},
            },
            "/legacy": {"get": {"responses": {"200": {"description": "JSON data", "content": {
                "text/event-stream": {"itemSchema": {"type": "object", "properties": {"id": {"type": "string"}, "data": {"type": "string"}}}},
            }}}}},
        },
    })
    result = journey.run_cli(journey.spec_path, journey.output, "--generate", "--no-update-check")
    assert result.returncode == 0, result.stdout + result.stderr
    journey.write_text(journey.output / "routes/events.ts", '''
import type { Routes } from "../types/index.js";
let release: (() => void) | undefined;
export const GET: Routes["/events"]["GET"] = ($) => $.response[200].sse(events($.headers["last-event-id"]));
async function* events(lastId?: string) {
  if (lastId !== "1") {
    yield { comment: "heartbeat" };
    const released = new Promise<void>((resolve) => { release = resolve; });
    yield { id: "1", event: "update", retry: 100, data: "first" };
    await released;
  }
  yield { id: "2", event: "update", data: "second\\nline" };
}
export const POST = ($) => {
  release?.();
  return $.response[200].text("released");
};
''')
    journey.write_text(journey.output / "routes/legacy.ts", '''
export const GET = ($) => $.response[200].stream(events());
async function* events() { yield { id: "payload", data: "still JSON" }; }
''')


@when("I serve the customized streaming routes")
def serve_streams(journey):
    journey.allocate_port()
    journey.start_cli(journey.spec_path, journey.output, "--build-cache", "--serve", "--port", journey.port, "--no-update-check")
    journey.wait_for_http("/counterfact/swagger", lambda response: response.status_code == 200)


@then("a heartbeat and named event arrive before the producer is released")
def receive_first_event(journey):
    with requests.get(f"{journey.base_url}/events", stream=True, timeout=10) as response:
        assert response.status_code == 200, journey.logs()
        assert response.headers["Content-Type"].startswith("text/event-stream")
        assert response.headers["Cache-Control"] == "no-cache"
        assert response.headers["X-Accel-Buffering"] == "no"
        lines = response.iter_lines(chunk_size=1, decode_unicode=True)
        # The generator is blocked until POST /events. Reading these lines
        # therefore proves that delivery does not wait for stream completion.
        assert [next(lines) for _ in range(7)] == [
            ": heartbeat", "", "event: update", "id: 1", "data: first", "retry: 100", "",
        ], journey.logs()
        released = journey.request("post", "/events")
        assert released.text == "released", journey.logs()
        journey.remaining_stream_lines = list(lines)


@then("releasing the producer delivers the remaining multiline event")
def receive_remaining_event(journey):
    assert journey.remaining_stream_lines == ["event: update", "id: 2", "data: second", "data: line", ""]


@then("reconnecting with Last-Event-ID replays only the remaining event")
def resume_stream(journey):
    response = journey.request("get", "/events", headers={"Last-Event-ID": "1"})
    assert response.text == "event: update\nid: 2\ndata: second\ndata: line\n\n", journey.logs()


@then("legacy JSON data streams keep their existing wire format")
def legacy_stream(journey):
    response = journey.request("get", "/legacy")
    assert response.text == 'data: {"id":"payload","data":"still JSON"}\n\n', journey.logs()
