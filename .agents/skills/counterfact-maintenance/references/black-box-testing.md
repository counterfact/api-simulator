# Product black-box testing

Reserve `test-black-box/` for implementation-unaware behavioral tests that exercise Counterfact as a complete product through user-facing interfaces.
A test is black-box because it controls product inputs and observes product outputs without depending on implementation details, not because it runs in a particular process.
The product execution may cross several packages without the harness knowing or selecting which packages are involved.
These tests may be more sensitive to subtle regressions than they are helpful at pinpointing their source.

Gherkin feature files are the authoritative inventory of black-box behavior.
Each scenario should describe a coherent developer journey and preserve every distinct user-visible claim, while equal or stronger journey coverage should replace duplicate assertions.
Python under `test-black-box/` is limited to pytest-bdd scenario bindings, step glue, and lifecycle support; do not add standalone pytest test functions as a second behavioral inventory.
Create contracts and configurations inside the scenario's temporary project instead of relying on mutable state or shared checked-in fixtures.
Reuse one generated project and server within a scenario, but never share mutable state between scenarios.
Use dynamic ports, deterministic named examples, bounded polling with complete process diagnostics, and teardown that terminates every child process.

Allowed observation and control surfaces are:

- The shipped `counterfact` CLI's arguments, stdin, stdout, stderr, and exit status.
- HTTP requests to a server started through that CLI.
- Files generated or changed by that CLI.
- Keystrokes and terminal output from a CLI process attached to a real pseudo-terminal.

Do not put a test in `test-black-box/` if it does any of the following:

- Generates or runs a standalone consumer script whose purpose is to exercise `counterfact` or `@counterfact/*` package APIs directly.
- Imports package source files, private modules, or `dist` paths.
- Constructs an application, server, runner, registry, loader, or client directly instead of operating the shipped product.
- Mocks implementation internals or asserts private state, internal call order, or concrete implementation topology.

The test layers are intentionally complementary:

- Black-box tests detect externally observable behavioral drift, including regressions that emerge only across package boundaries.
- Unit and type tests isolate behavior and provide faster, more diagnostic failures.
- Package-consumer and contract tests exercise declared package exports directly.
- Packed-consumer and package-closure tests prove that published artifacts install with complete declared dependencies and exports.

A separate process is neither necessary nor sufficient evidence that a test is black-box.
Calling the shipped CLI from Python is valid; using Python only to launch a Node script that imports packages is a package-consumer test, not a product black-box test.
Writing an editable generated route and letting the shipped CLI load it remains a product black-box test, even when that route uses a documented handler type from `counterfact`.
Broad and focused tests may overlap when they protect behavior at different abstraction levels.

Before adding or approving a black-box test:

1. State the user-visible regression or behavior in one sentence.
2. Identify the product interface that a user would operate.
3. Launch the shipped product without importing application packages into the test harness or a standalone consumer script.
4. Assert only observable output such as terminal text, HTTP responses, exit status, or generated files.
5. Confirm the test fails with the regression present, not merely that it passes after the fix.
6. Search `test-black-box/` for generated consumer scripts, direct package imports, and private source or build paths:

   ```bash
   rg -n '_run_node_script|consume\.mjs|--eval|input-type=module|packages/.+/(src|dist)/' test-black-box
   rg -n '@counterfact/|import .*counterfact|from .*counterfact' test-black-box
   ```

For pseudo-terminal teardown, close the master before waiting for child exit so unread output cannot block terminal draining. Bound every wait, including after SIGTERM, and escalate to SIGKILL rather than using an unbounded waitpid. Avoid parent HTTP-server threads before forkpty on macOS; keep HTTP fixtures in separate processes.

For interactive CLI behavior, use a real pseudo-terminal and send the literal keystrokes a user would type.
If the required terminal facility is unavailable on an operating system, skip explicitly and ensure another CI operating system executes the test; do not replace the test with a direct function call.
Keep that operating-system skip scoped to the real-terminal scenario so non-interactive journeys continue to run cross-platform.

Keep pytest's supported major range compatible with pytest-bdd in `test-black-box/requirements.txt`; pytest-bdd uses pytest fixture internals, so verify dependency upgrades by executing a Gherkin scenario rather than collection alone.
