"""First-run CLI journeys through its shipped terminal and file interfaces."""

import os
import re
import select
import time
from urllib.parse import urlsplit

import pytest
from pytest_bdd import given, scenario, then, when

from support.journey import PROMPT, STARTUP_TIMEOUT


TERMINAL_ONLY = pytest.mark.skipif(os.name == "nt", reason="Windows does not provide pty")


@TERMINAL_ONLY
@scenario("features/first_run.feature", "Tour Counterfact and start a discovered nested contract")
def test_nested_contract():
    """Exercise discovery, tour, generated HTTP, and REPL as one journey."""


@TERMINAL_ONLY
@scenario("features/first_run.feature", "Cancel a first run without writing files")
def test_cancellation():
    """Exercise the terminal's public cancellation controls."""


@TERMINAL_ONLY
@scenario("features/first_run.feature", "Read documentation without starting a project")
def test_documentation():
    """Capture the browser-launch request without opening a browser."""


@scenario("features/first_run.feature", "Leave an unattended first run immediately")
def test_unattended():
    """No terminal is required for noninteractive guidance."""


@TERMINAL_ONLY
@scenario("features/first_run.feature", "Leave a CI first run even with a terminal")
def test_ci_terminal():
    """CI never prompts, even when a terminal is present."""


@scenario("features/first_run.feature", "Preserve configured and explicit startup")
def test_configured_startup():
    """Configured and explicit CLI invocations retain their output choices."""


@TERMINAL_ONLY
@scenario("features/first_run.feature", "Report a selected contract loading error")
def test_loading_error():
    """Missing references use Counterfact's normal startup diagnostics."""


@scenario("features/first_run.feature", "Report configuration errors before offering an intro")
def test_config_error():
    """An invalid existing config is never mistaken for a first run."""


@scenario("features/first_run.feature", "Preserve explicit startup without a config")
def test_explicit_startup():
    """Explicit positional and action-only commands bypass onboarding."""


@TERMINAL_ONLY
@scenario("features/first_run.feature", "Select and watch a local spec whose filename looks like a URL")
def test_local_scheme_filename():
    """A scheme-like local filename still loads and reloads as a file."""


def contract():
    return {
        "openapi": "3.0.3",
        "info": {"title": "First-run API", "version": "1.0.0"},
        "paths": {
            "/hello": {
                "get": {
                    "responses": {
                        "200": {
                            "description": "ok",
                            "content": {
                                "text/plain": {
                                    "schema": {"type": "string"},
                                    "examples": {"default": {"value": "hello from the intro"}},
                                }
                            },
                        }
                    }
                }
            }
        },
    }


@given("an empty first-run directory")
def empty_directory(journey):
    journey.environment.pop("CI", None)
    journey.original_files = set(journey.project.iterdir())


@given("a first-run directory with a nested OpenAPI contract and unrelated files")
def nested_contract(journey):
    empty_directory(journey)
    journey.write_json("contracts/nested/service.json", contract())
    journey.write_text("legacy.yaml", "swagger: '2.0'\ninfo: {title: Legacy, version: '1'}\npaths: {}\n")
    journey.write_text("broken.yaml", "openapi: [")
    journey.write_json("ordinary.json", {"name": "a project"})
    journey.write_json("future.json", {**contract(), "openapi": "4.0.0"})
    journey.write_json("node_modules/ignored.json", contract())
    journey.write_json("dist/ignored.json", contract())
    journey.write_json(".git/ignored.json", contract())
    journey.write_json("hidden/.secret.json", contract())
    (journey.project / "linked-contract.json").symlink_to(journey.project / "contracts/nested/service.json")
    (journey.project / "linked-directory").symlink_to(journey.project / "contracts", target_is_directory=True)
    (journey.project / "contracts/loop").symlink_to(journey.project, target_is_directory=True)


@given("an empty first-run directory running in CI")
def ci_directory(journey):
    empty_directory(journey)
    journey.environment["CI"] = "true"


@given("an empty first-run directory with a browser launcher")
def browser_launcher(journey):
    empty_directory(journey)
    # The OS launcher is a public integration surface. Record the target
    # instead of opening the developer's browser in an automated test.
    launcher = journey.write_text("launchers/open", '#!/bin/sh\nprintf "%s\\n" "$@" > "$INTRO_BROWSER_CAPTURE"\n')
    launcher.chmod(0o755)
    journey.environment["PATH"] = f"{launcher.parent}{os.pathsep}{journey.environment['PATH']}"
    journey.environment["INTRO_BROWSER_CAPTURE"] = str(journey.project / "browser-target.txt")
    journey.environment["BROWSER"] = str(launcher)
    journey.environment["DE"] = "generic"
    journey.environment.pop("XDG_CURRENT_DESKTOP", None)
    journey.environment.pop("DISPLAY", None)
    journey.environment.pop("WAYLAND_DISPLAY", None)
    journey.original_files = set(journey.project.iterdir())


