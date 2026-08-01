import type { createPet } from "../types/paths/pets.types.js";

export const POST: createPet = ($) =>
  $.response[201].json($.context.add($.body));
