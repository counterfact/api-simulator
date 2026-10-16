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
@scenario("features/first_run.feature", "Start a discovered nested contract")
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
    if "INTRO_BROWSER_CAPTURE" not in journey.environment:
        ci = journey.environment.get("CI")
        browser_launcher(journey)
        if ci is not None:
            journey.environment["CI"] = ci
    journey.start_cli(terminal=True)
    if journey.environment.get("CI") != "true":
        journey.terminal.wait_for("Choose [1]: ", STARTUP_TIMEOUT)


@when("I run Counterfact without arguments without a terminal")
def unattended_intro(journey):
    journey.run_cli(timeout=10)


@then("the intro offers a guided example, my own document, and documentation")
def intro_options(journey):
    transcript = journey.transcript()
    assert "Try a guided example (recommended)" in transcript
    assert "Use my OpenAPI document" in transcript
    assert "Open documentation" in transcript
    assert "Looking for local" not in transcript


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


@when("I choose my OpenAPI document")
def choose_own_document(journey):
    type_and_wait(journey, b"invalid\r", "Choose one of the listed numbers")
    type_and_wait(journey, b"2\r", "Choose a document: ")


@when("I select the nested contract and an available server port")
def choose_nested_contract(journey):
    if "Choose a document:" not in journey.transcript():
        type_and_wait(journey, b"2\r", "Choose a document: ")
    match = re.search(r"(\d+)\) contracts/nested/service.json", journey.transcript())
    assert match is not None, journey.logs()
    type_and_wait(journey, f"{match.group(1)}\r".encode(), "Output directory [api] (b: back): ")
    type_and_wait(journey, b"\r", "Server port [3100]: ")
    type_and_wait(journey, b"invalid\r", "Choose a port between")
    journey.output = journey.project / "api"
    os.write(journey.terminal.terminal, f"{journey.allocate_port()}\r".encode())


@when("I select the contract whose filename looks like a URL")
def choose_scheme_filename(journey):
    type_and_wait(journey, b"2\r", "Choose a document: ")
    match = re.search(r"(\d+)\) http:spec\.json", journey.transcript())
    assert match is not None, journey.logs()
    type_and_wait(journey, f"{match.group(1)}\r".encode(), "Output directory [api] (b: back): ")
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
    type_and_wait(journey, b"2\r", "Choose a document: ")
    type_and_wait(journey, b"p\r", "OpenAPI path or URL")
    type_and_wait(journey, b"./openapi.json\r", "Output directory [api] (b: back): ")
    os.write(journey.terminal.terminal, b"q\r")


@when("I cancel the intro using q before starting example")
def cancel_tour(journey):
    type_and_wait(journey, b"\r", "Start [Enter]")
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
    type_and_wait(journey, b"3\r", "Documentation: ")


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






@TERMINAL_ONLY
@scenario("features/first_run.feature", "Preserve an existing example and choose an available port")
def test_tutorial_existing_directory():
    """Protect existing files and recover from a port conflict."""


@TERMINAL_ONLY
@scenario("features/first_run.feature", "Enter a contract path and return from document selection")
def test_enter_contract():
    """Use explicit document entry and back navigation."""


@when("I start the guided example on an available port")
def start_example(journey):
    type_and_wait(journey, b"\r", "Start [Enter]")
    type_and_wait(journey, b"p\r", "Server port [3100]: ")
    type_and_wait(journey, f"{journey.allocate_port()}\r".encode(), "Start [Enter]")
    journey.output = journey.project / "counterfact-demo"
    os.write(journey.terminal.terminal, b"\r")
    journey.terminal.wait_for("Coffee shop walkthrough", STARTUP_TIMEOUT)




























@given("an existing example directory and an occupied server port")
def existing_example(journey):
    import socket
    empty_directory(journey)
    journey.write_text("counterfact-demo/keep.txt", "user content")
    with socket.socket() as listener:
        listener.bind(("", 0))
        listener.listen()
        journey.occupied_port = listener.getsockname()[1]
        yield


@when("I return from example setup to the opening menu")
def back_from_example(journey):
    type_and_wait(journey, b"\r", "Start [Enter]")
    assert "counterfact-demo-2/" in journey.transcript()
    type_and_wait(journey, b"b\r", "Choose [1]: ")
    assert not (journey.project / "counterfact-demo-2").exists()


@when("I start the example after correcting an occupied port")
def correct_port(journey):
    type_and_wait(journey, b"\r", "Start [Enter]")
    type_and_wait(journey, b"p\r", "Server port [3100]: ")
    type_and_wait(journey, f"{journey.occupied_port}\r".encode(), "already in use")
    type_and_wait(journey, f"{journey.allocate_port()}\r".encode(), "Start [Enter]")
    journey.output = journey.project / "counterfact-demo-2"
    os.write(journey.terminal.terminal, b"\r")
    journey.terminal.wait_for("Coffee shop walkthrough", STARTUP_TIMEOUT)


