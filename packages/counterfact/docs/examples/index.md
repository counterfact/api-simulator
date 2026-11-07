# Runnable examples

These examples are complete, repository-hosted applications that use
Counterfact through its published CLI. Their source lives under
[`examples/`](https://github.com/counterfact/api-simulator/tree/main/examples)
in the Counterfact repository; it is not included in the `counterfact` npm
package.

Each example has its own lockfile and setup instructions. Clone the repository
before running one.

| Example | What it demonstrates | Run it from |
| --- | --- | --- |
| [React and Vite](./react-vite.md) | A React profile screen that reads the Ada Lovelace response from a local Counterfact API. | [`examples/react-vite`](https://github.com/counterfact/api-simulator/tree/main/examples/react-vite) |
| [Playwright error states](./playwright-error-states.md) | A browser suite that checks success, not-found, and service-unavailable screens through real HTTP. | [`examples/playwright-error-states`](https://github.com/counterfact/api-simulator/tree/main/examples/playwright-error-states) |

For reusable implementation and testing techniques that apply beyond one
framework, see [Usage Patterns](../patterns/index.md).
