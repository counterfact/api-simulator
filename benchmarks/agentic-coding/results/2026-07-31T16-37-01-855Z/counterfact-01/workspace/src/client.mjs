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
    const pageUrl = new URL("tickets", `${baseUrl.replace(/\/?$/, "/")}`);
    if (cursor !== undefined) {
      pageUrl.searchParams.set("cursor", cursor);
    }

    const response = await fetchWithRetries(pageUrl, maxRetries, sleep);
    let page;
    try {
      page = await response.json();
    } catch {
      throw new Error(`Ticket request succeeded but returned invalid JSON (${pageUrl})`);
    }

    if (!Array.isArray(page.items)) {
      throw new Error(`Ticket request returned an invalid page (${pageUrl})`);
    }

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

async function fetchWithRetries(url, maxRetries, sleep) {
  for (let retry = 0; ; retry += 1) {
    const response = await fetch(url);
    if (response.ok) {
      return response;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || retry >= maxRetries) {
      throw new Error(await requestError(response, url, retry));
    }

    await sleep(retryDelay(response, retry));
  }
}

function retryDelay(response, retry) {
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

  return 100 * 2 ** retry;
}

async function requestError(response, url, retries) {
  let detail = "";
  try {
    const body = await response.json();
    if (typeof body?.message === "string") {
      detail = `: ${body.message}`;
    }
  } catch {
    // Error bodies are optional and should not obscure the HTTP failure.
  }

  const attempts = retries + 1;
  return `Ticket request failed with HTTP ${response.status} after ${attempts} attempt${attempts === 1 ? "" : "s"} (${url})${detail}`;
}
