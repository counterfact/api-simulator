Feature: Generate only a standalone API client
  A developer can write just a typed API client, with its own data contracts,
  without routes, shared types, scenarios, or a server.

  Scenario: Generate standalone clients for a configured portfolio
    Given a configured portfolio of grouped specs that also enables serving
    When I generate only the clients
    Then only a standalone client is written for each group
    And each schema has its own data contract re-exported by the barrel
    And the config file's serving options are reported as ignored for the client

  Scenario: Reject conflicting or unsupported client-only commands
    Given a single contract for a client
    When I combine the client-only flag with serving
    Then the client-only command fails with "cannot be combined with --serve" and writes nothing
    When I generate only the client for a versioned spec
    Then the client-only command fails with "does not support versioned APIs" and writes nothing
