Feature: Evolve a contract without stale behavior
  A developer can compose contract inputs, observe live changes, and prune
  generated routes without restarting the active Counterfact server.

  Scenario: Evolve a split contract safely
    Given a split OpenAPI contract with an obsolete route
    And two ordered overlays update a response and remove a route
    When I generate and serve the composed contract
    Then the external schema drives generated types and a deterministic response
    And the last overlay update wins
    And the overlay-removed route has no generated artifact
    When I change an existing response example in the source contract
    Then the live server returns the changed example
    When I remove the obsolete operation and regenerate with prune
    Then the obsolete generated route is deleted
