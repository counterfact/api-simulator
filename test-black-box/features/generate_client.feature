Feature: Generate a typed Fetch client
  The command generates one client for each configured specification and version.

  Scenario: Generate a Fetch client for a configured portfolio
    Given a configured portfolio with grouped and versioned specs that also enables serving
    When I generate only the Fetch clients
    Then only the client entry points, validators and referenced schemas are generated
