import { pets } from "../../pets.js";
import type { Routes } from "../types/index.js";

// This file is authored code. Regeneration preserves it.
export const GET: Routes["/pets"]["GET"] = ($) =>
  $.response.status(200).json(pets);
