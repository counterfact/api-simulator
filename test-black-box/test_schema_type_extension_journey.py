"""Exercise configuration-driven type customization through the shipped CLI."""

import copy
import re
import time

from pytest_bdd import given, scenario, then, when


SPEC = {
    "openapi": "3.0.3",
    "info": {"title": "Schema Extension", "version": "1"},
    "paths": {
        "/items": {
            "get": {
                "responses": {
                    "200": {
                        "description": "Item",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/Item"}
                            }
                        },
                    }
                }
            }
        }
    },
    "components": {
        "schemas": {
            "Item": {
                "type": "object",
                "required": ["id"],
                "properties": {"id": {"type": "string", "format": "uuid"}},
            }
        }
    },
}


@scenario("features/schema_type_extension.feature", "Generate and watch customized schema types")
def test_generate_and_watch_customized_types():
    """Bind the generation and watching journey."""


@scenario("features/schema_type_extension.feature", "Customize shared versioned contracts")
def test_customize_versioned_types():
    """Bind the shared versioned generation journey."""


@scenario("features/schema_type_extension.feature", "Reject an invalid configured transform")
def test_invalid_configured_transform():
    """Bind the invalid module diagnostic journey."""


@given("a nested YAML config selects a schema type transform module")
def configured_transform(journey):
    journey.extension_spec = copy.deepcopy(SPEC)
    journey.write_json("openapi.json", journey.extension_spec)
    journey.output = journey.project / "api"
    journey.extension_config = journey.write_text(
        "settings/counterfact.yaml",
        "spec: ./openapi.json\ndestination: ./api\n"
        "schema-type-transform: ./transform.mjs\n",
    )
    journey.write_text(
        "settings/transform.mjs",
        "export default function transform(schema, defaultType, script) {\n"
        "  if (typeof schema === 'object' && schema.format === 'uuid') {\n"
        "    return script.importType('@example/domain', 'UUID');\n"
        "  }\n"
        "  return defaultType;\n"
        "}\n",
    )


@given("the config contains two versions of the same API group")
def versioned_config(journey):
    journey.write_json("v1.json", journey.extension_spec)
    journey.write_json("v2.json", journey.extension_spec)
    journey.write_text(
        "settings/counterfact.yaml",
        "spec:\n  - source: ./v1.json\n    group: example\n    version: v1\n"
        "  - source: ./v2.json\n    group: example\n    version: v2\n"
        "destination: ./api\nschemaTypeTransform: ./transform.mjs\n",
    )


@given("the configured module does not export a callback")
def invalid_module(journey):
    journey.write_text("settings/transform.mjs", "export default {};\n")
    journey.write_text("api/types/existing.ts", "// Preserve existing types.\n")


@when("I generate customized types through that config")
def generate_types(journey):
    journey.extension_result = journey.run_cli(
        "--config", journey.extension_config, "--generate", "--no-update-check"
    )


def assert_transformed(path):
    contents = path.read_text(encoding="utf-8")
    assert 'from "@example/domain"' in contents
    imported = re.search(r"UUID as (\w+)", contents)
    assert imported is not None, contents
    assert f"id: {imported.group(1)}" in contents
    return imported.group(1)


@then("the generated contract uses the imported domain type")
def customized_contract(journey):
    result = journey.extension_result
    assert result.returncode == 0, result.stdout + result.stderr
    assert_transformed(journey.output / "types/components/schemas/Item.ts")


@when("I watch that config and add a formatted property to the specification")
def watch_and_change(journey):
    journey.start_cli(
        "--config", journey.extension_config, "--watch-types", "--no-update-check"
    )
    deadline = time.monotonic() + 15
    while "Watching" not in journey.logs():
        assert journey.process.poll() is None, journey.logs()
        assert time.monotonic() < deadline, journey.logs()
        time.sleep(0.1)
    journey.extension_spec["components"]["schemas"]["Item"]["properties"]["parentId"] = {
        "type": "string", "format": "uuid"
    }
    journey.write_json("openapi.json", journey.extension_spec)


@then("the regenerated contract applies the same transform to the new property")
def regenerated_contract(journey):
    path = journey.output / "types/components/schemas/Item.ts"
    deadline = time.monotonic() + 15
    while "parentId?:" not in path.read_text(encoding="utf-8"):
        assert journey.process.poll() is None, journey.logs()
        assert time.monotonic() < deadline, journey.logs()
        time.sleep(0.1)
    alias = assert_transformed(path)
    assert f"parentId?: {alias}" in path.read_text(encoding="utf-8")


@then("both versioned contracts use the imported domain type")
def versioned_contracts(journey):
    result = journey.extension_result
    assert result.returncode == 0, result.stdout + result.stderr
    for version in ["v1", "v2"]:
        assert_transformed(journey.output / f"example/types/{version}/components/schemas/Item.ts")


@then("the shared contract retains both API versions")
def shared_version_contract(journey):
    contents = (journey.output / "example/types/paths/items.types.ts").read_text(encoding="utf-8")
    assert "HTTP_GET_$_v1" in contents
    assert "HTTP_GET_$_v2" in contents


@then("the CLI reports the invalid transform and leaves existing types intact")
def invalid_transform_error(journey):
    result = journey.extension_result
    assert result.returncode != 0
    assert "must default-export a function" in result.stdout + result.stderr
    assert (journey.output / "types/existing.ts").read_text(encoding="utf-8") == "// Preserve existing types.\n"
