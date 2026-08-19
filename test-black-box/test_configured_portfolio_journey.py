"""Steps for composing a configured portfolio of OpenAPI contracts."""

from pytest_bdd import given, scenario, then, when


def text_response(value):
    return {
        "description": "ok",
        "content": {
            "text/plain": {
                "schema": {"type": "string"},
                "examples": {"default": {"value": value}},
            }
        },
    }


def openapi_document(title, paths):
    return {
        "openapi": "3.0.3",
        "info": {"title": title, "version": "1.0.0"},
        "paths": {
            path: {
                method: {"responses": {"200": text_response(value)}}
                for method, value in operations.items()
            }
            for path, operations in paths.items()
        },
    }


@scenario(
    "features/configured_portfolio.feature", "Compose a configured API portfolio"
)
def test_compose_configured_api_portfolio():
    """Bind the configured-portfolio journey to its step definitions."""


@given(
    "a configured portfolio of root, shared, duplicate, prefixed, and versioned specs"
)
def write_configured_portfolio(journey):
    definitions = [
        ("customers", {"/customers": {"get": "customers"}}, {"group": "customers"}),
        ("products", {"/products": {"get": "products"}}, {"group": "products"}),
        ("alpha", {"/alpha": {"get": "alpha"}}, {"group": "alpha"}),
        ("beta", {"/beta": {"get": "beta"}}, {"group": "beta"}),
        ("gamma", {"/gamma": {"get": "gamma"}}, {"group": "gamma"}),
        ("read", {"/orders": {"get": "listed"}}, {"group": "read"}),
        ("write", {"/orders": {"post": "created"}}, {"group": "write"}),
        ("primary", {"/status": {"get": "first"}}, {"group": "primary"}),
        ("secondary", {"/status": {"get": "second"}}, {"group": "secondary"}),
        (
            "billing",
            {"/invoices": {"get": "invoices"}},
            {"group": "billing", "prefix": "/api"},
        ),
        (
            "inventory",
            {"/stock": {"get": "stock"}},
            {"group": "inventory", "prefix": "/api"},
        ),
        (
            "catalog-v1",
            {"/items": {"get": "v1-items"}},
            {"group": "catalog", "version": "v1", "prefix": "/api/v1"},
        ),
        (
            "catalog-v2",
            {"/items": {"get": "v2-items"}},
            {"group": "catalog", "version": "v2", "prefix": "/api/v2"},
        ),
    ]
    specs = []
    for name, paths, options in definitions:
        source = journey.write_json(
            f"contracts/{name}.json", openapi_document(name, paths)
        )
        specs.append({"source": str(source), **options})

    journey.config_port = journey.allocate_port()
    journey.cli_port = journey.allocate_port()
    journey.output = journey.project / "portfolio"
    journey.config_path = journey.write_json(
        "counterfact.json",
        {
            "spec": specs,
            "destination": str(journey.output),
            "port": journey.config_port,
            "generate": True,
            "buildCache": True,
            "serve": True,
        },
    )


@when("I start the portfolio with a CLI port override")
def start_portfolio(journey):
    journey.port = journey.cli_port
    journey.base_url = f"http://127.0.0.1:{journey.cli_port}"
    journey.start_cli(
        "--config",
        journey.config_path,
        "--port",
        journey.cli_port,
        "--no-update-check",
    )
    journey.wait_for_http(
        "/customers", lambda response: response.status_code == 200
    )


@then("distinct root-mounted APIs are reachable")
def root_mounted_apis_are_reachable(journey):
    customers = journey.request("get", "/customers")
    products = journey.request("get", "/products")
    assert (customers.status_code, customers.text) == (200, "customers")
    assert (products.status_code, products.text) == (200, "products")


@then("a request falls through to the third root-mounted spec")
def third_root_spec_is_reachable(journey):
    response = journey.request("get", "/gamma")
    assert (response.status_code, response.text) == (200, "gamma")


@then("shared-path GET and POST requests reach their declaring specs")
def shared_path_methods_reach_declaring_specs(journey):
    listed = journey.request("get", "/orders")
    created = journey.request("post", "/orders")
    assert (listed.status_code, listed.text) == (200, "listed")
    assert (created.status_code, created.text) == (200, "created")


@then("another method receives a combined Allow header")
def shared_path_combines_allow_header(journey):
    response = journey.request("put", "/orders")
    assert response.status_code == 405
    assert set(response.headers["allow"].split(", ")) == {"GET", "POST"}


@then("declaration order resolves duplicate operations")
def declaration_order_resolves_duplicates(journey):
    response = journey.request("get", "/status")
    assert (response.status_code, response.text) == (200, "first")


@then("explicit prefixes route grouped APIs without exposing group names")
def explicit_prefixes_hide_group_names(journey):
    invoices = journey.request("get", "/api/invoices")
    stock = journey.request("get", "/api/stock")
    assert (invoices.status_code, invoices.text) == (200, "invoices")
    assert (stock.status_code, stock.text) == (200, "stock")
    assert journey.request("get", "/billing/invoices").status_code == 404
    assert journey.request("get", "/inventory/stock").status_code == 404


@then("the CLI port override serves every configured API")
def cli_port_override_is_used(journey):
    assert journey.port == journey.cli_port
    assert journey.cli_port != journey.config_port
    assert journey.request("get", "/api/v1/items").status_code == 200


@then("versioned specs serve distinct URLs from shared grouped artifacts")
def versioned_specs_share_grouped_artifacts(journey):
    first = journey.request("get", "/api/v1/items")
    second = journey.request("get", "/api/v2/items")
    assert (first.status_code, first.text) == (200, "v1-items")
    assert (second.status_code, second.text) == (200, "v2-items")
    assert (journey.output / "catalog" / "routes" / "items.ts").exists()
    assert (journey.output / "catalog" / "types" / "versions.ts").exists()


@then("generated artifacts are grouped with no unintended top-level routes")
def generated_artifacts_are_only_grouped(journey):
    expected = [
        journey.output / "customers" / "routes" / "customers.ts",
        journey.output / "products" / "routes" / "products.ts",
        journey.output / "read" / "routes" / "orders.ts",
        journey.output / "write" / "routes" / "orders.ts",
        journey.output / "billing" / "routes" / "invoices.ts",
        journey.output / "inventory" / "routes" / "stock.ts",
    ]
    assert all(path.exists() for path in expected), (
        "Missing grouped artifacts: "
        + ", ".join(str(path) for path in expected if not path.exists())
        + f"\n{journey.logs()}"
    )
    assert not (journey.output / "routes").exists()
    assert journey.request("get", "/items").status_code == 404
    assert journey.request("get", "/invoices").status_code == 404
