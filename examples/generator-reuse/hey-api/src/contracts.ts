import type { Pet as HeyApiPet } from "#api-models";
import type { Pet as CounterfactPet } from "../api/types/components/schemas/Pet.js";

// Check the two generated entry points expose exactly the same model type.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
export type SamePet = Assert<Equal<HeyApiPet, CounterfactPet>>;
