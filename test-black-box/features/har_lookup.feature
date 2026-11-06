Feature: Use captured HAR responses in an editable handler
  Scenario: Replay, fall back and update a recording without restarting
    Given a generated API with a HAR-aware handler
    When I start the HAR-aware API
    Then matching requests return the recorded response
    And unmatched requests use the handler fallback
    And requests with a different header use the handler fallback
    When I move HAR lookup into root middleware
    Then matching requests return the recorded response
    And unmatched requests use the handler fallback
    And requests with a different header use the handler fallback
    When I replace the recording with an invalid file
    Then the last good recorded response remains available
    When I update the recorded response
    Then the updated recording is served without restarting
    When I remove the recording
    Then matching requests use the handler fallback