@given("a configured project with a local contract")
def configured_project(journey):
    empty_directory(journey)
    journey.write_json("contracts/nested/service.json", contract())
    journey.write_text("counterfact.yaml", "\n".join([
        "spec: contracts/nested/service.json",
        "destination: configured-output",
        "generate: true",
        "serve: false",
        "repl: false",
        "watch: false",
        f"port: {journey.allocate_port()}",
        "update-check: false",
    ]))


@given("a first-run contract with a missing reference")
def missing_reference(journey):
    empty_directory(journey)
    document = contract()
    document["paths"] = {"/hello": {"$ref": "./missing.yaml"}}
    journey.write_json("contracts/nested/service.json", document)


@given("a first-run directory with a malformed default config")
def malformed_config(journey):
    empty_directory(journey)
    journey.write_text("counterfact.yaml", "spec: [")


@given("an empty first-run directory with a local contract")
def explicit_contract(journey):
    empty_directory(journey)
    journey.write_json("contracts/nested/service.json", contract())


@given("a first-run contract named http:spec.json")
def scheme_filename(journey):
    empty_directory(journey)
    journey.write_json("http:spec.json", contract())


@when("I run Counterfact without arguments in a terminal")
def start_intro(journey):
    journey.start_cli(terminal=True)
    if journey.environment.get("CI") != "true":
        journey.terminal.wait_for("Choose [1]: ", STARTUP_TIMEOUT)


@when("I run Counterfact without arguments without a terminal")
def unattended_intro(journey):
    journey.run_cli(timeout=10)


@then("the intro offers documentation, a guided tour, and Swagger Petstore by default")
def intro_options(journey):
    transcript = journey.transcript()
    assert "Swagger Petstore (default)" in transcript
    assert "View documentation" in transcript
    assert "Guided tour" in transcript


@then("only supported local contracts are offered")
def supported_contracts(journey):
    transcript = journey.transcript()
    assert "contracts/nested/service.json" in transcript
    assert "legacy.yaml" in transcript
    for excluded in ["broken.yaml", "ordinary.json", "future.json", "ignored.json", ".secret", "linked-contract", "linked-directory", "contracts/loop"]:
        assert excluded not in transcript


def type_and_wait(journey, keys, expected):
    start = len(journey.terminal.output)
    os.write(journey.terminal.terminal, keys)
    journey.terminal.wait_for(expected, STARTUP_TIMEOUT, start=start)


@when("I enter an invalid menu choice and take the guided tour")
def guided_tour(journey):
    type_and_wait(journey, b"invalid\r", "Choose one of the listed numbers")
    type_and_wait(journey, b"3\r", "Press Enter to continue")
    assert "1/3" in journey.transcript()
    type_and_wait(journey, b"\r", "2/3")
    journey.terminal.wait_for("Press Enter to continue", STARTUP_TIMEOUT, start=journey.terminal.output.rfind(b"2/3"))
    type_and_wait(journey, b"\r", "3/3")
    journey.terminal.wait_for("Press Enter to continue", STARTUP_TIMEOUT, start=journey.terminal.output.rfind(b"3/3"))
    type_and_wait(journey, b"\r", "Choose [1]: ")
    assert "hot-reloads" in journey.transcript()


@when("I select the nested contract and an available server port")
def choose_nested_contract(journey):
    match = re.search(r"(\d+)\) contracts/nested/service.json", journey.transcript())
    assert match is not None, journey.logs()
    type_and_wait(journey, f"{match.group(1)}\r".encode(), "Output directory [api]: ")
    type_and_wait(journey, b"\r", "Server port [3100]: ")
    type_and_wait(journey, b"invalid\r", "Choose a port between")
    journey.output = journey.project / "api"
    os.write(journey.terminal.terminal, f"{journey.allocate_port()}\r".encode())


@when("I select the contract whose filename looks like a URL")
def choose_scheme_filename(journey):
    match = re.search(r"(\d+)\) http:spec\.json", journey.transcript())
    assert match is not None, journey.logs()
    type_and_wait(journey, f"{match.group(1)}\r".encode(), "Output directory [api]: ")
    type_and_wait(journey, b"\r", "Server port [3100]: ")
    journey.output = journey.project / "api"
    os.write(journey.terminal.terminal, f"{journey.allocate_port()}\r".encode())


@when("I change the selected contract's response example")
def change_scheme_contract(journey):
    document = contract()
    examples = document["paths"]["/hello"]["get"]["responses"]["200"]["content"]["text/plain"]["examples"]
    examples["default"]["value"] = "reloaded from a local file"
    journey.write_json("http:spec.json", document)


@then("the running API reloads the local contract change")
def local_contract_reloads(journey):
    journey.wait_for_http(
        "/hello",
        lambda response: response.status_code == 200 and response.text == "reloaded from a local file",
    )


@then("the generated API and Swagger UI work and the REPL accepts requests")
def api_works(journey):
    journey.terminal.wait_for(PROMPT, STARTUP_TIMEOUT)
    assert (journey.output / "routes/hello.ts").exists()
    response = journey.wait_for_http("/hello", lambda response: response.status_code == 200)
    assert response.text == "hello from the intro"
    swagger_url = re.search(r"Swagger UI.*?(http://localhost:\d+\S*)", journey.transcript())
    assert swagger_url is not None, journey.logs()
    swagger = journey.request("get", urlsplit(swagger_url.group(1)).path)
    assert swagger.status_code == 200
    assert "hello from the intro" in journey.terminal.command('await client.get("/hello")')


