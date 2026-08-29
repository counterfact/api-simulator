# Verify frontend error states with Playwright

Counterfact runs as a real HTTP server, so Playwright can exercise a browser
against deterministic success and failure behavior without intercepting the
application's requests.

## Run the verified example

```sh
cd examples/playwright-error-states
npm ci
npx playwright install chromium
npm run verify
```

The example starts Counterfact and Vite as Playwright web servers. Its browser
checks cover a successful profile, a missing profile, and a temporary service
failure.

## Model only the states the screen needs

Keep the branching rule explicit in the Counterfact handler:

```ts
export const GET: HTTP_GET = ($) => {
  if ($.path.profileId === 404) return $.response[404].empty();
  if ($.path.profileId === 503)
    return $.response[503].text("Try again shortly");

  return $.response[200].json({
    id: $.path.profileId,
    name: "Ada Lovelace",
  });
};
```

Then drive each state through the same UI and HTTP boundary the user sees:

```ts
await page.goto("/?profile=503");
await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
```

Prefer narrow, deterministic switches to random failures. Tests should explain
which condition produces each state and should reset shared state between
cases when the simulator mutates data.

## When to use MSW instead

Use MSW when a test should intercept `fetch` inside the same browser or Node
process without running another server. Use Counterfact when multiple clients
or processes need a shared, stateful HTTP API. They can also be combined: MSW
can intercept the browser request and forward it to Counterfact.

See [automated integration tests](./automated-integration-tests.md) for server
lifecycle and isolation guidance.
