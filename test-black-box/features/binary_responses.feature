Feature: Serve binary downloads with their declared media types
  A developer can customize generated routes to serve exact binary bytes and
  negotiate their media types without changing existing octet-stream downloads.

  Scenario: Serve PDF and legacy binary downloads
    Given an OpenAPI contract for PDF and octet-stream downloads
    When I generate the download API and customize its binary responses
    And I serve the customized download API
    Then requesting a PDF returns its exact bytes and PDF content type
    And requesting an incompatible representation of the PDF returns 406
    And the single-argument binary response remains an octet-stream download
    And the download with alternatives negotiates PDF and plain text
