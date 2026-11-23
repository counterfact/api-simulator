"""Steps for generating only the schema types of a contract."""

from pytest_bdd import given, scenario, then, when


def openapi_document(title: str, schema_name: str) -> dict:
    return {
        "openapi": "3.0.3",
        "info": {"title": title, "version": "1.0.0"},
        "paths": {
            "/things": {
                "get": {
                    "responses": {
                        "200": {
                            "description": "ok",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "$ref": f"#/components/schemas/{schema_name}"
                                    }
                                }
                            },
                        }
                    }
                }
            }
        },
        "components": {
            "schemas": {
                schema_name: {
                    "type": "object",
                    "required": ["id"],
                    "properties": {"id": {"type": "string"}},
                }
            }
        },
    }


def written_files(root):
    if not root.exists():
        return []
    return sorted(
        str(path.relative_to(root)) for path in root.rglob("*") if path.is_file()
    )


@scenario(
    "features/generate_schemas_only.feature",
    "Generate schemas for a configured portfolio",
)
def test_generate_schemas_for_configured_portfolio():
    """Bind the configured schema-only journey to its steps."""


@scenario(
    "features/generate_schemas_only.feature",
    "Reject conflicting or incomplete schema-only commands",
)
def test_reject_conflicting_or_incomplete_commands():
    """Bind the rejected schema-only journey to its steps."""


@given(
    "a configured portfolio with grouped and versioned specs that also enables serving"
)
def configured_portfolio(journey):
    definitions = [
        ("invoices", "Invoice", {"group": "billing"}),
        ("items-v1", "Item", {"group": "catalog", "version": "v1"}),
        ("items-v2", "Item", {"group": "catalog", "version": "v2"}),
    ]
    specs = []
    for name, schema_name, options in definitions:
        source = journey.write_json(
            f"contracts/{name}.json", openapi_document(name, schema_name)
        )
        specs.append({"source": str(source), **options})

    journey.output = journey.project / "schemas"
    journey.config_path = journey.write_json(
        "counterfact.json",
        {
            "spec": specs,
            "destination": str(journey.output),
            "generate": True,
            "buildCache": True,
            "serve": True,
        },
    )


@when("I generate only the schemas")
def generate_only_schemas(journey):
    result = journey.run_cli(
        "--config",
        journey.config_path,
        "--generate-schemas-only",
        "--no-update-check",
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"


@then("only the schema types are written beside their group and version")
def only_schemas_are_written(journey):
    assert written_files(journey.output) == [
        "billing/Invoice.ts",
        "catalog/v1/Item.ts",
        "catalog/v2/Item.ts",
    ]


@then("the config file's serving options are reported as ignored")
def serving_options_are_reported(journey):
    stderr = journey.command_results["cli"].stderr
    assert "Ignoring config file options" in stderr
    assert "serve" in stderr
    assert "Generated 3 schema types" in journey.command_results["cli"].stdout


@given("a single contract with schemas")
def single_contract(journey):
    journey.spec_path = journey.write_json(
        "openapi.json", openapi_document("single", "Widget")
    )
    journey.output = journey.project / "widgets"


@when("I combine the schema-only flag with serving")
def combine_with_serving(journey):
    journey.command_results["conflict"] = journey.run_cli(
        journey.spec_path,
        journey.output,
        "--generate-schemas-only",
        "--serve",
        "--no-update-check",
        name="conflict",
    )


@then("the command fails and writes nothing")
def conflict_fails(journey):
    result = journey.command_results["conflict"]
    assert result.returncode == 1
    assert "cannot be combined with --serve" in result.stderr
    assert written_files(journey.output) == []


@when("I omit the destination")
def omit_destination(journey):
    journey.run_cli(
        journey.spec_path,
        "--generate-schemas-only",
        "--no-update-check",
        name="no-destination",
    )


@then("the command requires a destination and writes nothing")
def destination_is_required(journey):
    result = journey.command_results["no-destination"]
    assert result.returncode == 1
    assert "requires a destination directory" in result.stderr
    assert written_files(journey.project / "types") == []
    assert not (journey.project / "Widget.ts").exists()
