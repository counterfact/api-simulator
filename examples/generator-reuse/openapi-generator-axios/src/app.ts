import type { Pet } from "#api-models";

// An ordinary application imports its SDK from a local generated directory.
export const samplePet: Pet = {
  id: 42,
  name: "Rover",
  owner: { id: 7, name: "Alex" },
  status: "available",
  friends: [],
};

// The normal generated Axios SDK can call the Counterfact endpoint.
export async function createPetUsingSdk(
  basePath = "http://localhost:3100",
): Promise<Pet> {
  const { Configuration, DefaultApi } =
    await import("./generated/sdk/index.js");
  const client = new DefaultApi(new Configuration({ basePath }));
  const response = await client.createPet(samplePet);
  return response.data;
}
