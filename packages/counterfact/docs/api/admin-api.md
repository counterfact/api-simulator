# HTTP Admin API

Enable with `--admin-api`. The base path is `/_counterfact/api`. For grouped runners, the API is mounted beneath that runner's subdirectory; use the matching group endpoint.

## Authentication

Set `--admin-api-token` or `COUNTERFACT_ADMIN_API_TOKEN`, then send `Authorization: Bearer <token>`. Missing or incorrect credentials return 401. Without a configured token, access is restricted to loopback addresses; other clients receive 403.

## Endpoints

Paths below are relative to the base path.

| Method | Path               | Request and result                                                                                                  |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`          | Returns `status`, `port`, `uptime`, `basePath`, and `prefix`.                                                       |
| GET    | `/contexts`        | Returns `data.paths` and `data.contexts`.                                                                           |
| GET    | `/contexts/<path>` | Returns `data.path` and `data.context` for a context subtree.                                                       |
| POST   | `/contexts/<path>` | Accepts a JSON object and updates the context through the registry. Returns the resulting context.                  |
| GET    | `/routes`          | Returns `data.routes`.                                                                                              |
| GET    | `/config`          | Returns a configuration snapshot, including `adminApiTokenConfigured` without the token value.                      |
| GET    | `/config/proxy`    | Returns `data.proxyUrl` and `data.proxyPaths`.                                                                      |
| PATCH  | `/config/proxy`    | Accepts optional `proxyUrl` (string) and `proxyPaths` (array of `[path, boolean]` pairs). Updates supplied entries. |

For context paths, append the route subtree without a leading slash: `/contexts/pets` addresses `/pets`. The bare `/contexts` endpoint lists contexts; it is not a root-context update endpoint.

## Responses and errors

Except for health, successful results use `{ success: true, data: ... }`; writes may include `message`. Invalid context bodies and invalid proxy URL types return 400. Unknown endpoints return 404. Caught failures return 500 with `success: false` and `error`.

These endpoints expose live simulator state. The Admin API does not provide the library's `reset()` or `scenario()` methods over HTTP. Use [simulator lifecycle](./simulator.md) for those operations.
