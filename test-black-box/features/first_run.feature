Feature: Find a useful starting point on the first run
  An unconfigured developer can discover a contract or learn Counterfact,
  while existing projects and unattended commands preserve their behavior.

  Scenario: Tour Counterfact and start a discovered nested contract
    Given a first-run directory with a nested OpenAPI contract and unrelated files
    When I run Counterfact without arguments in a terminal
    Then the intro offers documentation, a guided tour, and Swagger Petstore by default
    And only supported local contracts are offered
    When I enter an invalid menu choice and take the guided tour
    And I select the nested contract and an available server port
    Then the generated API and Swagger UI work and the REPL accepts requests

  Scenario Outline: Cancel a first run without writing files
    Given an empty first-run directory
    When I run Counterfact without arguments in a terminal
    Then the intro reports that no local contracts were found
    When I cancel the intro using <method>
    Then Counterfact exits successfully without generating files

    Examples:
      | method               |
      | q                    |
      | Ctrl+C               |
      | Ctrl+D               |
      | q at the destination |
      | q during the tour    |

  Scenario: Read documentation without starting a project
    Given an empty first-run directory with a browser launcher
    When I run Counterfact without arguments in a terminal
    And I choose documentation
    Then the documentation URL is handed to the browser without generating files

  Scenario: Leave an unattended first run immediately
    Given an empty first-run directory
    When I run Counterfact without arguments without a terminal
    Then Counterfact prints explicit startup guidance and exits without generating files

  Scenario: Leave a CI first run even with a terminal
    Given an empty first-run directory running in CI
    When I run Counterfact without arguments in a terminal
    Then Counterfact prints explicit startup guidance and exits without generating files

  Scenario: Preserve configured and explicit startup
    Given a configured project with a local contract
    When I run Counterfact without arguments without a terminal
    Then the configured output is generated without an intro
    When I run Counterfact with an explicit spec and output override
    Then the explicit output is generated without an intro

  Scenario: Report a selected contract loading error
    Given a first-run contract with a missing reference
    When I run Counterfact without arguments in a terminal
    And I select the nested contract and an available server port
    Then Counterfact reports the loading error and exits unsuccessfully

  Scenario: Report configuration errors before offering an intro
    Given a first-run directory with a malformed default config
    When I run Counterfact without arguments without a terminal
    Then Counterfact reports the config error without offering an intro

  Scenario: Preserve explicit startup without a config
    Given an empty first-run directory with a local contract
    When I explicitly generate from the contract and then without OpenAPI
    Then explicit positional and action-only commands generate without an intro

  Scenario: Select and watch a local spec whose filename looks like a URL
    Given a first-run contract named http:spec.json
    When I run Counterfact without arguments in a terminal
    And I select the contract whose filename looks like a URL
    Then the generated API and Swagger UI work and the REPL accepts requests
    When I change the selected contract's response example
    Then the running API reloads the local contract change
