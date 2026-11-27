import type { Routes } from "../types/index.js";

import { copyPet } from "../../src/pets.js";

export const POST: Routes["/pets"]["POST"] = function ($) {
  return $.response.status(201).json(copyPet($.body));
};
