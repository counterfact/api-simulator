export {};

declare module "koa" {
  interface Request {
    body?: unknown;
    rawBody: string;
  }
}
