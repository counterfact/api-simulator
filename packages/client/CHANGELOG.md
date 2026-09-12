# @counterfact/client

## 0.2.0

### Minor Changes

- 13155b0: Display complete multipart request bodies in the REPL client output, and write
  route help directly to the console.

### Patch Changes

- 04d67bb: Validate and send required OpenAPI cookie, body, and form inputs through the immutable route builder, including REPL completions for the new methods.

## 0.1.1

### Patch Changes

- 5e59b84: Match required request header names case-insensitively.
- 28aafab: Percent-encode path parameter values before sending requests.
- 28aafab: Include inherited path-item parameters in route request guidance and validation.
