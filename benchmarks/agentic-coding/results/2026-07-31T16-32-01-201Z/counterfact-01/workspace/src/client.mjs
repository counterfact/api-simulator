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
  const tickets = [];
  const seenIds = new Set();
  let cursor;

  do {
    const url = new URL("tickets", ensureTrailingSlash(baseUrl));
    if (cursor !== undefined) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await requestWithRetries(url, maxRetries, sleep);
    const page = await response.json();

    for (const ticket of page.items) {
      if (!seenIds.has(ticket.id)) {
        seenIds.add(ticket.id);
        tickets.push(ticket);
      }
    }

    cursor = page.nextCursor;
  } while (cursor !== undefined);

  return tickets;
}

async function requestWithRetries(url, maxRetries, sleep) {
  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Error(`Request to ${url} could not be completed: ${error.message}`, {
        cause: error,
      });
    }

    if (response.ok) {
      return response;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      throw new Error(
        `Request to ${url} failed with HTTP ${response.status}${await responseMessage(response)}`,
      );
    }

    await sleep(retryDelay(response, attempt));
  }
}

function ensureTrailingSlash(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function retryDelay(response, attempt) {
  const retryAfterHeader = response.headers.get("Retry-After");
  const retryAfter = Number(retryAfterHeader);
  if (
    retryAfterHeader !== null &&
    Number.isFinite(retryAfter) &&
    retryAfter >= 0
  ) {
    return retryAfter * 1000;
  }

  return 1000 * 2 ** attempt;
}

async function responseMessage(response) {
  try {
    const body = await response.json();
    return body?.message ? `: ${body.message}` : "";
  } catch {
    return "";
  }
}
