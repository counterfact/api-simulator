Feature: Kick the tires on a stateful Counterfact API
  A developer can generate, shape, inspect, reload, and reset an API
  entirely through Counterfact's published product surfaces.

  Scenario: Shape and steer a stateful Pet API
    Given an OpenAPI contract for a stateful Pet API
    When I generate the Counterfact project
    Then the documented project artifacts exist
    Given I author deterministic pet handlers and named scenarios
    When I start Counterfact with watching, serving, and the REPL
    Then the REPL and Swagger UI are ready
    And the open REPL autocompletes the initial pet routes
    And the route builder distinguishes a missing and supplied pet ID
    And the route builder requires the documented pet body
    And a REPL request for the missing pet returns 404
    And request validation rejects an invalid pet
    When I create Fluffy through the REPL
    Then Fluffy is available as pet 1
    When I apply the addPendingPet scenario
    Then the additive scenario preserves Fluffy and adds Rex
    When I apply the serviceUnavailable scenario
    Then the REPL observes a service unavailable response
    When I apply the restoreService scenario
    Then the REPL observes a successful response again
    When I hot reload the pet route
    Then the new route revision is served without losing state
    When I add a pet history operation to the OpenAPI contract
    Then the history route is generated and served
    And the open REPL autocompletes the history route
    And the original pet state still exists
    When I apply the reset scenario
    Then the empty baseline is restored
    When I create Bella through the REPL
    Then Bella is available as pet 1
