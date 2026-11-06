import type { Pet as HeyApiPet } from "#api-models";
import type { Pet as CounterfactPet } from "../api/types/components/schemas/Pet.js";

// Check the two generated entry points expose exactly the same model type.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
export type SamePet = Assert<Equal<HeyApiPet, CounterfactPet>>;

// Compile these controls without executing invalid responses at runtime.
export function checkResponseContract(
  $: Parameters<import("../api/types/paths/pets.types.js").HTTP_GET>[0],
): void {
  // @ts-expect-error The generated response requires Pet.name.
  $.response.status(200).json({ id: 1, status: "available" });
  // @ts-expect-error The generated response rejects unknown Pet.status values.
  $.response.status(200).json({ id: 1, name: "Buddy", status: "lost" });
}
