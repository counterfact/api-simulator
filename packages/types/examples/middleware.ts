import type { Middleware } from "@counterfact/types";

interface RequestState {
  requestCount: number;
}

export const countRequests: Middleware<RequestState> = async (
  request,
  respondTo,
) => {
  request.context.requestCount += 1;
  return respondTo(request);
};
