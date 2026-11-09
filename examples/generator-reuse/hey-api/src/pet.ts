import type { Pet } from "#api-models";

// Application code imports Hey API's real output directly.
export const pet: Pet = { id: 1, name: "Buddy", status: "available" };

// @ts-expect-error Hey API's Pet requires name.
export const missingName: Pet = { id: 1, status: "available" };
// @ts-expect-error Hey API emits status as a string union.
export const invalidStatus: Pet = { id: 1, name: "Buddy", status: "lost" };
