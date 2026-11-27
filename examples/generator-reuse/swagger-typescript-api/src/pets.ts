import { PetStatus, type Pet } from "./generated/sdk/models.js";

// Avoid depending on the generator's enum member capitalization.
const available = Object.values(PetStatus).find(
  (value) => value === "available",
)!;

export const pets: Pet[] = [{ id: 1, name: "Ada", status: available }];
