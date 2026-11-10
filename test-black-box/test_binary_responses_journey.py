"""Exercise binary download negotiation through the shipped CLI and HTTP."""

from pytest_bdd import given, scenario, then, when


PDF_BYTES = b"%PDF-1.7\n%\x00\x80\xff\n1 0 obj\n<<>>\nendobj\n%%EOF\n"
DOWNLOAD_BYTES = bytes([0, 1, 127, 128, 255])


def download_operation(*media_types):
    return {
        "get": {
            "responses": {
                "200": {
                    "description": "Download",
                    "content": {
                        media_type: {
                            "schema": {
                                "type": "string",
                                **({"format": "binary"} if media_type != "text/plain" else {}),
                            }
                        }
                        for media_type in media_types
                    },
                }
            }
        }
    }


@scenario("features/binary_responses.feature", "Serve PDF and legacy binary downloads")
def test_serve_binary_downloads():
    """Bind the binary download journey to its step definitions."""


@given("an OpenAPI contract for PDF and octet-stream downloads")
def write_download_contract(journey):
    journey.spec_path = journey.write_json(
        "openapi.json",
        {
            "openapi": "3.0.3",
            "info": {"title": "Binary Download Journey", "version": "1.0.0"},
            "paths": {
                "/document": download_operation("application/pdf"),
                "/download": download_operation("application/octet-stream"),
                "/alternatives": download_operation("application/pdf", "text/plain"),
            },
        },
    )
    journey.output = journey.project / "api"


@when("I generate the download API and customize its binary responses")
def generate_and_customize_downloads(journey):
    result = journey.run_cli(
        journey.spec_path, journey.output, "--generate", "--no-update-check"
    )
    assert result.returncode == 0, (
        f"Generation failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    pdf_body = f"Buffer.from({list(PDF_BYTES)})"
    journey.write_text(
        "api/routes/document.ts",
        "export const GET = ($) => $.response.status(200)"
        f'.binary({pdf_body}, "application/pdf");\n',
    )
    journey.write_text(
        "api/routes/download.ts",
        "export const GET = ($) => $.response.status(200)"
        f".binary(Buffer.from({list(DOWNLOAD_BYTES)}));\n",
    )
    journey.write_text(
        "api/routes/alternatives.ts",
        "export const GET = ($) => $.response.status(200)"
        f'.binary({pdf_body}, "application/pdf")'
        '.text("Document preview");\n',
    )


@when("I serve the customized download API")
def serve_downloads(journey):
    journey.allocate_port()
    journey.start_cli(
        journey.spec_path,
        journey.output,
        "--port",
        journey.port,
        "--build-cache",
        "--serve",
        "--no-update-check",
    )
    journey.wait_for_http(
        "/counterfact/swagger", lambda response: response.status_code == 200
    )


@then("requesting a PDF returns its exact bytes and PDF content type")
def pdf_download_is_exact(journey):
    response = journey.request(
        "get", "/document", headers={"Accept": "application/pdf"}
    )
    assert response.status_code == 200, journey.logs()
    assert response.headers["Content-Type"] == "application/pdf"
    assert response.content == PDF_BYTES


@then("requesting an incompatible representation of the PDF returns 406")
def incompatible_pdf_representation_is_rejected(journey):
    response = journey.request(
        "get", "/document", headers={"Accept": "application/json"}
    )
    assert response.status_code == 406, journey.logs()


@then("the single-argument binary response remains an octet-stream download")
def legacy_binary_download_is_unchanged(journey):
    response = journey.request(
        "get", "/download", headers={"Accept": "application/octet-stream"}
    )
    assert response.status_code == 200, journey.logs()
    assert response.headers["Content-Type"] == "application/octet-stream"
    assert response.content == DOWNLOAD_BYTES


@then("the download with alternatives negotiates PDF and plain text")
def binary_alternatives_are_negotiated(journey):
    pdf_response = journey.request(
        "get", "/alternatives", headers={"Accept": "application/pdf"}
    )
    assert pdf_response.status_code == 200, journey.logs()
    assert pdf_response.headers["Content-Type"] == "application/pdf"
    assert pdf_response.content == PDF_BYTES

    text_response = journey.request(
        "get", "/alternatives", headers={"Accept": "text/plain"}
    )
    assert text_response.status_code == 200, journey.logs()
    assert text_response.headers["Content-Type"].split(";")[0] == "text/plain"
    assert text_response.text == "Document preview"
