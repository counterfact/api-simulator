Feature: Simulate a reconnectable event stream
  A developer can stream explicit SSE frames without buffering the response
  and use the client's event id to resume a simulated feed.

  Scenario: Stream named events and resume from the last received id
    Given a generated OpenAPI 3.2 project with explicit and legacy streams
    When I serve the customized streaming routes
    Then a heartbeat and named event arrive before the producer is released
    And releasing the producer delivers the remaining multiline event
    And reconnecting with Last-Event-ID replays only the remaining event
    And legacy JSON data streams keep their existing wire format
