import type { Pet, PetStatus } from "#api-models";
import type { Pet as CounterfactPet } from "../api/types/components/schemas/Pet.js";
import type { HTTP_GET } from "../api/types/paths/pets.types.js";
import { pet } from "./pet.js";

// Bidirectional assignment includes the DTO methods and nominal enum identity.
const upstream: Pet = pet;
const counterfact: CounterfactPet = upstream;
const roundTrip: Pet = counterfact;
const status: PetStatus = roundTrip.status;
void status;

// @ts-expect-error A wire string is not NSwag's nominal enum type.
const wireStatus: PetStatus = "available";
void wireStatus;
// @ts-expect-error A plain JSON object does not have NSwag's DTO methods.
const plainObject: CounterfactPet = {
  id: 1,
  name: "Buddy",
  status: pet.status,
};
void plainObject;

// This function is compiled but is never imported by the running application.
const invalidResponse: HTTP_GET = ($) => {
  return (
    $.response
      .status(200)
      // @ts-expect-error The response requires the actual NSwag DTO class shape.
      .json({ id: 1, name: "Buddy", status: pet.status })
  );
};
void invalidResponse;