@then("the existing example is unchanged and the new example runs")
def existing_unchanged(journey):
    assert (journey.project / "counterfact-demo/keep.txt").read_text() == "user content"
    assert set((journey.project / "counterfact-demo").iterdir()) == {journey.project / "counterfact-demo/keep.txt"}
    assert journey.request("get", "/products").json()[2]["stock"] == 0


@when("I return from document selection to the opening menu")
def back_from_documents(journey):
    type_and_wait(journey, b"2\r", "Choose a document: ")
    type_and_wait(journey, b"b\r", "Choose [1]: ")


@when("I enter the contract path and choose an available server port")
def enter_contract_path(journey):
    type_and_wait(journey, b"2\r", "Choose a document: ")
    type_and_wait(journey, b"p\r", "OpenAPI path or URL")
    type_and_wait(journey, b"contracts/nested/service.json\r", "Output directory [api] (b: back): ")
    type_and_wait(journey, b"\r", "Server port [3100]: ")
    journey.output = journey.project / "api"
    os.write(journey.terminal.terminal, f"{journey.allocate_port()}\r".encode())


@TERMINAL_ONLY
@scenario("features/first_run.feature", "Return from an empty document chooser without creating files")
def test_empty_document_back():
    """Back navigation leaves an empty project untouched."""


@when("I go back and quit the intro")
def back_and_quit(journey):
    type_and_wait(journey, b"b\r", "Choose [1]: ")
    os.write(journey.terminal.terminal, b"q\r")


@TERMINAL_ONLY
@scenario("features/first_run.feature", "Start an API from an entered contract URL")
def test_enter_contract_url():
    """An entered HTTP URL is loaded through normal CLI startup."""


