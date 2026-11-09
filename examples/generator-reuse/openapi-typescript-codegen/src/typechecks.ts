import { PetStatus } from "./generated/sdk/index.js";
import type { Pet } from "./generated/sdk/index.js";
import type { Routes, Schemas } from "../api/types/index.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

export type SamePet = Expect<Equal<Schemas["Pet"], Pet>>;
export type SameNominalEnum = Expect<Equal<Schemas["PetStatus"], PetStatus>>;

const sdkPet: Pet = { id: 1, name: "Milo", status: PetStatus.AVAILABLE };
const counterfactPet: Schemas["Pet"] = sdkPet;
const roundTrip: Pet = counterfactPet;
void roundTrip;

// tsc fails if these expected errors disappear.
// @ts-expect-error The SDK requires name.
const missingName: Schemas["Pet"] = { id: 1, status: PetStatus.AVAILABLE };
// @ts-expect-error A matching wire string is not the SDK's nominal enum.
const rawString: Schemas["PetStatus"] = "available";
const badId: Schemas["Pet"] = {
  // @ts-expect-error A missing or wrong model export must not turn into any.
  id: "1",
  name: "Milo",
  status: PetStatus.AVAILABLE,
};

export const rejectedResponse: Routes["/pet"]["GET"] = function ($) {
  // @ts-expect-error The route response uses the same required SDK properties.
  return $.response.status(200).json({ id: 1, status: PetStatus.AVAILABLE });
};

void missingName;
void rawString;
void badId;
