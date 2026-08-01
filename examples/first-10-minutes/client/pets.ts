import type { Pet } from "../api/types/components/schemas/Pet.js";

/** A representative consumer fixture that must evolve with the OpenAPI contract. */
export const expectedAvailablePet: Pet = {
  id: 1,
  name: "Fluffy",
  status: "available",
};

export async function readPet(baseUrl: string, id: number): Promise<Pet> {
  const response = await fetch(`${baseUrl}/pets/${id}`);
  if (!response.ok) throw new Error(`GET /pets/${id}: ${response.status}`);
  return (await response.json()) as Pet;
}