@given("a contract served at a local HTTP URL")
def served_contract(journey):
    import subprocess
    import sys
    empty_directory(journey)
    journey.write_json("remote-contract/openapi.json", contract())
    # Keep the HTTP fixture in a child process: starting a parent thread before
    # forkpty can deadlock the terminal child on macOS.
    server = subprocess.Popen([sys.executable, "-u", "-m", "http.server", "0", "--bind", "127.0.0.1", "--directory", str(journey.project)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        readable, _, _ = select.select([server.stdout], [], [], 10)
        assert readable, "Contract fixture did not start"
        line = server.stdout.readline()
        match = re.search(r"port (\d+)", line)
        assert match is not None, line
        journey.contract_url = f"http://127.0.0.1:{match.group(1)}/remote-contract/openapi.json"
        yield
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)


@when("I enter the contract URL and choose an available server port")
def enter_contract_url(journey):
    type_and_wait(journey, b"2\r", "Choose a document: ")
    type_and_wait(journey, b"p\r", "OpenAPI path or URL")
    type_and_wait(journey, f"{journey.contract_url}\r".encode(), "Output directory [api] (b: back): ")
    type_and_wait(journey, b"\r", "Server port [3100]: ")
    journey.output = journey.project / "api"
    os.write(journey.terminal.terminal, f"{journey.allocate_port()}\r".encode())


@TERMINAL_ONLY
@scenario("features/first_run.feature", "Shop for coffee against the generated Counterfact API")
def test_coffee_shop_purchase():
    """The generated project serves the app and its real shopping API."""


@then("the coffee shop serves products and accepts a demo purchase")
def coffee_shop_purchase(journey):
    page = journey.request("get", "/walkthrough")
    assert page.status_code == 200
    assert "text/html" in page.headers["Content-Type"]
    assert "Counterfact Coffee" in page.text
    assert "Walkthrough instructions" in page.text
    info = journey.request("get", "/tutorial-info")
    assert info.status_code == 200, info.text
    assert os.path.realpath(info.json()["projectPath"]) == os.path.realpath(journey.output)
    assert info.json()["sessionId"]
    assert "sessionStorage" in page.text
    assert "Open in VSCode" in page.text
    assert "vscode://file/" in page.text
    assert "Repeat instructions" not in page.text
    products = journey.request("get", "/products").json()
    assert [product["id"] for product in products] == ["house-blend", "dark-roast", "decaf"]
    assert products[2]["stock"] == 0
    order = journey.request("post", "/orders", json={"items": [{"productId": "house-blend", "quantity": 1}]})
    assert order.status_code == 201, order.text
    assert order.json()["orderId"] == 1
    impossible = journey.request("post", "/orders", json={"items": [{"productId": "dark-roast", "quantity": 4}]})
    assert impossible.status_code == 409


@TERMINAL_ONLY
@scenario("features/first_run.feature", "Update coffee inventory in a handler and restock through the REPL")
def test_coffee_shop_inventory():
    """Editor changes and REPL mutations affect the same running inventory."""


def coffee_stock(journey, product_id):
    response = journey.request("get", "/products")
    assert response.status_code == 200, response.text
    return next(product["stock"] for product in response.json() if product["id"] == product_id)


def coffee_order(journey, product_id, quantity):
    return journey.request("post", "/orders", json={"items": [{"productId": product_id, "quantity": quantity}]})


@when("I make Decaf available by editing its product handler")
def edit_decaf(journey):
    path = journey.output / "routes/products.ts"
    path.write_text(path.read_text().replace("const decafStock = 0;", "const decafStock = 5;"))


@then("the coffee API returns the changed stock and accepts a Decaf order")
def decaf_available(journey):
    journey.wait_for_http("/products", lambda response: response.status_code == 200 and response.json()[2]["stock"] == 5)
    assert coffee_order(journey, "decaf", 1).status_code == 201
    assert coffee_stock(journey, "decaf") == 5


@when("I make ordering unavailable and then restore it")
def unavailable_orders(journey):
    path = journey.output / "routes/orders.ts"
    path.write_text(path.read_text().replace("const ordersAvailable = true;", "const ordersAvailable = false;"))
    journey.wait_for_http("/orders", lambda response: response.status_code == 503, method="post", json={"items": [{"productId": "house-blend", "quantity": 1}]})


@then("an unsuccessful order preserves inventory and a retry succeeds")
def retry_orders(journey):
    before = coffee_stock(journey, "house-blend")
    assert coffee_order(journey, "house-blend", 1).status_code == 503
    assert coffee_stock(journey, "house-blend") == before
    path = journey.output / "routes/orders.ts"
    path.write_text(path.read_text().replace("const ordersAvailable = false;", "const ordersAvailable = true;"))
    journey.wait_for_http("/orders", lambda response: response.status_code == 201, method="post", json={"items": [{"productId": "house-blend", "quantity": 1}]})


@when("I add the inventory mutation to the successful order handler")
def update_order_context(journey):
    path = journey.output / "routes/orders.ts"
    path.write_text(path.read_text().replace("// INVENTORY LESSON: subtract each purchased quantity here.", "for (const item of items) {\n    $.context.inventory[item.productId] -= item.quantity;\n  }"))


@then("buying coffee reduces the inventory returned by the products API")
def purchase_updates_inventory(journey):
    # A request made before the hot reload may still use the old handler. It
    # has no inventory mutation; retry only until one order visibly changes it.
    deadline = time.monotonic() + STARTUP_TIMEOUT
    while time.monotonic() < deadline:
        assert coffee_order(journey, "dark-roast", 1).status_code == 201
        if coffee_stock(journey, "dark-roast") == 2:
            break
        time.sleep(0.1)
    assert coffee_stock(journey, "dark-roast") == 2, journey.logs()
    assert coffee_stock(journey, "decaf") == 5


@when("I purchase the remaining Dark Roast stock")
def purchase_remaining(journey):
    assert coffee_order(journey, "dark-roast", 2).status_code == 201


@then("Dark Roast is sold out and another order is rejected")
def sold_out(journey):
    assert coffee_stock(journey, "dark-roast") == 0
    assert coffee_order(journey, "dark-roast", 1).status_code == 409
    assert coffee_stock(journey, "dark-roast") == 0


@when("I restock Dark Roast through the running REPL")
def repl_restock(journey):
    output = journey.terminal.command('context.inventory["dark-roast"]')
    assert "0" in output
    journey.terminal.command('context.inventory["dark-roast"] = 5')


@then("the products API shows five bags and the next purchase leaves four")
def restock_and_purchase(journey):
    assert coffee_stock(journey, "dark-roast") == 5
    assert coffee_order(journey, "dark-roast", 1).status_code == 201
    assert coffee_stock(journey, "dark-roast") == 4
    assert coffee_order(journey, "dark-roast", 5).status_code == 409
    duplicate = journey.request("post", "/orders", json={"items": [{"productId": "dark-roast", "quantity": 3}, {"productId": "dark-roast", "quantity": 3}]})
    assert duplicate.status_code == 409
    assert duplicate.json()["shortages"] == [{"productId": "dark-roast", "requested": 6, "available": 4}]
    assert coffee_stock(journey, "dark-roast") == 4
    path = journey.output / "routes/products.ts"
    path.write_text(path.read_text() + "\n// Preserve running inventory across route reloads.\n")
    journey.wait_for_http("/products", lambda response: response.status_code == 200 and response.json()[1]["stock"] == 4)

    session = journey.request("get", "/tutorial-info").json()["sessionId"]
    context_path = journey.output / "routes/_.context.ts"
    context_path.write_text(context_path.read_text() + "\n// Reload context without changing the inventory declaration.\n")
    journey.wait_for_http("/tutorial-info", lambda response: response.status_code == 200 and response.json()["sessionId"] != session)
    assert coffee_stock(journey, "dark-roast") == 4
    assert coffee_stock(journey, "house-blend") == 5
    assert coffee_order(journey, "house-blend", 1).status_code == 201
    assert coffee_stock(journey, "house-blend") == 4
