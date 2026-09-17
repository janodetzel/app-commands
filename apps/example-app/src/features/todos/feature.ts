import type { ApolloClient } from "@apollo/client";
import { command } from "@janodetzel/app-commands";
import { z } from "zod";

import { addTodo, getTodos, removeTodo, setTodoDone } from "./api";

export type TodosFeatureDeps = { apollo: ApolloClient };

/**
 * Only what a reader does on the todos screens. The screen calls
 * `todos.add({ title })` and so does the bridge, so there is one implementation
 * and the agent verifies the path a user takes.
 *
 * There is no `list`: reading the todos is `apollo.inspect --prefix "Todo:"`,
 * the same cache the screen renders from. A list command here would be a second
 * implementation of it.
 */
export const createTodosFeature = (deps: TodosFeatureDeps) => ({
	add: command()
		.input({ title: z.string().min(1), description: z.string().optional() })
		.description(
			"Adds a todo through the API, updates the cache the way the screen does, and returns the todos from the cache. An omitted description is stored as an empty string; it is never null. Does not edit an existing todo: a repeated title adds a second one.",
		)
		.run(async ({ title, description }) => {
			await addTodo(deps.apollo, title, description);
			return getTodos(deps.apollo, "cache");
		}),

	setDone: command()
		.input({ id: z.string().min(1), done: z.boolean() })
		.description(
			"Checks or unchecks one todo and returns it. Fails when the id does not exist. Setting done to the value it already has is a no-op the server still confirms.",
		)
		.run(async ({ id, done }) => setTodoDone(deps.apollo, id, done)),

	remove: command()
		.input({ id: z.string().min(1) })
		.description(
			"Removes a todo, evicts it from the cache, and returns the todos that are left. Fails when the id does not exist.",
		)
		.run(async ({ id }) => {
			await removeTodo(deps.apollo, id);
			return getTodos(deps.apollo, "cache");
		}),
});

export type TodosFeature = ReturnType<typeof createTodosFeature>;
