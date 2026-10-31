// Only messages deliberately authored by the tutorial may cross the HTTP boundary.
// Never derive these messages from caught errors or learner code.
const guidance = new WeakMap<object, string>();

export function tutorialGuidance(
  message: string,
  options?: ErrorOptions,
): Error {
  const error = new Error(message, options);
  guidance.set(error, message);
  return error;
}

export function tutorialFailure(error: unknown, fallback: string): string {
  const message =
    typeof error === "object" && error !== null
      ? guidance.get(error)
      : undefined;
  if (message !== undefined) return message;
  console.error("Tutorial operation failed:", error);
  return fallback;
}
