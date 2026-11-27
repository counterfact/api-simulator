import { OpenAPI, PetsService } from "./generated/sdk/index.js";
import type { Pet } from "./generated/sdk/index.js";

// The ordinary application SDK calls the local Counterfact server.
OpenAPI.BASE = "http://localhost:3100";

export async function loadPet(): Promise<Pet> {
  return await PetsService.getPet();
}
