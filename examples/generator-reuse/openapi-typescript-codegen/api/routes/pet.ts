import { PetStatus } from "../../src/generated/sdk/models/PetStatus.js";
import type { Pet } from "../../src/generated/sdk/index.js";
import type { Routes } from "../types/index.js";

// This is the SDK's model, including the SDK's actual nominal enum.
export const pet: Pet = { id: 1, name: "Milo", status: PetStatus.AVAILABLE };

export const GET: Routes["/pet"]["GET"] = function ($) {
  return $.response.status(200).json(pet);
};
