import type { NewPet } from "../types/components/schemas/NewPet.js";
import type { Pet } from "../types/components/schemas/Pet.js";

export class Context {
  private pets = new Map<number, Pet>();
  private nextId = 1;
  simulateFailure = false;

  reset() {
    this.pets.clear();
    this.nextId = 1;
    this.simulateFailure = false;
  }

  add(input: NewPet): Pet {
    const pet = { ...input, id: this.nextId++ };
    this.pets.set(pet.id, pet);
    return pet;
  }

  get(id: number) {
    return this.pets.get(id);
  }
}
