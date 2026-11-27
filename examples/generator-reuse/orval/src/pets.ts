import type { Pet } from "#orval-models";

// The frontend and mock handler both consume this ordinary app-level helper.
export function copyPet(pet: Pet): Pet {
  return { ...pet };
}

export const samplePet: Pet = {
  id: 1,
  name: "Milo",
  owner: { name: "Patrick" },
};
