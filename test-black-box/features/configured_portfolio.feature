Feature: Compose several contracts into one API portfolio
  A developer can use one Counterfact configuration to preserve routing,
  grouping, versioning, and declaration-order semantics across many specs.

  Scenario: Compose a configured API portfolio
    Given a configured portfolio of root, shared, duplicate, prefixed, and versioned specs
    When I start the portfolio with a CLI port override
    Then distinct root-mounted APIs are reachable
    And a request falls through to the third root-mounted spec
    And shared-path GET and POST requests reach their declaring specs
    And another method receives a combined Allow header
    And declaration order resolves duplicate operations
    And explicit prefixes route grouped APIs without exposing group names
    And the CLI port override serves every configured API
    And versioned specs serve distinct URLs from shared grouped artifacts
    And generated artifacts are grouped with no unintended top-level routes
