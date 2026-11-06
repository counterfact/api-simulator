import { Pet } from "./generated/client.js";

// NSwag's factory hydrates a DTO class, including its init/toJSON methods.
// Counterfact does not perform that hydration for us.
export const pet: Pet = Pet.fromJS({
  id: 1,
  name: "Buddy",
  status: "available",
});
