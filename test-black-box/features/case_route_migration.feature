Feature: Preserve authored routes when exact-case OpenAPI paths share a file

  Scenario: Migrate an edited route and serve both spellings
    Given a typed route edited before a case-variant path was added
    When I generate and serve the case-variant contract
    Then the route spellings have distinct HTTP behavior
    And the shared route retains the original implementation and its backup
