Feature: Customize generated schema types through configuration
  A developer can select a schema type transform in a YAML configuration file
  and use it throughout generation without editing generated files.

  Scenario: Generate and watch customized schema types
    Given a nested YAML config selects a schema type transform module
    When I generate customized types through that config
    Then the generated contract uses the imported domain type
    When I watch that config and add a formatted property to the specification
    Then the regenerated contract applies the same transform to the new property

  Scenario: Customize shared versioned contracts
    Given a nested YAML config selects a schema type transform module
    And the config contains two versions of the same API group
    When I generate customized types through that config
    Then both versioned contracts use the imported domain type
    And the shared contract retains both API versions

  Scenario: Reject an invalid configured transform
    Given a nested YAML config selects a schema type transform module
    And the configured module does not export a callback
    When I generate customized types through that config
    Then the CLI reports the invalid transform and leaves existing types intact
