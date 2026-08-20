import type { COUNTERFACT_RESPONSE } from "./counterfact-response.js";
import type { MaybePromise } from "./maybe-promise.js";

/**
 * The type of the `.random()` method on the response builder.
 * When called, it randomly selects one of the available content-type examples
 * and returns a completed `COUNTERFACT_RESPONSE`.
 */
export type RandomFunction = () => MaybePromise<COUNTERFACT_RESPONSE>;
