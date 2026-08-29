# Counterfact with Playwright error states

This browser example drives success, not-found, and temporary-failure screens
through a real Counterfact HTTP server. The application does not contain test-
specific request interception.

```sh
npm ci
npx playwright install chromium
npm run verify
```

Playwright starts the Counterfact and Vite development servers, runs the three
browser journeys, and stops both servers.

For the guided workflow and tradeoffs with MSW, see
[Playwright error states](../../packages/counterfact/docs/patterns/playwright-error-states.md).

The deterministic branches model only the UI states under test. They are not
a replacement for production-service coverage.
