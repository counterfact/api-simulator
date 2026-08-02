import type { getPet } from "../../types/paths/pets/{petId}.types.js";

export const GET: getPet = ($) => {
  if ($.context.simulateFailure) return $.response[503].empty();
  const pet = $.context.get($.path.petId);
  return pet ? $.response[200].json(pet) : $.response[404].empty();
};
