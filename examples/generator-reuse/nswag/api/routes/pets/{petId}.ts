import type { HTTP_GET } from "../../types/paths/pets/{petId}.types.js";
import { pet } from "../../../src/pet.js";

// The same type alias works from a deeper generated route directory.
export const GET: HTTP_GET = ($) => $.response.status(200).json(pet);
