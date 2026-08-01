// The benchmark fixture is deliberately decoupled from generated route types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const POST = ($: any) => {
  $.context.reset($.body.scenario);
  return $.response[204].empty();
};
