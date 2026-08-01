// The benchmark fixture is deliberately decoupled from generated route types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GET = ($: any) => $.response[200].json($.context.audit);
