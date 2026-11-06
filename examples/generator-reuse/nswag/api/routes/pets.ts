import type { HTTP_GET } from "../types/paths/pets.types.js";
import { pet } from "../../src/pet.js";

export const GET: HTTP_GET = ($) => $.response.status(200).json(pet);
