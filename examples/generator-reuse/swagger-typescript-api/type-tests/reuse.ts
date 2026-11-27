import type { Pet, PetStatus } from "../src/generated/sdk/models.js";
import type { Schemas, Routes } from "../src/simulation/types/index.js";
import { pets } from "../src/pets.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;

export type SameModel = Assert<Equal<Schemas["Pet"], Pet>>;
export type SameEnum = Assert<Equal<Schemas["PetStatus"], PetStatus>>;
export type SameRecursiveModel = Assert<
  Equal<NonNullable<Schemas["Pet"]["friend"]>, Pet>
>;

// Both directions must compile with the unmodified upstream output.
export const fromSdk: Schemas["Pet"] = pets[0];
export const toSdk: Pet = fromSdk;
export const enumFromSdk: Schemas["PetStatus"] = pets[0].status;
export const enumToSdk: PetStatus = enumFromSdk;

// Negative controls fail the build if the generator/import becomes any/unknown.
// @ts-expect-error Nominal enum identity must survive the Counterfact alias.
export const rawStatus: Schemas["PetStatus"] = "available";
// @ts-expect-error Pet.id is a number in the real SDK model.
export const wrongId: Schemas["Pet"] = { ...pets[0], id: "1" };
// @ts-expect-error Required fields cannot disappear through the adapter.
export const missingFields: Schemas["Pet"] = { id: 1 };

export const acceptsSdkResponse: Routes["/pets"]["GET"] = ($) =>
  $.response.status(200).json(pets);
export const rejectsInvalidResponse: Routes["/pets"]["GET"] = ($) =>
  // @ts-expect-error Handler response is checked against the reused model.
  $.response.status(200).json([{ ...pets[0], id: "1" }]);
