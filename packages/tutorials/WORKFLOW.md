# Coffee-shop lesson graphs

Generated from the executable LangGraph definitions. Read the curriculum in `packages/tutorials/src/coffee-shop/coffee-shop-curriculum.ts`; each phase has its script, actions, and evidence in `lessons/<phase>.ts`.

Each invocation handles one learner event. An edge to `__end__` at a wait means the workflow stops until another approval, save, request, REPL observation, or answer arrives. It does not perform that learner action automatically. Milo's file-writing nodes call their tools only for an explicit approved edit, and checks run only for check events. The browser controls message pacing; the project journal records durable lesson completion.

After a phase completes, the parent workflow saves progress and either continues within the same lesson or waits for Next Lesson. Older project protocols keep their original lesson inventory.

Regenerate after building tutorials: `node scripts/describe-tutorial-workflow.mjs > packages/tutorials/WORKFLOW.md`.

## Lesson 1: Try the coffee shop (orientation)

[Read the script and graph](./src/coffee-shop/lessons/orientation.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	learner_places_first_order(learner_places_first_order)
	observe_first_order(observe_first_order)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_places_first_order --> observe_first_order;
	lesson_complete --> __end__;
	milo_explains --> learner_places_first_order;
	observe_first_order -.-> lesson_complete;
	observe_first_order -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 2: Explore your generated API (explore)

[Read the script and graph](./src/coffee-shop/lessons/explore.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	learner_inspects_and_refreshes(learner_inspects_and_refreshes)
	observe_generated_products(observe_generated_products)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_inspects_and_refreshes --> observe_generated_products;
	lesson_complete --> __end__;
	milo_explains --> learner_inspects_and_refreshes;
	observe_generated_products -.-> lesson_complete;
	observe_generated_products -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 3: Give generated descriptions coffee examples (description-example)

[Read the script and graph](./src/coffee-shop/lessons/description-example.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	learner_adds_description_examples(learner_adds_description_examples)
	verify_saved_description_example(verify_saved_description_example)
	milo_invites_experiment(milo_invites_experiment)
	observe_description_examples(observe_description_examples)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_adds_description_examples --> verify_saved_description_example;
	lesson_complete --> __end__;
	milo_explains --> learner_adds_description_examples;
	milo_invites_experiment --> observe_description_examples;
	verify_saved_description_example -.-> milo_invites_experiment;
	verify_saved_description_example -.-> __end__;
	observe_description_examples -.-> lesson_complete;
	observe_description_examples -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 4: Replace random products (catalog)

[Read the script and graph](./src/coffee-shop/lessons/catalog.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	milo_proposes_catalog(milo_proposes_catalog)
	wait_for_approval(wait_for_approval)
	milo_adds_catalog(milo_adds_catalog)
	learner_replaces_random_response(learner_replaces_random_response)
	verify_catalog_handler(verify_catalog_handler)
	milo_invites_experiment(milo_invites_experiment)
	compare_catalog_responses(compare_catalog_responses)
	milo_requests_second_refresh(milo_requests_second_refresh)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_replaces_random_response --> verify_catalog_handler;
	lesson_complete --> __end__;
	milo_explains --> milo_proposes_catalog;
	milo_invites_experiment --> compare_catalog_responses;
	milo_proposes_catalog --> wait_for_approval;
	milo_requests_second_refresh --> __end__;
	wait_for_approval -.-> milo_adds_catalog;
	wait_for_approval -.-> __end__;
	milo_adds_catalog -.-> learner_replaces_random_response;
	milo_adds_catalog -.-> __end__;
	verify_catalog_handler -.-> milo_invites_experiment;
	verify_catalog_handler -.-> __end__;
	compare_catalog_responses -.-> lesson_complete;
	compare_catalog_responses -.-> milo_requests_second_refresh;
	compare_catalog_responses -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 5: Respond to the order you received (order)

[Read the script and graph](./src/coffee-shop/lessons/order.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	learner_returns_submitted_items(learner_returns_submitted_items)
	verify_saved_order(verify_saved_order)
	milo_invites_experiment(milo_invites_experiment)
	observe_submitted_items(observe_submitted_items)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_returns_submitted_items --> verify_saved_order;
	lesson_complete --> __end__;
	milo_explains --> learner_returns_submitted_items;
	milo_invites_experiment --> observe_submitted_items;
	verify_saved_order -.-> milo_invites_experiment;
	verify_saved_order -.-> __end__;
	observe_submitted_items -.-> lesson_complete;
	observe_submitted_items -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 6: Add failure and recovery (fail)

[Read the script and graph](./src/coffee-shop/lessons/fail.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	milo_proposes_fail_support(milo_proposes_fail_support)
	wait_for_approval(wait_for_approval)
	milo_prepares_fail_support(milo_prepares_fail_support)
	learner_disables_orders(learner_disables_orders)
	verify_saved_fail(verify_saved_fail)
	milo_invites_experiment(milo_invites_experiment)
	observe_unavailable_response(observe_unavailable_response)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_disables_orders --> verify_saved_fail;
	lesson_complete --> __end__;
	milo_explains --> milo_proposes_fail_support;
	milo_invites_experiment --> observe_unavailable_response;
	milo_proposes_fail_support --> wait_for_approval;
	wait_for_approval -.-> milo_prepares_fail_support;
	wait_for_approval -.-> __end__;
	milo_prepares_fail_support -.-> learner_disables_orders;
	milo_prepares_fail_support -.-> __end__;
	verify_saved_fail -.-> milo_invites_experiment;
	verify_saved_fail -.-> __end__;
	observe_unavailable_response -.-> lesson_complete;
	observe_unavailable_response -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 6: Add failure and recovery (retry)

[Read the script and graph](./src/coffee-shop/lessons/retry.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	learner_restores_orders(learner_restores_orders)
	verify_saved_retry(verify_saved_retry)
	milo_invites_experiment(milo_invites_experiment)
	observe_same_cart_recovery(observe_same_cart_recovery)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_restores_orders --> verify_saved_retry;
	lesson_complete --> __end__;
	milo_explains --> learner_restores_orders;
	milo_invites_experiment --> observe_same_cart_recovery;
	verify_saved_retry -.-> milo_invites_experiment;
	verify_saved_retry -.-> __end__;
	observe_same_cart_recovery -.-> lesson_complete;
	observe_same_cart_recovery -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 7: Introduce shared context (context)

[Read the script and graph](./src/coffee-shop/lessons/context.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	milo_proposes_context_support(milo_proposes_context_support)
	wait_for_approval(wait_for_approval)
	milo_prepares_context_support(milo_prepares_context_support)
	learner_implements_context_methods(learner_implements_context_methods)
	verify_saved_context(verify_saved_context)
	verify_context_methods(verify_context_methods)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_implements_context_methods --> verify_saved_context;
	lesson_complete --> __end__;
	milo_explains --> milo_proposes_context_support;
	milo_proposes_context_support --> wait_for_approval;
	wait_for_approval -.-> milo_prepares_context_support;
	wait_for_approval -.-> __end__;
	milo_prepares_context_support -.-> learner_implements_context_methods;
	milo_prepares_context_support -.-> __end__;
	verify_saved_context -.-> verify_context_methods;
	verify_saved_context -.-> __end__;
	verify_context_methods -.-> lesson_complete;
	verify_context_methods -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 8: Connect routes and the REPL (connect)

[Read the script and graph](./src/coffee-shop/lessons/connect.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	learner_connects_routes_to_context(learner_connects_routes_to_context)
	verify_saved_connect(verify_saved_connect)
	verify_connected_routes(verify_connected_routes)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_connects_routes_to_context --> verify_saved_connect;
	lesson_complete --> __end__;
	milo_explains --> learner_connects_routes_to_context;
	verify_saved_connect -.-> verify_connected_routes;
	verify_saved_connect -.-> __end__;
	verify_connected_routes -.-> lesson_complete;
	verify_connected_routes -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 8: Connect routes and the REPL (context-repl)

[Read the script and graph](./src/coffee-shop/lessons/context-repl.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	learner_adds_practice_coffee(learner_adds_practice_coffee)
	wait_for_connected_routes(wait_for_connected_routes)
	observe_practice_coffee(observe_practice_coffee)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_adds_practice_coffee --> wait_for_connected_routes;
	lesson_complete --> __end__;
	milo_explains --> learner_adds_practice_coffee;
	wait_for_connected_routes -.-> observe_practice_coffee;
	wait_for_connected_routes -.-> __end__;
	observe_practice_coffee -.-> lesson_complete;
	observe_practice_coffee -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 9: Initialize context with scenarios (seed)

[Read the script and graph](./src/coffee-shop/lessons/seed.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	milo_proposes_seed_support(milo_proposes_seed_support)
	wait_for_approval(wait_for_approval)
	milo_prepares_seed_support(milo_prepares_seed_support)
	learner_exports_startup(learner_exports_startup)
	verify_saved_seed(verify_saved_seed)
	milo_invites_experiment(milo_invites_experiment)
	observe_complete_reset(observe_complete_reset)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_exports_startup --> verify_saved_seed;
	lesson_complete --> __end__;
	milo_explains --> milo_proposes_seed_support;
	milo_invites_experiment --> observe_complete_reset;
	milo_proposes_seed_support --> wait_for_approval;
	wait_for_approval -.-> milo_prepares_seed_support;
	wait_for_approval -.-> __end__;
	milo_prepares_seed_support -.-> learner_exports_startup;
	milo_prepares_seed_support -.-> __end__;
	verify_saved_seed -.-> milo_invites_experiment;
	verify_saved_seed -.-> __end__;
	observe_complete_reset -.-> lesson_complete;
	observe_complete_reset -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 10: Change the running state (decaf)

[Read the script and graph](./src/coffee-shop/lessons/decaf.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	learner_changes_decaf_stock(learner_changes_decaf_stock)
	observe_decaf_purchase(observe_decaf_purchase)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_changes_decaf_stock --> observe_decaf_purchase;
	lesson_complete --> __end__;
	milo_explains --> learner_changes_decaf_stock;
	observe_decaf_purchase -.-> lesson_complete;
	observe_decaf_purchase -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 11: Add stock rules (rules)

[Read the script and graph](./src/coffee-shop/lessons/rules.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	milo_proposes_rules_support(milo_proposes_rules_support)
	wait_for_approval(wait_for_approval)
	milo_prepares_rules_support(milo_prepares_rules_support)
	learner_adds_stock_rejection(learner_adds_stock_rejection)
	verify_saved_rules(verify_saved_rules)
	milo_invites_experiment(milo_invites_experiment)
	observe_rejection_and_cleanup(observe_rejection_and_cleanup)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_adds_stock_rejection --> verify_saved_rules;
	lesson_complete --> __end__;
	milo_explains --> milo_proposes_rules_support;
	milo_invites_experiment --> observe_rejection_and_cleanup;
	milo_proposes_rules_support --> wait_for_approval;
	wait_for_approval -.-> milo_prepares_rules_support;
	wait_for_approval -.-> __end__;
	milo_prepares_rules_support -.-> learner_adds_stock_rejection;
	milo_prepares_rules_support -.-> __end__;
	verify_saved_rules -.-> milo_invites_experiment;
	verify_saved_rules -.-> __end__;
	observe_rejection_and_cleanup -.-> lesson_complete;
	observe_rejection_and_cleanup -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 12: Make purchases reduce inventory (observe)

[Read the script and graph](./src/coffee-shop/lessons/observe.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	learner_buys_and_compares_stock(learner_buys_and_compares_stock)
	compare_purchase_and_answer(compare_purchase_and_answer)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_buys_and_compares_stock --> compare_purchase_and_answer;
	lesson_complete --> __end__;
	milo_explains --> learner_buys_and_compares_stock;
	compare_purchase_and_answer -.-> lesson_complete;
	compare_purchase_and_answer -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 12: Make purchases reduce inventory (reduce)

[Read the script and graph](./src/coffee-shop/lessons/reduce.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	milo_proposes_reduce_support(milo_proposes_reduce_support)
	wait_for_approval(wait_for_approval)
	milo_prepares_reduce_support(milo_prepares_reduce_support)
	learner_implements_inventory_mutation(learner_implements_inventory_mutation)
	verify_saved_reduce(verify_saved_reduce)
	milo_invites_experiment(milo_invites_experiment)
	observe_inventory_reduction(observe_inventory_reduction)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_implements_inventory_mutation --> verify_saved_reduce;
	lesson_complete --> __end__;
	milo_explains --> milo_proposes_reduce_support;
	milo_invites_experiment --> observe_inventory_reduction;
	milo_proposes_reduce_support --> wait_for_approval;
	wait_for_approval -.-> milo_prepares_reduce_support;
	wait_for_approval -.-> __end__;
	milo_prepares_reduce_support -.-> learner_implements_inventory_mutation;
	milo_prepares_reduce_support -.-> __end__;
	verify_saved_reduce -.-> milo_invites_experiment;
	verify_saved_reduce -.-> __end__;
	observe_inventory_reduction -.-> lesson_complete;
	observe_inventory_reduction -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 13: Exercise evolving state (sellout)

[Read the script and graph](./src/coffee-shop/lessons/sellout.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	learner_buys_remaining_stock(learner_buys_remaining_stock)
	observe_sold_out(observe_sold_out)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_buys_remaining_stock --> observe_sold_out;
	lesson_complete --> __end__;
	milo_explains --> learner_buys_remaining_stock;
	observe_sold_out -.-> lesson_complete;
	observe_sold_out -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 13: Exercise evolving state (restock)

[Read the script and graph](./src/coffee-shop/lessons/restock.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	learner_restocks_in_repl(learner_restocks_in_repl)
	observe_restock_and_purchase(observe_restock_and_purchase)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_restocks_in_repl --> observe_restock_and_purchase;
	lesson_complete --> __end__;
	milo_explains --> learner_restocks_in_repl;
	observe_restock_and_purchase -.-> lesson_complete;
	observe_restock_and_purchase -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```

## Lesson 14: Save a reusable setup (scenario)

[Read the script and graph](./src/coffee-shop/lessons/scenario.ts#L1).

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	milo_explains(milo_explains)
	milo_proposes_scenario_support(milo_proposes_scenario_support)
	wait_for_approval(wait_for_approval)
	milo_prepares_scenario_support(milo_prepares_scenario_support)
	learner_implements_focused_restock(learner_implements_focused_restock)
	verify_saved_scenario(verify_saved_scenario)
	milo_invites_experiment(milo_invites_experiment)
	observe_focused_restock(observe_focused_restock)
	lesson_complete(lesson_complete)
	__end__([<p>__end__</p>]):::last
	__start__ --> milo_explains;
	learner_implements_focused_restock --> verify_saved_scenario;
	lesson_complete --> __end__;
	milo_explains --> milo_proposes_scenario_support;
	milo_invites_experiment --> observe_focused_restock;
	milo_proposes_scenario_support --> wait_for_approval;
	wait_for_approval -.-> milo_prepares_scenario_support;
	wait_for_approval -.-> __end__;
	milo_prepares_scenario_support -.-> learner_implements_focused_restock;
	milo_prepares_scenario_support -.-> __end__;
	verify_saved_scenario -.-> milo_invites_experiment;
	verify_saved_scenario -.-> __end__;
	observe_focused_restock -.-> lesson_complete;
	observe_focused_restock -.-> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;

```
