import type { ApolloClient } from "@apollo/client";
import { command } from "@janodetzel/app-commands";
import { z } from "zod";

import { addTodo, getTodos, removeTodo, setTodoDone } from "./api";

export type TodosFeatureDeps = { apollo: ApolloClient };

/**
 * Only what a reader does on the todos screens. The screen calls
 * `todos.newTodoSubmitted({ title })` and so does the bridge, so there is one
 * implementation
 * and the agent verifies the path a user takes.
 *
 * Named after the control a reader touches, not the state change behind it, so
 * a command that no screen can reach has nowhere to hide.
 *
 * There is no `list`: reading the todos is `apollo.inspect --prefix "Todo:"`,
 * the same cache the screen renders from. A list command here would be a second
 * implementation of it.
 */
export const createTodosFeature = (deps: TodosFeatureDeps) => ({
	newTodoSubmitted: command()
		.input({ title: z.string().min(1), description: z.string().optional() })
		.description(
			"Does what submitting a new todo does: the Add button on the list, or Save on the add screen, both land here. Updates the cache the way the screen does and returns the todos from it. An omitted description is stored as an empty string; it is never null. Does not edit an existing todo: a repeated title adds a second one.",
		)
		.run(async ({ title, description }) => {
			await addTodo(deps.apollo, title, description);
			return getTodos(deps.apollo, "cache");
		}),

	checkboxTapped: command()
		.input({ id: z.string().min(1), done: z.boolean() })
		.description(
			"Does what tapping a todo's checkbox does, and returns the todo. Takes the state to land on rather than toggling, because that is what the row passes. Fails when the id does not exist. Passing the value it already has is a no-op the server still confirms.",
		)
		.run(async ({ id, done }) => setTodoDone(deps.apollo, id, done)),

	deleteButtonTapped: command()
		.input({ id: z.string().min(1) })
		.description(
			"Does what tapping Delete on a todo does: removes it, evicts it from the cache, and returns the todos that are left. There is no confirmation step and no undo. Fails when the id does not exist.",
		)
		.run(async ({ id }) => {
			await removeTodo(deps.apollo, id);
			return getTodos(deps.apollo, "cache");
		}),
});

export type TodosFeature = ReturnType<typeof createTodosFeature>;
