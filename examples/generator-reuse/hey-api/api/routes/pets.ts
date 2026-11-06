import type { HTTP_GET } from "../types/paths/pets.types.js";
import { pet } from "../../src/pet.js";

export const GET: HTTP_GET = ($) => {
  // The response accepts the same Hey API model used by application code.
  const response = $.response[200].json(pet);
  // @ts-expect-error The generated response requires Pet.name.
  $.response[200].json({ id: 1, status: "available" });
  // @ts-expect-error The generated response rejects unknown Pet.status values.
  $.response[200].json({ id: 1, name: "Buddy", status: "lost" });
  return response;
};
