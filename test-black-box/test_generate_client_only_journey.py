"""Steps for generating only a standalone API client."""

from pytest_bdd import given, parsers, scenario, then, when


def openapi_document(title: str, resource: str, schema_names: list[str]) -> dict:
    return {
        "openapi": "3.0.3",
        "info": {"title": title, "version": "1.0.0"},
        "paths": {
            f"/{resource}": {
                "get": {
                    "operationId": f"list_{resource}",
                    "responses": {
                        "200": {
                            "description": "ok",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "$ref": f"#/components/schemas/{schema_names[0]}"
                                    }
                                }
                            },
                        }
                    },
                }
            }
        },
        "components": {
            "schemas": {
                name: {
                    "type": "object",
                    "required": ["id"],
                    "properties": {"id": {"type": "string"}},
                }
                for name in schema_names
            }
        },
    }


def written_files(root):
    if not root.exists():
        return []
    return sorted(
        path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()
    )


@scenario(
    "features/generate_client_only.feature",
    "Generate standalone clients for a configured portfolio",
)
def test_generate_clients_for_configured_portfolio():
    """Bind the configured client-only journey to its steps."""


@scenario(
    "features/generate_client_only.feature",
    "Reject conflicting or unsupported client-only commands",
)
def test_reject_conflicting_or_unsupported_client_commands():
    """Bind the rejected client-only journey to its steps."""


@given("a configured portfolio of grouped specs that also enables serving")
def configured_portfolio(journey):
    definitions = [
        ("billing", "invoices", ["Invoice", "Payment"]),
        ("catalog", "items", ["Item"]),
    ]
    specs = []
    for group, resource, schema_names in definitions:
        source = journey.write_json(
            f"contracts/{group}.json",
            openapi_document(group, resource, schema_names),
        )
        specs.append({"source": str(source), "group": group})

    journey.output = journey.project / "api"
    journey.config_path = journey.write_json(
        "counterfact.json",
        {
            "spec": specs,
            "destination": str(journey.output),
            "generateClientOnly": True,
            "typeSuffix": "Dto",
            "serve": True,
            "watch": True,
        },
    )


@when("I generate only the clients")
def generate_only_clients(journey):
    result = journey.run_cli("--config", journey.config_path, "--no-update-check")
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"


@then("only a standalone client is written for each group")
def only_clients_are_written(journey):
    assert written_files(journey.output) == [
        "billing/client/Invoices.ts",
        "billing/client/data-contracts.ts",
        "billing/client/data-contracts/InvoiceDto.ts",
        "billing/client/data-contracts/PaymentDto.ts",
        "billing/client/http-client.ts",
        "billing/client/index.ts",
        "catalog/client/Items.ts",
        "catalog/client/data-contracts.ts",
        "catalog/client/data-contracts/ItemDto.ts",
        "catalog/client/http-client.ts",
        "catalog/client/index.ts",
    ]
    module = (journey.output / "billing/client/Invoices.ts").read_text()
    assert "../" not in module
    assert "this.http.request<InvoiceDto, unknown>" in module


@then("each schema has its own data contract re-exported by the barrel")
def contracts_are_split(journey):
    barrel = (journey.output / "billing/client/data-contracts.ts").read_text()
    assert 'export * from "./data-contracts/InvoiceDto.js";' in barrel
    assert 'export * from "./data-contracts/PaymentDto.js";' in barrel
    index = (journey.output / "billing/client/index.ts").read_text()
    assert 'export * from "./data-contracts.js";' in index


@then("the config file's serving options are reported as ignored for the client")
def serving_options_are_reported(journey):
    result = journey.command_results["cli"]
    assert "Ignoring config file options" in result.stderr
    assert "serve" in result.stderr
    assert "watch" in result.stderr
    assert "Generated a standalone client" in result.stdout


@given("a single contract for a client")
def single_contract(journey):
    journey.spec_path = journey.write_json(
        "openapi.json", openapi_document("single", "widgets", ["Widget"])
    )
    journey.output = journey.project / "widgets"


@when("I combine the client-only flag with serving")
def combine_with_serving(journey):
    journey.run_cli(
        journey.spec_path,
        journey.output,
        "--generate-client-only",
        "--serve",
        "--no-update-check",
        name="rejected",
    )


@when("I generate only the client for a versioned spec")
def versioned_spec(journey):
    journey.config_path = journey.write_json(
        "versioned.json",
        {
            "spec": [
                {"source": str(journey.spec_path), "group": "w", "version": "v1"}
            ],
            "destination": str(journey.output),
        },
    )
    journey.run_cli(
        "--config",
        journey.config_path,
        "--generate-client-only",
        "--no-update-check",
        name="rejected",
    )


@then(
    parsers.parse(
        'the client-only command fails with "{message}" and writes nothing'
    )
)
def client_only_fails(journey, message):
    result = journey.command_results["rejected"]
    assert result.returncode == 1
    assert message in result.stderr
    assert written_files(journey.output) == []
