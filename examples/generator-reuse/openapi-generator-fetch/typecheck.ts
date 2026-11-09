import type { Owner, Pet } from "#api-models";
import type { Routes, Schemas } from "./api/types/index.js";
import { samplePet } from "./src/app.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
export type SamePet = Assert<Equal<Schemas["Pet"], Pet>>;
export type SameOwner = Assert<Equal<Schemas["Owner"], Owner>>;
export type SameBody = Assert<
  Equal<Parameters<Routes["/pets"]["POST"]>[0]["body"], Pet>
>;

export const fromSdk: Schemas["Pet"] = samplePet;
export const backToSdk: Pet = fromSdk;

// @ts-expect-error Both tools must reject a missing required owner.
export const missingOwner: Schemas["Pet"] = { id: 1, name: "Rover" };
// @ts-expect-error Counterfact must keep the SDK's numeric id.
export const wrongId: Schemas["Pet"] = { ...samplePet, id: "42" };
// @ts-expect-error Counterfact must preserve the SDK's enum values.
export const wrongStatus: Schemas["Pet"] = { ...samplePet, status: "lost" };
// @ts-expect-error Recursive SDK references must retain required properties.
export const badFriend: Schemas["Pet"] = { ...samplePet, friends: [{ id: 3 }] };

export const invalidResponse: Routes["/pets"]["POST"] = function ($) {
  // @ts-expect-error The response body must also use the SDK's Pet contract.
  return $.response.status(200).json({ id: 1, name: "Missing owner" });
};
