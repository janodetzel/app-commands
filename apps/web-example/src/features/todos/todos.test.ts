import { describe, expect, it } from "vitest";

import { createTodosFeature, createTodosStore } from ".";

/**
 * The feature is tested through its own methods, which is what the screen calls
 * and what a command calls. Nothing here needs a browser or a mock.
 */
describe("the todos feature", () => {
	const build = () => {
		const store = createTodosStore();
		return { store, todos: createTodosFeature({ store }) };
	};

	it("adds a todo that is not done, and leaves it in the store the screen reads", async () => {
		const { store, todos } = build();

		expect(await todos.newTodoSubmitted({ title: "Write tests" })).toEqual({
			id: 1,
			title: "Write tests",
			done: false,
		});
		expect(store.getState().todos).toEqual([{ id: 1, title: "Write tests", done: false }]);
	});

	it("numbers todos from the store's own counter, so ids repeat across runs", async () => {
		const first = build();
		const second = build();

		await first.todos.newTodoSubmitted({ title: "a" });
		await second.todos.newTodoSubmitted({ title: "a" });

		expect(first.store.getState().todos[0]!.id).toBe(second.store.getState().todos[0]!.id);
	});

	it("toggles and deletes by id, and fails on an id that is not there", async () => {
		const { store, todos } = build();
		await todos.newTodoSubmitted({ title: "a" });

		expect(await todos.todoCheckboxToggled({ id: 1 })).toMatchObject({ done: true });
		expect(await todos.todoDeleteClicked({ id: 1 })).toBe(1);
		expect(store.getState().todos).toEqual([]);

		await expect(todos.todoCheckboxToggled({ id: 1 })).rejects.toThrow("there is no todo 1");
		await expect(todos.todoDeleteClicked({ id: 1 })).rejects.toThrow("there is no todo 1");
	});
});
