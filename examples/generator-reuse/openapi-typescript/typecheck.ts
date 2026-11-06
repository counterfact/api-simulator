import type { components } from "@app/api-models";
import type { Schemas } from "./api/types/index.js";

type ExternalPet = components["schemas"]["Pet"];
type CounterfactPet = Schemas["Pet"];
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
export type SameModel = Assert<Equal<ExternalPet, CounterfactPet>>;

export function bothDirections(
  external: ExternalPet,
  simulated: CounterfactPet,
) {
  const response: CounterfactPet = external;
  const frontendModel: ExternalPet = simulated;
  return { response, frontendModel };
}

// These controls must fail. Unused @ts-expect-error directives fail the check.
// @ts-expect-error The upstream-generated enum rejects unknown wire values.
export const invalidStatus: CounterfactPet = {
  id: "1",
  name: "Milo",
  status: "lost",
};
// @ts-expect-error The upstream-generated model requires name.
export const missingName: CounterfactPet = { id: "1", status: "available" };
// @ts-expect-error Nested recursive values use the upstream-generated model too.
export const invalidFriend: CounterfactPet = {
  id: "1",
  name: "Milo",
  status: "available",
  friend: { id: 2 },
};
