/**
 * Options for setting an HTTP cookie on a response.
 * These correspond to standard `Set-Cookie` attributes and are passed to the
 * `.cookie()` method on the response builder.
 */
export interface CookieOptions {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "lax" | "none" | "strict";
  secure?: boolean;
}
