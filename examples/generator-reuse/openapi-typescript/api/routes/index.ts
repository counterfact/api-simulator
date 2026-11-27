import type { Routes } from "../types/index.js";
import { petFor } from "../../src/pet.js";

export const GET: Routes["/"]["GET"] = function ($) {
  return $.response.status(200).json(petFor("default"));
};
