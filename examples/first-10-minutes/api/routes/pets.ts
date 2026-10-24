import type { HTTP_POST } from "../types/paths/pets.types.js";

export const POST: HTTP_POST = function ($) {
  return $.response[201].json($.context.add($.body));
};
