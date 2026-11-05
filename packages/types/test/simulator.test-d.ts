import { expectType, expectError } from "tsd";
import { counterfact, type Config, type Simulator } from "counterfact";

declare const config: Config;
const simulator = await counterfact<{ projects: string[] }>(config);
expectType<Simulator<{ projects: string[] }>>(simulator);
expectType<Promise<void>>(simulator.reset());
expectType<Promise<void>>(simulator.scenario("emptyProjects"));
expectType<Promise<void>>(simulator.scenario("pets/orders/pending", "pets"));
expectType<string[] | undefined>(simulator.store?.projects);
expectType<Record<string, unknown>>(simulator.loadContext("/", "pets"));
expectError(simulator.scenario(42));
expectError(simulator.scenario("pending", 42));
expectError(simulator.reset("pets"));
