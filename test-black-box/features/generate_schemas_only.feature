Feature: Generate only the schema types
  A developer can write just the component schema types from one or more
  contracts into a directory, without routes, scenarios, or a server.

  Scenario: Generate schemas for a configured portfolio
    Given a configured portfolio with grouped and versioned specs that also enables serving
    When I generate only the schemas
    Then only the schema types are written beside their group and version
    And the config file's serving options are reported as ignored

  Scenario: Reject conflicting or incomplete schema-only commands
    Given a single contract with schemas
    When I combine the schema-only flag with serving
    Then the command fails and writes nothing
    When I omit the destination
    Then the command requires a destination and writes nothing
