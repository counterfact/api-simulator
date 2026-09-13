Feature: Generate and run an OpenAPI simulation
  A developer can turn a modern contract into a prefixed, validated,
  hot-reloadable API through the shipped Counterfact CLI.

  Scenario: Generate, serve, and customize an OpenAPI API
    Given a deterministic OpenAPI contract with validation and binary routes
    When I start the generated API with the named spec option and an explicit prefix
    Then the generated API and Swagger UI are ready
    And its route, type, and cache artifacts exist
    And deterministic scalar and array examples are served below the prefix
    And a contract path containing a colon is served literally
    And the same routes are not served without the prefix
    And an unsupported method returns 405 with its Allow header
    And unacceptable response negotiation returns 406
    And a required header is enforced case-insensitively
    And invalid bodies are rejected while valid bodies are accepted
    When I customize a handler that relies on the implicit success status
    Then its implicit 200 response is still validated
    When I customize the generated binary handler
    Then the hot-reloaded handler serves the expected bytes and content type
