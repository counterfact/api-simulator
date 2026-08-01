/**
 * Collect every ticket from the configured API.
 *
 * See TASK.md and openapi.yaml for the contract.
 */
export async function fetchAllTickets({
  baseUrl,
  maxRetries = 3,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  void baseUrl;
  void maxRetries;
  void sleep;
  throw new Error("Not implemented");
}
