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
  const retryLimit = Math.max(0, Math.floor(Number(maxRetries) || 0));
  const tickets = [];
  const seenIds = new Set();
  let cursor;

  do {
    const page = await fetchTicketPage({ baseUrl, cursor, retryLimit, sleep });

    for (const ticket of page.items) {
      if (!seenIds.has(ticket.id)) {
        seenIds.add(ticket.id);
        tickets.push(ticket);
      }
    }

    cursor = page.nextCursor;
  } while (cursor !== undefined && cursor !== null);

  return tickets;
}

async function fetchTicketPage({ baseUrl, cursor, retryLimit, sleep }) {
  const url = new URL("tickets", ensureTrailingSlash(baseUrl));
  if (cursor !== undefined && cursor !== null) {
    url.searchParams.set("cursor", cursor);
  }

  for (let retryCount = 0; ; retryCount += 1) {
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Error(`Failed to request tickets: ${error.message}`, { cause: error });
    }

    if (response.ok) {
      try {
        return await response.json();
      } catch (error) {
        throw new Error(`Tickets API returned invalid JSON (${response.status})`, {
          cause: error,
        });
      }
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || retryCount >= retryLimit) {
      throw new Error(await responseErrorMessage(response));
    }

    await sleep(retryDelayMilliseconds(response, retryCount));
  }
}

function ensureTrailingSlash(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function retryDelayMilliseconds(response, retryCount) {
  const retryAfterHeader = response.headers.get("Retry-After");
  const retryAfter = Number(retryAfterHeader);
  if (
    retryAfterHeader !== null &&
    retryAfterHeader.trim() !== "" &&
    Number.isFinite(retryAfter) &&
    retryAfter >= 0
  ) {
    return retryAfter * 1000;
  }

  // A small exponential backoff keeps retries from immediately repeating load.
  return 1000 * 2 ** retryCount;
}

async function responseErrorMessage(response) {
  let message;
  try {
    const body = await response.json();
    message = body?.message;
  } catch {
    // Error bodies are optional; the status remains useful on its own.
  }

  return `Tickets API request failed with HTTP ${response.status}${
    message ? `: ${message}` : ""
  }`;
}
