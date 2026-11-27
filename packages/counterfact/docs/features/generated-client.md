# Generated API Client

Counterfact can generate a strongly typed API client next to its routes and types. Pass `--generate-client` (or set `generateClient: true` in `counterfact.yaml`):

```sh
npx counterfact@latest openapi.yaml ./api --generate-client
```

The client reuses the generated `types/`, so request arguments and response data stay in step with your OpenAPI document and with your mock. `--generate-client` also generates types.

Like `--generate-types`, `--generate-client` is an action flag: on its own it generates code and exits. Add other actions to keep the client up to date while the mock runs, for example `--generate-client --watch --serve --repl`. Clients for [versioned APIs](./multiple-versions.md) are not supported yet; Counterfact skips them with a warning.

## Output

```
<output-directory>/
├── client/
│   ├── http-client.ts      # the default, fetch-based HTTP provider
│   ├── data-contracts.ts   # a named type for every #/components/schemas entry
│   ├── Users.ts            # one class per module (operations under /users)
│   ├── Pets.ts
│   └── index.ts            # re-exports everything plus the combined Api class
├── counterfact-types/
└── types/
```

Operations are grouped into modules by their first path segment: `/users` and `/users/{id}` both go into `Users`. Operations on `/` go into `Root`. Change the grouping with `--module-name-index <n>` (use a later path segment, such as `1` for `/v1/users`) or `--module-name-first-tag` (use the operation's first tag).

Each method is named after its `operationId`, camel-cased (`Users_Search` becomes `usersSearch`). Without an `operationId`, it gets a name from its path and method: `usersList`, `usersCreate`, `usersDetail`, `usersUpdate`, `usersPartialUpdate`, and `usersDelete`.

To generate only the client, without routes or the shared `types/`, see [standalone client](#standalone-client).

Everything in `client/` is regenerated each time. Don't edit those files; Counterfact removes generated files that no longer apply and leaves any other files in the directory alone.

## Calling the API

```ts
import { Api, HttpClient } from "./api/client/index.js";

const api = new Api(new HttpClient({ baseUrl: "https://api.example.com" }));

const { data: user } = await api.users.getUser(42);
```

Method arguments come in this order: path parameters, then the query object and the request body (required ones before optional ones), then `params`, which holds per-request options such as `headers`, `signal`, or `cancelToken`. Each argument is typed from the document, so a wrong path parameter, query key, or body field is a type error.

Methods resolve with the `fetch` `Response`, extended with typed `data` (a 2xx body) and `error` (any other body). A non-2xx response rejects with that same object. Pass `--unwrap-response-data` to resolve with `data` instead.

Bodies are read by the response's own `Content-Type`: JSON as JSON, `text/*` and XML as text, anything else as a `Blob`. A 2xx response uses the operation's `format` when it has one. Empty bodies (204, 205, 304, or `Content-Length: 0`) leave both `data` and `error` null.

JSON request bodies are always sent through `JSON.stringify`, so a string body is sent as a JSON string and `null` as `null`. Multipart bodies take `Blob` and `File` values, byte arrays, and the `MultipartFile` objects (`{ data, filename, contentType, size }`) that Counterfact's shared types use for binary fields. All of these are uploaded as binary parts. Requests that share a `cancelToken` share one abort signal, and `abortRequest(token)` cancels every one of them still in flight. A body media type that the route types don't describe (anything other than JSON, URL-encoded, or multipart form data) is typed `unknown`.

You can also construct a single module: `new Users(http)`.

## HTTP providers

All transport configuration lives in the HTTP provider, never in the generated modules. `HttpClient`, the default provider, uses `fetch`:

```ts
const http = new HttpClient<string>({
  baseUrl: "https://api.example.com",
  baseApiParams: { credentials: "include", headers: { "X-App": "web" } },
  // Called for operations with OpenAPI `security`.
  securityWorker: (token) =>
    token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  // Send requests through your own fetch wrapper or HTTP stack.
  customFetch: (input, init) => fetch(input, init),
});

http.setSecurityData(token);
const api = new Api(http);
```

Every module shares the provider it was built with. You can reach it as `api.http` or `users.http`.

To send requests some other way, implement `HttpProvider`:

```ts
import type {
  FullRequestParams,
  HttpProvider,
  HttpResponse,
} from "./api/client/index.js";

class MyProvider implements HttpProvider {
  async request<Data, Error>(
    params: FullRequestParams,
  ): Promise<HttpResponse<Data, Error>> {
    // ...
  }
}

const api = new Api(new MyProvider());
```

### Custom request options

`FullRequestParams` is an interface, so you can augment it with options your HTTP stack understands. `HttpClient` passes any option it doesn't recognize to `customFetch` in its `init` argument:

```ts
declare module "./api/client/http-client.js" {
  interface FullRequestParams {
    preferAsync?: boolean;
  }
}

await api.jobs.jobsCreate(body, { preferAsync: true });
```

## Naming options

- `--module-class-suffix <suffix>` appends a suffix to every module class name.
- `--type-prefix <prefix>` and `--type-suffix <suffix>` add a prefix or suffix to every data contract type name. A prefix cannot start with a digit.
- `--api-class-name <name>` renames the class that combines every module. It must be a valid TypeScript class name that is not a reserved word. A module that would share its name gets a `Module` suffix.

For example, to generate `UsersClient` classes and `UserDto` models:

```yaml
spec: ./openapi.json
destination: ./api
generateClient: true
moduleClassSuffix: Client
typeSuffix: Dto
```

To declare data contracts as interfaces and enums, see [customize schema declarations](./generated-code.md#customize-schema-declarations).

## Standalone client

To get a client and nothing else, use `--generate-client-only` (or `generateClientOnly: true` in `counterfact.yaml`):

```sh
npx counterfact@latest openapi.yaml ./api --generate-client-only --type-suffix Dto --module-class-suffix Client
```

```
<output-directory>/
└── client/
    ├── http-client.ts
    ├── data-contracts/
    │   ├── UserDto.ts      # one file per schema, including unused ones
    │   └── RoleDto.ts
    ├── data-contracts.ts   # export * from each file in data-contracts/
    ├── UsersClient.ts
    └── index.ts
```

A standalone client does not import `types/` or `counterfact-types/`, so you can copy `client/` into another project. Each method's request and response types are written into the module itself:

```ts
getUser = (id: number, params: RequestParams = {}) =>
  this.http.request<UserDto, ErrorDto>({
    path: `/users/${encodeURIComponent(String(id))}`,
    method: "GET",
    format: "json",
    ...params,
  });
```

In multipart request bodies, binary fields also accept `Blob`, `File`, and `Uint8Array` values through the `MultipartBody` type. The data contract types themselves keep their JSON shape.

The response type is the union of the 2xx response bodies, and the error type is the union of the other responses, including `default`. When a response offers several media types, JSON is preferred. Swagger 2.0 documents are supported, with `#/definitions` as the data contracts. The [naming options](#naming-options) and [schema declaration options](./generated-code.md#customize-schema-declarations) apply. Versioned APIs are not supported yet.

`--generate-client-only` runs once and exits. It cannot be combined with routes, types, watching, or the server.
