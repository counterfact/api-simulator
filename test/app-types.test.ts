import { counterfact } from "../src/app.js";

interface ConcreteStore {
  readonly count: number;
  increment(): void;
}

type GenericSimulator = Awaited<ReturnType<typeof counterfact<ConcreteStore>>>;
type DefaultSimulator = Awaited<ReturnType<typeof counterfact>>;
type IsEqual<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type IsOptional<ObjectType, Key extends keyof ObjectType> =
  object extends Pick<ObjectType, Key> ? true : false;

describe("counterfact store return type", () => {
  it("is optional, uses the supplied generic, and defaults to unknown", () => {
    const genericStoreType: IsEqual<
      GenericSimulator["store"],
      ConcreteStore | undefined
    > = true;
    const genericStoreIsOptional: IsOptional<GenericSimulator, "store"> = true;
    const defaultStoreType: IsEqual<DefaultSimulator["store"], unknown> = true;
    const defaultStoreIsOptional: IsOptional<DefaultSimulator, "store"> = true;

    expect({
      defaultStoreIsOptional,
      defaultStoreType,
      genericStoreIsOptional,
      genericStoreType,
    }).toEqual({
      defaultStoreIsOptional: true,
      defaultStoreType: true,
      genericStoreIsOptional: true,
      genericStoreType: true,
    });
  });
});
