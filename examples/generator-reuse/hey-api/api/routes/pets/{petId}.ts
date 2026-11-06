import type { HTTP_GET } from "../../types/paths/pets/{petId}.types.js";
import { pet } from "../../../src/pet.js";

// The same model alias resolves from this deeper generated route too.
export const GET: HTTP_GET = ($) => $.response.status(200).json(pet);
