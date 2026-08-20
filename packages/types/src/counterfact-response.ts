/**
 * A unique symbol used as a brand for the `COUNTERFACT_RESPONSE` type.
 * This prevents arbitrary objects from being accidentally treated as a
 * completed response value.
 */
const counterfactResponse = Symbol("Counterfact Response");

/**
 * The terminal value type returned by the fluent response builder once all
 * required fields (body, headers, etc.) have been provided. When a route
 * handler returns this type, Counterfact treats the response as complete.
 */
export type COUNTERFACT_RESPONSE = {
  [counterfactResponse]: typeof counterfactResponse;
};
