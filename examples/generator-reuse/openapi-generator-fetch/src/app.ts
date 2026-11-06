import type { Pet } from "#api-models";

// An ordinary application imports its SDK from a local generated directory.
export const samplePet: Pet = {
  id: 42,
  name: "Rover",
  owner: { id: 7, name: "Alex" },
  status: "available",
  friends: [],
};

// The normal generated Fetch SDK can call the Counterfact endpoint.
// This declaration is compiled against the real SDK, including its request wrapper.
export async function createPetUsingSdk(
  basePath = "http://localhost:3100",
): Promise<Pet> {
  const { Configuration, DefaultApi } =
    await import("./generated/sdk/index.js");
  const client = new DefaultApi(new Configuration({ basePath }));
  return client.createPet({ pet: samplePet });
}
