# swagger-typescript-api-adapter

Adapt a generated Counterfact `createSdk` function to the standard
swagger-typescript-api Fetch interface.

```ts
import { createSdk } from "./generated/client/index.js";
import { HttpClient, wrapSta } from "swagger-typescript-api-adapter";

const Api = wrapSta(createSdk);

const api = new Api({ baseUrl: "https://example.test" });
const { data } = await api.users.getUser(42);

// For code generated with STA's --single-http-client option:
const http = new HttpClient({ baseUrl: "https://example.test" });
const sharedApi = new Api(http);
```

`HttpClient` captures the supplied config and any security data set before it
is passed to `new Api(http)`. Each adapted API using that instance shares its
transport and security data. You can also pass config directly to `new Api`.
Without a base URL override, the adapter uses the first server in the spec.

For clients previously generated with STA's `--unwrap-response-data` flag,
pass the option to the adapter declaration:

```ts
const Api = wrapSta(createSdk, { unwrapResponseData: true });
const api = new Api({ baseUrl });
const user = await api.users.getUser(42);
```

Both forms reject non-2xx responses with an STA-style Fetch response containing
`.error`. The adapter uses STA-style response parsing, including the existing
request `format` option. Use `createSdk` directly for Counterfact's validated,
status-narrowed results.

The migration test generates a client with swagger-typescript-api 13.13.0 and
runs the same consumer against the generated client and the adapter. The test
covers grouped methods, both constructor forms, auth, query and body arguments,
and wrapped and body-only responses. The package targets the standard Fetch
generator. STA's Axios output, custom templates, extracted request parameter
objects, and its modular file layout require separate migration work.