@then("the intro reports that no local contracts were found")
def no_contracts(journey):
    assert "No local OpenAPI documents found." in journey.transcript()


@when("I cancel the intro using q")
def cancel_q(journey):
    os.write(journey.terminal.terminal, b"q\r")


@when("I cancel the intro using Ctrl+C")
def cancel_control_c(journey):
    os.write(journey.terminal.terminal, b"\x03")


@when("I cancel the intro using Ctrl+D")
def cancel_control_d(journey):
    os.write(journey.terminal.terminal, b"\x04")


@when("I cancel the intro using q at the destination")
def cancel_destination(journey):
    type_and_wait(journey, b"\r", "Output directory [api]: ")
    os.write(journey.terminal.terminal, b"q\r")


@when("I cancel the intro using q during the tour")
def cancel_tour(journey):
    type_and_wait(journey, b"3\r", "Press Enter to continue")
    os.write(journey.terminal.terminal, b"q\r")


def terminal_exit(journey):
    # Observe exit as well as text: a promise left pending after EOF can print
    # guidance and still leave the CLI hanging. Bound this wait and retain logs.
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        readable, _, _ = select.select([journey.terminal.terminal], [], [], 0.05)
        if readable:
            try:
                journey.terminal.output.extend(os.read(journey.terminal.terminal, 4096))
            except OSError:
                pass
        child, status = os.waitpid(journey.terminal.process_id, os.WNOHANG)
        if child:
            return os.waitstatus_to_exitcode(status)
    raise AssertionError(f"CLI did not exit.\n{journey.logs()}")


@then("Counterfact exits successfully without generating files")
def exits_without_files(journey):
    assert terminal_exit(journey) == 0, journey.logs()
    assert set(journey.project.iterdir()) == journey.original_files


@when("I choose documentation")
def choose_documentation(journey):
    type_and_wait(journey, b"2\r", "Documentation: ")


@then("the documentation URL is handed to the browser without generating files")
def documentation_works(journey):
    assert terminal_exit(journey) == 0, journey.logs()
    target = journey.project / "browser-target.txt"
    deadline = time.monotonic() + 5
    while not target.exists() and time.monotonic() < deadline:
        time.sleep(0.05)
    assert target.read_text().strip() == "https://counterfact.dev/docs/getting-started/"
    assert not (journey.project / "api").exists()
    assert not (journey.project / "routes").exists()


@then("Counterfact prints explicit startup guidance and exits without generating files")
def unattended_guidance(journey):
    if journey.terminal is not None:
        journey.terminal.wait_for("Run without OpenAPI: npx counterfact _", STARTUP_TIMEOUT)
        output = journey.transcript()
        assert terminal_exit(journey) == 0, journey.logs()
    else:
        result = journey.command_results["cli"]
        assert result.returncode == 0, result.stderr
        output = result.stdout
    assert "Documentation:" in output
    assert "Start with a spec:" in output
    assert "Choose [1]" not in output
    assert "Mock server" not in output
    assert set(journey.project.iterdir()) == journey.original_files


@then("the configured output is generated without an intro")
def configured_output(journey):
    result = journey.command_results["cli"]
    assert result.returncode == 0, result.stderr
    assert "Welcome to Counterfact" not in result.stdout
    assert (journey.project / "configured-output/routes/hello.ts").exists()


@when("I run Counterfact with an explicit spec and output override")
def explicit_cli(journey):
    journey.run_cli("--spec", "contracts/nested/service.json", "explicit-output", "--generate", "--no-update-check", name="explicit")


@then("the explicit output is generated without an intro")
def explicit_output(journey):
    result = journey.command_results["explicit"]
    assert result.returncode == 0, result.stderr
    assert "Welcome to Counterfact" not in result.stdout
    assert (journey.project / "explicit-output/routes/hello.ts").exists()


@then("Counterfact reports the loading error and exits unsuccessfully")
def loading_error(journey):
    journey.terminal.wait_for("Could not load the OpenAPI spec", STARTUP_TIMEOUT)
    assert terminal_exit(journey) == 1, journey.logs()


@then("Counterfact reports the config error without offering an intro")
def config_error(journey):
    result = journey.command_results["cli"]
    assert result.returncode != 0
    assert "YAMLException" in result.stderr
    assert "Welcome to Counterfact" not in result.stdout
    assert not (journey.project / "api").exists()


@when("I explicitly generate from the contract and then without OpenAPI")
def explicit_generation(journey):
    journey.run_cli("contracts/nested/service.json", "explicit-output", "--generate", "--no-update-check", name="positional")
    journey.run_cli("--generate", "--no-update-check", name="actions")


@then("explicit positional and action-only commands generate without an intro")
def explicit_generation_works(journey):
    for name in ["positional", "actions"]:
        result = journey.command_results[name]
        assert result.returncode == 0, result.stderr
        assert "Welcome to Counterfact" not in result.stdout
    assert (journey.project / "explicit-output/routes/hello.ts").exists()
