import type { Pet } from "#orval-models";

import type { Routes, Schemas } from "../api/types/index.js";
import { samplePet } from "./pets.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
export type SameModel = Assert<Equal<Schemas["Pet"], Pet>>;

const fromClient: Pet = samplePet;
const fromMock: Schemas["Pet"] = fromClient;
const backToClient: Pet = fromMock;
void backToClient;

// These controls fail the check if either tool degrades these models to any.
// @ts-expect-error Orval requires name.
const missingName: Pet = { id: 1 };
// @ts-expect-error The Counterfact schema must retain Orval's numeric id.
const wrongId: Schemas["Pet"] = { id: "1", name: "Milo" };
// @ts-expect-error A nested schema must retain its required property.
const wrongOwner: Schemas["Pet"] = { id: 1, name: "Milo", owner: {} };
void [missingName, wrongId, wrongOwner];

export const invalidHandler: Routes["/pets"]["POST"] = function ($) {
  // @ts-expect-error Counterfact checks the response against the reused model.
  return $.response.status(201).json({ id: 1 });
};
