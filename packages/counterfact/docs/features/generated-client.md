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

Everything in `client/` is regenerated each time. Don't edit those files; Counterfact removes generated files that no longer apply and leaves any other files in the directory alone.

## Calling the API

```ts
import { Api, HttpClient } from "./api/client/index.js";

const api = new Api(new HttpClient({ baseUrl: "https://api.example.com" }));

const { data: user } = await api.users.getUser(42);
```

Method arguments come in this order: path parameters, then the query object and the request body (required ones before optional ones), then `params`, which holds per-request options such as `headers`, `signal`, or `cancelToken`. Each argument is typed from the document, so a wrong path parameter, query key, or body field is a type error.

Methods resolve with the `fetch` `Response`, extended with typed `data` (a 2xx body) and `error` (any other body). A non-2xx response rejects with that same object. Pass `--unwrap-response-data` to resolve with `data` instead.

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
- `--type-prefix <prefix>` and `--type-suffix <suffix>` add a prefix or suffix to every data contract type name.
- `--api-class-name <name>` renames the class that combines every module.

For example, to generate `UsersClient` classes and `UserDto` models:

```yaml
spec: ./openapi.json
destination: ./api
generateClient: true
moduleClassSuffix: Client
typeSuffix: Dto
```

To declare data contracts as interfaces and enums, see [customize schema declarations](./generated-code.md#customize-schema-declarations).
