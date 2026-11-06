import type { HTTP_GET } from "../types/paths/pets.types.js";
import { pet } from "../../src/pet.js";

export const GET: HTTP_GET = ($) => {
  const response = $.response[200].json(pet);
  // @ts-expect-error The response requires the actual NSwag DTO class shape.
  $.response[200].json({ id: 1, name: "Buddy", status: pet.status });
  return response;
};
