import type { components } from "@app/api-models";

// The frontend and the simulated endpoint use this same generated model.
export function petFor(id: string): components["schemas"]["Pet"] {
  return { id, name: "Milo", status: "available" };
}
