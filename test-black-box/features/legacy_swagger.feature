Feature: Preserve a legacy Swagger simulation
  A developer can generate and serve a Swagger 2 contract with the same CLI.

  Scenario: Run a legacy Swagger contract
    Given a deterministic Swagger 2 contract
    When I generate and serve the legacy API
    Then the legacy response is deterministic
    And the legacy route and cache artifacts exist
