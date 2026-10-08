# Counterfact accessibility

## Scope

This statement covers Counterfact's command-line interface, optional live REPL, bundled Swagger UI, repository documentation, and the documentation website at [counterfact.dev](https://counterfact.dev/).
It does not assess applications built against a simulated API, user-supplied OpenAPI descriptions, or third-party tools used alongside Counterfact.

## Current support

- The [getting-started guide](packages/counterfact/docs/getting-started.md) provides written commands and request examples.
  The local API can be called by an HTTP client without operating Swagger UI.
- The [command-line reference](packages/counterfact/docs/reference.md#cli-reference) documents command-line options and the optional REPL.
  The REPL accepts typed commands for inspecting and changing simulator state.
- The documentation site's source uses headings, a main content landmark, named navigation, and visible focus styles for links and buttons.
  The quality-study pages also include a skip link and labeled, keyboard-focusable regions around wide tables.

These descriptions are based on documentation and source inspection, rather than a claim that every interface works with every assistive technology.

## Limitations and verification gaps

This statement does not establish WCAG conformance or certify compatibility with any screen reader, terminal, browser, or other assistive technology.
Keyboard-only navigation, screen-reader output, zoom and reflow, and color contrast across the website and Swagger UI have not been verified as part of preparing this statement.
The REPL uses a colored prompt and live terminal output; their usability depends on the terminal and assistive technology, and has not been evaluated here.
Swagger UI is supplied by a dependency, and this statement does not establish its accessibility in Counterfact's configuration.

## Report a barrier

Please [open an issue in Counterfact's issue tracker](https://github.com/counterfact/api-simulator/issues/new) and describe the accessibility barrier.
Include, where possible:

- The command, documentation URL, or Swagger UI operation you were using.
- What you expected, what happened, and how it prevented or made your task harder.
- Steps to reproduce and the Counterfact version.
- Your operating system, terminal or browser, and assistive technology, if relevant and comfortable to share.

Reports are public, so remove credentials, private API data, and other sensitive information.
You do not need to identify a WCAG criterion or propose a fix to report a barrier.
This statement sets no response-time or remediation deadline.
