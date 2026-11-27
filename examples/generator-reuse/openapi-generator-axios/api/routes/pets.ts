import type { Pet } from "#api-models";
import type { Routes } from "../types/index.js";

export const POST: Routes["/pets"]["POST"] = function ($) {
  // The request body is already typed as the SDK's Pet. No conversion or cast.
  const pet: Pet = $.body;
  return $.response.status(200).json(pet);
};
