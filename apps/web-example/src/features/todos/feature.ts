import { command } from "@janodetzel/app-commands";
import { z } from "zod";

import type { TodosStore } from "./store";

export type TodosFeatureDeps = { store: TodosStore };

/**
 * Client state only, so the entry points are the store's actions, named after
 * the control the user touches. There is no `list`: the todos are read with
 * `store.inspect --store todos`, the same store the screen subscribes to.
 */
export const createTodosFeature = (deps: TodosFeatureDeps) => ({
	newTodoSubmitted: command()
		.input({ title: z.string().trim().min(1) })
		.description(
			"Does what submitting the add form does: appends a todo that is not done yet and returns it. Fails on a blank title, which the form never submits. Does not check for a duplicate title.",
		)
		.run(async ({ title }) => deps.store.getState().add(title)),

	todoCheckboxToggled: command()
		.input({ id: z.number().int().positive() })
		.description(
			"Does what clicking a todo's checkbox does: flips done and returns the todo. Fails when no todo has that id.",
		)
		.run(async ({ id }) => deps.store.getState().toggle(id)),

	todoDeleteClicked: command()
		.input({ id: z.number().int().positive() })
		.description(
			"Does what clicking a todo's delete button does: removes it and returns its id. Fails when no todo has that id, and there is no undo.",
		)
		.run(async ({ id }) => {
			deps.store.getState().remove(id);
			return id;
		}),
});

export type TodosFeature = ReturnType<typeof createTodosFeature>;
